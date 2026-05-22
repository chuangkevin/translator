import { describe, it, expect, beforeEach } from 'vitest';
import { LRUCache } from '../src/lib/youtube-caption';

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
    cache.get('a'); // refresh 'a'
    cache.set('c', '3'); // should evict 'b', not 'a'
    expect(cache.has('a')).toBe(true);
    expect(cache.has('b')).toBe(false);
  });

  it('returns undefined for missing keys', () => {
    const cache = new LRUCache<string, string>(3);
    expect(cache.get('missing')).toBeUndefined();
  });
});
