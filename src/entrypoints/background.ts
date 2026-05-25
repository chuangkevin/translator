import { OpenCodeClient } from '../lib/opencode-client';
import { Translator } from '../lib/translator';
import { getSettings } from '../lib/storage';
import { TranslationCache, cacheKey } from '../lib/translation-cache';
import type { TranslateMessage, TranslateResult } from '../lib/types';

const cache = new TranslationCache();
let cacheTargetLang = '';
let cacheModel = '';

// Global concurrency limit — prevents flooding the OpenCode server when many elements
// are translated simultaneously. Each service worker activation starts fresh.
let globalPermits = 5;
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
        el.dataset.xtCaptionUrl = `${tracks[0].baseUrl}&fmt=vtt`;
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

  // Translation requests from content scripts
  chrome.runtime.onMessage.addListener(
    (message: TranslateMessage, _sender, sendResponse: (result: TranslateResult) => void) => {
      if (message.type !== 'translate') return false;

      (async () => {
        try {
          const settings = await getSettings();
          if (settings.targetLang !== cacheTargetLang || settings.model !== cacheModel) {
            cache.clear();
            cacheTargetLang = settings.targetLang;
            cacheModel = settings.model;
          }
          const key = cacheKey(settings.targetLang, message.text);
          const cached = cache.get(key);
          if (cached !== undefined) {
            console.log('[Translator BG] cache hit | text:', message.text.slice(0, 40));
            sendResponse({ ok: true, translation: cached });
            return;
          }
          console.log('[Translator BG] translate request | serverUrl:', settings.serverUrl, '| text:', message.text.slice(0, 40));
          await acquireSlot();
          let result: TranslateResult;
          try {
            const client = new OpenCodeClient({
              serverUrl: settings.serverUrl,
              provider: settings.provider,
              model: settings.model,
              targetLang: settings.targetLang,
            });
            const translator = new Translator(client);
            result = await translator.translate(message.text);
          } finally {
            releaseSlot();
          }
          if (!result.ok) {
            console.warn('[Translator BG] translate failed:', result.error, '| serverUrl:', settings.serverUrl);
          } else if (!result.translation) {
            console.warn('[Translator BG] empty translation, treating as failure');
            result = { ok: false, error: 'Empty translation result' };
          } else {
            console.log('[Translator BG] translate ok | result:', result.translation.slice(0, 40));
            cache.set(key, result.translation);
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
});
