import { describe, it, expect, beforeEach, vi } from 'vitest';

let getSettings: () => Promise<import('../src/lib/types').ExtensionSettings>;
let saveSettings: (s: Partial<import('../src/lib/types').ExtensionSettings>) => Promise<void>;

beforeEach(async () => {
  vi.resetModules();
  vi.mocked(chrome.storage.sync.set).mockClear();
  vi.mocked(chrome.storage.sync.get).mockClear();
  vi.mocked(chrome.storage.sync.remove).mockClear();
  const mod = await import('../src/lib/storage');
  getSettings = mod.getSettings;
  saveSettings = mod.saveSettings;
});

describe('getSettings', () => {
  it('returns defaults when storage is empty', async () => {
    vi.mocked(chrome.storage.sync.get).mockResolvedValue({});
    const settings = await getSettings();
    expect(settings.serverUrls).toEqual(['http://localhost:3000']);
    expect(settings.provider).toBe('openai');
    expect(settings.model).toBe('gpt-5.5');
    expect(settings.targetLang).toBe('繁體中文');
    expect(settings.bilingualEnabled).toBe(false);
  });

  it('merges stored serverUrls over defaults', async () => {
    vi.mocked(chrome.storage.sync.get).mockResolvedValue({
      serverUrls: ['http://myserver:4000', 'http://backup:4000'],
      model: 'gpt-4o',
    });
    const settings = await getSettings();
    expect(settings.serverUrls).toEqual(['http://myserver:4000', 'http://backup:4000']);
    expect(settings.model).toBe('gpt-4o');
    expect(settings.provider).toBe('openai');
  });

  it('migrates legacy serverUrl to serverUrls', async () => {
    vi.mocked(chrome.storage.sync.get).mockResolvedValue({
      serverUrl: 'http://legacy:3000',
      model: 'gpt-4o',
    });
    vi.mocked(chrome.storage.sync.set).mockResolvedValue(undefined);
    vi.mocked(chrome.storage.sync.remove).mockResolvedValue(undefined);
    const settings = await getSettings();
    expect(settings.serverUrls).toEqual(['http://legacy:3000']);
    expect(chrome.storage.sync.set).toHaveBeenCalledWith({ serverUrls: ['http://legacy:3000'] });
    expect(chrome.storage.sync.remove).toHaveBeenCalledWith('serverUrl');
  });
});

describe('saveSettings', () => {
  it('calls chrome.storage.sync.set with provided values', async () => {
    vi.mocked(chrome.storage.sync.set).mockResolvedValue(undefined);
    await saveSettings({ serverUrls: ['http://newserver:5000'] });
    expect(chrome.storage.sync.set).toHaveBeenCalledWith(
      expect.objectContaining({ serverUrls: ['http://newserver:5000'] })
    );
  });
});
