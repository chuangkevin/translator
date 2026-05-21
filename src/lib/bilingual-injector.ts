const SELECTOR = 'p, h1, h2, h3, h4, h5, h6, li, td, blockquote';
let idCounter = 0;

export class BilingualInjector {
  constructor(private root: HTMLElement | Document = document.body) {}

  getTargets(): HTMLElement[] {
    return Array.from(this.root.querySelectorAll<HTMLElement>(SELECTOR)).filter(
      el =>
        !el.hasAttribute('data-xt-id') &&
        !el.classList.contains('xt-translation') &&
        (el.textContent?.trim().length ?? 0) > 0,
    );
  }

  inject(el: HTMLElement, translation: string): void {
    el.setAttribute('data-xt-id', String(++idCounter));
    const node = document.createElement(el.tagName.toLowerCase());
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
  }
}
