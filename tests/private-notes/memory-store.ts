import type { PluginDataStore } from '../../src/plugin/storage/document-notes';

/** In-memory pluginData with hooks to simulate failures and to record access. */
export class MemoryStore implements PluginDataStore {
  readonly data = new Map<string, string>();
  readonly reads: string[] = [];
  readonly writes: { key: string; value: string }[] = [];
  /** `throw`: setPluginData throws; `drop`: it silently stores nothing. */
  failMode: 'none' | 'throw' | 'drop' = 'none';

  keys(): string[] {
    return [...this.data.keys()];
  }

  get(key: string): string {
    this.reads.push(key);
    return this.data.get(key) ?? '';
  }

  set(key: string, value: string): void {
    if (this.failMode === 'throw') throw new Error('write rejected');
    this.writes.push({ key, value });
    if (this.failMode === 'drop') return;
    // Figma removes a key when an empty string is written.
    if (value === '') this.data.delete(key);
    else this.data.set(key, value);
  }

  /** Puts a raw value without recording it as a write (test fixtures). */
  seed(key: string, value: string): void {
    this.data.set(key, value);
  }

  snapshot(): Record<string, string> {
    return Object.fromEntries(this.data);
  }
}
