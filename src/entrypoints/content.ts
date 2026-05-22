import { BilingualInjector, isSimplifiedChinese } from '../lib/bilingual-injector';
import { FloatingButton } from '../lib/floating-button';
import { getSiteRules } from '../lib/storage';
import type {
  TranslateMessage,
  TranslateResult,
  ToggleTranslationMessage,
  ApplySiteRuleMessage,
} from '../lib/types';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',

  async main() {
    console.log('[Translator CS] Content script started on', location.href);
    let bilingualEnabled = false; // always start fresh — state reflects actual page content

    // Check site rules before mounting anything
    const siteRules = await getSiteRules();
    const domain = location.hostname;
    const pageKey = location.origin + location.pathname;
    const domainBehavior = siteRules.domains[domain];
    const isSkipped = siteRules.skipUrls.includes(pageKey);

    if (domainBehavior === 'never') {
      // Don't mount anything, exit silently
      return;
    }

    const injector = new BilingualInjector(document.body);

    const floatingBtn = new FloatingButton({
      onToggleBilingual: () => { toggleBilingual().catch(() => {}); },
    });
    floatingBtn.mount();
    floatingBtn.updateState({ bilingualEnabled, loading: false, error: false });

    // Auto-translate if domain is set to 'always'
    if (domainBehavior === 'always' && !isSkipped && !bilingualEnabled) {
      toggleBilingual().catch(() => {});
    }

    chrome.runtime.onMessage.addListener((message: ToggleTranslationMessage | ApplySiteRuleMessage) => {
      if (message.type === 'toggle-translation') {
        toggleBilingual().catch(() => {});
      } else if (message.type === 'apply-site-rule') {
        const msg = message as ApplySiteRuleMessage;
        if (msg.behavior === 'never') {
          floatingBtn.unmount();
        } else if (msg.behavior === 'always') {
          if (!bilingualEnabled) toggleBilingual().catch(() => {});
        }
      }
    });

    async function toggleBilingual() {
      bilingualEnabled = !bilingualEnabled;
      floatingBtn.updateState({ bilingualEnabled, loading: false, error: false });
      console.log('[Translator CS] bilingual toggled to', bilingualEnabled);
      if (bilingualEnabled) {
        await translatePage();
      } else {
        injector.clear();
      }
    }

    let isTranslating = false;
    async function translatePage() {
      if (isTranslating) return;
      isTranslating = true;
      // Reset error state, set loading
      floatingBtn.updateState({ bilingualEnabled, loading: true, error: false });
      try {
        const targets = injector.getTargets();
        // Inject placeholders for all targets immediately
        const placeholders = targets.map(el => injector.injectPlaceholder(el));

        let successCount = 0;
        await Promise.all(
          targets.map(async (el, i) => {
            const text = el.textContent?.trim() ?? '';
            if (!text) return;
            const result = await sendTranslate(text);
            if (result.ok) {
              if (isSimplifiedChinese(text)) {
                placeholders[i].remove();
                el.removeAttribute('data-xt-id');
                injector.replaceSimplified(el, result.translation);
              } else {
                injector.fulfill(placeholders[i], result.translation);
              }
              successCount++;
            } else {
              // Remove placeholder and clear marker on original element
              placeholders[i].remove();
              el.removeAttribute('data-xt-id');
            }
          }),
        );

        const allFailed = targets.length > 0 && successCount === 0;
        floatingBtn.updateState({ bilingualEnabled, loading: false, error: allFailed });
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
      // Must read lastError to prevent Chrome from logging it as an uncaught error
      const err = chrome.runtime.lastError;
      if (err) {
        resolve({ ok: false, error: err.message ?? 'Extension connection error' });
        return;
      }
      resolve(result ?? { ok: false, error: 'No response from background' });
    });
  });
}
