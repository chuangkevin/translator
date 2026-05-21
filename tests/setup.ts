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
