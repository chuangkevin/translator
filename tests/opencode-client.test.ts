import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenCodeClient, OpenCodeError } from '../src/lib/opencode-client';

const CONFIG = {
  serverUrl: 'http://localhost:3000',
  provider: 'openai',
  model: 'chatgpt5.5',
  targetLang: '繁體中文',
};

function mockFetch(...responses: Array<{ ok: boolean; body: unknown; status?: number }>) {
  let call = 0;
  vi.stubGlobal('fetch', vi.fn(async () => {
    const r = responses[call++];
    return {
      ok: r.ok,
      status: r.status ?? (r.ok ? 200 : 500),
      json: async () => r.body,
      text: async () => JSON.stringify(r.body),
    };
  }));
}

beforeEach(() => vi.unstubAllGlobals());

describe('OpenCodeClient.translate', () => {
  it('creates session, sends message, deletes session, returns text', async () => {
    mockFetch(
      { ok: true, body: { id: 'sess-1' } },
      { ok: true, body: { parts: [{ type: 'text', text: '你好', synthetic: false }] } },
      { ok: true, body: {} },
    );

    const client = new OpenCodeClient(CONFIG);
    const result = await client.translate('Hello');

    expect(result).toBe('你好');

    const calls = vi.mocked(fetch).mock.calls;
    expect(calls[0][0]).toBe('http://localhost:3000/session');
    expect(calls[1][0]).toBe('http://localhost:3000/session/sess-1/message');
    expect(calls[2][0]).toBe('http://localhost:3000/session/sess-1');
    expect((calls[2][1] as RequestInit).method).toBe('DELETE');
  });

  it('ignores synthetic parts in response', async () => {
    mockFetch(
      { ok: true, body: { id: 'sess-2' } },
      { ok: true, body: { parts: [{ type: 'text', text: 'prefix', synthetic: true }, { type: 'text', text: '世界', synthetic: false }] } },
      { ok: true, body: {} },
    );

    const client = new OpenCodeClient(CONFIG);
    expect(await client.translate('World')).toBe('世界');
  });

  it('throws OpenCodeError when session creation fails', async () => {
    mockFetch({ ok: false, body: 'Server Error', status: 500 });

    const client = new OpenCodeClient(CONFIG);
    await expect(client.translate('Hello')).rejects.toBeInstanceOf(OpenCodeError);
  });

  it('throws OpenCodeError when message send fails', async () => {
    mockFetch(
      { ok: true, body: { id: 'sess-3' } },
      { ok: false, body: 'Timeout', status: 504 },
      { ok: true, body: {} },
    );

    const client = new OpenCodeClient(CONFIG);
    await expect(client.translate('Hello')).rejects.toBeInstanceOf(OpenCodeError);
  });

  it('POST /session uses id field in model', async () => {
    mockFetch(
      { ok: true, body: { id: 'sess-4' } },
      { ok: true, body: { parts: [{ type: 'text', text: '測試', synthetic: false }] } },
      { ok: true, body: {} },
    );

    const client = new OpenCodeClient(CONFIG);
    await client.translate('test');

    const sessionBody = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
    expect(sessionBody.model).toEqual({ providerID: 'openai', id: 'chatgpt5.5', variant: 'default' });
  });

  it('POST /session/{id}/message uses modelID field in model', async () => {
    mockFetch(
      { ok: true, body: { id: 'sess-5' } },
      { ok: true, body: { parts: [{ type: 'text', text: '測試', synthetic: false }] } },
      { ok: true, body: {} },
    );

    const client = new OpenCodeClient(CONFIG);
    await client.translate('test');

    const msgBody = JSON.parse((vi.mocked(fetch).mock.calls[1][1] as RequestInit).body as string);
    expect(msgBody.model).toEqual({ providerID: 'openai', modelID: 'chatgpt5.5', variant: 'default' });
  });
});
