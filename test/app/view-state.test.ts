import { describe, expect, it } from 'vitest';
import { buildViewState } from '../../src/app/view-state.js';
import { QueueStore, analyze } from '../../src/core/index.js';
import { loadWorkspace } from '../../src/node/load.js';
import { NOW, T } from '../helpers.js';
import { DEMO_DIR, DEMO_MTIMES } from '../support/demo.js';

function demoStore(): QueueStore {
  const { input } = loadWorkspace(DEMO_DIR);
  const store = new QueueStore();
  for (const file of input.files) {
    const lane = file.path.split('/').pop()?.replace(/\.md$/, '') ?? '';
    store.setFile({ ...file, mtimeMs: T(DEMO_MTIMES[lane] ?? '') });
  }
  store.setConfigText(input.configText);
  return store;
}

describe('buildViewState', () => {
  const store = demoStore();
  const state = buildViewState(store.analyze(NOW), (path) => store.textOf(path));

  it('carries the status bar model', () => {
    expect(state.status.text).toBe('▶ 5 lanes active · 21 open · 5 blocked · updated 4 min ago');
  });

  it('lists diagnostics per file with the columns to underline', () => {
    const blocked = '- [!] B-14 Make the rules fingerprint a ratchet once permissions land';
    expect(state.diagnostics.map((d) => d.path)).toEqual(['.planmaster/lanes/B.md', '.planmaster/lanes/E.md']);
    const [first, second] = state.diagnostics[0]?.entries ?? [];
    expect(first).toMatchObject({ line: 12, start: 6, end: blocked.length, severity: 'error', code: 'PM004' });
    expect(second).toMatchObject({ line: 12, code: 'PM006' });
    expect(state.diagnostics[1]?.entries[0]).toMatchObject({ line: 7, start: 6, severity: 'warning', code: 'PM012' });
  });

  it('marks the lines in progress and the focus line of each lane', () => {
    const marks = (lane: string) => state.marks.find((m) => m.path === `.planmaster/lanes/${lane}.md`);
    expect(marks('A')).toEqual({ path: '.planmaster/lanes/A.md', doingLines: [7, 9], focusLine: 7 });
    expect(marks('D')).toEqual({ path: '.planmaster/lanes/D.md', doingLines: [7], focusLine: 7 });
  });

  it('gives a lane without anything in progress an empty mark', () => {
    const idle = new QueueStore();
    idle.setFile({ path: '.planmaster/lanes/A.md', kind: 'lane', text: '---\nformat: 1\nlane: A\ntitle: Idle lane here\n---\n\n- [ ] A-1 Todo\n' });
    const result = buildViewState(idle.analyze(NOW), (path) => idle.textOf(path));
    expect(result.marks).toEqual([{ path: '.planmaster/lanes/A.md', doingLines: [], focusLine: null }]);
    expect(result.diagnostics).toEqual([]);
  });

  it('falls back to the whole line when the text of a file is not available', () => {
    const analysis = analyze({ files: [{ path: '.planmaster/lanes/A.md', kind: 'lane', text: '---\nformat: 1\nlane: A\ntitle: Broken lane\n---\n- [!] A-1 Item\n' }] }, NOW);
    const result = buildViewState(analysis, () => undefined);
    expect(result.diagnostics[0]?.entries[0]).toMatchObject({ start: 0, end: 0 });
  });
});
