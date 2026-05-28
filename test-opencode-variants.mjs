/**
 * Tests different message body formats against the real OpenCode server.
 * Run: node test-opencode-variants.mjs
 */
import http from 'http';

const SERVER_URL = 'http://111c748:4096';

function fetchRaw(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = http.request({
      hostname: parsed.hostname, port: parsed.port || 80,
      path: parsed.pathname, method: options.method || 'GET',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function createSession(model) {
  const r = await fetchRaw(`${SERVER_URL}/session`, {
    method: 'POST',
    body: JSON.stringify({ title: 'test', agent: 'general', model }),
  });
  const data = JSON.parse(r.body);
  return data.id;
}

async function sendMessage(sessionId, body) {
  return fetchRaw(`${SERVER_URL}/session/${encodeURIComponent(sessionId)}/message`, {
    method: 'POST', body: JSON.stringify(body),
  });
}

async function deleteSession(sessionId) {
  await fetchRaw(`${SERVER_URL}/session/${encodeURIComponent(sessionId)}`, { method: 'DELETE' }).catch(() => {});
}

const MODEL_CREATE = { providerID: 'anthropic', id: 'claude-haiku-4-5', variant: 'default' };
const MODEL_MSG_ID = { providerID: 'anthropic', id: 'claude-haiku-4-5', variant: 'default' };
const MODEL_MSG_MID = { providerID: 'anthropic', modelID: 'claude-haiku-4-5', variant: 'default' };

const variants = [
  {
    label: 'No system, modelID',
    msgBody: (m) => ({ agent: 'general', model: MODEL_MSG_MID, parts: [{ type: 'text', text: 'Say "ok"' }] }),
  },
  {
    label: 'No system, id',
    msgBody: (m) => ({ agent: 'general', model: MODEL_MSG_ID, parts: [{ type: 'text', text: 'Say "ok"' }] }),
  },
  {
    label: 'With system, id',
    msgBody: (m) => ({ agent: 'general', model: MODEL_MSG_ID, system: '只輸出譯文', parts: [{ type: 'text', text: 'Say "ok"' }] }),
  },
  {
    label: 'No model field',
    msgBody: (m) => ({ agent: 'general', parts: [{ type: 'text', text: 'Say "ok"' }] }),
  },
  {
    label: 'Text as string (no parts)',
    msgBody: (m) => ({ agent: 'general', model: MODEL_MSG_MID, text: 'Say "ok"' }),
  },
  {
    label: 'content field instead of parts',
    msgBody: (m) => ({ agent: 'general', model: MODEL_MSG_MID, content: [{ type: 'text', text: 'Say "ok"' }] }),
  },
];

for (const v of variants) {
  let sessionId;
  try {
    sessionId = await createSession(MODEL_CREATE);
    console.log(`\n--- ${v.label} (session ${sessionId?.slice(-6)}) ---`);
    const body = v.msgBody(sessionId);
    console.log('body:', JSON.stringify(body));
    const r = await sendMessage(sessionId, body);
    console.log(`→ status: ${r.status}`);
    console.log(`→ body:   ${r.body.slice(0, 300)}`);
  } catch (e) {
    console.log(`ERROR: ${e.message}`);
  } finally {
    if (sessionId) await deleteSession(sessionId);
  }
}

console.log('\n=== Done ===');
