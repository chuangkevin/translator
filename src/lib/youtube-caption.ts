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

export class YoutubeCaptionTranslator {
  private cache = new LRUCache<string, string>(200);
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private observer: MutationObserver | null = null;

  constructor(
    private onTranslate: (text: string) => Promise<string | null>,
  ) {}

  start(): void {
    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLElement && node.classList.contains('ytp-caption-segment')) {
            this.handleSegment(node);
          }
          if (node instanceof HTMLElement) {
            for (const seg of node.querySelectorAll<HTMLElement>('.ytp-caption-segment')) {
              this.handleSegment(seg);
            }
          }
        }
      }
    });

    this.observer.observe(document.body, { subtree: true, childList: true });
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = null;
  }

  private handleSegment(segment: HTMLElement): void {
    const text = segment.textContent?.trim() ?? '';
    if (!text || segment.getAttribute('data-xt-caption') === 'true') return;

    if (this.cache.has(text)) {
      this.appendTranslation(segment, this.cache.get(text)!);
      return;
    }

    const key = text;
    clearTimeout(this.debounceTimers.get(key));
    this.debounceTimers.set(
      key,
      setTimeout(async () => {
        this.debounceTimers.delete(key);
        const translation = await this.onTranslate(text);
        if (translation) {
          this.cache.set(text, translation);
          this.appendTranslation(segment, translation);
        }
      }, 200),
    );
  }

  private appendTranslation(segment: HTMLElement, translation: string): void {
    segment.setAttribute('data-xt-caption', 'true');
    const existing = segment.parentElement?.querySelector('.xt-yt-translation');
    if (existing) existing.remove();

    const div = document.createElement('div');
    div.className = 'xt-yt-translation';
    div.style.cssText = 'color:#fff;font-size:0.9em;opacity:0.85;margin-top:2px;text-align:center';
    div.textContent = translation;
    segment.insertAdjacentElement('afterend', div);
  }
}
