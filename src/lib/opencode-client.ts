export class OpenCodeError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'OpenCodeError';
  }
}

interface OpenCodeConfig {
  serverUrl: string;
  provider: string;
  model: string;
  targetLang: string;
}

// POST /session uses "id"; POST /session/{id}/message uses "modelID"
interface SessionCreateModel {
  providerID: string;
  id: string;
  variant: 'default';
}

interface MessageModel {
  providerID: string;
  modelID: string;
  variant: 'default';
}

const SESSION_CREATE_TIMEOUT_MS = 10_000;
const MESSAGE_TIMEOUT_MS = 30_000;

async function readJson<T>(res: Response, op: string): Promise<T> {
  if (!res.ok) {
    const body = await res.text();
    throw new OpenCodeError(`OpenCode ${op} failed: HTTP ${res.status} — ${body}`, res.status);
  }
  return res.json() as Promise<T>;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new OpenCodeError(`${label} timed out after ${ms}ms`)), ms),
    ),
  ]);
}

export class OpenCodeClient {
  private createModel: SessionCreateModel;
  private messageModel: MessageModel;
  private systemPrompt: string;

  constructor(private config: OpenCodeConfig) {
    this.createModel = {
      providerID: config.provider,
      id: config.model,
      variant: 'default',
    };
    this.messageModel = {
      providerID: config.provider,
      modelID: config.model,
      variant: 'default',
    };
    this.systemPrompt = `你是翻譯助手，無論原文是何種語言（英文、日文、廣東話、簡體中文、葡萄牙文等），一律翻譯成${config.targetLang}，只輸出譯文，不加任何說明。`;
  }

  async translate(text: string): Promise<string> {
    const baseUrl = this.config.serverUrl.replace(/\/$/, '');

    // 1. Create session
    const sessionRes = await withTimeout(
      fetch(`${baseUrl}/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'translator',
          agent: 'general',
          model: this.createModel,
        }),
      }),
      SESSION_CREATE_TIMEOUT_MS,
      'create session',
    );
    const session = await readJson<{ id?: string }>(sessionRes, 'create session');
    if (!session.id) throw new OpenCodeError('Session creation response missing id');
    const sessionId = session.id;

    try {
      // 2. Send message
      const msgRes = await withTimeout(
        fetch(`${baseUrl}/session/${encodeURIComponent(sessionId)}/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agent: 'general',
            model: this.messageModel,
            system: this.systemPrompt,
            parts: [{ type: 'text', text }],
          }),
        }),
        MESSAGE_TIMEOUT_MS,
        'send message',
      );
      const msg = await readJson<{ parts?: Array<{ type: string; text?: string; synthetic?: boolean }> }>(
        msgRes,
        'send message',
      );

      const translation = (msg.parts ?? [])
        .filter(p => p.type === 'text' && !p.synthetic && typeof p.text === 'string')
        .map(p => p.text!)
        .join('');
      if (!translation) throw new OpenCodeError('Empty translation result from server');
      return translation;
    } finally {
      // 3. Delete session (fire-and-forget)
      fetch(`${baseUrl}/session/${encodeURIComponent(sessionId)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      }).catch(() => undefined);
    }
  }
}
