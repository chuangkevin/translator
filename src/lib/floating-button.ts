interface FloatingButtonOptions {
  onToggleBilingual: () => void;
  onToggleSelection: () => void;
}

interface ButtonState {
  bilingualEnabled: boolean;
  selectionEnabled: boolean;
  error: boolean;
}

const CSS = `
  #xt-fab {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 2147483646;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    user-select: none;
  }
  .xt-fab-btn {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: #fff;
    border: 1px solid #e0e0e0;
    box-shadow: 0 2px 8px rgba(0,0,0,0.18);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    transition: background 0.15s;
  }
  .xt-fab-btn:hover { background: #f5f5f5; }
  .xt-fab-btn.xt-active { background: #e8f0fe; border-color: #1a73e8; }
  .xt-fab-btn.xt-error { border-color: #d32f2f; }
  .xt-menu { display: flex; flex-direction: column; gap: 8px; }
`;

export class FloatingButton {
  private host: HTMLDivElement | null = null;
  private state: ButtonState = { bilingualEnabled: false, selectionEnabled: true, error: false };

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
    const { bilingualEnabled, selectionEnabled, error } = this.state;
    this.host.innerHTML = `
      <div id="xt-fab">
        <div class="xt-menu">
          <button class="xt-fab-btn ${bilingualEnabled ? 'xt-active' : ''} ${error ? 'xt-error' : ''}"
                  id="xt-btn-bilingual" title="雙語翻譯">
            ${bilingualEnabled ? '🔤' : '💬'}
          </button>
          <button class="xt-fab-btn ${selectionEnabled ? 'xt-active' : ''}"
                  id="xt-btn-selection" title="選取翻譯">
            ✏️
          </button>
        </div>
      </div>
    `;
    this.host.querySelector('#xt-btn-bilingual')
      ?.addEventListener('click', this.options.onToggleBilingual);
    this.host.querySelector('#xt-btn-selection')
      ?.addEventListener('click', this.options.onToggleSelection);
  }
}
