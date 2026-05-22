export interface CaptionSegment {
  startMs: number;
  endMs: number;
  text: string;
  translation?: string;
}

function timeToMs(t: string): number {
  const parts = t.trim().split(':');
  let seconds = 0;
  if (parts.length === 3) {
    seconds = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2]);
  } else if (parts.length === 2) {
    seconds = parseInt(parts[0]) * 60 + parseFloat(parts[1]);
  } else {
    seconds = parseFloat(parts[0]);
  }
  return Math.round(seconds * 1000);
}

export function parseVtt(vtt: string): CaptionSegment[] {
  const segments: CaptionSegment[] = [];
  for (const block of vtt.split(/\n\n+/)) {
    const lines = block.trim().split('\n');
    const timeIdx = lines.findIndex(l => l.includes('-->'));
    if (timeIdx < 0) continue;

    const [startStr, endStr] = lines[timeIdx].split('-->');
    const startMs = timeToMs(startStr);
    // end part may have position cues after the timestamp
    const endMs = timeToMs(endStr.trimStart().split(/\s/)[0]);

    const text = lines
      .slice(timeIdx + 1)
      .join(' ')
      .replace(/<[^>]*>/g, '')        // strip inline HTML tags
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (text && endMs > startMs) {
      segments.push({ startMs, endMs, text });
    }
  }

  // Drop consecutive blocks with identical text (YouTube sometimes repeats a segment)
  return segments.filter((s, i) => i === 0 || s.text !== segments[i - 1].text);
}

// Read caption URL directly from an inline <script> tag on the page.
// This is accessible from the isolated world (no MAIN-world bridge needed) and is the
// fastest source because it is synchronous and works before ytInitialPlayerResponse fires.
export function getCaptionUrlFromPageScript(): string | null {
  for (const script of Array.from(document.scripts)) {
    const text = script.textContent ?? '';
    if (!text.includes('captionTracks')) continue;
    const match = text.match(/"captionTracks":\s*\[.*?"baseUrl"\s*:\s*"([^"]+)"/s);
    if (!match) continue;
    const url = match[1]
      .replace(/\\u0026/g, '&')
      .replace(/\\u003d/g, '=')
      .replace(/\\u003D/g, '=')
      .replace(/\\\//g, '/');
    return `${url}&fmt=vtt`;
  }
  return null;
}

// Read caption URL from the DOM attribute set by the MAIN-world bridge script injected
// in content-youtube.ts (ytInitialPlayerResponse is not accessible from isolated world).
export function getCaptionUrl(videoId?: string): string | null {
  const el = document.documentElement;
  const url = el.dataset.xtCaptionUrl;
  if (!url) return null;
  if (videoId && el.dataset.xtVideoId !== videoId) return null;
  return url;
}

// Fallback: YouTube's timedtext list API when ytInitialPlayerResponse is unavailable.
export async function fetchCaptionUrlFromApi(videoId: string): Promise<string | null> {
  try {
    const resp = await fetch(`https://www.youtube.com/api/timedtext?v=${videoId}&type=list`);
    if (!resp.ok) return null;
    const xml = await resp.text();
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    const track = doc.querySelector('track');
    if (!track) return null;
    const lang = track.getAttribute('lang_code') ?? 'en';
    const name = track.getAttribute('name') ?? '';
    const kind = track.getAttribute('kind') ?? '';
    const params = new URLSearchParams({ v: videoId, lang, name, fmt: 'vtt' });
    if (kind) params.set('kind', kind);
    return `https://www.youtube.com/api/timedtext?${params}`;
  } catch {
    return null;
  }
}
