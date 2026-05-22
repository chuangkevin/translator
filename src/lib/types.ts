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
  model: 'gpt-5.5',
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
