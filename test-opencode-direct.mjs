/**
 * Direct OpenCode API diagnostic — bypasses the extension entirely.
 * Run: node test-opencode-direct.mjs
 */
import http from 'http';

const SERVER_URL = 'http://111c748:4096';

function fetchJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const reqOptions = {
      hostname: parsed.hostname,
      port: parsed.port || 80,
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    };
    const req = http.request(reqOptions, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        resolve({ status: res.statusCode, body, json: () => { try { return JSON.parse(body); } catch { return body; } } });
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function testSession(label, createBody, messageBody) {
  console.log(`\n--- ${label} ---`);
  console.log('POST /session body:', JSON.stringify(createBody, null, 2));

  let sessionRes;
  try {
    sessionRes = await fetchJson(`${SERVER_URL}/session`, {
      method: 'POST',
      body: JSON.stringify(createBody),
    });
  } catch (e) {
    console.log('create session NETWORK ERROR:', e.message);
    return;
  }
  console.log('create session status:', sessionRes.status);
  const sessionData = sessionRes.json();
  console.log('create session response:', JSON.stringify(sessionData));

  if (!sessionData?.id) {
    console.log('No session ID — skipping message test');
    return;
  }

  const sessionId = sessionData.id;
  console.log('\nPOST /session message body:', JSON.stringify(messageBody, null, 2));

  let msgRes;
  try {
    msgRes = await fetchJson(`${SERVER_URL}/session/${encodeURIComponent(sessionId)}/message`, {
      method: 'POST',
      body: JSON.stringify(messageBody),
    });
  } catch (e) {
    console.log('send message NETWORK ERROR:', e.message);
    return;
  }
  console.log('send message status:', msgRes.status);
  console.log('send message response:', msgRes.body.slice(0, 500));

  // cleanup
  await fetchJson(`${SERVER_URL}/session/${encodeURIComponent(sessionId)}`, { method: 'DELETE' }).catch(() => {});
}

// ── Try to list models ──────────────────────────────────────────────────────
console.log('=== Checking /model endpoint ===');
try {
  const r = await fetchJson(`${SERVER_URL}/model`);
  console.log('GET /model status:', r.status);
  console.log('GET /model body:', r.body.slice(0, 2000));
} catch (e) {
  console.log('GET /model error:', e.message);
}

// ── Test different model configs ────────────────────────────────────────────
const SYSTEM = '你是翻譯助手，將使用者的文字翻譯成繁體中文，只輸出譯文，不加任何說明。';
const TEXT = 'Hello world';

const CANDIDATES = [
  { providerID: 'anthropic', id: 'claude-opus-4-5', modelID: 'claude-opus-4-5' },
  { providerID: 'anthropic', id: 'claude-sonnet-4-5', modelID: 'claude-sonnet-4-5' },
  { providerID: 'anthropic', id: 'claude-haiku-4-5', modelID: 'claude-haiku-4-5' },
  { providerID: 'openai', id: 'gpt-4o', modelID: 'gpt-4o' },
  { providerID: 'openai', id: 'gpt-4o-mini', modelID: 'gpt-4o-mini' },
];

for (const c of CANDIDATES) {
  const createModel = { providerID: c.providerID, id: c.id, variant: 'default' };
  const msgModel = { providerID: c.providerID, modelID: c.modelID, variant: 'default' };

  await testSession(
    `${c.providerID}/${c.id}`,
    { title: 'diag', agent: 'general', model: createModel },
    { agent: 'general', model: msgModel, system: SYSTEM, parts: [{ type: 'text', text: TEXT }] },
  );
}

console.log('\n=== Done ===');
