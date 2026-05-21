export type TranslateCallback = (text: string) => void;

export class SelectionPopup {
  private el: HTMLDivElement | null = null;

  constructor(private onTranslate: TranslateCallback) {}

  mount(): void {
    if (this.el) return;
    const div = document.createElement('div');
    div.id = 'xt-selection-popup';
    div.style.cssText = [
      'position:fixed',
      'z-index:2147483647',
      'display:none',
      'background:#fff',
      'border:1px solid #e0e0e0',
      'border-radius:8px',
      'padding:10px 14px',
      'box-shadow:0 4px 16px rgba(0,0,0,0.15)',
      'font-size:14px',
      'line-height:1.5',
      'max-width:320px',
      'word-break:break-word',
    ].join(';');
    document.body.appendChild(div);
    this.el = div;
  }

  show(text: string, pos: { x: number; y: number }): void {
    if (!this.el) return;
    this.el.innerHTML = `
      <div style="color:#555;font-size:12px;margin-bottom:4px">原文</div>
      <div style="color:#333">${escapeHtml(text)}</div>
      <div style="color:#555;font-size:12px;margin:6px 0 4px">譯文</div>
      <div class="xt-popup-translation" style="color:#1a73e8">翻譯中…</div>
    `;
    const margin = 8;
    this.el.style.left = `${Math.min(pos.x, window.innerWidth - 340)}px`;
    this.el.style.top = `${pos.y + margin}px`;
    this.el.style.display = 'block';
    this.onTranslate(text);
  }

  setTranslation(translation: string): void {
    const node = this.el?.querySelector('.xt-popup-translation');
    if (node) node.textContent = translation;
  }

  setError(): void {
    const node = this.el?.querySelector('.xt-popup-translation');
    if (node) {
      (node as HTMLElement).style.color = '#d32f2f';
      node.textContent = '翻譯失敗';
    }
  }

  hide(): void {
    if (this.el) this.el.style.display = 'none';
  }

  unmount(): void {
    this.el?.remove();
    this.el = null;
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
