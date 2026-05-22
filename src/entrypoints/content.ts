import { BilingualInjector, isSimplifiedChinese } from '../lib/bilingual-injector';
import { FloatingButton } from '../lib/floating-button';
import { getSiteRules } from '../lib/storage';
import type {
  TranslateMessage,
  TranslateResult,
  ToggleTranslationMessage,
  ApplySiteRuleMessage,
} from '../lib/types';

function isTraditionalChinesePage(): boolean {
  // YouTube's lang attribute reflects the user's UI language, not the video content language.
  // Sample the video title to detect the actual content language.
  if (location.hostname.includes('youtube.com')) {
    const titleEl = document.querySelector<HTMLElement>('h1, #title yt-formatted-string');
    const sample = (titleEl?.textContent ?? '').trim();
    if (!sample) return false; // can't detect → assume non-Chinese, translate
    const cjkCount = (sample.match(/[一-鿿]/g) ?? []).length;
    return cjkCount / Math.max(sample.length, 1) > 0.5;
  }

  const lang = document.documentElement.lang.toLowerCase().trim();
  if (lang.startsWith('zh-tw') || lang.startsWith('zh-hk') || lang.startsWith('zh-hant') || lang.startsWith('zh-mo')) {
    return true;
  }
  if (lang && !lang.startsWith('zh')) return false;
  // No lang / generic 'zh': sample body text
  const sample = (document.body?.textContent ?? '').replace(/\s+/g, '').slice(0, 500);
  const cjkCount = (sample.match(/[一-鿿]/g) ?? []).length;
  if (cjkCount < 30) return false;
  return !isSimplifiedChinese(sample);
}

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',

  async main() {
    console.log('[Translator CS] Content script started on', location.href);
    let bilingualEnabled = false;
    let isTranslating = false;

    const siteRules = await getSiteRules();
    const domain = location.hostname;
    const pageKey = location.origin + location.pathname;
    const domainBehavior = siteRules.domains[domain];
    const isSkipped = siteRules.skipUrls.includes(pageKey);

    if (domainBehavior === 'never') return;

    const injector = new BilingualInjector(document.body);
    const floatingBtn = new FloatingButton({
      onToggleBilingual: () => { toggleBilingual().catch(() => {}); },
    });
    floatingBtn.mount();
    floatingBtn.updateState({ bilingualEnabled: false, loading: false, error: false });

    // Auto-translate: 'always' domain forces it; otherwise translate any non-Traditional-Chinese page
    if (!isSkipped && (domainBehavior === 'always' || !isTraditionalChinesePage())) {
      toggleBilingual().catch(() => {});
    }

    // Alt+A: direct keydown listener — more reliable than chrome.commands relay via service worker
    document.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        toggleBilingual().catch(() => {});
      }
    }, { capture: true });

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
      if (isTranslating) return; // ignore toggle during active translation
      bilingualEnabled = !bilingualEnabled;
      console.log('[Translator CS] bilingual toggled to', bilingualEnabled);
      if (bilingualEnabled) {
        await translatePage();
      } else {
        floatingBtn.updateState({ bilingualEnabled: false, loading: false, error: false });
        injector.clear();
      }
    }

    async function translatePage() {
      if (isTranslating) return;
      isTranslating = true;
      floatingBtn.updateState({ bilingualEnabled: true, loading: true, error: false });
      try {
        const targets = injector.getTargets();
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
              placeholders[i].remove();
              el.removeAttribute('data-xt-id');
            }
          }),
        );

        const allFailed = targets.length > 0 && successCount === 0;
        if (allFailed) {
          bilingualEnabled = false; // revert — nothing was actually translated
        }
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
      const err = chrome.runtime.lastError;
      if (err) {
        resolve({ ok: false, error: err.message ?? 'Extension connection error' });
        return;
      }
      resolve(result ?? { ok: false, error: 'No response from background' });
    });
  });
}
