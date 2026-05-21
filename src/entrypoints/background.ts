import { OpenCodeClient } from '../lib/opencode-client';
import { Translator } from '../lib/translator';
import { getSettings } from '../lib/storage';
import type { TranslateMessage, TranslateResult } from '../lib/types';

export default defineBackground(() => {
  // Keyboard command → relay toggle to active tab content script
  chrome.commands.onCommand.addListener(async (command) => {
    if (command !== 'toggle-translation') return;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id != null) {
      chrome.tabs.sendMessage(tab.id, { type: 'toggle-translation' });
    }
  });

  // Translation requests from content scripts
  chrome.runtime.onMessage.addListener(
    (message: TranslateMessage, _sender, sendResponse: (result: TranslateResult) => void) => {
      if (message.type !== 'translate') return false;

      (async () => {
        const settings = await getSettings();
        const client = new OpenCodeClient({
          serverUrl: settings.serverUrl,
          provider: settings.provider,
          model: settings.model,
          targetLang: settings.targetLang,
        });
        const translator = new Translator(client);
        const result = await translator.translate(message.text);
        sendResponse(result);
      })();

      return true; // keep message channel open for async response
    },
  );
});
