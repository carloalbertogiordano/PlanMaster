import { describe, expect, it } from 'vitest';
import { analyze, blockedGroups, deriveEvents, laneCounts, summarize } from '../src/core/index.js';
import { loadWorkspace } from '../src/node/load.js';
import { NOW, T } from './helpers.js';
import { DEMO_DIR, DEMO_MTIMES, analyzeDemo } from './support/demo.js';

describe('demo workspace', () => {
  const analysis = analyzeDemo();

  it('produces exactly the findings listed in its README', () => {
    expect(analysis.findings.map((f) => `${f.file}:${f.line} ${f.code}`)).toEqual([
      '.planmaster/lanes/B.md:12 PM004',
      '.planmaster/lanes/B.md:12 PM006',
      '.planmaster/lanes/E.md:7 PM012',
    ]);
  });

  it('loads five lanes with the expected titles and thirty items', () => {
    expect(analysis.lanes.map((l) => l.lane)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(analysis.lanes.map((l) => l.frontMatter.title)).toEqual([
      'Requirements matrix, counts and citations',
      'Automated checks, gates and ratchets',
      'Work plans, drafting and review',
      'Implementation of approved plans',
      'Inventories and data-flow surveys',
    ]);
    expect(analysis.lanes.reduce((n, l) => n + l.items.length, 0)).toBe(30);
    expect(analysis.lanes.map((l) => laneCounts(l).total)).toEqual([7, 7, 7, 6, 3]);
  });

  it('has the numbers shown in the mockup status bar', () => {
    const summary = summarize(analysis);
    expect(summary).toMatchObject({ lanesActive: 5, open: 21, blocked: 5, errors: 2, warnings: 1, stale: 1 });
    expect(summary.newestChangeMs).toBe(T(DEMO_MTIMES.A!));
  });

  it('groups blocked items as the mockup shows them', () => {
    const groups = blockedGroups(analysis).map((g) => `${g.kind}:${g.key}=${g.items.map((i) => i.id).join(',')}`);
    expect(groups).toEqual(['person:alice=C-04', 'person:bob=A-09,D-07', 'item:=D-08', 'missing:=B-14']);
  });

  it('derives the fourteen events since 09:15', () => {
    const events = deriveEvents(analysis, T('2026-11-02T09:15'));
    expect(events).toHaveLength(14);
    expect(events[0]?.item.id).toBe('A-07b');
    expect(events.filter((e) => e.kind === 'started')).toHaveLength(6);
    expect(events.filter((e) => e.kind === 'closed')).toHaveLength(5);
    expect(events.filter((e) => e.kind === 'blocked')).toHaveLength(3);
  });

  it('is clean when the clock is unknown for staleness', () => {
    const { input } = loadWorkspace(DEMO_DIR);
    const withoutTimes = analyze({ ...input, files: input.files.map((f) => ({ ...f, mtimeMs: undefined })) }, NOW);
    expect(withoutTimes.findings.map((f) => f.code)).toEqual(['PM004', 'PM006']);
  });
});
