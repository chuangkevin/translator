/**
 * Launches OpenCode UI in Playwright, sends a message automatically,
 * and captures the real API request format. No user interaction needed.
 * Run: node test-opencode-network.mjs
 */
import { chromium } from 'playwright';

const SERVER_URL = 'http://111c748:4096';

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext();

const captured = [];
context.on('request', req => {
  const url = req.url();
  if (!url.startsWith('http://111c748:4096/assets') && !url.includes('.png') && !url.includes('.ico') && !url.includes('.css') && !url.includes('.js') && !url.includes('.webmanifest')) {
    captured.push({ url, method: req.method(), postData: req.postData() });
    console.log(`[REQ] ${req.method()} ${url}`);
  }
});
context.on('response', async res => {
  const url = res.url();
  if (!url.startsWith('http://111c748:4096/assets') && !url.includes('.png') && !url.includes('.ico') && !url.includes('.css') && !url.includes('.js') && !url.includes('.webmanifest')) {
    const match = captured.find(r => r.url === url && !r.responseStatus);
    if (match) {
      try {
        match.responseStatus = res.status();
        match.responseBody = await res.text();
        console.log(`[RES] ${res.status()} ${url} → ${match.responseBody.slice(0, 100)}`);
      } catch {}
    }
  }
});

const page = await context.newPage();
await page.goto(SERVER_URL);
// Wait for DOM, then extra time for SPA to settle
await page.waitForLoadState('domcontentloaded');
console.log('DOM loaded, waiting for SPA...');
await page.waitForTimeout(5000);
console.log('Looking for input...');

// Try common selectors for chat input
const inputSelectors = [
  'textarea',
  'input[type="text"]',
  '[contenteditable="true"]',
  '[role="textbox"]',
  '[placeholder*="message" i]',
  '[placeholder*="chat" i]',
  '[placeholder*="ask" i]',
  '[placeholder*="type" i]',
];

let inputEl = null;
for (const sel of inputSelectors) {
  try {
    inputEl = await page.waitForSelector(sel, { timeout: 3000 });
    console.log('Found input:', sel);
    break;
  } catch {}
}

if (!inputEl) {
  // Dump all interactive elements
  const els = await page.evaluate(() => {
    const tags = ['input', 'textarea', '[contenteditable]', '[role]'];
    const found = [];
    for (const tag of tags) {
      document.querySelectorAll(tag).forEach(el => {
        found.push({ tag: el.tagName, role: el.getAttribute('role'), placeholder: el.getAttribute('placeholder'), contenteditable: el.getAttribute('contenteditable'), id: el.id, className: el.className.slice(0, 60) });
      });
    }
    return found;
  });
  console.log('Interactive elements:', JSON.stringify(els, null, 2));
  await page.screenshot({ path: 'opencode-ui.png' });
  console.log('Screenshot saved to opencode-ui.png');
}

if (inputEl) {
  await inputEl.click();
  await page.keyboard.type('Hello', { delay: 100 });
  await page.keyboard.press('Enter');
  console.log('Sent message, waiting for response...');
  await page.waitForTimeout(20000);
} else {
  console.log('No input found, waiting to capture any init requests...');
  await page.waitForTimeout(5000);
}

console.log('\n=== Captured API requests ===');
for (const r of captured) {
  console.log(`\n${r.method} ${r.url}`);
  if (r.postData) {
    try { console.log('Request:', JSON.stringify(JSON.parse(r.postData), null, 2)); }
    catch { console.log('Request (raw):', r.postData); }
  }
  if (r.responseStatus) {
    console.log('Status:', r.responseStatus);
    if (r.responseBody) {
      try { console.log('Response:', JSON.stringify(JSON.parse(r.responseBody), null, 2).slice(0, 800)); }
      catch { console.log('Response (raw):', r.responseBody?.slice(0, 400)); }
    }
  }
}

await browser.close();
