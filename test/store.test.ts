import { describe, expect, it, vi } from 'vitest';
import { ConfigError, analyze, parseLaneFile, type SourceFile } from '../src/core/index.js';
import { QueueStore } from '../src/core/store.js';
import { loadWorkspace } from '../src/node/load.js';
import { CONFIG, NOW, T, archiveFile, codes, laneFile } from './helpers.js';
import { DEMO_DIR } from './support/demo.js';

function storeWithSpy() {
  const parse = vi.fn(parseLaneFile);
  return { store: new QueueStore(parse), parse };
}

describe('QueueStore parsing', () => {
  it('parses each file once when it is added', () => {
    const { store, parse } = storeWithSpy();
    store.setFile(laneFile('A', '- [ ] A-1 One'));
    store.setFile(laneFile('B', '- [ ] B-1 Two'));
    expect(parse).toHaveBeenCalledTimes(2);
    store.analyze(NOW);
    store.analyze(NOW);
    expect(parse).toHaveBeenCalledTimes(2);
  });

  it('does not parse again when the text is unchanged', () => {
    const { store, parse } = storeWithSpy();
    store.setFile(laneFile('A', '- [ ] A-1 One'));
    store.setFile(laneFile('A', '- [ ] A-1 One'));
    expect(parse).toHaveBeenCalledTimes(1);
  });

  it('parses only the file whose text changed', () => {
    const { store, parse } = storeWithSpy();
    store.setFile(laneFile('A', '- [ ] A-1 One'));
    store.setFile(laneFile('B', '- [ ] B-1 Two'));
    store.setFile(laneFile('A', '- [ ] A-1 One changed'));
    expect(parse).toHaveBeenCalledTimes(3);
    expect(store.analyze(NOW).lanes[0]?.items[0]?.title).toBe('One changed');
  });

  it('parses again when the same path changes kind', () => {
    const { store, parse } = storeWithSpy();
    const lane = laneFile('A', '- [ ] A-1 One');
    store.setFile(lane);
    store.setFile({ ...lane, kind: 'archive' });
    expect(parse).toHaveBeenCalledTimes(2);
    expect(store.analyze(NOW).archives).toHaveLength(1);
  });
});

describe('QueueStore file times', () => {
  const body = '- [~] A-1 Item since:2026-11-02T08:05';

  it('applies a new modification time without parsing again', () => {
    const { store, parse } = storeWithSpy();
    store.setFile(laneFile('A', body, '2026-11-02T08:07'));
    expect(codes(store.analyze(NOW).findings)).toEqual(['PM012']);

    store.setFile(laneFile('A', body, '2026-11-02T11:40'));
    expect(parse).toHaveBeenCalledTimes(1);
    expect(codes(store.analyze(NOW).findings)).toEqual([]);
  });

  it('does not change an analysis that was already returned', () => {
    const { store } = storeWithSpy();
    store.setFile(laneFile('A', body, '2026-11-02T08:07'));
    const before = store.analyze(NOW);
    store.setFile(laneFile('A', body, '2026-11-02T11:40'));
    expect(before.lanes[0]?.mtimeMs).toBe(T('2026-11-02T08:07'));
  });
});

describe('QueueStore removal and unreadable files', () => {
  it('forgets a removed file', () => {
    const { store } = storeWithSpy();
    store.setFile(laneFile('A', '- [!] A-1 Broken'));
    store.removeFile('.planmaster/lanes/A.md');
    const analysis = store.analyze(NOW);
    expect(analysis.lanes).toEqual([]);
    expect(analysis.findings).toEqual([]);
    expect(store.textOf('.planmaster/lanes/A.md')).toBeUndefined();
  });

  it('reports an unreadable file and drops its previous content', () => {
    const { store } = storeWithSpy();
    store.setFile(laneFile('A', '- [ ] A-1 One'));
    store.setUnreadable({ path: '.planmaster/lanes/A.md', kind: 'lane', reason: 'permission denied' });
    const analysis = store.analyze(NOW);
    expect(analysis.lanes).toEqual([]);
    expect(codes(analysis.findings)).toEqual(['PM021']);
  });

  it('recovers when an unreadable file can be read again', () => {
    const { store } = storeWithSpy();
    store.setUnreadable({ path: '.planmaster/lanes/A.md', kind: 'lane', reason: 'busy' });
    store.setFile(laneFile('A', '- [ ] A-1 One'));
    const analysis = store.analyze(NOW);
    expect(analysis.lanes).toHaveLength(1);
    expect(analysis.findings).toEqual([]);
  });

  it('forgets an unreadable file that is removed', () => {
    const { store } = storeWithSpy();
    store.setUnreadable({ path: '.planmaster/lanes/A.md', kind: 'lane', reason: 'busy' });
    store.removeFile('.planmaster/lanes/A.md');
    expect(store.analyze(NOW).findings).toEqual([]);
  });
});

describe('QueueStore configuration', () => {
  const blocked = laneFile('A', '- [!] A-1 Item wait:carol since:2026-11-02T10:00');

  it('applies a new configuration to the next analysis', () => {
    const { store } = storeWithSpy();
    store.setFile(blocked);
    store.setConfigText(CONFIG);
    expect(codes(store.analyze(NOW).findings)).toEqual(['PM007']);
    store.setConfigText(JSON.stringify({ people: ['carol'] }));
    expect(codes(store.analyze(NOW).findings)).toEqual([]);
  });

  it('throws on a broken configuration instead of falling back to defaults', () => {
    const { store } = storeWithSpy();
    store.setConfigText('{ nope');
    expect(() => store.analyze(NOW)).toThrow(ConfigError);
  });
});

describe('QueueStore contents', () => {
  it('returns the latest text of a file and lists the known paths', () => {
    const { store } = storeWithSpy();
    store.setFile(laneFile('A', '- [ ] A-1 One'));
    store.setFile(archiveFile('A', '- [x] A-2 Old done:2026-10-01T10:00'));
    expect(store.textOf('.planmaster/lanes/A.md')).toContain('A-1 One');
    expect(store.paths()).toEqual(['.planmaster/archive/A.md', '.planmaster/lanes/A.md']);
  });

  it('gives the same result as analysing the whole workspace at once', () => {
    const { input } = loadWorkspace(DEMO_DIR);
    const store = new QueueStore();
    input.files.forEach((file: SourceFile) => { store.setFile(file); });
    store.setConfigText(input.configText);
    expect(store.analyze(NOW).findings).toEqual(analyze(input, NOW).findings);
  });
});
