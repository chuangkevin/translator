import { describe, it, expect } from 'vitest';
import { LRUCache } from '../src/lib/youtube-caption';
import { parseVtt } from '../src/lib/youtube-vtt';

describe('LRUCache', () => {
  it('stores and retrieves values', () => {
    const cache = new LRUCache<string, string>(3);
    cache.set('a', '1');
    expect(cache.get('a')).toBe('1');
  });

  it('evicts oldest entry when full', () => {
    const cache = new LRUCache<string, string>(2);
    cache.set('a', '1');
    cache.set('b', '2');
    cache.set('c', '3');
    expect(cache.has('a')).toBe(false);
    expect(cache.has('b')).toBe(true);
    expect(cache.has('c')).toBe(true);
  });

  it('refreshes access order on get', () => {
    const cache = new LRUCache<string, string>(2);
    cache.set('a', '1');
    cache.set('b', '2');
    cache.get('a');
    cache.set('c', '3');
    expect(cache.has('a')).toBe(true);
    expect(cache.has('b')).toBe(false);
  });

  it('returns undefined for missing keys', () => {
    const cache = new LRUCache<string, string>(3);
    expect(cache.get('missing')).toBeUndefined();
  });
});

describe('parseVtt', () => {
  it('parses basic VTT segments', () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:03.000
Hello world

00:00:04.000 --> 00:00:06.000
Second line`;
    const segs = parseVtt(vtt);
    expect(segs).toHaveLength(2);
    expect(segs[0]).toMatchObject({ startMs: 1000, endMs: 3000, text: 'Hello world' });
    expect(segs[1]).toMatchObject({ startMs: 4000, endMs: 6000, text: 'Second line' });
  });

  it('strips inline HTML tags', () => {
    const vtt = `WEBVTT\n\n00:00:01.000 --> 00:00:03.000\n<c.colorE5E5E5>Clean text</c>`;
    const segs = parseVtt(vtt);
    expect(segs[0].text).toBe('Clean text');
  });

  it('decodes HTML entities', () => {
    const vtt = `WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nHello &amp; World`;
    const segs = parseVtt(vtt);
    expect(segs[0].text).toBe('Hello & World');
  });

  it('deduplicates consecutive identical segments', () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:02.000
Same text

00:00:02.000 --> 00:00:03.000
Same text

00:00:03.000 --> 00:00:04.000
Different`;
    const segs = parseVtt(vtt);
    expect(segs).toHaveLength(2);
    expect(segs[0].text).toBe('Same text');
    expect(segs[1].text).toBe('Different');
  });

  it('ignores blocks without timestamp', () => {
    const vtt = `WEBVTT\nKind: captions\n\n00:00:01.000 --> 00:00:03.000\nValid`;
    const segs = parseVtt(vtt);
    expect(segs).toHaveLength(1);
    expect(segs[0].text).toBe('Valid');
  });

  it('handles hour:minute:second.ms format', () => {
    const vtt = `WEBVTT\n\n01:02:03.500 --> 01:02:05.000\nText`;
    const segs = parseVtt(vtt);
    expect(segs[0].startMs).toBe((3600 + 120 + 3) * 1000 + 500);
  });
});
