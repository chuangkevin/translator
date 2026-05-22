const SELECTOR = 'p, h1, h2, h3, h4, h5, h6, li, td, blockquote';

// Characters that exist only in Simplified Chinese (not Traditional Chinese)
const SIMPLIFIED_CHARS = new Set(
  '们书爱见说这来时头国动过间经联决达产层将补导电发风够关规号话华环获际量领论没农气钱强亲请区认识属树岁谈体听务系选义应优语员运长针众么',
);

export function isSimplifiedChinese(text: string): boolean {
  // Japanese text contains hiragana/katakana — don't misidentify as Chinese
  if (/[぀-ゟ゠-ヿ]/.test(text)) return false;
  for (const char of text) {
    if (SIMPLIFIED_CHARS.has(char)) return true;
  }
  return false;
}

export class BilingualInjector {
  private idCounter = 0;

  constructor(private root: HTMLElement | Document = document.body) {}

  private get ownerDoc(): Document {
    return this.root instanceof Document ? this.root : this.root.ownerDocument;
  }

  private isTarget(el: HTMLElement): boolean {
    return (
      el.matches(SELECTOR) &&
      !el.hasAttribute('data-xt-id') &&
      !el.hasAttribute('data-xt-orig') &&
      !el.classList.contains('xt-translation') &&
      (el.textContent?.trim().length ?? 0) > 0
    );
  }

  getTargets(): HTMLElement[] {
    return Array.from(this.root.querySelectorAll<HTMLElement>(SELECTOR)).filter(el =>
      this.isTarget(el),
    );
  }

  getNewTargets(root: HTMLElement): HTMLElement[] {
    const results: HTMLElement[] = [];
    if (this.isTarget(root)) results.push(root);
    for (const el of root.querySelectorAll<HTMLElement>(SELECTOR)) {
      if (this.isTarget(el)) results.push(el);
    }
    return results;
  }

  injectPlaceholder(el: HTMLElement): HTMLElement {
    el.setAttribute('data-xt-id', String(++this.idCounter));
    const node = this.ownerDoc.createElement(el.tagName.toLowerCase());
    node.className = 'xt-translation';
    node.textContent = '…';
    node.style.opacity = '0.4';
    const win = this.ownerDoc.defaultView;
    if (win) {
      const cs = win.getComputedStyle(el);
      node.style.cssText = [
        `font-family:${cs.fontFamily}`,
        `font-size:${cs.fontSize}`,
        `font-weight:${cs.fontWeight}`,
        `font-style:${cs.fontStyle}`,
        `line-height:${cs.lineHeight}`,
        `color:${cs.color}`,
        `margin-top:${cs.marginTop}`,
        `margin-bottom:${cs.marginBottom}`,
        `opacity:0.4`,
      ].join(';');
    }
    el.insertAdjacentElement('afterend', node);
    return node;
  }

  fulfill(node: HTMLElement, translation: string): void {
    node.textContent = translation;
    node.style.opacity = '';
  }

  inject(el: HTMLElement, translation: string): void {
    const node = this.injectPlaceholder(el);
    this.fulfill(node, translation);
  }

  replaceSimplified(el: HTMLElement, translation: string): void {
    el.setAttribute('data-xt-orig', el.textContent ?? '');
    el.textContent = translation;
  }

  clear(): void {
    for (const el of this.root.querySelectorAll<HTMLElement>('.xt-translation')) {
      el.remove();
    }
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-xt-id]')) {
      el.removeAttribute('data-xt-id');
    }
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-xt-orig]')) {
      el.textContent = el.getAttribute('data-xt-orig') ?? '';
      el.removeAttribute('data-xt-orig');
    }
    this.idCounter = 0;
  }
}
