import { describe, expect, it } from 'vitest';
import type { KeyValueStore } from '../../src/app/seen.js';
import { TagFilterStore, parseTagSelection } from '../../src/app/tag-selection.js';

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

describe('parseTagSelection', () => {
  it('accepts a list of tags and keeps each once', () => {
    expect(parseTagSelection(['SEC', 'OPS', 'SEC'])).toEqual(['SEC', 'OPS']);
    expect(parseTagSelection([])).toEqual([]);
  });

  it.each([
    ['null', null],
    ['a string', 'SEC'],
    ['an object', { 0: 'SEC' }],
    ['a list with a number', ['SEC', 3]],
    ['a list with an invalid tag', ['SEC', 'a b']],
    ['a list with an empty tag', ['']],
    ['a very long list', Array.from({ length: 101 }, (_, i) => `T${i}`)],
  ])('rejects %s', (_name, raw) => {
    expect(parseTagSelection(raw)).toBeNull();
  });
});

describe('TagFilterStore', () => {
  it('starts with nothing selected', () => {
    expect(new TagFilterStore(new MemoryStore(), 'k').value).toEqual([]);
  });

  it('remembers the selection across instances sharing the store', async () => {
    const store = new MemoryStore();
    await new TagFilterStore(store, 'k').set(['SEC', 'OPS']);
    expect(new TagFilterStore(store, 'k').value).toEqual(['SEC', 'OPS']);
  });

  it('keeps separate selections for separate keys', async () => {
    const store = new MemoryStore();
    await new TagFilterStore(store, 'a').set(['SEC']);
    expect(new TagFilterStore(store, 'b').value).toEqual([]);
  });

  it('ignores stored data that is not a valid selection', () => {
    const store = new MemoryStore();
    store.values.set('k', 'not a list');
    expect(new TagFilterStore(store, 'k').value).toEqual([]);
  });

  it('clears the selection', async () => {
    const store = new MemoryStore();
    const filter = new TagFilterStore(store, 'k');
    await filter.set(['SEC']);
    await filter.set([]);
    expect(filter.value).toEqual([]);
  });
});
