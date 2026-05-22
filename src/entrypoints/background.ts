import { OpenCodeClient } from '../lib/opencode-client';
import { Translator } from '../lib/translator';
import { getSettings } from '../lib/storage';
import type { TranslateMessage, TranslateResult } from '../lib/types';

export default defineBackground(() => {
  console.log('[Translator BG] Service worker started');

  // Keyboard command → relay toggle to active tab content script
  chrome.commands.onCommand.addListener(async (command) => {
    if (command !== 'toggle-translation') return;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id != null) {
      chrome.tabs.sendMessage(tab.id, { type: 'toggle-translation' }, () => {
        void chrome.runtime.lastError; // suppress "no receiving end" errors
      });
    }
  });

  // Translation requests from content scripts
  chrome.runtime.onMessage.addListener(
    (message: TranslateMessage, _sender, sendResponse: (result: TranslateResult) => void) => {
      if (message.type !== 'translate') return false;

      (async () => {
        try {
          const settings = await getSettings();
          console.log('[Translator BG] translate request | serverUrl:', settings.serverUrl, '| text:', message.text.slice(0, 40));
          const client = new OpenCodeClient({
            serverUrl: settings.serverUrl,
            provider: settings.provider,
            model: settings.model,
            targetLang: settings.targetLang,
          });
          const translator = new Translator(client);
          const result = await translator.translate(message.text);
          if (!result.ok) {
            console.warn('[Translator BG] translate failed:', result.error, '| serverUrl:', settings.serverUrl);
          } else {
            console.log('[Translator BG] translate ok | result:', result.translation?.slice(0, 40));
          }
          sendResponse(result);
        } catch (e) {
          console.warn('[Translator BG] unexpected error:', e);
          sendResponse({ ok: false, error: String(e) });
        }
      })();

      return true; // keep message channel open for async response
    },
  );
});
