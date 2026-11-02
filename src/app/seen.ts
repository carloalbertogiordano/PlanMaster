/** The part of the editor's workspace storage that is needed here. */
export interface KeyValueStore {
  get(key: string): unknown;
  update(key: string, value: unknown): PromiseLike<void>;
}

/** Remembers when the user last marked the what's-new feed as seen. */
export class SeenTracker {
  private readonly store: KeyValueStore;
  private readonly key: string;

  constructor(store: KeyValueStore, key: string) {
    this.store = store;
    this.key = key;
  }

  /** Milliseconds since the epoch; 0 when never marked, so that a fresh install shows everything. */
  get value(): number {
    const stored = this.store.get(this.key);
    return typeof stored === 'number' && Number.isFinite(stored) && stored > 0 ? stored : 0;
  }

  async markSeen(time: number): Promise<void> {
    if (time > this.value) await this.store.update(this.key, time);
  }
}
