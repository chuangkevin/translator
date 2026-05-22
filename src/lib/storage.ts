import { ExtensionSettings, DEFAULT_SETTINGS, SiteRules, DEFAULT_SITE_RULES } from './types';

export async function getSettings(): Promise<ExtensionSettings> {
  const stored = await chrome.storage.sync.get(null);
  return { ...DEFAULT_SETTINGS, ...stored } as ExtensionSettings;
}

export async function saveSettings(partial: Partial<ExtensionSettings>): Promise<void> {
  await chrome.storage.sync.set(partial);
}

export async function getSiteRules(): Promise<SiteRules> {
  const stored = await chrome.storage.sync.get('siteRules');
  return { ...DEFAULT_SITE_RULES, ...(stored.siteRules ?? {}) };
}

export async function saveSiteRules(rules: SiteRules): Promise<void> {
  await chrome.storage.sync.set({ siteRules: rules });
}
