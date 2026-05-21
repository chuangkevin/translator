import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/lib/opencode-client', () => ({
  OpenCodeClient: vi.fn().mockImplementation(() => ({
    translate: vi.fn(),
  })),
  OpenCodeError: class OpenCodeError extends Error {},
}));

let Translator: typeof import('../src/lib/translator').Translator;
let OpenCodeClient: { new (...args: unknown[]): { translate: ReturnType<typeof vi.fn> } };

beforeEach(async () => {
  vi.resetModules();
  const tMod = await import('../src/lib/translator');
  const cMod = await import('../src/lib/opencode-client');
  Translator = tMod.Translator;
  OpenCodeClient = cMod.OpenCodeClient as unknown as typeof OpenCodeClient;
});

describe('Translator', () => {
  it('translates text using OpenCodeClient', async () => {
    const mockClient = new OpenCodeClient({} as never);
    vi.mocked(mockClient.translate).mockResolvedValue('你好');

    const translator = new Translator(mockClient as never);
    const result = await translator.translate('Hello');
    expect(result).toEqual({ ok: true, translation: '你好' });
  });

  it('retries once on transient failure then succeeds', async () => {
    const mockClient = new OpenCodeClient({} as never);
    vi.mocked(mockClient.translate)
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValue('世界');

    const translator = new Translator(mockClient as never, { retries: 2, retryDelayMs: 0 });
    const result = await translator.translate('World');
    expect(result).toEqual({ ok: true, translation: '世界' });
    expect(mockClient.translate).toHaveBeenCalledTimes(2);
  });

  it('returns ok:false after all retries exhausted', async () => {
    const mockClient = new OpenCodeClient({} as never);
    vi.mocked(mockClient.translate).mockRejectedValue(new Error('persistent error'));

    const translator = new Translator(mockClient as never, { retries: 2, retryDelayMs: 0 });
    const result = await translator.translate('fail');
    expect(result).toEqual({ ok: false, error: expect.stringContaining('persistent error') });
    expect(mockClient.translate).toHaveBeenCalledTimes(2);
  });

  it('limits concurrency to maxConcurrent', async () => {
    const mockClient = new OpenCodeClient({} as never);
    let active = 0;
    let maxActive = 0;
    vi.mocked(mockClient.translate).mockImplementation(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise(r => setTimeout(r, 10));
      active--;
      return 'x';
    });

    const translator = new Translator(mockClient as never, { maxConcurrent: 2, retries: 1, retryDelayMs: 0 });
    await Promise.all([
      translator.translate('a'),
      translator.translate('b'),
      translator.translate('c'),
      translator.translate('d'),
    ]);
    expect(maxActive).toBeLessThanOrEqual(2);
  });
});
