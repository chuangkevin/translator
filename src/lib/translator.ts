import { OpenCodeClient, OpenCodeError } from './opencode-client';
export type { OpenCodeError };
import type { TranslateResult } from './types';

interface TranslatorOptions {
  maxConcurrent?: number;
  /** Total number of attempts (first try + retries). Default: 4. */
  retries?: number;
  /** Base delay in ms; actual delay is retryDelayMs * 2^attempt (exponential). Default: 1000. */
  retryDelayMs?: number;
}

class Semaphore {
  private permits: number;
  private queue: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return Promise.resolve();
    }
    return new Promise(resolve => this.queue.push(resolve));
  }

  release(): void {
    const next = this.queue.shift();
    if (next) {
      next();
    } else {
      this.permits++;
    }
  }
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export class Translator {
  private semaphore: Semaphore;
  private retries: number;
  private retryDelayMs: number;

  constructor(
    private client: OpenCodeClient,
    options: TranslatorOptions = {},
  ) {
    this.semaphore = new Semaphore(options.maxConcurrent ?? 5);
    this.retries = options.retries ?? 4;
    this.retryDelayMs = options.retryDelayMs ?? 1000;
  }

  async translateBatch(texts: string[]): Promise<(string | null)[]> {
    await this.semaphore.acquire();
    try {
      for (let attempt = 0; attempt < this.retries; attempt++) {
        if (attempt > 0) await sleep(this.retryDelayMs * Math.pow(2, attempt - 1));
        try {
          return await this.client.translateBatch(texts);
        } catch (err) {
          if (err instanceof OpenCodeError && err.status && err.status < 500) break;
        }
      }
      return texts.map(() => null);
    } finally {
      this.semaphore.release();
    }
  }

  async translate(text: string): Promise<TranslateResult> {
    await this.semaphore.acquire();
    try {
      let lastError: Error | undefined;
      for (let attempt = 0; attempt < this.retries; attempt++) {
        if (attempt > 0) await sleep(this.retryDelayMs * Math.pow(2, attempt - 1));
        try {
          const translation = await this.client.translate(text);
          return { ok: true, translation };
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          if (err instanceof OpenCodeError && err.status && err.status < 500) break;
        }
      }
      return { ok: false, error: lastError?.message ?? 'Unknown error' };
    } finally {
      this.semaphore.release();
    }
  }
}
