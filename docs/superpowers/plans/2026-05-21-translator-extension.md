# Translator Browser Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Chrome/Edge MV3 browser extension providing bilingual inline translation, selected-text popup, and YouTube caption overlay via a user-configured OpenCode server.

**Architecture:** WXT (MV3) with Background service worker as the sole HTTP caller. Content scripts send `chrome.runtime.sendMessage` to background, which calls the OpenCode session API (`POST /session` → `POST /session/{id}/message` → `DELETE /session/{id}`) and returns translated text. Settings stored in `chrome.storage.sync`.

**Tech Stack:** WXT, TypeScript, Vitest + jsdom, Vanilla TS + CSS

---

## File Map

| File | Responsibility |
|------|----------------|
| `wxt.config.ts` | Manifest: permissions, Alt+A command, browser targets |
| `vitest.config.ts` | Vitest with jsdom environment |
| `tests/setup.ts` | Global chrome API mock for all tests |
| `src/lib/types.ts` | `ExtensionSettings`, message shapes, `TranslateResult` |
| `src/lib/storage.ts` | Typed `chrome.storage.sync` get/set wrapper |
| `src/lib/opencode-client.ts` | OpenCode session API HTTP client (create/message/delete) |
| `src/lib/translator.ts` | Concurrency semaphore (max 5) + translate fn + 2-retry backoff |
| `src/lib/bilingual-injector.ts` | DOM scan + inject/clear `.xt-translation` nodes |
| `src/lib/youtube-caption.ts` | MutationObserver + LRU cache (200 entries) |
| `src/lib/selection-popup.ts` | Selection detection + floating popup DOM |
| `src/lib/floating-button.ts` | Floating sidebar button + open/close menu |
| `src/entrypoints/background.ts` | Service worker: translate message handler + keyboard command relay |
| `src/entrypoints/content.ts` | Main content script: wires all lib modules |
| `src/entrypoints/content-youtube.ts` | YouTube content script |
| `src/entrypoints/options/index.html` | Options page HTML |
| `src/entrypoints/options/index.ts` | Options page: read/write settings form |
| `src/entrypoints/popup/index.html` | Toolbar popup HTML |
| `src/entrypoints/popup/index.ts` | Toolbar popup: status + link to options |

---

### Task 1: Project Setup

**Files:**
- Create: `package.json`
- Create: `wxt.config.ts`
- Create: `vitest.config.ts`
- Create: `tests/setup.ts`
- Create: `tsconfig.json`

- [ ] **Step 1.1: Initialize package.json**

```json
{
  "name": "translator",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wxt",
    "dev:edge": "wxt --browser edge",
    "build": "wxt build",
    "build:edge": "wxt build --browser edge",
    "zip": "wxt zip",
    "test": "vitest run",
    "test:watch": "vitest",
    "prepare": "wxt prepare"
  },
  "devDependencies": {
    "wxt": "^0.19.0",
    "typescript": "^5.4.0",
    "vitest": "^2.0.0",
    "@vitest/coverage-v8": "^2.0.0",
    "jsdom": "^24.0.0",
    "@types/chrome": "^0.0.268"
  }
}
```

Save to `package.json`. Then run:
```
cd D:\Projects\_HomeProject\translator
npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 1.2: Create wxt.config.ts**

```typescript
import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  outDir: '.output',
  manifest: {
    name: 'Translator',
    description: 'AI-powered bilingual page translation',
    permissions: ['storage', 'activeTab', 'scripting'],
    commands: {
      'toggle-translation': {
        suggested_key: { default: 'Alt+A' },
        description: 'Toggle bilingual translation on/off',
      },
    },
  },
});
```

- [ ] **Step 1.3: Create tsconfig.json**

```json
{
  "extends": ".wxt/tsconfig.json",
  "compilerOptions": {
    "strict": true
  },
  "exclude": ["node_modules", ".output", ".wxt"]
}
```

- [ ] **Step 1.4: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
  },
});
```

- [ ] **Step 1.5: Create tests/setup.ts** (chrome API mock used by all tests)

```typescript
import { vi } from 'vitest';

const storageSyncData: Record<string, unknown> = {};

const chromeMock = {
  storage: {
    sync: {
      get: vi.fn((keys: string | string[] | null, cb?: (items: Record<string, unknown>) => void) => {
        const result: Record<string, unknown> = {};
        const keyList = keys === null
          ? Object.keys(storageSyncData)
          : Array.isArray(keys) ? keys : [keys];
        for (const k of keyList) {
          if (k in storageSyncData) result[k] = storageSyncData[k];
        }
        cb?.(result);
        return Promise.resolve(result);
      }),
      set: vi.fn((items: Record<string, unknown>, cb?: () => void) => {
        Object.assign(storageSyncData, items);
        cb?.();
        return Promise.resolve();
      }),
    },
    local: {
      get: vi.fn(() => Promise.resolve({})),
      set: vi.fn(() => Promise.resolve()),
    },
    onChanged: { addListener: vi.fn() },
  },
  runtime: {
    sendMessage: vi.fn(),
    onMessage: { addListener: vi.fn() },
  },
  commands: {
    onCommand: { addListener: vi.fn() },
  },
  tabs: {
    query: vi.fn(),
    sendMessage: vi.fn(),
  },
};

vi.stubGlobal('chrome', chromeMock);
```

- [ ] **Step 1.6: Create src/ directory structure**

```
mkdir -p src\entrypoints\options src\entrypoints\popup src\lib tests
```

Run `npx wxt prepare` to generate `.wxt/tsconfig.json`:
```
npx wxt prepare
```

Expected: `.wxt/` directory created with `tsconfig.json` inside.

- [ ] **Step 1.7: Run tests to confirm setup**

```
npm test
```

Expected: `No test files found` (no tests yet) — exit 0.

- [ ] **Step 1.8: Commit**

```
git add package.json wxt.config.ts tsconfig.json vitest.config.ts tests/setup.ts
git commit -m "chore: initialize WXT + Vitest project"
```

---

### Task 2: Types and Storage

**Files:**
- Create: `src/lib/types.ts`
- Create: `src/lib/storage.ts`
- Create: `tests/storage.test.ts`

- [ ] **Step 2.1: Create src/lib/types.ts**

```typescript
export interface ExtensionSettings {
  serverUrl: string;
  provider: string;
  model: string;
  targetLang: string;
  bilingualEnabled: boolean;
  selectionEnabled: boolean;
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  serverUrl: 'http://localhost:3000',
  provider: 'openai',
  model: 'chatgpt5.5',
  targetLang: '繁體中文',
  bilingualEnabled: false,
  selectionEnabled: true,
};

// Content script → Background
export interface TranslateMessage {
  type: 'translate';
  text: string;
}

// Background → Content script (keyboard command relay)
export interface ToggleTranslationMessage {
  type: 'toggle-translation';
}

export type TranslateResult =
  | { ok: true; translation: string }
  | { ok: false; error: string };
```

- [ ] **Step 2.2: Write failing tests for storage**

Create `tests/storage.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Must import after setup.ts has stubbed chrome
let getSettings: () => Promise<import('../src/lib/types').ExtensionSettings>;
let saveSettings: (s: Partial<import('../src/lib/types').ExtensionSettings>) => Promise<void>;

beforeEach(async () => {
  vi.resetModules();
  vi.mocked(chrome.storage.sync.set).mockClear();
  vi.mocked(chrome.storage.sync.get).mockClear();
  const mod = await import('../src/lib/storage');
  getSettings = mod.getSettings;
  saveSettings = mod.saveSettings;
});

describe('getSettings', () => {
  it('returns defaults when storage is empty', async () => {
    vi.mocked(chrome.storage.sync.get).mockResolvedValue({});
    const settings = await getSettings();
    expect(settings.serverUrl).toBe('http://localhost:3000');
    expect(settings.provider).toBe('openai');
    expect(settings.model).toBe('chatgpt5.5');
    expect(settings.targetLang).toBe('繁體中文');
    expect(settings.bilingualEnabled).toBe(false);
    expect(settings.selectionEnabled).toBe(true);
  });

  it('merges stored values over defaults', async () => {
    vi.mocked(chrome.storage.sync.get).mockResolvedValue({
      serverUrl: 'http://myserver:4000',
      model: 'gpt-4o',
    });
    const settings = await getSettings();
    expect(settings.serverUrl).toBe('http://myserver:4000');
    expect(settings.model).toBe('gpt-4o');
    expect(settings.provider).toBe('openai'); // still default
  });
});

describe('saveSettings', () => {
  it('calls chrome.storage.sync.set with provided values', async () => {
    await saveSettings({ serverUrl: 'http://newserver:5000' });
    expect(chrome.storage.sync.set).toHaveBeenCalledWith(
      expect.objectContaining({ serverUrl: 'http://newserver:5000' })
    );
  });
});
```

Run to confirm failure:
```
npm test -- tests/storage.test.ts
```

Expected: `Cannot find module '../src/lib/storage'`

- [ ] **Step 2.3: Implement src/lib/storage.ts**

```typescript
import { ExtensionSettings, DEFAULT_SETTINGS } from './types';

export async function getSettings(): Promise<ExtensionSettings> {
  const stored = await chrome.storage.sync.get(null);
  return { ...DEFAULT_SETTINGS, ...stored } as ExtensionSettings;
}

export async function saveSettings(partial: Partial<ExtensionSettings>): Promise<void> {
  await chrome.storage.sync.set(partial);
}
```

- [ ] **Step 2.4: Run storage tests — expect PASS**

```
npm test -- tests/storage.test.ts
```

Expected: all 3 tests PASS.

- [ ] **Step 2.5: Commit**

```
git add src/lib/types.ts src/lib/storage.ts tests/storage.test.ts
git commit -m "feat: types and storage layer"
```

---

### Task 3: OpenCode Client

**Files:**
- Create: `src/lib/opencode-client.ts`
- Create: `tests/opencode-client.test.ts`

- [ ] **Step 3.1: Write failing tests**

Create `tests/opencode-client.test.ts`:

```typescript
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

  it('sends model payload with providerID and id from config', async () => {
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
});
```

Run to confirm failure:
```
npm test -- tests/opencode-client.test.ts
```

Expected: `Cannot find module '../src/lib/opencode-client'`

- [ ] **Step 3.2: Implement src/lib/opencode-client.ts**

```typescript
export class OpenCodeError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'OpenCodeError';
  }
}

interface OpenCodeConfig {
  serverUrl: string;
  provider: string;
  model: string;
  targetLang: string;
}

interface SessionModel {
  providerID: string;
  id: string;
  variant: 'default';
}

const SESSION_CREATE_TIMEOUT_MS = 10_000;
const MESSAGE_TIMEOUT_MS = 30_000;

async function readJson<T>(res: Response, op: string): Promise<T> {
  if (!res.ok) {
    const body = await res.text();
    throw new OpenCodeError(`OpenCode ${op} failed: HTTP ${res.status} — ${body}`, res.status);
  }
  return res.json() as Promise<T>;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new OpenCodeError(`${label} timed out after ${ms}ms`)), ms),
    ),
  ]);
}

export class OpenCodeClient {
  private sessionModel: SessionModel;
  private systemPrompt: string;

  constructor(private config: OpenCodeConfig) {
    this.sessionModel = {
      providerID: config.provider,
      id: config.model,
      variant: 'default',
    };
    this.systemPrompt = `你是翻譯助手，將使用者的文字翻譯成${config.targetLang}，只輸出譯文，不加任何說明。`;
  }

  async translate(text: string): Promise<string> {
    const baseUrl = this.config.serverUrl.replace(/\/$/, '');

    // 1. Create session
    const sessionRes = await withTimeout(
      fetch(`${baseUrl}/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'translator',
          agent: 'general',
          model: this.sessionModel,
        }),
      }),
      SESSION_CREATE_TIMEOUT_MS,
      'create session',
    );
    const session = await readJson<{ id?: string }>(sessionRes, 'create session');
    if (!session.id) throw new OpenCodeError('Session creation response missing id');
    const sessionId = session.id;

    try {
      // 2. Send message
      const msgRes = await withTimeout(
        fetch(`${baseUrl}/session/${encodeURIComponent(sessionId)}/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agent: 'general',
            model: this.sessionModel,
            system: this.systemPrompt,
            parts: [{ type: 'text', text }],
          }),
        }),
        MESSAGE_TIMEOUT_MS,
        'send message',
      );
      const msg = await readJson<{ parts?: Array<{ type: string; text?: string; synthetic?: boolean }> }>(
        msgRes,
        'send message',
      );

      return (msg.parts ?? [])
        .filter(p => p.type === 'text' && !p.synthetic && typeof p.text === 'string')
        .map(p => p.text!)
        .join('');
    } finally {
      // 3. Delete session (fire-and-forget)
      fetch(`${baseUrl}/session/${encodeURIComponent(sessionId)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      }).catch(() => undefined);
    }
  }
}
```

- [ ] **Step 3.3: Run tests — expect PASS**

```
npm test -- tests/opencode-client.test.ts
```

Expected: all 5 tests PASS.

- [ ] **Step 3.4: Commit**

```
git add src/lib/opencode-client.ts tests/opencode-client.test.ts
git commit -m "feat: OpenCode session API client"
```

---

### Task 4: Translator (Concurrency + Retry)

**Files:**
- Create: `src/lib/translator.ts`
- Create: `tests/translator.test.ts`

- [ ] **Step 4.1: Write failing tests**

Create `tests/translator.test.ts`:

```typescript
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
```

Run:
```
npm test -- tests/translator.test.ts
```
Expected: `Cannot find module '../src/lib/translator'`

- [ ] **Step 4.2: Implement src/lib/translator.ts**

```typescript
import { OpenCodeClient, OpenCodeError } from './opencode-client';
import type { TranslateResult } from './types';

interface TranslatorOptions {
  maxConcurrent?: number;
  retries?: number;
  retryDelayMs?: number;
}

class Semaphore {
  private permits: number;
  private queue: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return Promise.resolve();
    }
    return new Promise(resolve => this.queue.push(resolve));
  }

  release(): void {
    const next = this.queue.shift();
    if (next) {
      next();
    } else {
      this.permits++;
    }
  }
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export class Translator {
  private semaphore: Semaphore;
  private retries: number;
  private retryDelayMs: number;

  constructor(
    private client: OpenCodeClient,
    options: TranslatorOptions = {},
  ) {
    this.semaphore = new Semaphore(options.maxConcurrent ?? 5);
    this.retries = options.retries ?? 2;
    this.retryDelayMs = options.retryDelayMs ?? 500;
  }

  async translate(text: string): Promise<TranslateResult> {
    await this.semaphore.acquire();
    try {
      let lastError: Error | undefined;
      for (let attempt = 0; attempt < this.retries; attempt++) {
        if (attempt > 0) await sleep(this.retryDelayMs * attempt);
        try {
          const translation = await this.client.translate(text);
          return { ok: true, translation };
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          if (err instanceof OpenCodeError && err.status && err.status < 500) break;
        }
      }
      return { ok: false, error: lastError?.message ?? 'Unknown error' };
    } finally {
      this.semaphore.release();
    }
  }
}
```

- [ ] **Step 4.3: Run tests — expect PASS**

```
npm test -- tests/translator.test.ts
```

Expected: all 4 tests PASS.

- [ ] **Step 4.4: Commit**

```
git add src/lib/translator.ts tests/translator.test.ts
git commit -m "feat: translator with concurrency semaphore and retry"
```

---

### Task 5: Background Service Worker

**Files:**
- Create: `src/entrypoints/background.ts`

Background cannot be unit tested easily (chrome API depth); manual verification in Task 13.

- [ ] **Step 5.1: Create src/entrypoints/background.ts**

```typescript
import { OpenCodeClient } from '../lib/opencode-client';
import { Translator } from '../lib/translator';
import { getSettings } from '../lib/storage';
import type { TranslateMessage, TranslateResult } from '../lib/types';

export default defineBackground(() => {
  // Keyboard command → relay toggle to active tab content script
  chrome.commands.onCommand.addListener(async (command) => {
    if (command !== 'toggle-translation') return;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id != null) {
      chrome.tabs.sendMessage(tab.id, { type: 'toggle-translation' });
    }
  });

  // Translation requests from content scripts
  chrome.runtime.onMessage.addListener(
    (message: TranslateMessage, _sender, sendResponse: (result: TranslateResult) => void) => {
      if (message.type !== 'translate') return false;

      (async () => {
        const settings = await getSettings();
        const client = new OpenCodeClient({
          serverUrl: settings.serverUrl,
          provider: settings.provider,
          model: settings.model,
          targetLang: settings.targetLang,
        });
        const translator = new Translator(client);
        const result = await translator.translate(message.text);
        sendResponse(result);
      })();

      return true; // keep message channel open for async response
    },
  );
});
```

- [ ] **Step 5.2: Commit**

```
git add src/entrypoints/background.ts
git commit -m "feat: background service worker message handler"
```

---

### Task 6: Bilingual Injector

**Files:**
- Create: `src/lib/bilingual-injector.ts`
- Create: `tests/bilingual-injector.test.ts`

- [ ] **Step 6.1: Write failing tests**

Create `tests/bilingual-injector.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { BilingualInjector } from '../src/lib/bilingual-injector';

describe('BilingualInjector', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('getTargets returns translatable elements', () => {
    document.body.innerHTML = '<p>Hello</p><h1>Title</h1><span>ignored</span>';
    const injector = new BilingualInjector(document.body);
    const targets = injector.getTargets();
    expect(targets).toHaveLength(2);
    expect(targets.map(el => el.tagName.toLowerCase())).toEqual(['p', 'h1']);
  });

  it('skips elements that are already translated', () => {
    document.body.innerHTML = '<p data-xt-id="1">Hello</p>';
    const injector = new BilingualInjector(document.body);
    expect(injector.getTargets()).toHaveLength(0);
  });

  it('injects translation node after target', () => {
    document.body.innerHTML = '<p>Hello</p>';
    const injector = new BilingualInjector(document.body);
    const p = document.querySelector('p')!;
    injector.inject(p, '你好');

    const translation = document.querySelector('.xt-translation');
    expect(translation).not.toBeNull();
    expect(translation!.textContent).toBe('你好');
    expect(translation!.previousElementSibling).toBe(p);
  });

  it('marks injected element with data-xt-id so it is not re-targeted', () => {
    document.body.innerHTML = '<p>Hello</p>';
    const injector = new BilingualInjector(document.body);
    const p = document.querySelector('p')!;
    injector.inject(p, '你好');

    expect(p.getAttribute('data-xt-id')).not.toBeNull();
    expect(injector.getTargets()).toHaveLength(0);
  });

  it('clear removes all translation nodes and data-xt-id attributes', () => {
    document.body.innerHTML = '<p>Hello</p><p>World</p>';
    const injector = new BilingualInjector(document.body);
    for (const el of injector.getTargets()) {
      injector.inject(el, '譯文');
    }

    injector.clear();
    expect(document.querySelectorAll('.xt-translation')).toHaveLength(0);
    expect(document.querySelectorAll('[data-xt-id]')).toHaveLength(0);
  });

  it('skips elements with no visible text content', () => {
    document.body.innerHTML = '<p>   </p><p>有內容</p>';
    const injector = new BilingualInjector(document.body);
    expect(injector.getTargets()).toHaveLength(1);
  });
});
```

Run:
```
npm test -- tests/bilingual-injector.test.ts
```
Expected: `Cannot find module '../src/lib/bilingual-injector'`

- [ ] **Step 6.2: Implement src/lib/bilingual-injector.ts**

```typescript
const SELECTOR = 'p, h1, h2, h3, h4, h5, h6, li, td, blockquote';
let idCounter = 0;

export class BilingualInjector {
  constructor(private root: HTMLElement | Document = document.body) {}

  getTargets(): HTMLElement[] {
    return Array.from(this.root.querySelectorAll<HTMLElement>(SELECTOR)).filter(
      el =>
        !el.hasAttribute('data-xt-id') &&
        !el.classList.contains('xt-translation') &&
        (el.textContent?.trim().length ?? 0) > 0,
    );
  }

  inject(el: HTMLElement, translation: string): void {
    el.setAttribute('data-xt-id', String(++idCounter));
    const node = document.createElement(el.tagName.toLowerCase());
    node.className = 'xt-translation';
    node.textContent = translation;
    el.insertAdjacentElement('afterend', node);
  }

  clear(): void {
    for (const el of this.root.querySelectorAll<HTMLElement>('.xt-translation')) {
      el.remove();
    }
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-xt-id]')) {
      el.removeAttribute('data-xt-id');
    }
  }
}
```

- [ ] **Step 6.3: Run tests — expect PASS**

```
npm test -- tests/bilingual-injector.test.ts
```

Expected: all 6 tests PASS.

- [ ] **Step 6.4: Commit**

```
git add src/lib/bilingual-injector.ts tests/bilingual-injector.test.ts
git commit -m "feat: bilingual injector DOM module"
```

---

### Task 7: Selection Popup

**Files:**
- Create: `src/lib/selection-popup.ts`
- Create: `tests/selection-popup.test.ts`

- [ ] **Step 7.1: Write failing tests**

Create `tests/selection-popup.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SelectionPopup } from '../src/lib/selection-popup';

describe('SelectionPopup', () => {
  let popup: SelectionPopup;
  let onTranslate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    document.body.innerHTML = '';
    onTranslate = vi.fn();
    popup = new SelectionPopup(onTranslate);
    popup.mount();
  });

  it('mount adds popup container to document.body', () => {
    expect(document.getElementById('xt-selection-popup')).not.toBeNull();
  });

  it('show makes popup visible with loading state', () => {
    popup.show('Hello', { x: 100, y: 200 });
    const el = document.getElementById('xt-selection-popup')!;
    expect(el.style.display).not.toBe('none');
    expect(el.textContent).toContain('Hello');
  });

  it('setTranslation updates popup content', () => {
    popup.show('Hello', { x: 100, y: 200 });
    popup.setTranslation('你好');
    expect(document.getElementById('xt-selection-popup')!.textContent).toContain('你好');
  });

  it('hide makes popup invisible', () => {
    popup.show('Hello', { x: 100, y: 200 });
    popup.hide();
    expect(document.getElementById('xt-selection-popup')!.style.display).toBe('none');
  });

  it('calls onTranslate with selected text when shown', () => {
    popup.show('World', { x: 50, y: 50 });
    expect(onTranslate).toHaveBeenCalledWith('World');
  });
});
```

Run:
```
npm test -- tests/selection-popup.test.ts
```
Expected: `Cannot find module '../src/lib/selection-popup'`

- [ ] **Step 7.2: Implement src/lib/selection-popup.ts**

```typescript
export type TranslateCallback = (text: string) => void;

export class SelectionPopup {
  private el: HTMLDivElement | null = null;

  constructor(private onTranslate: TranslateCallback) {}

  mount(): void {
    if (this.el) return;
    const div = document.createElement('div');
    div.id = 'xt-selection-popup';
    div.style.cssText = [
      'position:fixed',
      'z-index:2147483647',
      'display:none',
      'background:#fff',
      'border:1px solid #e0e0e0',
      'border-radius:8px',
      'padding:10px 14px',
      'box-shadow:0 4px 16px rgba(0,0,0,0.15)',
      'font-size:14px',
      'line-height:1.5',
      'max-width:320px',
      'word-break:break-word',
    ].join(';');
    document.body.appendChild(div);
    this.el = div;
  }

  show(text: string, pos: { x: number; y: number }): void {
    if (!this.el) return;
    this.el.innerHTML = `
      <div style="color:#555;font-size:12px;margin-bottom:4px">原文</div>
      <div style="color:#333">${escapeHtml(text)}</div>
      <div style="color:#555;font-size:12px;margin:6px 0 4px">譯文</div>
      <div class="xt-popup-translation" style="color:#1a73e8">翻譯中…</div>
    `;
    const margin = 8;
    this.el.style.left = `${Math.min(pos.x, window.innerWidth - 340)}px`;
    this.el.style.top = `${pos.y + margin}px`;
    this.el.style.display = 'block';
    this.onTranslate(text);
  }

  setTranslation(translation: string): void {
    const node = this.el?.querySelector('.xt-popup-translation');
    if (node) node.textContent = translation;
  }

  setError(): void {
    const node = this.el?.querySelector('.xt-popup-translation');
    if (node) {
      (node as HTMLElement).style.color = '#d32f2f';
      node.textContent = '翻譯失敗';
    }
  }

  hide(): void {
    if (this.el) this.el.style.display = 'none';
  }

  unmount(): void {
    this.el?.remove();
    this.el = null;
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
```

- [ ] **Step 7.3: Run tests — expect PASS**

```
npm test -- tests/selection-popup.test.ts
```

Expected: all 5 tests PASS.

- [ ] **Step 7.4: Commit**

```
git add src/lib/selection-popup.ts tests/selection-popup.test.ts
git commit -m "feat: selection translation popup"
```

---

### Task 8: Floating Button

**Files:**
- Create: `src/lib/floating-button.ts`
- Create: `tests/floating-button.test.ts`

- [ ] **Step 8.1: Write failing tests**

Create `tests/floating-button.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FloatingButton } from '../src/lib/floating-button';

describe('FloatingButton', () => {
  let onToggleBilingual: ReturnType<typeof vi.fn>;
  let onToggleSelection: ReturnType<typeof vi.fn>;
  let btn: FloatingButton;

  beforeEach(() => {
    document.body.innerHTML = '';
    onToggleBilingual = vi.fn();
    onToggleSelection = vi.fn();
    btn = new FloatingButton({ onToggleBilingual, onToggleSelection });
  });

  it('mount adds floating host to document.body', () => {
    btn.mount();
    expect(document.getElementById('xt-floating-host')).not.toBeNull();
  });

  it('unmount removes host from document.body', () => {
    btn.mount();
    btn.unmount();
    expect(document.getElementById('xt-floating-host')).toBeNull();
  });

  it('updateState sets bilingual icon appearance', () => {
    btn.mount();
    btn.updateState({ bilingualEnabled: true, selectionEnabled: false, error: false });
    const host = document.getElementById('xt-floating-host')!;
    expect(host.innerHTML).toContain('xt-active');
  });

  it('showError adds error indicator', () => {
    btn.mount();
    btn.updateState({ bilingualEnabled: false, selectionEnabled: false, error: true });
    expect(document.getElementById('xt-floating-host')!.innerHTML).toContain('xt-error');
  });
});
```

Run:
```
npm test -- tests/floating-button.test.ts
```
Expected: `Cannot find module '../src/lib/floating-button'`

- [ ] **Step 8.2: Implement src/lib/floating-button.ts**

```typescript
interface FloatingButtonOptions {
  onToggleBilingual: () => void;
  onToggleSelection: () => void;
}

interface ButtonState {
  bilingualEnabled: boolean;
  selectionEnabled: boolean;
  error: boolean;
}

const CSS = `
  #xt-fab {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 2147483646;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    user-select: none;
  }
  .xt-fab-btn {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: #fff;
    border: 1px solid #e0e0e0;
    box-shadow: 0 2px 8px rgba(0,0,0,0.18);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    transition: background 0.15s;
  }
  .xt-fab-btn:hover { background: #f5f5f5; }
  .xt-fab-btn.xt-active { background: #e8f0fe; border-color: #1a73e8; }
  .xt-fab-btn.xt-error { border-color: #d32f2f; }
  .xt-menu { display: flex; flex-direction: column; gap: 8px; }
`;

export class FloatingButton {
  private host: HTMLDivElement | null = null;
  private state: ButtonState = { bilingualEnabled: false, selectionEnabled: true, error: false };

  constructor(private options: FloatingButtonOptions) {}

  mount(): void {
    if (this.host) return;
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    const host = document.createElement('div');
    host.id = 'xt-floating-host';
    document.body.appendChild(host);
    this.host = host;
    this.render();
  }

  unmount(): void {
    this.host?.remove();
    this.host = null;
  }

  updateState(state: ButtonState): void {
    this.state = state;
    this.render();
  }

  private render(): void {
    if (!this.host) return;
    const { bilingualEnabled, selectionEnabled, error } = this.state;
    this.host.innerHTML = `
      <div id="xt-fab">
        <div class="xt-menu">
          <button class="xt-fab-btn ${bilingualEnabled ? 'xt-active' : ''} ${error ? 'xt-error' : ''}"
                  id="xt-btn-bilingual" title="雙語翻譯">
            ${bilingualEnabled ? '🔤' : '💬'}
          </button>
          <button class="xt-fab-btn ${selectionEnabled ? 'xt-active' : ''}"
                  id="xt-btn-selection" title="選取翻譯">
            ✏️
          </button>
        </div>
      </div>
    `;
    this.host.querySelector('#xt-btn-bilingual')
      ?.addEventListener('click', this.options.onToggleBilingual);
    this.host.querySelector('#xt-btn-selection')
      ?.addEventListener('click', this.options.onToggleSelection);
  }
}
```

- [ ] **Step 8.3: Run tests — expect PASS**

```
npm test -- tests/floating-button.test.ts
```

Expected: all 4 tests PASS.

- [ ] **Step 8.4: Commit**

```
git add src/lib/floating-button.ts tests/floating-button.test.ts
git commit -m "feat: floating button sidebar"
```

---

### Task 9: Main Content Script

**Files:**
- Create: `src/entrypoints/content.ts`

Wires BilingualInjector + SelectionPopup + FloatingButton together. Uses `chrome.runtime.sendMessage` to request translations from background.

- [ ] **Step 9.1: Create src/entrypoints/content.ts**

```typescript
import { BilingualInjector } from '../lib/bilingual-injector';
import { SelectionPopup } from '../lib/selection-popup';
import { FloatingButton } from '../lib/floating-button';
import { getSettings, saveSettings } from '../lib/storage';
import type { TranslateMessage, TranslateResult, ToggleTranslationMessage } from '../lib/types';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',

  async main() {
    const settings = await getSettings();
    let bilingualEnabled = settings.bilingualEnabled;
    let selectionEnabled = settings.selectionEnabled;

    const injector = new BilingualInjector(document.body);

    const selectionPopup = new SelectionPopup(async (text) => {
      const result = await sendTranslate(text);
      if (result.ok) {
        selectionPopup.setTranslation(result.translation);
      } else {
        selectionPopup.setError();
      }
    });
    selectionPopup.mount();

    const floatingBtn = new FloatingButton({
      onToggleBilingual: () => toggleBilingual(),
      onToggleSelection: () => toggleSelection(),
    });
    floatingBtn.mount();
    floatingBtn.updateState({ bilingualEnabled, selectionEnabled, error: false });

    // Selection translation
    document.addEventListener('mouseup', () => {
      if (!selectionEnabled) return;
      const sel = window.getSelection();
      const text = sel?.toString().trim() ?? '';
      if (text.length < 2) {
        selectionPopup.hide();
        return;
      }
      const range = sel!.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      selectionPopup.show(text, { x: rect.left + window.scrollX, y: rect.bottom + window.scrollY });
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') selectionPopup.hide();
    });

    document.addEventListener('mousedown', (e) => {
      const popup = document.getElementById('xt-selection-popup');
      if (popup && !popup.contains(e.target as Node)) selectionPopup.hide();
    });

    // Keyboard command from background
    chrome.runtime.onMessage.addListener((message: ToggleTranslationMessage) => {
      if (message.type === 'toggle-translation') toggleBilingual();
    });

    async function toggleBilingual() {
      bilingualEnabled = !bilingualEnabled;
      await saveSettings({ bilingualEnabled });
      floatingBtn.updateState({ bilingualEnabled, selectionEnabled, error: false });
      if (bilingualEnabled) {
        await translatePage();
      } else {
        injector.clear();
      }
    }

    async function toggleSelection() {
      selectionEnabled = !selectionEnabled;
      await saveSettings({ selectionEnabled });
      floatingBtn.updateState({ bilingualEnabled, selectionEnabled, error: false });
    }

    let isTranslating = false;
    async function translatePage() {
      if (isTranslating) return;
      isTranslating = true;
      try {
        const targets = injector.getTargets();
        await Promise.all(
          targets.map(async (el) => {
            const text = el.textContent?.trim() ?? '';
            if (!text) return;
            const result = await sendTranslate(text);
            if (result.ok) {
              injector.inject(el, result.translation);
            } else {
              floatingBtn.updateState({ bilingualEnabled, selectionEnabled, error: true });
            }
          }),
        );
      } finally {
        isTranslating = false;
      }
    }
  },
});

function sendTranslate(text: string): Promise<TranslateResult> {
  return new Promise(resolve => {
    const msg: TranslateMessage = { type: 'translate', text };
    chrome.runtime.sendMessage(msg, (result: TranslateResult) => {
      resolve(result ?? { ok: false, error: 'No response from background' });
    });
  });
}
```

- [ ] **Step 9.2: Commit**

```
git add src/entrypoints/content.ts
git commit -m "feat: main content script"
```

---

### Task 10: YouTube Content Script

**Files:**
- Create: `src/lib/youtube-caption.ts`
- Create: `tests/youtube-caption.test.ts`
- Create: `src/entrypoints/content-youtube.ts`

- [ ] **Step 10.1: Write failing tests**

Create `tests/youtube-caption.test.ts`:

```typescript
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
```

Run:
```
npm test -- tests/youtube-caption.test.ts
```
Expected: `Cannot find module '../src/lib/youtube-caption'`

- [ ] **Step 10.2: Implement src/lib/youtube-caption.ts**

```typescript
export class LRUCache<K, V> {
  private map = new Map<K, V>();

  constructor(private maxSize: number) {}

  get(key: K): V | undefined {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key)!;
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.maxSize) {
      this.map.delete(this.map.keys().next().value!);
    }
  }

  has(key: K): boolean {
    return this.map.has(key);
  }
}

export class YoutubeCaptionTranslator {
  private cache = new LRUCache<string, string>(200);
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private observer: MutationObserver | null = null;

  constructor(
    private onTranslate: (text: string) => Promise<string | null>,
  ) {}

  start(): void {
    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLElement && node.classList.contains('ytp-caption-segment')) {
            this.handleSegment(node);
          }
          if (node instanceof HTMLElement) {
            for (const seg of node.querySelectorAll<HTMLElement>('.ytp-caption-segment')) {
              this.handleSegment(seg);
            }
          }
        }
      }
    });

    this.observer.observe(document.body, { subtree: true, childList: true });
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = null;
  }

  private handleSegment(segment: HTMLElement): void {
    const text = segment.textContent?.trim() ?? '';
    if (!text || segment.getAttribute('data-xt-caption') === 'true') return;

    if (this.cache.has(text)) {
      this.appendTranslation(segment, this.cache.get(text)!);
      return;
    }

    const key = text;
    clearTimeout(this.debounceTimers.get(key));
    this.debounceTimers.set(
      key,
      setTimeout(async () => {
        this.debounceTimers.delete(key);
        const translation = await this.onTranslate(text);
        if (translation) {
          this.cache.set(text, translation);
          this.appendTranslation(segment, translation);
        }
      }, 200),
    );
  }

  private appendTranslation(segment: HTMLElement, translation: string): void {
    segment.setAttribute('data-xt-caption', 'true');
    const existing = segment.parentElement?.querySelector('.xt-yt-translation');
    if (existing) existing.remove();

    const div = document.createElement('div');
    div.className = 'xt-yt-translation';
    div.style.cssText = 'color:#fff;font-size:0.9em;opacity:0.85;margin-top:2px;text-align:center';
    div.textContent = translation;
    segment.insertAdjacentElement('afterend', div);
  }
}
```

- [ ] **Step 10.3: Run LRU tests — expect PASS**

```
npm test -- tests/youtube-caption.test.ts
```

Expected: all 4 tests PASS.

- [ ] **Step 10.4: Create src/entrypoints/content-youtube.ts**

```typescript
import { YoutubeCaptionTranslator } from '../lib/youtube-caption';
import type { TranslateMessage, TranslateResult } from '../lib/types';

export default defineContentScript({
  matches: ['*://*.youtube.com/*'],
  runAt: 'document_idle',

  main() {
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
      resolve(result ?? { ok: false, error: 'No response' });
    });
  });
}
```

- [ ] **Step 10.5: Commit**

```
git add src/lib/youtube-caption.ts tests/youtube-caption.test.ts src/entrypoints/content-youtube.ts
git commit -m "feat: YouTube caption translation"
```

---

### Task 11: Options Page

**Files:**
- Create: `src/entrypoints/options/index.html`
- Create: `src/entrypoints/options/index.ts`

- [ ] **Step 11.1: Create src/entrypoints/options/index.html**

```html
<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8" />
  <title>Translator 設定</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f9f9f9; color: #333; }
    .container { max-width: 520px; margin: 40px auto; padding: 0 20px; }
    h1 { font-size: 22px; font-weight: 600; margin-bottom: 28px; color: #1a1a1a; }
    .field { margin-bottom: 20px; }
    label { display: block; font-size: 14px; font-weight: 500; margin-bottom: 6px; color: #555; }
    input[type="text"], input[type="url"] {
      width: 100%; padding: 9px 12px; border: 1px solid #d0d0d0;
      border-radius: 6px; font-size: 14px; outline: none; background: #fff;
    }
    input:focus { border-color: #1a73e8; box-shadow: 0 0 0 2px rgba(26,115,232,0.15); }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    button {
      padding: 10px 24px; background: #1a73e8; color: #fff; border: none;
      border-radius: 6px; font-size: 14px; font-weight: 500; cursor: pointer;
    }
    button:hover { background: #1558b0; }
    #status { margin-top: 12px; font-size: 13px; color: #2e7d32; min-height: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Translator 設定</h1>
    <div class="field">
      <label for="serverUrl">OpenCode Server URL</label>
      <input type="url" id="serverUrl" placeholder="http://localhost:3000" />
    </div>
    <div class="row">
      <div class="field">
        <label for="provider">Provider</label>
        <input type="text" id="provider" placeholder="openai" />
      </div>
      <div class="field">
        <label for="model">Model</label>
        <input type="text" id="model" placeholder="chatgpt5.5" />
      </div>
    </div>
    <div class="field">
      <label for="targetLang">目標語言</label>
      <input type="text" id="targetLang" placeholder="繁體中文" />
    </div>
    <button id="save">儲存</button>
    <div id="status"></div>
  </div>
  <script type="module" src="index.ts"></script>
</body>
</html>
```

- [ ] **Step 11.2: Create src/entrypoints/options/index.ts**

```typescript
import { getSettings, saveSettings } from '../../lib/storage';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

async function load() {
  const s = await getSettings();
  ($<HTMLInputElement>('serverUrl')).value = s.serverUrl;
  ($<HTMLInputElement>('provider')).value = s.provider;
  ($<HTMLInputElement>('model')).value = s.model;
  ($<HTMLInputElement>('targetLang')).value = s.targetLang;
}

$('save').addEventListener('click', async () => {
  await saveSettings({
    serverUrl: ($<HTMLInputElement>('serverUrl')).value.trim(),
    provider: ($<HTMLInputElement>('provider')).value.trim(),
    model: ($<HTMLInputElement>('model')).value.trim(),
    targetLang: ($<HTMLInputElement>('targetLang')).value.trim(),
  });
  const status = $('status');
  status.textContent = '已儲存 ✓';
  setTimeout(() => { status.textContent = ''; }, 2000);
});

load();
```

- [ ] **Step 11.3: Commit**

```
git add src/entrypoints/options/
git commit -m "feat: options page"
```

---

### Task 12: Extension Toolbar Popup

**Files:**
- Create: `src/entrypoints/popup/index.html`
- Create: `src/entrypoints/popup/index.ts`

- [ ] **Step 12.1: Create src/entrypoints/popup/index.html**

```html
<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8" />
  <title>Translator</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; width: 240px; padding: 16px; }
    h2 { font-size: 16px; font-weight: 600; margin-bottom: 12px; }
    .hint { font-size: 13px; color: #666; margin-bottom: 14px; line-height: 1.5; }
    a { display: block; text-align: center; padding: 9px; background: #1a73e8; color: #fff;
        border-radius: 6px; font-size: 13px; text-decoration: none; }
    a:hover { background: #1558b0; }
    .server { font-size: 11px; color: #999; margin-top: 10px; word-break: break-all; }
  </style>
</head>
<body>
  <h2>Translator</h2>
  <p class="hint">使用頁面右下角的浮動按鈕開關翻譯，或按 <kbd>Alt+A</kbd> 切換雙語模式。</p>
  <a href="#" id="open-options">開啟設定</a>
  <div class="server" id="server-info"></div>
  <script type="module" src="index.ts"></script>
</body>
</html>
```

- [ ] **Step 12.2: Create src/entrypoints/popup/index.ts**

```typescript
import { getSettings } from '../../lib/storage';

document.getElementById('open-options')?.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

getSettings().then(s => {
  const info = document.getElementById('server-info');
  if (info) info.textContent = `Server: ${s.serverUrl}`;
});
```

- [ ] **Step 12.3: Commit**

```
git add src/entrypoints/popup/
git commit -m "feat: toolbar popup"
```

---

### Task 13: Build and Manual Browser Verification

**Files:** none new

- [ ] **Step 13.1: Run all tests**

```
npm test
```

Expected: all tests PASS (storage: 3, opencode-client: 5, translator: 4, bilingual-injector: 6, selection-popup: 5, floating-button: 4, youtube-caption: 4 = **31 tests total**).

- [ ] **Step 13.2: Build for Chrome**

```
npm run build
```

Expected: `.output/chrome-mv3/` directory created, no TypeScript errors.

- [ ] **Step 13.3: Load extension in Chrome**

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select `D:\Projects\_HomeProject\translator\.output\chrome-mv3`

Expected: Extension appears with name "Translator".

- [ ] **Step 13.4: Verify Options page**

1. Click extension icon → **開啟設定**
2. Fill in your OpenCode server URL (e.g. `http://localhost:3000`), provider `openai`, model `chatgpt5.5`
3. Click **儲存** → "已儲存 ✓" appears

- [ ] **Step 13.5: Verify bilingual translation**

1. Open any English article (e.g. a Wikipedia page)
2. Press **Alt+A**
3. Expected: Chinese translations appear below each paragraph in lighter gray text
4. Press **Alt+A** again → translations removed

- [ ] **Step 13.6: Verify selection popup**

1. On any page, highlight 10+ characters of English text
2. Expected: popup appears near selection with "翻譯中…" then Chinese translation

- [ ] **Step 13.7: Verify YouTube captions**

1. Open a YouTube video with auto-generated English captions
2. Enable captions (CC button)
3. Expected: Chinese translations appear below the original caption text

- [ ] **Step 13.8: Verify floating button**

1. On any non-YouTube page, confirm the floating button appears in the bottom-right
2. Click the 💬 button → bilingual translation toggles on/off
3. Click ✏️ → selection translation toggles

- [ ] **Step 13.9: Build for Edge**

```
npm run build:edge
```

Expected: `.output/edge-mv3/` created, no errors.

- [ ] **Step 13.10: Final commit**

```
git add .
git commit -m "feat: complete translator extension v0.1.0"
git push
```

---

## Test Summary

| Test file | Tests |
|-----------|-------|
| `tests/storage.test.ts` | 3 |
| `tests/opencode-client.test.ts` | 5 |
| `tests/translator.test.ts` | 4 |
| `tests/bilingual-injector.test.ts` | 6 |
| `tests/selection-popup.test.ts` | 5 |
| `tests/floating-button.test.ts` | 4 |
| `tests/youtube-caption.test.ts` | 4 |
| **Total** | **31** |
