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

  inject(el: HTMLElement, translation: string): void {
    el.setAttribute('data-xt-id', String(++this.idCounter));
    const node = this.ownerDoc.createElement(el.tagName.toLowerCase());
    node.className = 'xt-translation';
    node.textContent = translation;
    el.insertAdjacentElement('afterend', node);
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
