import { YoutubeCaptionTranslator } from '../lib/youtube-caption';
import type { TranslateMessage, TranslateResult } from '../lib/types';

export default defineContentScript({
  matches: ['*://*.youtube.com/*'],
  runAt: 'document_idle',

  main() {
    const captionTranslator = new YoutubeCaptionTranslator(async (text) => {
      const result = await sendTranslate(text);
      return result.ok ? result.translation : null;
    });

    captionTranslator.start();
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
