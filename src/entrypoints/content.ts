import { BilingualInjector } from '../lib/bilingual-injector';
import { SelectionPopup } from '../lib/selection-popup';
import { FloatingButton } from '../lib/floating-button';
import { getSettings, saveSettings } from '../lib/storage';
import type { TranslateMessage, TranslateResult, ToggleTranslationMessage } from '../lib/types';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',

  async main() {
    const settings = await getSettings();
    let bilingualEnabled = settings.bilingualEnabled;
    let selectionEnabled = settings.selectionEnabled;

    const injector = new BilingualInjector(document.body);

    const selectionPopup = new SelectionPopup(async (text) => {
      const result = await sendTranslate(text);
      if (result.ok) {
        selectionPopup.setTranslation(result.translation);
      } else {
        selectionPopup.setError();
      }
    });
    selectionPopup.mount();

    const floatingBtn = new FloatingButton({
      onToggleBilingual: () => toggleBilingual(),
      onToggleSelection: () => toggleSelection(),
    });
    floatingBtn.mount();
    floatingBtn.updateState({ bilingualEnabled, selectionEnabled, error: false });

    document.addEventListener('mouseup', () => {
      if (!selectionEnabled) return;
      const sel = window.getSelection();
      const text = sel?.toString().trim() ?? '';
      if (text.length < 2) {
        selectionPopup.hide();
        return;
      }
      const range = sel!.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      selectionPopup.show(text, { x: rect.left + window.scrollX, y: rect.bottom + window.scrollY });
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') selectionPopup.hide();
    });

    document.addEventListener('mousedown', (e) => {
      const popup = document.getElementById('xt-selection-popup');
      if (popup && !popup.contains(e.target as Node)) selectionPopup.hide();
    });

    chrome.runtime.onMessage.addListener((message: ToggleTranslationMessage) => {
      if (message.type === 'toggle-translation') toggleBilingual();
    });

    async function toggleBilingual() {
      bilingualEnabled = !bilingualEnabled;
      await saveSettings({ bilingualEnabled });
      floatingBtn.updateState({ bilingualEnabled, selectionEnabled, error: false });
      if (bilingualEnabled) {
        await translatePage();
      } else {
        injector.clear();
      }
    }

    async function toggleSelection() {
      selectionEnabled = !selectionEnabled;
      await saveSettings({ selectionEnabled });
      floatingBtn.updateState({ bilingualEnabled, selectionEnabled, error: false });
    }

    let isTranslating = false;
    async function translatePage() {
      if (isTranslating) return;
      isTranslating = true;
      try {
        const targets = injector.getTargets();
        await Promise.all(
          targets.map(async (el) => {
            const text = el.textContent?.trim() ?? '';
            if (!text) return;
            const result = await sendTranslate(text);
            if (result.ok) {
              injector.inject(el, result.translation);
            } else {
              floatingBtn.updateState({ bilingualEnabled, selectionEnabled, error: true });
            }
          }),
        );
      } finally {
        isTranslating = false;
      }
    }
  },
});

function sendTranslate(text: string): Promise<TranslateResult> {
  return new Promise(resolve => {
    const msg: TranslateMessage = { type: 'translate', text };
    chrome.runtime.sendMessage(msg, (result: TranslateResult) => {
      resolve(result ?? { ok: false, error: 'No response from background' });
    });
  });
}
