import { describe, expect, it } from 'vitest';
import { SeenTracker, type KeyValueStore } from '../../src/app/seen.js';

class MemoryStore implements KeyValueStore {
  readonly values = new Map<string, unknown>();
  get(key: string): unknown {
    return this.values.get(key);
  }
  update(key: string, value: unknown): Promise<void> {
    this.values.set(key, value);
    return Promise.resolve();
  }
}

describe('SeenTracker', () => {
  it('starts at zero so that a fresh install shows everything', () => {
    expect(new SeenTracker(new MemoryStore(), 'a').value).toBe(0);
  });

  it('remembers the time it was marked, across instances sharing the store', async () => {
    const store = new MemoryStore();
    await new SeenTracker(store, 'a').markSeen(1000);
    expect(new SeenTracker(store, 'a').value).toBe(1000);
  });

  it('keeps separate values for separate keys', async () => {
    const store = new MemoryStore();
    await new SeenTracker(store, 'a').markSeen(1000);
    expect(new SeenTracker(store, 'b').value).toBe(0);
  });

  it('ignores a stored value that is not a usable number', () => {
    const store = new MemoryStore();
    store.values.set('a', 'yesterday');
    expect(new SeenTracker(store, 'a').value).toBe(0);
    store.values.set('a', Number.NaN);
    expect(new SeenTracker(store, 'a').value).toBe(0);
  });

  it('never moves backwards', async () => {
    const tracker = new SeenTracker(new MemoryStore(), 'a');
    await tracker.markSeen(2000);
    await tracker.markSeen(1000);
    expect(tracker.value).toBe(2000);
  });
});
