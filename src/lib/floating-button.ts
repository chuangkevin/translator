interface FloatingButtonOptions {
  onToggleBilingual: () => void;
}

interface ButtonState {
  bilingualEnabled: boolean;
  loading: boolean;
  error: boolean;
  /** Raw failure reason from the background; surfaced to the user when error is true. */
  errorMessage?: string;
}

/** Turn a raw OpenCode/transport error into a short, truthful Chinese reason for the FAB label.
 *  A 5xx from the self-hosted OpenCode server almost always means the configured model is
 *  unavailable (e.g. renamed/removed), so we say so instead of showing a bare status code. */
function errorReason(msg: string): string {
  if (/timed out|timeout/i.test(msg)) return '伺服器逾時';
  if (/HTTP 5\d\d/.test(msg)) return '伺服器錯誤（模型可能已失效）';
  if (/HTTP 4\d\d/.test(msg)) return '請求被拒（檢查設定）';
  if (/connection|connect|failed to fetch|no response|network/i.test(msg)) return '無法連線到伺服器';
  return msg.length > 16 ? `${msg.slice(0, 16)}…` : msg || '翻譯失敗';
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, '&quot;');
}

const PEEK_PX = 24;
const DRAG_THRESHOLD = 4;
const EDGE_MARGIN = 40;

const CSS = `
  @keyframes xt-dots {
    0%   { content: '·'; }
    33%  { content: '··'; }
    66%  { content: '···'; }
    100% { content: '·'; }
  }
  #xt-floating-host {
    position: fixed;
    z-index: 2147483646;
    transform: translateY(-50%);
    transition: right 0.2s ease, left 0.2s ease;
    user-select: none;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    cursor: grab;
  }
  #xt-floating-host.xt-dragging {
    cursor: grabbing;
    transition: none !important;
  }
  #xt-fab {
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .xt-fab-btn {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: #fff;
    border: 1px solid #e0e0e0;
    box-shadow: 0 2px 8px rgba(0,0,0,0.18);
    cursor: inherit;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 22px;
    pointer-events: none;
    transition: background 0.15s;
  }
  .xt-fab-btn.xt-active  { background: #1a73e8; border-color: #1a73e8; }
  .xt-fab-btn.xt-loading { background: #4285f4; border-color: #4285f4; }
  .xt-fab-btn.xt-error   { background: #d32f2f; border-color: #d32f2f; }
  .xt-fab-label {
    font-size: 10px;
    color: #555;
    margin-top: 4px;
    text-align: center;
    white-space: nowrap;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.15s ease;
  }
  #xt-floating-host:hover .xt-fab-label,
  #xt-floating-host.xt-dragging .xt-fab-label,
  #xt-floating-host.xt-error-visible .xt-fab-label { opacity: 1; }
  .xt-fab-label.xt-label-active  { color: #1a73e8; }
  .xt-fab-label.xt-label-loading { color: #4285f4; }
  .xt-fab-label.xt-label-error   { color: #d32f2f; }
  .xt-dots-anim::after {
    content: '·';
    animation: xt-dots 1.2s steps(1) infinite;
  }
`;

export class FloatingButton {
  private host: HTMLDivElement | null = null;
  private state: ButtonState = { bilingualEnabled: false, loading: false, error: false };
  private side: 'left' | 'right' = 'right';
  private topPx = 0;
  private isDragging = false;

  constructor(private options: FloatingButtonOptions) {}

  mount(): void {
    if (this.host) return;
    this.topPx = window.innerHeight / 2;

    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    const host = document.createElement('div');
    host.id = 'xt-floating-host';
    document.body.appendChild(host);
    this.host = host;

    this.applyPosition(false);
    this.bindEvents();
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

  private applyPosition(visible: boolean): void {
    const host = this.host;
    if (!host) return;
    const offset = visible ? 0 : -PEEK_PX;
    host.style.top = `${this.topPx}px`;
    if (this.side === 'right') {
      host.style.right = `${offset}px`;
      host.style.left = '';
    } else {
      host.style.left = `${offset}px`;
      host.style.right = '';
    }
  }

  private bindEvents(): void {
    const host = this.host!;

    host.addEventListener('mouseenter', () => {
      if (!this.isDragging) this.applyPosition(true);
    });
    host.addEventListener('mouseleave', () => {
      if (!this.isDragging) this.applyPosition(false);
    });

    host.addEventListener('mousedown', (e: MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();

      const startX = e.clientX;
      const startY = e.clientY;
      const startTop = this.topPx;
      let hasMoved = false;

      const onMove = (ev: MouseEvent) => {
        if (!hasMoved) {
          if (Math.abs(ev.clientX - startX) < DRAG_THRESHOLD && Math.abs(ev.clientY - startY) < DRAG_THRESHOLD) return;
          hasMoved = true;
          this.isDragging = true;
          host.classList.add('xt-dragging');
          this.applyPosition(true);
        }
        this.topPx = Math.max(EDGE_MARGIN, Math.min(window.innerHeight - EDGE_MARGIN, startTop + (ev.clientY - startY)));
        host.style.top = `${this.topPx}px`;
      };

      const onUp = (ev: MouseEvent) => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);

        if (hasMoved) {
          this.isDragging = false;
          host.classList.remove('xt-dragging');
          this.side = ev.clientX < window.innerWidth / 2 ? 'left' : 'right';
          const rect = host.getBoundingClientRect();
          const stillOver = ev.clientX >= rect.left && ev.clientX <= rect.right
                         && ev.clientY >= rect.top  && ev.clientY <= rect.bottom;
          this.applyPosition(stillOver);
        } else {
          this.options.onToggleBilingual();
        }
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  private render(): void {
    if (!this.host) return;
    const { bilingualEnabled, loading, error, errorMessage } = this.state;

    let btnClass = 'xt-fab-btn';
    let labelClass = 'xt-fab-label';
    let icon = '💬';
    let label = '翻譯';
    let title = '雙語翻譯';

    if (loading) {
      btnClass += ' xt-loading';
      labelClass += ' xt-label-loading';
      icon = '⏳';
      label = '翻譯中';
      title = '翻譯中…';
    } else if (error) {
      btnClass += ' xt-error';
      labelClass += ' xt-label-error';
      icon = '⚠️';
      label = errorMessage ? errorReason(errorMessage) : '失敗';
      // Full raw error in the tooltip for debugging; humanized reason on the label.
      title = errorMessage ? `翻譯失敗：${errorMessage}（點此重試）` : '翻譯失敗 - 點此重試';
    } else if (bilingualEnabled) {
      btnClass += ' xt-active';
      labelClass += ' xt-label-active';
      icon = '🔤';
      label = '已翻譯';
      title = '已翻譯';
    }

    // Keep the reason on screen in the error state instead of revealing it only on hover.
    this.host.classList.toggle('xt-error-visible', error);

    this.host.innerHTML = `
      <div id="xt-fab">
        <div class="${btnClass}" title="${escapeAttr(title)}">
          ${icon}
        </div>
        <div class="${labelClass}${loading ? ' xt-dots-anim' : ''}">${escapeHtml(label)}</div>
      </div>
    `;
  }
}
