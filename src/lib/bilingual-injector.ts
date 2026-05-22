const SELECTOR = 'p, h1, h2, h3, h4, h5, h6, li, td, blockquote';

export class BilingualInjector {
  private idCounter = 0;

  constructor(private root: HTMLElement | Document = document.body) {}

  private get ownerDoc(): Document {
    return this.root instanceof Document ? this.root : this.root.ownerDocument;
  }

  getTargets(): HTMLElement[] {
    return Array.from(this.root.querySelectorAll<HTMLElement>(SELECTOR)).filter(
      el =>
        !el.hasAttribute('data-xt-id') &&
        !el.classList.contains('xt-translation') &&
        (el.textContent?.trim().length ?? 0) > 0,
    );
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

  clear(): void {
    for (const el of this.root.querySelectorAll<HTMLElement>('.xt-translation')) {
      el.remove();
    }
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-xt-id]')) {
      el.removeAttribute('data-xt-id');
    }
    this.idCounter = 0;
  }
}
