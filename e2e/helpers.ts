import { BrowserContext, chromium } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';
import os from 'os';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, '../.output/chrome-mv3');

export async function launchWithExtension(): Promise<BrowserContext> {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-ext-'));
  return chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-sandbox',
    ],
    viewport: { width: 1280, height: 800 },
  });
}

export async function getExtensionId(context: BrowserContext): Promise<string> {
  // Try existing background pages / service workers first
  for (const p of context.backgroundPages()) {
    const m = p.url().match(/chrome-extension:\/\/([^/]+)/);
    if (m) return m[1];
  }
  for (const w of context.serviceWorkers()) {
    const m = w.url().match(/chrome-extension:\/\/([^/]+)/);
    if (m) return m[1];
  }
  // Wait for service worker to register
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Extension ID not found after 8s')), 8000);
    context.on('serviceworker', w => {
      const m = w.url().match(/chrome-extension:\/\/([^/]+)/);
      if (m) { clearTimeout(t); resolve(m[1]); }
    });
  });
}
