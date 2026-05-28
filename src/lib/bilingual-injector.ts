// yt-attributed-string is YouTube's newer comment text element (replaces yt-formatted-string in comments)
const SELECTOR = 'p, h1, h2, h3, h4, h5, h6, li, td, blockquote, #content-text, #video-title, yt-attributed-string';

// Characters that exist only in Simplified Chinese (not Traditional Chinese)
const SIMPLIFIED_CHARS = new Set(
  '们书爱见说这来时头国动过间经联决达产层将补导电发风够关规号话华环获际量领论没农气钱强亲请区认识属树岁谈体听务系选义应优语员运长针众么',
);

const STYLE_ID = 'xt-injector-style';
const INJECTOR_CSS = [
  '@keyframes xt-pulse{0%,100%{opacity:.2}50%{opacity:.75}}',
  '.xt-loading{animation:xt-pulse 1.2s ease-in-out infinite}',
].join('');

export function isSimplifiedChinese(text: string): boolean {
  // Japanese text contains hiragana/katakana — don't misidentify as Chinese
  if (/[぀-ゟ゠-ヿ]/.test(text)) return false;
  for (const char of text) {
    if (SIMPLIFIED_CHARS.has(char)) return true;
  }
  return false;
}

function applyStyles(el: HTMLElement, styles: Record<string, string>): void {
  for (const [prop, val] of Object.entries(styles)) {
    (el.style as unknown as Record<string, string>)[prop] = val;
  }
}

export class BilingualInjector {
  private idCounter = 0;

  constructor(private root: HTMLElement | Document = document.body) {}

  private get ownerDoc(): Document {
    return this.root instanceof Document ? this.root : this.root.ownerDocument;
  }

  private ensureStyles(): void {
    const doc = this.ownerDoc;
    if (doc.getElementById(STYLE_ID)) return;
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = INJECTOR_CSS;
    (doc.head ?? doc.documentElement).appendChild(style);
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
    this.ensureStyles();
    el.setAttribute('data-xt-id', String(++this.idCounter));
    const tag = el.tagName.toUpperCase();
    // td/th/li: inserting a sibling element of the same type would corrupt table columns
    // or add extra list items. Insert a <div> block inside the element instead.
    const insertInside = tag === 'TD' || tag === 'TH' || tag === 'LI';
    // h1-h6: use body-text size so the translation doesn't dominate the visual hierarchy.
    const isHeading = /^H[1-6]$/.test(tag);
    const node = this.ownerDoc.createElement(insertInside ? 'div' : el.tagName.toLowerCase());
    node.className = 'xt-translation xt-loading';
    node.textContent = '…';
    const win = this.ownerDoc.defaultView;
    if (win) {
      const cs = win.getComputedStyle(el);
      if (insertInside) {
        applyStyles(node, {
          display: 'block',
          fontFamily: cs.fontFamily,
          fontSize: '0.8em',
          color: cs.color,
          borderTop: '1px solid rgba(0,0,0,0.08)',
          marginTop: '4px',
          paddingTop: '4px',
          opacity: '0.4',
        });
        el.appendChild(node);
      } else {
        // Headings keep their font-weight and family, but are scaled down to ~70%
        // so the translation is visually subordinate without looking like body text.
        const fontSize = isHeading
          ? `${Math.max(Math.round(parseFloat(cs.fontSize) * 0.7), 14)}px`
          : cs.fontSize;
        applyStyles(node, {
          fontFamily: cs.fontFamily,
          fontSize,
          fontWeight: cs.fontWeight,
          fontStyle: cs.fontStyle,
          lineHeight: cs.lineHeight,
          color: cs.color,
          marginTop: '4px',
          marginBottom: cs.marginBottom,
          maxWidth: '100%',
          opacity: '0.4',
        });
        el.insertAdjacentElement('afterend', node);
      }
    } else {
      insertInside ? el.appendChild(node) : el.insertAdjacentElement('afterend', node);
    }
    return node;
  }

  fulfill(node: HTMLElement, translation: string): void {
    node.classList.remove('xt-loading');
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
