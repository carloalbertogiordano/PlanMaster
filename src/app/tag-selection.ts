import { TAG_KEY } from '../core/index.js';
import type { KeyValueStore } from './seen.js';

const MAX_SELECTED = 100;

/** Checks a list of tag keys that came from outside (the view, or stored data); null when it is not one. */
export function parseTagSelection(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_SELECTED) return null;
  if (!raw.every((entry): entry is string => typeof entry === 'string' && TAG_KEY.test(entry))) return null;
  return [...new Set(raw)];
}

/** Remembers which tags the user selected in the filter bar of one folder. */
export class TagFilterStore {
  private readonly store: KeyValueStore;
  private readonly key: string;

  constructor(store: KeyValueStore, key: string) {
    this.store = store;
    this.key = key;
  }

  /** The selected tags; empty when nothing was stored or the stored data is not a valid selection. */
  get value(): string[] {
    return parseTagSelection(this.store.get(this.key)) ?? [];
  }

  async set(tags: readonly string[]): Promise<void> {
    await this.store.update(this.key, [...tags]);
  }
}
