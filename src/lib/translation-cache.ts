const MAX_ENTRIES = 500;

export class TranslationCache {
  private map = new Map<string, string>();

  get(key: string): string | undefined {
    const value = this.map.get(key);
    if (value !== undefined) {
      this.map.delete(key);
      this.map.set(key, value);
    }
    return value;
  }

  set(key: string, value: string): void {
    if (this.map.has(key)) this.map.delete(key);
    else if (this.map.size >= MAX_ENTRIES) {
      this.map.delete(this.map.keys().next().value!);
    }
    this.map.set(key, value);
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}

export function cacheKey(targetLang: string, text: string): string {
  return `${targetLang}\x00${text}`;
}
