import { type CaptionSegment, fetchCaptionUrlFromApi, getCaptionUrl, parseVtt } from './youtube-vtt';

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
  'position:absolute',
  'bottom:10%',
  'left:5%',
  'right:5%',
  'text-align:center',
  'color:#fff',
  'font-size:20px',
  'font-weight:bold',
  'text-shadow:0 1px 4px #000,0 0 8px #000',
  'pointer-events:none',
  'z-index:200',
  'line-height:1.5',
  'white-space:pre-wrap',
].join(';');

export class YoutubeCaptionTranslator {
  private segments: CaptionSegment[] = [];
  private overlay: HTMLElement | null = null;
  private rafId: number | null = null;
  private abortController: AbortController | null = null;
  private currentVideoId: string | null = null;

  constructor(private onTranslate: (text: string) => Promise<string | null>) {}

  start(): void {
    this.initForCurrentVideo();
    window.addEventListener('yt-navigate-finish', () => this.initForCurrentVideo());
  }

  stop(): void {
    this.cleanup();
  }

  private getVideoId(): string | null {
    const param = new URLSearchParams(location.search).get('v');
    if (param) return param;
    const match = location.pathname.match(/^\/shorts\/([^/?]+)/);
    return match?.[1] ?? null;
  }

  private async initForCurrentVideo(): Promise<void> {
    const videoId = this.getVideoId();
    if (!videoId || videoId === this.currentVideoId) return;
    this.currentVideoId = videoId;
    this.cleanup();

    const url = await this.waitForCaptionUrl(videoId);
    if (!url || this.currentVideoId !== videoId) return;

    const vttText = await fetch(url).then(r => r.text()).catch(() => null);
    if (!vttText || this.currentVideoId !== videoId) return;

    this.segments = parseVtt(vttText);
    if (!this.segments.length) return;

    const player = await this.waitForPlayer();
    if (!player || this.currentVideoId !== videoId) return;

    this.createOverlay(player);
    this.startPlayback();
    this.translateAll(videoId);
  }

  private async waitForCaptionUrl(videoId: string, maxMs = 5000): Promise<string | null> {
    const deadline = Date.now() + maxMs;
    while (Date.now() < deadline) {
      const url = getCaptionUrl(videoId);
      if (url) return url;
      await new Promise<void>(r => setTimeout(r, 300));
    }
    // Primary source (ytInitialPlayerResponse via DOM bridge) timed out — try API fallback
    return fetchCaptionUrlFromApi(videoId);
  }

  private async waitForPlayer(maxMs = 10000): Promise<HTMLElement | null> {
    const deadline = Date.now() + maxMs;
    while (Date.now() < deadline) {
      const player = document.querySelector<HTMLElement>('#movie_player');
      if (player) return player;
      await new Promise<void>(r => setTimeout(r, 200));
    }
    return null;
  }

  private translateAll(videoId: string): void {
    const controller = new AbortController();
    this.abortController = controller;
    let idx = 0;

    const worker = async () => {
      while (!controller.signal.aborted && this.currentVideoId === videoId) {
        const seg = this.segments[idx++];
        if (!seg) break;
        if (!seg.text) continue;
        const translation = await this.onTranslate(seg.text);
        if (translation && !controller.signal.aborted) {
          seg.translation = translation;
        }
      }
    };

    // 5 concurrent workers process segments in order (earliest captions first)
    Promise.all(Array.from({ length: 5 }, worker)).catch(() => {});
  }

  private createOverlay(player: HTMLElement): void {
    this.overlay?.remove();
    const el = document.createElement('div');
    el.id = 'xt-yt-overlay';
    el.style.cssText = OVERLAY_CSS;
    player.appendChild(el);
    this.overlay = el;
  }

  private startPlayback(): void {
    const video = document.querySelector<HTMLVideoElement>('video');
    if (!video || !this.overlay) return;

    let lastKey = '';
    const tick = () => {
      this.rafId = requestAnimationFrame(tick);
      if (!this.overlay) return;
      const ms = video.currentTime * 1000;
      const seg = this.segments.find(s => ms >= s.startMs && ms < s.endMs);
      const key = `${seg?.startMs ?? ''}`;
      if (key !== lastKey) {
        this.overlay.textContent = seg?.translation ?? '';
        lastKey = key;
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
