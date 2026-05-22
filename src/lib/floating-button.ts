interface FloatingButtonOptions {
  onToggleBilingual: () => void;
}

interface ButtonState {
  bilingualEnabled: boolean;
  loading: boolean;
  error: boolean;
}

const CSS = `
  @keyframes xt-dots {
    0%   { content: '·'; }
    33%  { content: '··'; }
    66%  { content: '···'; }
    100% { content: '·'; }
  }
  #xt-fab {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 2147483646;
    display: flex;
    flex-direction: column;
    align-items: center;
    user-select: none;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }
  .xt-fab-btn {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: #fff;
    border: 1px solid #e0e0e0;
    box-shadow: 0 2px 8px rgba(0,0,0,0.18);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 22px;
    transition: background 0.15s;
  }
  .xt-fab-btn:hover { background: #f5f5f5; }
  .xt-fab-btn.xt-active { background: #1a73e8; border-color: #1a73e8; }
  .xt-fab-btn.xt-loading { background: #4285f4; border-color: #4285f4; }
  .xt-fab-btn.xt-error { background: #d32f2f; border-color: #d32f2f; }
  .xt-fab-label {
    font-size: 10px;
    color: #555;
    margin-top: 4px;
    text-align: center;
    white-space: nowrap;
  }
  .xt-fab-label.xt-label-active { color: #1a73e8; }
  .xt-fab-label.xt-label-loading { color: #4285f4; }
  .xt-fab-label.xt-label-error { color: #d32f2f; }
  .xt-dots-anim::after {
    content: '·';
    animation: xt-dots 1.2s steps(1) infinite;
  }
`;

export class FloatingButton {
  private host: HTMLDivElement | null = null;
  private state: ButtonState = { bilingualEnabled: false, loading: false, error: false };

  constructor(private options: FloatingButtonOptions) {}

  mount(): void {
    if (this.host) return;
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    const host = document.createElement('div');
    host.id = 'xt-floating-host';
    document.body.appendChild(host);
    this.host = host;
    this.render();
  }

  unmount(): void {
    this.host?.remove();
    this.host = null;
  }

  updateState(state: ButtonState): void {
    this.state = state;
    this.render();
  }

  private render(): void {
    if (!this.host) return;
    const { bilingualEnabled, loading, error } = this.state;

    let btnClass = 'xt-fab-btn';
    let labelClass = 'xt-fab-label';
    let icon = '💬';
    let label = '翻譯';

    if (loading) {
      btnClass += ' xt-loading';
      labelClass += ' xt-label-loading';
      icon = '⏳';
      label = '翻譯中';
    } else if (error) {
      btnClass += ' xt-error';
      labelClass += ' xt-label-error';
      icon = '⚠️';
      label = '失敗';
    } else if (bilingualEnabled) {
      btnClass += ' xt-active';
      labelClass += ' xt-label-active';
      icon = '🔤';
      label = '已翻譯';
    }

    this.host.innerHTML = `
      <div id="xt-fab">
        <button class="${btnClass}" id="xt-btn-bilingual"
                title="${error ? '翻譯失敗 - 點此重試' : loading ? '翻譯中…' : bilingualEnabled ? '已翻譯' : '雙語翻譯'}">
          ${icon}
        </button>
        <div class="${labelClass}${loading ? ' xt-dots-anim' : ''}">${label}</div>
      </div>
    `;
    this.host.querySelector('#xt-btn-bilingual')
      ?.addEventListener('click', this.options.onToggleBilingual);
  }
}
