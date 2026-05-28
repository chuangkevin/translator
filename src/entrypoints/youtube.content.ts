import { YoutubeCaptionTranslator } from '../lib/youtube-caption';
import type { TranslateBatchMessage, TranslateBatchResult, TranslateMessage, TranslateResult } from '../lib/types';

const BUTTON_ID = 'xt-caption-toggle';
const BUTTON_ON_TITLE = '關閉字幕翻譯';
const BUTTON_OFF_TITLE = '開啟字幕翻譯';

// SVG icon: text lines with a translate arrow
const ICON_OFF = `<svg viewBox="0 0 24 24" fill="currentColor" width="100%" height="100%"><path d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0 0 14.07 6H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/></svg>`;
const ICON_ON = `<svg viewBox="0 0 24 24" fill="#4fc3f7" width="100%" height="100%"><path d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0 0 14.07 6H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/></svg>`;

export default defineContentScript({
  matches: ['*://*.youtube.com/*'],
  runAt: 'document_idle',

  main() {
    let captionOn = false;

    const captionTranslator = new YoutubeCaptionTranslator(
      async (text) => {
        const result = await sendTranslate(text);
        return result.ok ? result.translation : null;
      },
      sendTranslateBatch,
    );

    function updateButtonState(btn: HTMLButtonElement) {
      btn.title = captionOn ? BUTTON_ON_TITLE : BUTTON_OFF_TITLE;
      btn.innerHTML = captionOn ? ICON_ON : ICON_OFF;
    }

    function getOrCreateButton(): HTMLButtonElement | null {
      const existing = document.getElementById(BUTTON_ID) as HTMLButtonElement | null;
      if (existing) return existing;

      // Target the left sub-container; fall back to the outer .ytp-right-controls
      const container =
        document.querySelector('.ytp-right-controls-left') ??
        document.querySelector('.ytp-right-controls');
      if (!container) return null;

      const btn = document.createElement('button');
      btn.id = BUTTON_ID;
      btn.className = 'ytp-button';
      btn.style.cssText = 'width:48px;padding:0;opacity:.9;';
      btn.title = BUTTON_OFF_TITLE;
      btn.innerHTML = ICON_OFF;

      btn.addEventListener('click', () => {
        captionOn = !captionOn;
        console.log('[XT Caption] button toggled:', captionOn);
        if (captionOn) {
          captionTranslator.start();
        } else {
          captionTranslator.stop();
        }
        updateButtonState(btn);
      });

      // Insert before the settings button so our button sits next to subtitles
      const settingsBtn = container.querySelector('.ytp-settings-button');
      if (settingsBtn) {
        container.insertBefore(btn, settingsBtn);
      } else {
        container.appendChild(btn);
      }
      return btn;
    }

    async function waitAndInjectButton(maxMs = 8000): Promise<void> {
      const deadline = Date.now() + maxMs;
      while (Date.now() < deadline) {
        const btn = getOrCreateButton();
        if (btn) return;
        await new Promise<void>(r => setTimeout(r, 400));
      }
    }

    // Initial inject
    waitAndInjectButton().catch(() => {});

    // Re-inject on SPA navigation (YouTube swaps the player DOM)
    window.addEventListener('yt-navigate-finish', () => {
      // Stop caption translator on navigation (new video)
      if (captionOn) {
        captionTranslator.stop();
        captionOn = false;
      }
      waitAndInjectButton().catch(() => {});
    });
  },
});

function sendTranslate(text: string): Promise<TranslateResult> {
  return new Promise(resolve => {
    const msg: TranslateMessage = { type: 'translate', text };
    chrome.runtime.sendMessage(msg, (result: TranslateResult) => {
      const err = chrome.runtime.lastError;
      if (err) {
        resolve({ ok: false, error: err.message ?? 'Extension connection error' });
        return;
      }
      resolve(result ?? { ok: false, error: 'No response' });
    });
  });
}

function sendTranslateBatch(texts: string[]): Promise<(string | null)[]> {
  return new Promise(resolve => {
    const msg: TranslateBatchMessage = { type: 'translate-batch', texts };
    chrome.runtime.sendMessage(msg, (result: TranslateBatchResult) => {
      void chrome.runtime.lastError;
      resolve(result?.ok ? result.translations : texts.map(() => null));
    });
  });
}
