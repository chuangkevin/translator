import { ExtensionSettings, DEFAULT_SETTINGS } from './types';

export async function getSettings(): Promise<ExtensionSettings> {
  const stored = await chrome.storage.sync.get(null);
  return { ...DEFAULT_SETTINGS, ...stored } as ExtensionSettings;
}

export async function saveSettings(partial: Partial<ExtensionSettings>): Promise<void> {
  await chrome.storage.sync.set(partial);
}
