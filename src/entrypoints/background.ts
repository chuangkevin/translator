import { OpenCodeClient } from '../lib/opencode-client';
import { Translator } from '../lib/translator';
import { getSettings } from '../lib/storage';
import { TranslationCache, cacheKey } from '../lib/translation-cache';
import type { ExtensionSettings, FetchVttMessage, FetchVttResult, TranslateMessage, TranslateResult, TranslateBatchMessage, TranslateBatchResult } from '../lib/types';

const CACHE_STORAGE_KEY = 'xt_cache';

const cache = new TranslationCache();
let cacheTargetLang = '';
let cacheModel = '';
let cacheReady = false;
let saveDebounce: ReturnType<typeof setTimeout> | null = null;

async function ensureCacheReady(settings: ExtensionSettings): Promise<void> {
  if (cacheReady) return;
  cacheTargetLang = settings.targetLang;
  cacheModel = settings.model;
  cacheReady = true;
  try {
    const data = await chrome.storage.local.get(CACHE_STORAGE_KEY);
    const saved = data[CACHE_STORAGE_KEY] as { entries?: Record<string, string>; targetLang?: string; model?: string } | undefined;
    if (saved?.targetLang === settings.targetLang && saved?.model === settings.model && saved.entries) {
      cache.loadEntries(saved.entries);
      console.log('[Translator BG] loaded', cache.size, 'cache entries from storage');
    }
  } catch {}
}

function scheduleSave(): void {
  if (saveDebounce) clearTimeout(saveDebounce);
  saveDebounce = setTimeout(async () => {
    saveDebounce = null;
    try {
      await chrome.storage.local.set({
        [CACHE_STORAGE_KEY]: { entries: cache.toObject(), targetLang: cacheTargetLang, model: cacheModel },
      });
    } catch {}
  }, 1000);
}

// Global concurrency limit — prevents flooding the OpenCode server when many elements
// are translated simultaneously. Each service worker activation starts fresh.
let globalPermits = 10;
const globalQueue: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  if (globalPermits > 0) { globalPermits--; return Promise.resolve(); }
  return new Promise<void>(r => globalQueue.push(r));
}

function releaseSlot(): void {
  const next = globalQueue.shift();
  if (next) next();
  else globalPermits++;
}

// Injected into YouTube tabs via chrome.scripting (MAIN world) to bypass CSP.
// Reads ytInitialPlayerResponse and stores caption URL in dataset attributes
// so the isolated-world content script can read it.
function ytCaptionBridge(): void {
  if ((window as any).__xtBridgeInstalled) return;
  (window as any).__xtBridgeInstalled = true;

  function update(): void {
    try {
      const data: any = (window as any).ytInitialPlayerResponse ?? {};
      const tracks: any[] =
        data?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
      const el = document.documentElement;
      if (tracks[0]?.baseUrl) {
        try {
          const u = new URL(tracks[0].baseUrl);
          u.searchParams.set('fmt', 'vtt');
          el.dataset.xtCaptionUrl = u.toString();
        } catch {
          el.dataset.xtCaptionUrl = `${tracks[0].baseUrl}&fmt=vtt`;
        }
        el.dataset.xtVideoId = data?.videoDetails?.videoId ?? '';
      } else {
        delete el.dataset.xtCaptionUrl;
        delete el.dataset.xtVideoId;
      }
    } catch {}
  }

  update();
  window.addEventListener('yt-navigate-finish', update);
}

async function translateWithFailover(text: string, settings: ExtensionSettings): Promise<TranslateResult> {
  const urls = settings.serverUrls?.length ? settings.serverUrls : ['http://localhost:3000'];
  let lastError = '所有伺服器均無回應';
  for (const serverUrl of urls) {
    const client = new OpenCodeClient({ serverUrl, provider: settings.provider, model: settings.model, targetLang: settings.targetLang });
    const translator = new Translator(client);
    const result = await translator.translate(text);
    if (result.ok) return result;
    // 4xx = config error, no point trying next server
    if (result.error.includes('HTTP 4')) break;
    lastError = result.error;
  }
  return { ok: false, error: lastError };
}

async function translateBatchWithFailover(texts: string[], settings: ExtensionSettings): Promise<(string | null)[]> {
  const urls = settings.serverUrls?.length ? settings.serverUrls : ['http://localhost:3000'];
  for (const serverUrl of urls) {
    const client = new OpenCodeClient({ serverUrl, provider: settings.provider, model: settings.model, targetLang: settings.targetLang });
    const translator = new Translator(client);
    const results = await translator.translateBatch(texts);
    // If any translation succeeded, treat this server as working
    if (results.some(r => r !== null)) return results;
  }
  return texts.map(() => null);
}

export default defineBackground(() => {
  console.log('[Translator BG] Service worker started');

  // Inject MAIN-world bridge for YouTube caption URL extraction
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status !== 'complete') return;
    if (!tab.url?.includes('youtube.com')) return;
    chrome.scripting
      .executeScript({ target: { tabId }, world: 'MAIN', func: ytCaptionBridge })
      .catch(() => {});
  });

  // Keyboard command → relay toggle to active tab content script
  chrome.commands.onCommand.addListener(async (command) => {
    if (command !== 'toggle-translation') return;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id != null) {
      chrome.tabs.sendMessage(tab.id, { type: 'toggle-translation' }, () => {
        void chrome.runtime.lastError;
      });
    }
  });

  // Batch translation requests from content scripts
  chrome.runtime.onMessage.addListener(
    (message: TranslateBatchMessage, _sender, sendResponse: (r: TranslateBatchResult) => void) => {
      if (message.type !== 'translate-batch') return false;
      (async () => {
        try {
          const settings = await getSettings();
          if (settings.targetLang !== cacheTargetLang || settings.model !== cacheModel) {
            cache.clear();
            cacheReady = false;
          }
          await ensureCacheReady(settings);
          // Separate cached from uncached texts
          const keys = message.texts.map(t => cacheKey(settings.targetLang, t));
          const results: (string | null)[] = message.texts.map((_, i) => cache.get(keys[i]) ?? null);
          const uncachedIdxs = results.map((r, i) => r === null ? i : -1).filter(i => i >= 0);

          if (uncachedIdxs.length > 0) {
            const uncachedTexts = uncachedIdxs.map(i => message.texts[i]);
            await acquireSlot();
            try {
              const batchResult = await translateBatchWithFailover(uncachedTexts, settings);
              batchResult.forEach((t, bi) => {
                const origIdx = uncachedIdxs[bi];
                results[origIdx] = t;
                if (t) { cache.set(keys[origIdx], t); scheduleSave(); }
              });
            } finally {
              releaseSlot();
            }
          }
          sendResponse({ ok: true, translations: results });
        } catch (e) {
          console.warn('[Translator BG] batch error:', e);
          sendResponse({ ok: false, error: String(e) });
        }
      })();
      return true;
    },
  );

  // Single translation requests from content scripts
  chrome.runtime.onMessage.addListener(
    (message: TranslateMessage, _sender, sendResponse: (result: TranslateResult) => void) => {
      if (message.type !== 'translate') return false;

      (async () => {
        try {
          const settings = await getSettings();
          if (settings.targetLang !== cacheTargetLang || settings.model !== cacheModel) {
            cache.clear();
            cacheReady = false;
          }
          await ensureCacheReady(settings);
          const key = cacheKey(settings.targetLang, message.text);
          const cached = cache.get(key);
          if (cached !== undefined) {
            console.log('[Translator BG] cache hit | text:', message.text.slice(0, 40));
            sendResponse({ ok: true, translation: cached });
            return;
          }
          console.log('[Translator BG] translate request | servers:', settings.serverUrls, '| text:', message.text.slice(0, 40));
          await acquireSlot();
          let result: TranslateResult;
          try {
            result = await translateWithFailover(message.text, settings);
          } finally {
            releaseSlot();
          }
          if (!result.ok) {
            console.warn('[Translator BG] translate failed:', result.error, '| servers:', settings.serverUrls);
          } else if (!result.translation) {
            console.warn('[Translator BG] empty translation, treating as failure');
            result = { ok: false, error: 'Empty translation result' };
          } else {
            console.log('[Translator BG] translate ok | result:', result.translation.slice(0, 40));
            cache.set(key, result.translation);
            scheduleSave();
          }
          sendResponse(result);
        } catch (e) {
          console.warn('[Translator BG] unexpected error:', e);
          sendResponse({ ok: false, error: String(e) });
        }
      })();

      return true;
    },
  );

  // VTT proxy: content scripts can't fetch YouTube's timedtext because YouTube's
  // own service worker intercepts the request and returns empty HTML. The background
  // SW is outside youtube.com's context, so it fetches directly from the network.
  chrome.runtime.onMessage.addListener(
    (message: FetchVttMessage, _sender, sendResponse: (r: FetchVttResult) => void) => {
      if (message.type !== 'fetch-vtt') return false;
      (async () => {
        try {
          const resp = await fetch(message.url);
          if (!resp.ok) { sendResponse({ ok: false, error: `HTTP ${resp.status}` }); return; }
          const content = await resp.text();
          sendResponse({ ok: true, content });
        } catch (e) {
          sendResponse({ ok: false, error: String(e) });
        }
      })();
      return true;
    },
  );
});
