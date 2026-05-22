import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import os from 'os';
import http from 'http';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.join(__dirname, '.output', 'chrome-mv3');
const userDataDir = path.join(os.tmpdir(), 'translator-test-' + Date.now());
fs.mkdirSync(userDataDir, { recursive: true });

const executablePath = 'C:\\Users\\h1114\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe';

// 啟動 mock OpenCode server
const MOCK_PORT = 13777;
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  if (req.method === 'POST' && req.url === '/session') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id: 'mock-1' }));
  } else if (req.method === 'POST' && req.url?.startsWith('/session/')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ parts: [{ type: 'text', text: '（模擬中文翻譯）', synthetic: false }] }));
  } else if (req.method === 'DELETE') {
    res.writeHead(200); res.end('{}');
  } else {
    res.writeHead(404); res.end();
  }
});
server.listen(MOCK_PORT, '127.0.0.1');
console.log(`Mock server: http://127.0.0.1:${MOCK_PORT}`);

const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  executablePath,
  args: [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
    '--no-sandbox',
  ],
});

// 等候 SW 出現
const sw = await new Promise(resolve => {
  const existing = context.serviceWorkers();
  if (existing.length > 0) return resolve(existing[0]);
  context.on('serviceworker', resolve);
  setTimeout(() => resolve(null), 8000);
});

if (!sw) { console.error('SW not found'); await context.close(); process.exit(1); }

const swUrl = sw.url();
const extId = swUrl.match(/chrome-extension:\/\/([^/]+)/)?.[1];
console.log('Extension ID:', extId);

// 設定 options
const optPage = await context.newPage();
await optPage.goto(`chrome-extension://${extId}/options.html`);
await optPage.waitForLoadState('domcontentloaded');
await optPage.waitForTimeout(500);
await optPage.fill('#serverUrl', `http://127.0.0.1:${MOCK_PORT}`);
await optPage.click('#save');
await optPage.waitForTimeout(500);
const savedStatus = await optPage.textContent('#status');
console.log('Saved status:', savedStatus);
await optPage.close();

// 測試翻譯
const page = await context.newPage();
await page.goto('https://example.com');
await page.waitForTimeout(3000);

await page.$eval('#xt-btn-bilingual', el => el.click());
await page.waitForTimeout(6000);

const translations = await page.$$('.xt-translation');
const errorTip = await page.$('.xt-error-tip');

console.log('\n--- 結果 ---');
console.log('translation elements:', translations.length);
if (translations.length > 0) {
  const t = await translations[0].textContent();
  console.log('first translation text:', t);
}
console.log('error state:', errorTip ? '有錯誤 (' + (await errorTip.textContent()) + ')' : '✓ 無錯誤');

await context.close();
server.close();
fs.rmSync(userDataDir, { recursive: true, force: true });
