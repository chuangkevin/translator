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

export function getCaptionUrl(videoId?: string): string | null {
  const data = (window as any).ytInitialPlayerResponse;
  if (!data) return null;
  if (videoId && data?.videoDetails?.videoId !== videoId) return null;
  const tracks: any[] = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  if (!tracks.length) return null;
  const baseUrl: string | undefined = tracks[0]?.baseUrl;
  return baseUrl ? `${baseUrl}&fmt=vtt` : null;
}
