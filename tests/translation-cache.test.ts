import { describe, it, expect, beforeEach } from 'vitest';
import { TranslationCache, cacheKey } from '../src/lib/translation-cache';

describe('TranslationCache', () => {
  let cache: TranslationCache;

  beforeEach(() => {
    cache = new TranslationCache();
  });

  it('returns undefined for a cache miss', () => {
    expect(cache.get('key')).toBeUndefined();
  });

  it('returns cached value after set', () => {
    cache.set('key', 'value');
    expect(cache.get('key')).toBe('value');
  });

  it('size reflects entry count', () => {
    expect(cache.size).toBe(0);
    cache.set('a', '1');
    cache.set('b', '2');
    expect(cache.size).toBe(2);
  });

  it('overwriting a key keeps size stable', () => {
    cache.set('a', '1');
    cache.set('a', '2');
    expect(cache.size).toBe(1);
    expect(cache.get('a')).toBe('2');
  });

  it('clear removes all entries', () => {
    cache.set('a', '1');
    cache.set('b', '2');
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get('a')).toBeUndefined();
  });

  it('LRU eviction: oldest-access entry is evicted when full', () => {
    const max = 500;
    // Fill cache to capacity
    for (let i = 0; i < max; i++) {
      cache.set(`k${i}`, `v${i}`);
    }
    expect(cache.size).toBe(max);

    // Access k0 to make it recently used
    cache.get('k0');

    // Add one more → k1 should be evicted (oldest not recently accessed)
    cache.set('k_new', 'v_new');
    expect(cache.size).toBe(max);
    expect(cache.get('k1')).toBeUndefined(); // evicted
    expect(cache.get('k0')).toBe('v0');      // still present (was accessed)
    expect(cache.get('k_new')).toBe('v_new');
  });
});

describe('cacheKey', () => {
  it('combines targetLang and text with null byte separator', () => {
    const key = cacheKey('繁體中文', 'Hello');
    expect(key).toBe('繁體中文\x00Hello');
  });

  it('produces different keys for different languages', () => {
    expect(cacheKey('繁體中文', 'Hello')).not.toBe(cacheKey('日本語', 'Hello'));
  });

  it('produces different keys for different text', () => {
    expect(cacheKey('繁體中文', 'Hello')).not.toBe(cacheKey('繁體中文', 'World'));
  });
});
