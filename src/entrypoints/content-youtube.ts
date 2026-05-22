import { YoutubeCaptionTranslator } from '../lib/youtube-caption';
import type { TranslateMessage, TranslateResult } from '../lib/types';

// Inject into the page's MAIN world so we can read ytInitialPlayerResponse.
// Content scripts run in an isolated world and cannot access page-level JS variables directly.
function injectPageBridge(): void {
  const s = document.createElement('script');
  s.textContent = `(function(){
    function update(){
      try{
        var d=window.ytInitialPlayerResponse||{};
        var tracks=((d.captions||{}).playerCaptionsTracklistRenderer||{}).captionTracks||[];
        var el=document.documentElement;
        if(tracks[0]&&tracks[0].baseUrl){
          el.dataset.xtCaptionUrl=tracks[0].baseUrl+'&fmt=vtt';
          el.dataset.xtVideoId=((d.videoDetails||{}).videoId)||'';
        } else {
          el.dataset.xtCaptionUrl='';
          el.dataset.xtVideoId='';
        }
      }catch(e){}
    }
    update();
    window.addEventListener('yt-navigate-finish', update);
  })();`;
  (document.head ?? document.documentElement).appendChild(s);
  s.remove();
}

export default defineContentScript({
  matches: ['*://*.youtube.com/*'],
  runAt: 'document_idle',

  main() {
    injectPageBridge();

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
