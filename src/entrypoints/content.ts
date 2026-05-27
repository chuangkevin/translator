import { BilingualInjector, isSimplifiedChinese } from '../lib/bilingual-injector';
import { FloatingButton } from '../lib/floating-button';
import { getSiteRules } from '../lib/storage';
import type {
  TranslateMessage,
  TranslateResult,
  TranslateBatchMessage,
  TranslateBatchResult,
  ToggleTranslationMessage,
  ApplySiteRuleMessage,
} from '../lib/types';

const BATCH_SIZE = 5;

// Characters found only in Traditional Chinese (distinct Unicode code points from their SC counterparts).
// Detecting any of these in body text is a strong TC signal.
const TC_MARKER_RE = /[體語電腦學務請時間問題關係話應該國際傳統現實義務環境識別數據處理認識]/;
// Hiragana/Katakana ranges — presence means the page is Japanese, not Chinese.
const JAPANESE_RE = /[぀-ゟ゠-ヿ]/;

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
  // Explicit Traditional Chinese → skip translation
  if (lang.startsWith('zh-tw') || lang.startsWith('zh-hk') || lang.startsWith('zh-hant') || lang.startsWith('zh-mo')) {
    return true;
  }
  // Explicit Simplified Chinese → translate
  if (lang.startsWith('zh-cn') || lang.startsWith('zh-hans') || lang.startsWith('zh-sg') || lang.startsWith('zh-my')) {
    return false;
  }
  // Non-Chinese language → translate
  if (lang && !lang.startsWith('zh')) return false;

  // No lang / generic 'zh': sample body text
  const sample = (document.body?.textContent ?? '').replace(/\s+/g, '').slice(0, 500);
  const cjkCount = (sample.match(/[一-鿿]/g) ?? []).length;
  if (cjkCount < 30) return false;

  // Positive TC signal: TC-exclusive characters present, no Japanese kana → definitely TC
  if (!JAPANESE_RE.test(sample) && TC_MARKER_RE.test(sample)) return true;

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

    let mutationObserver: MutationObserver | null = null;
    let pendingEls = new Set<HTMLElement>();
    let debounceId: ReturnType<typeof setTimeout> | null = null;

    function startObserver() {
      mutationObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (!(node instanceof HTMLElement)) continue;
            for (const el of injector.getNewTargets(node)) pendingEls.add(el);
          }
        }
        if (pendingEls.size === 0) return;
        if (debounceId !== null) clearTimeout(debounceId);
        debounceId = setTimeout(() => {
          const els = Array.from(pendingEls);
          pendingEls.clear();
          Promise.all(els.map(el => translateEl(el))).catch(() => {});
        }, 200);
      });
      mutationObserver.observe(document.body, { childList: true, subtree: true });
    }

    function stopObserver() {
      mutationObserver?.disconnect();
      mutationObserver = null;
      if (debounceId !== null) { clearTimeout(debounceId); debounceId = null; }
      pendingEls.clear();
    }

    // Auto-translate: 'always' domain forces it; otherwise translate any non-Traditional-Chinese page
    if (!isSkipped && (domainBehavior === 'always' || !isTraditionalChinesePage())) {
      toggleBilingual().catch(() => {});
    }

    // YouTube SPA: re-translate when navigating between videos (DOM is swapped, not added)
    window.addEventListener('yt-navigate-finish', () => {
      if (bilingualEnabled && !isTranslating) {
        translatePage().catch(() => {});
      }
    });

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
      if (isTranslating) return;
      bilingualEnabled = !bilingualEnabled;
      console.log('[Translator CS] bilingual toggled to', bilingualEnabled);
      if (bilingualEnabled) {
        startObserver(); // start before translatePage so elements added during slow translation are caught
        await translatePage();
      } else {
        stopObserver();
        floatingBtn.updateState({ bilingualEnabled: false, loading: false, error: false });
        injector.clear();
      }
    }

    async function translateEl(el: HTMLElement): Promise<void> {
      const text = el.textContent?.trim() ?? '';
      if (!text) return;
      const placeholder = injector.injectPlaceholder(el);
      const result = await sendTranslate(text);
      if (result.ok) {
        if (isSimplifiedChinese(text)) {
          placeholder.remove();
          el.removeAttribute('data-xt-id');
          injector.replaceSimplified(el, result.translation);
        } else {
          injector.fulfill(placeholder, result.translation);
        }
      } else {
        placeholder.remove();
        el.removeAttribute('data-xt-id');
      }
    }

    async function translatePage() {
      if (isTranslating) return;
      isTranslating = true;
      floatingBtn.updateState({ bilingualEnabled: true, loading: true, error: false });
      try {
        const targets = injector.getTargets();
        let successCount = 0;
        let lastError = '';

        // Group elements into batches: one API call per batch ≈ BATCH_SIZE× faster.
        const batches: HTMLElement[][] = [];
        for (let i = 0; i < targets.length; i += BATCH_SIZE) {
          batches.push(targets.slice(i, i + BATCH_SIZE));
        }

        await Promise.all(
          batches.map(async batch => {
            const texts = batch.map(el => el.textContent?.trim() ?? '');
            const placeholders = batch.map((el, i) =>
              texts[i] ? injector.injectPlaceholder(el) : null,
            );
            const result = await sendTranslateBatch(texts);
            if (result.ok) {
              result.translations.forEach((translation, i) => {
                const el = batch[i];
                const ph = placeholders[i];
                if (!texts[i] || !ph) return;
                if (!translation) {
                  ph.remove();
                  el.removeAttribute('data-xt-id');
                  return;
                }
                if (isSimplifiedChinese(texts[i])) {
                  ph.remove();
                  el.removeAttribute('data-xt-id');
                  injector.replaceSimplified(el, translation);
                } else {
                  injector.fulfill(ph, translation);
                }
                successCount++;
              });
            } else {
              lastError = result.error;
              batch.forEach((el, i) => {
                placeholders[i]?.remove();
                el.removeAttribute('data-xt-id');
              });
            }
          }),
        );

        const allFailed = targets.length > 0 && successCount === 0;
        if (allFailed) {
          bilingualEnabled = false;
          stopObserver();
          injector.clear();
        }
        floatingBtn.updateState({
          bilingualEnabled,
          loading: false,
          error: allFailed,
          errorMessage: allFailed ? lastError : undefined,
        });
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

function sendTranslateBatch(texts: string[]): Promise<TranslateBatchResult> {
  return new Promise(resolve => {
    const msg: TranslateBatchMessage = { type: 'translate-batch', texts };
    chrome.runtime.sendMessage(msg, (result: TranslateBatchResult) => {
      const err = chrome.runtime.lastError;
      if (err) {
        resolve({ ok: false, error: err.message ?? 'Extension connection error' });
        return;
      }
      resolve(result ?? { ok: false, error: 'No response from background' });
    });
  });
}
