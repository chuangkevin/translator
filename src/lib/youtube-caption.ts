import { type CaptionSegment, fetchCaptionUrlFromApi, getCaptionUrl, getCaptionUrlFromPageScript, parseVtt } from './youtube-vtt';

// Kept for backward compatibility with tests
export class LRUCache<K, V> {
  private map = new Map<K, V>();

  constructor(private maxSize: number) {}

  get(key: K): V | undefined {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key)!;
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.maxSize) {
      this.map.delete(this.map.keys().next().value!);
    }
  }

  has(key: K): boolean {
    return this.map.has(key);
  }
}

const OVERLAY_CSS = [
  'position:fixed',
  'text-align:center',
  'color:#fff',
  'font-size:20px',
  'font-weight:bold',
  'text-shadow:0 1px 4px #000,0 0 8px #000',
  'pointer-events:none',
  'z-index:2147483647',
  'line-height:1.5',
  'white-space:pre-wrap',
  'padding:4px 8px',
  'box-sizing:border-box',
].join(';');

const BATCH_SIZE = 5;

export class YoutubeCaptionTranslator {
  private segments: CaptionSegment[] = [];
  private overlay: HTMLElement | null = null;
  private rafId: number | null = null;
  private abortController: AbortController | null = null;
  private currentVideoId: string | null = null;
  private navigateListener: (() => void) | null = null;

  constructor(
    private onTranslate: (text: string) => Promise<string | null>,
    private onTranslateBatch?: (texts: string[]) => Promise<(string | null)[]>,
    // Proxy fetch via background SW to bypass YouTube's own service worker
    private onFetchUrl?: (url: string) => Promise<string | null>,
  ) {}

  start(): void {
    this.initForCurrentVideo();
    if (!this.navigateListener) {
      this.navigateListener = () => this.initForCurrentVideo();
      window.addEventListener('yt-navigate-finish', this.navigateListener);
    }
  }

  stop(): void {
    if (this.navigateListener) {
      window.removeEventListener('yt-navigate-finish', this.navigateListener);
      this.navigateListener = null;
    }
    this.cleanup();
    this.currentVideoId = null;
  }

  private getVideoId(): string | null {
    const param = new URLSearchParams(location.search).get('v');
    if (param) return param;
    const match = location.pathname.match(/^\/shorts\/([^/?]+)/);
    return match?.[1] ?? null;
  }

  private async doFetch(url: string): Promise<string | null> {
    if (this.onFetchUrl) return this.onFetchUrl(url);
    return window.fetch(url, { credentials: 'include' })
      .then(r => r.ok ? r.text() : null)
      .catch(() => null);
  }

  private async initForCurrentVideo(): Promise<void> {
    const videoId = this.getVideoId();
    if (!videoId || videoId === this.currentVideoId) return;
    this.currentVideoId = videoId;
    this.cleanup();

    console.log('[XT Caption] init video:', videoId);
    this.createOverlay('字幕載入中…');

    const result = await this.waitForCaptionUrl(videoId);
    console.log('[XT Caption] result:', result ? `${result.url.slice(0, 80)} (${result.content.length}b)` : 'NOT FOUND');

    if (!result || this.currentVideoId !== videoId) {
      this.setOverlayStatus('找不到字幕', 3000);
      return;
    }

    this.segments = parseVtt(result.content);
    console.log('[XT Caption] segments:', this.segments.length);

    if (!this.segments.length) {
      this.setOverlayStatus('無法解析字幕', 3000);
      return;
    }

    this.setOverlayText('字幕翻譯中…');

    await this.waitForPlayer();
    if (this.currentVideoId !== videoId) return;

    this.startPlayback();
    this.translateAll(videoId);
  }

  // Returns the URL + pre-fetched WEBVTT content so we don't need a second fetch.
  private async waitForCaptionUrl(
    videoId: string,
    maxMs = 5000,
  ): Promise<{ url: string; content: string } | null> {
    const tryUrl = async (url: string): Promise<{ url: string; content: string } | null> => {
      const content = await this.doFetch(url);
      if (content?.includes('WEBVTT')) return { url, content };
      return null;
    };

    // 1. Inline <script> tag — synchronous find, then verify via background fetch
    const fromScript = getCaptionUrlFromPageScript();
    if (fromScript) { const r = await tryUrl(fromScript); if (r) return r; }

    // 2. MAIN-world bridge dataset
    { const url = getCaptionUrl(videoId); if (url) { const r = await tryUrl(url); if (r) return r; } }

    // 3. Direct timedtext URLs (no auth needed, works for English auto-generated)
    for (const url of [
      `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&kind=asr&fmt=vtt`,
      `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=vtt`,
    ]) {
      const r = await tryUrl(url);
      if (r) return r;
    }

    // 4. Poll bridge dataset for remaining time
    const deadline = Date.now() + maxMs;
    while (Date.now() < deadline) {
      const url = getCaptionUrl(videoId);
      if (url) { const r = await tryUrl(url); if (r) return r; }
      await new Promise<void>(r => setTimeout(r, 300));
    }

    // 5. type=list API
    const listUrl = await fetchCaptionUrlFromApi(videoId);
    if (listUrl) { const r = await tryUrl(listUrl); if (r) return r; }

    return null;
  }

  private async waitForPlayer(maxMs = 10000): Promise<void> {
    const deadline = Date.now() + maxMs;
    while (Date.now() < deadline) {
      if (document.querySelector<HTMLVideoElement>('video')) return;
      await new Promise<void>(r => setTimeout(r, 200));
    }
  }

  private translateAll(videoId: string): void {
    const controller = new AbortController();
    this.abortController = controller;

    // Start from the segment nearest to current playback time
    const video = document.querySelector<HTMLVideoElement>('video');
    const currentMs = (video?.currentTime ?? 0) * 1000;
    const nearestIdx = this.segments.findIndex(s => s.endMs >= currentMs - 2000);
    let idx = nearestIdx >= 0 ? nearestIdx : 0;

    const worker = async () => {
      while (!controller.signal.aborted && this.currentVideoId === videoId) {
        // Grab next batch synchronously (no await, so no race on idx)
        const batch: Array<{ seg: CaptionSegment }> = [];
        while (batch.length < BATCH_SIZE) {
          const seg = this.segments[idx++];
          if (!seg) break;
          if (seg.text && !seg.translation) batch.push({ seg });
        }
        if (!batch.length) break;

        let translations: (string | null)[];
        if (this.onTranslateBatch) {
          translations = await this.onTranslateBatch(batch.map(b => b.seg.text));
        } else {
          translations = await Promise.all(batch.map(b => this.onTranslate(b.seg.text)));
        }

        if (!controller.signal.aborted && this.currentVideoId === videoId) {
          translations.forEach((t, i) => { if (t) batch[i].seg.translation = t; });
        }
      }
    };

    // 3 concurrent workers, each processing BATCH_SIZE segments at a time
    Promise.all(Array.from({ length: 3 }, worker)).catch(() => {});
  }

  private createOverlay(initialText = ''): void {
    this.overlay?.remove();
    const el = document.createElement('div');
    el.id = 'xt-yt-overlay';
    el.style.cssText = OVERLAY_CSS;
    el.textContent = initialText;
    document.body.appendChild(el);
    this.overlay = el;
    const video = document.querySelector<HTMLVideoElement>('video');
    if (video) this.positionOverlay(el, video);
  }

  private setOverlayText(text: string): void {
    if (this.overlay) this.overlay.textContent = text;
  }

  private setOverlayStatus(text: string, removeAfterMs: number): void {
    this.setOverlayText(text);
    setTimeout(() => {
      if (this.overlay?.textContent === text) {
        this.overlay.remove();
        this.overlay = null;
      }
    }, removeAfterMs);
  }

  private positionOverlay(el: HTMLElement, video: HTMLVideoElement): void {
    const rect = video.getBoundingClientRect();
    if (rect.width > 0) {
      const padH = rect.width * 0.05;
      el.style.left = `${rect.left + padH}px`;
      el.style.width = `${rect.width - padH * 2}px`;
      el.style.bottom = `${window.innerHeight - rect.bottom + rect.height * 0.1}px`;
    }
  }

  private startPlayback(): void {
    const video = document.querySelector<HTMLVideoElement>('video');
    if (!video || !this.overlay) return;

    let lastKey = '';
    const tick = () => {
      this.rafId = requestAnimationFrame(tick);
      if (!this.overlay) return;

      this.positionOverlay(this.overlay, video);

      const ms = video.currentTime * 1000;
      const seg = this.segments.find(s => ms >= s.startMs && ms < s.endMs);
      const key = `${seg?.startMs ?? ''}`;
      if (key !== lastKey) {
        this.overlay.textContent = seg ? (seg.translation ?? '…') : '';
        lastKey = key;
      } else if (seg?.translation && this.overlay.textContent === '…') {
        this.overlay.textContent = seg.translation;
      }
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private cleanup(): void {
    this.abortController?.abort();
    this.abortController = null;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.overlay?.remove();
    this.overlay = null;
    this.segments = [];
  }
}
