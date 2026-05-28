import { ExtensionSettings, DEFAULT_SETTINGS, SiteRules, DEFAULT_SITE_RULES } from './types';

export async function getSettings(): Promise<ExtensionSettings> {
  const stored = await chrome.storage.sync.get(null) as Record<string, unknown>;
  // Migrate legacy single serverUrl to serverUrls array
  if (stored.serverUrl && !stored.serverUrls) {
    stored.serverUrls = [stored.serverUrl as string];
    delete stored.serverUrl;
    await chrome.storage.sync.set({ serverUrls: stored.serverUrls });
    await chrome.storage.sync.remove('serverUrl');
  }
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
