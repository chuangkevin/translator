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
  'padding:4px 10px',
  'box-sizing:border-box',
  'background:rgba(8,8,8,0.75)',
  'border-radius:4px',
].join(';');

// Selectors for YouTube caption segments (check in priority order)
const CAPTION_SELECTORS = [
  '.ytp-caption-window-container .ytp-caption-segment',
  '.caption-window .ytp-caption-segment',
  '.ytp-caption-segment',
];

export class YoutubeCaptionTranslator {
  private overlay: HTMLElement | null = null;
  private domObserver: MutationObserver | null = null;
  private positionInterval: ReturnType<typeof setInterval> | null = null;
  private pendingTimer: ReturnType<typeof setTimeout> | null = null;
  private translationCache = new Map<string, string>();
  private currentVideoId: string | null = null;
  private navigateListener: (() => void) | null = null;

  constructor(
    private onTranslate: (text: string) => Promise<string | null>,
    private onTranslateBatch?: (texts: string[]) => Promise<(string | null)[]>,
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

  private async initForCurrentVideo(): Promise<void> {
    const videoId = this.getVideoId();
    if (!videoId || videoId === this.currentVideoId) return;
    this.currentVideoId = videoId;
    this.cleanup();

    console.log('[XT Caption] init video:', videoId);
    this.createOverlay();
    this.attachCaptionObserver(videoId);
  }

  private getCaptionContainer(): Element | null {
    return (
      document.querySelector('.ytp-caption-window-container') ??
      document.querySelector('.caption-window')
    );
  }

  private getCaptionText(root: Element): string {
    for (const sel of CAPTION_SELECTORS) {
      const segments = root.querySelectorAll(sel);
      if (segments.length) {
        return Array.from(segments).map(s => s.textContent ?? '').join(' ').trim();
      }
    }
    // Fallback: any text inside the container
    return (root.textContent ?? '').trim().replace(/\s+/g, ' ');
  }

  private attachCaptionObserver(videoId: string, attempt = 0): void {
    if (this.currentVideoId !== videoId) return;

    const container = this.getCaptionContainer();
    if (!container) {
      if (attempt < 20) setTimeout(() => this.attachCaptionObserver(videoId, attempt + 1), 500);
      else console.warn('[XT Caption] caption container not found after 10s');
      return;
    }

    console.log('[XT Caption] observer attached, container:', container.className);
    let lastText = '';

    const handleMutation = () => {
      if (this.currentVideoId !== videoId) return;

      const text = this.getCaptionText(container);
      if (text === lastText) return;
      lastText = text;

      if (this.pendingTimer) { clearTimeout(this.pendingTimer); this.pendingTimer = null; }

      if (!text) {
        this.setOverlayText('');
        return;
      }

      const cached = this.translationCache.get(text);
      if (cached) {
        this.setOverlayText(cached);
        return;
      }

      this.setOverlayText('…');
      this.pendingTimer = setTimeout(async () => {
        this.pendingTimer = null;
        if (this.currentVideoId !== videoId || lastText !== text) return;
        const t = await this.onTranslate(text);
        if (t && this.currentVideoId === videoId && lastText === text) {
          this.translationCache.set(text, t);
          this.setOverlayText(t);
        }
      }, 80);
    };

    const observer = new MutationObserver(handleMutation);
    observer.observe(container, { childList: true, subtree: true, characterData: true });
    this.domObserver = observer;
  }

  private createOverlay(): void {
    this.overlay?.remove();
    const el = document.createElement('div');
    el.id = 'xt-yt-overlay';
    el.style.cssText = OVERLAY_CSS;
    document.body.appendChild(el);
    this.overlay = el;
    this.updateOverlayPosition();

    // Reposition when video resizes or page scrolls
    this.positionInterval = setInterval(() => this.updateOverlayPosition(), 800);
  }

  private updateOverlayPosition(): void {
    if (!this.overlay) return;
    const video = document.querySelector<HTMLVideoElement>('video');
    if (!video) return;
    const rect = video.getBoundingClientRect();
    if (rect.width <= 0) return;
    const padH = rect.width * 0.05;
    this.overlay.style.left = `${rect.left + padH}px`;
    this.overlay.style.width = `${rect.width - padH * 2}px`;
    // Position at ~20% from bottom of video — above native captions (~10%)
    this.overlay.style.bottom = `${window.innerHeight - rect.bottom + rect.height * 0.2}px`;
  }

  private setOverlayText(text: string): void {
    if (this.overlay) this.overlay.textContent = text;
  }

  private cleanup(): void {
    this.domObserver?.disconnect();
    this.domObserver = null;
    if (this.pendingTimer) { clearTimeout(this.pendingTimer); this.pendingTimer = null; }
    if (this.positionInterval) { clearInterval(this.positionInterval); this.positionInterval = null; }
    this.overlay?.remove();
    this.overlay = null;
    this.translationCache.clear();
  }
}
