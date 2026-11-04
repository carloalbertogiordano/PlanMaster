import { describe, expect, it } from 'vitest';
import { buildQueueViewModel, errorViewModel, setupViewModel, withSetup, type LaneBlockModel, type QueueViewModel } from '../../src/app/queue-view-model.js';
import { assessSetup } from '../../src/app/setup.js';
import { NOW, T, laneFile, run } from '../helpers.js';
import { analyzeDemo } from '../support/demo.js';

const LAST_SEEN = T('2026-11-02T09:15');

const demoModelAnalysis = (): ReturnType<typeof analyzeDemo> => analyzeDemo();

function demoModel(lastSeen = LAST_SEEN): QueueViewModel {
  return buildQueueViewModel(analyzeDemo(), { folder: 'demo', lastSeen });
}

function lane(model: QueueViewModel, id: string): LaneBlockModel {
  const found = model.lanes.find((l) => l.lane === id);
  if (!found) throw new Error(`No lane ${id}`);
  return found;
}

describe('stack: lane blocks', () => {
  const model = demoModel();

  it('has one block per lane with title, counts and progress', () => {
    expect(model.folder).toBe('demo');
    expect(model.lanes.map((l) => l.lane)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(lane(model, 'A')).toMatchObject({
      title: 'Requirements matrix, counts and citations',
      closed: 2,
      total: 7,
      closedPercent: 29,
      doingPercent: 29,
      blockedCount: 1,
      closedCount: 2,
      hiddenClosed: 0,
    });
  });

  it('shows the item in progress with its whole subtree', () => {
    const rows = lane(model, 'A').focus;
    expect(rows.map((r) => `${r.depth}:${r.id}:${r.state}`)).toEqual(['0:A-07:doing', '1:A-07a:done', '1:A-07b:doing', '1:A-07c:todo']);
  });

  it('lists the first two to-do items as up next', () => {
    expect(lane(model, 'A').next.map((r) => r.id)).toEqual(['A-08']);
    expect(lane(model, 'D').next.map((r) => r.id)).toEqual(['D-05', 'D-06']);
  });

  it('shows the whole tree in file order when expanded', () => {
    expect(lane(model, 'C').all.map((r) => r.id)).toEqual(['C-05', 'C-05a', 'C-05b', 'C-04', 'C-06', 'C-03', 'C-02']);
  });

  it('has an empty focus for a lane with nothing in progress', () => {
    const idle = buildQueueViewModel(run([laneFile('A', '- [ ] A-1 Todo')]), { folder: 'f', lastSeen: 0 });
    expect(idle.lanes[0]).toMatchObject({ focus: [], idle: true });
    expect(idle.lanes[0]?.next.map((r) => r.id)).toEqual(['A-1']);
  });

  it('carries where each row lives so it can be revealed', () => {
    expect(lane(model, 'D').focus[0]).toMatchObject({ id: 'D-04', path: '.planmaster/lanes/D.md', line: 7 });
  });
});

describe('stack: row chips', () => {
  const model = demoModel();
  const chips = (laneId: string, id: string) => lane(model, laneId).all.find((r) => r.id === id)?.chips;

  it('shows how long an item has been in progress, then its references', () => {
    expect(chips('D', 'D-04')).toEqual([{ kind: 'doing', text: 'for 1 h 28 min' }, { kind: 'plain', text: 'P-017' }]);
  });

  it('marks a stale item in progress', () => {
    expect(chips('E', 'E-05')).toEqual([{ kind: 'doing', text: 'for 3 h 43 min' }, { kind: 'stale', text: 'stale' }]);
  });

  it('shows who or what a blocked item waits for, and for how long', () => {
    expect(chips('D', 'D-07')).toEqual([{ kind: 'block', text: 'waiting on bob' }, { kind: 'plain', text: 'for 58 min' }, { kind: 'plain', text: 'P-034' }]);
    expect(chips('D', 'D-08')).toEqual([{ kind: 'block', text: 'after D-04' }, { kind: 'plain', text: 'for 1 h 28 min' }, { kind: 'plain', text: 'P-010' }]);
  });

  it('flags a blocked item with missing tokens as an error', () => {
    expect(chips('B', 'B-14')).toEqual([{ kind: 'error', text: 'missing wait:' }, { kind: 'error', text: 'missing since:' }]);
  });

  it('shows when an item was closed or dropped', () => {
    expect(chips('D', 'D-03')).toEqual([{ kind: 'done', text: 'at 11:15' }, { kind: 'plain', text: 'P-033' }]);
    expect(chips('B', 'B-09')).toEqual([{ kind: 'done', text: '30 Oct' }]);
    expect(chips('C', 'C-02')).toEqual([{ kind: 'done', text: 'dropped 30 Oct' }, { kind: 'plain', text: 'P-030' }]);
  });

  it('has one chip for each reference and none for a plain to-do item', () => {
    const files = [laneFile('A', '- [ ] A-1 One ref:P-1,P-2\n- [ ] A-2 Two')];
    const built = buildQueueViewModel(run(files), { folder: 'f', lastSeen: 0 });
    expect(built.lanes[0]?.all[0]?.chips).toEqual([{ kind: 'plain', text: 'P-1' }, { kind: 'plain', text: 'P-2' }]);
    expect(built.lanes[0]?.all[1]?.chips).toEqual([]);
  });

  it('describes the state in words for assistive technology', () => {
    expect(lane(model, 'D').all.map((r) => r.stateLabel)).toEqual(['in progress', 'blocked', 'to do', 'to do', 'blocked', 'done']);
  });
});

describe('stack: closed items that are too old', () => {
  const body = `
- [~] A-1 Active since:2026-11-02T10:00
- [x] A-2 Recent done:2026-11-02T09:00
- [x] A-3 Old done:2026-10-20T09:00
  - [x] A-3a Old child done:2026-10-20T08:00
- [x] A-4 Old parent done:2026-10-20T09:00
  - [~] A-4a Still going under a closed parent since:2026-11-02T09:00`;
  const block = buildQueueViewModel(run([laneFile('A', body)]), { folder: 'f', lastSeen: 0 }).lanes[0]!;

  it('hides old closed subtrees and counts them', () => {
    expect(block.all.map((r) => r.id)).toEqual(['A-1', 'A-2', 'A-4', 'A-4a']);
    expect(block.hiddenClosed).toBe(2);
  });

  it('never hides an item that is still open', () => {
    expect(block.all.some((r) => r.id === 'A-4a')).toBe(true);
  });

  it('still counts hidden items in the totals', () => {
    expect(block.total).toBe(6);
    expect(block.closed).toBe(4);
  });
});

describe('blocked tab', () => {
  const model = demoModel();

  it('groups by who waits, then dependencies, then missing reasons', () => {
    expect(model.blocked.map((g) => g.title)).toEqual(['Waiting on alice', 'Waiting on bob', 'Dependencies between items', 'No reason given, needs fixing']);
    expect(model.blocked.map((g) => g.kind)).toEqual(['person', 'person', 'item', 'missing']);
    expect(model.blockedCount).toBe(5);
  });

  it('orders rows by oldest block and names the lane of each', () => {
    const bob = model.blocked[1]!;
    expect(bob.rows.map((r) => `${r.lane}:${r.id}`)).toEqual(['A:A-09', 'D:D-07']);
  });

  it('shows the state of the item a dependency waits on', () => {
    const dependency = model.blocked[2]!.rows[0]!;
    expect(dependency.id).toBe('D-08');
    expect(dependency.dependency).toEqual({ kind: 'doing', text: 'D-04 in progress' });
  });

  it('says when the item waited on has not started', () => {
    const files = [laneFile('A', '- [!] A-1 Blocked wait:A-2 since:2026-11-02T10:00\n- [ ] A-2 Not yet')];
    const built = buildQueueViewModel(run(files), { folder: 'f', lastSeen: 0 });
    expect(built.blocked[0]?.rows[0]?.dependency).toEqual({ kind: 'block', text: 'A-2 not started' });
  });

  it('is empty when nothing is blocked', () => {
    const built = buildQueueViewModel(run([laneFile('A', '- [ ] A-1 x')]), { folder: 'f', lastSeen: 0 });
    expect(built.blocked).toEqual([]);
    expect(built.blockedCount).toBe(0);
  });
});

describe("what's new tab", () => {
  const model = demoModel();

  it('lists the events since the last time, newest first', () => {
    expect(model.news.sinceLabel).toBe('09:15');
    expect(model.news.events).toHaveLength(14);
    expect(model.news.events[0]).toMatchObject({ time: '11:40', verb: 'started', detail: '' });
    expect(model.news.events[0]?.row).toMatchObject({ id: 'A-07b', lane: 'A' });
  });

  it('says what a blocked item waits for', () => {
    const blocked = model.news.events.find((e) => e.row.id === 'C-04');
    expect(blocked).toMatchObject({ verb: 'blocked', detail: ', waiting on alice', time: '10:40' });
  });

  it('shows everything when nothing was seen yet', () => {
    const all = demoModel(0);
    expect(all.news.sinceLabel).toBe('the beginning');
    expect(all.news.events.length).toBeGreaterThan(14);
  });

  it('is empty once everything was seen', () => {
    const seen = demoModel(NOW);
    expect(seen.news.events).toEqual([]);
    expect(seen.news.sinceLabel).toBe('11:48');
  });

  it('includes the date when the last time was on another day', () => {
    expect(demoModel(T('2026-11-01T18:30')).news.sinceLabel).toBe('1 Nov 18:30');
  });
});

describe('the model as data', () => {
  it('survives a round trip through JSON unchanged', () => {
    const model = demoModel();
    expect(JSON.parse(JSON.stringify(model))).toEqual(model);
  });

  it('keeps titles from the file exactly as they are; escaping is the renderer concern', () => {
    const hostile = '<img src=x onerror=alert(1)> **bold** [x](y)';
    const built = buildQueueViewModel(run([laneFile('A', `- [ ] A-1 ${hostile}`)]), { folder: 'f', lastSeen: 0 });
    expect(built.lanes[0]?.all[0]?.title).toBe(hostile);
  });
});

describe('errorViewModel', () => {
  it('is an empty view that carries the message', () => {
    expect(errorViewModel('demo', 'config.json is not valid JSON')).toEqual({
      folder: 'demo',
      lanes: [],
      blocked: [],
      blockedCount: 0,
      news: { sinceLabel: '', events: [] },
      tags: [],
      filter: [],
      error: 'config.json is not valid JSON',
    });
  });
});

describe('the setup notice', () => {
  const needs = assessSetup({ hasWorkspaceDir: true, analysis: run([]), claudeMd: undefined });

  it('is added when the project needs setup', () => {
    const model = buildQueueViewModel(run([]), { folder: 'f', lastSeen: 0, setup: needs });
    expect(model.setup).toEqual({ reason: 'empty', headline: 'Your queue is empty.', detail: needs.detail, problems: [] });
  });

  it('is left out when nothing is needed or when none was given', () => {
    const fine = assessSetup({ hasWorkspaceDir: true, analysis: demoModelAnalysis(), claudeMd: '<!-- planmaster:begin v1 -->\nx\n<!-- planmaster:end -->' });
    expect(buildQueueViewModel(demoModelAnalysis(), { folder: 'f', lastSeen: 0, setup: fine }).setup).toBeUndefined();
    expect(buildQueueViewModel(demoModelAnalysis(), { folder: 'f', lastSeen: 0 }).setup).toBeUndefined();
  });

  it('can be added to a model that was built without it, for example an error model', () => {
    const base = errorViewModel('f', 'config.json is not valid JSON: boom');
    const unreadable = assessSetup({ hasWorkspaceDir: true, analysis: undefined, claudeMd: undefined, configError: 'config.json is not valid JSON: boom' });
    expect(withSetup(base, unreadable)).toEqual({ ...base, setup: { reason: 'unparsable', headline: 'Some queue files cannot be read.', detail: unreadable.detail, problems: ['config.json is not valid JSON: boom'] } });
  });

  it('is not added when nothing is needed or the assessment is missing', () => {
    const base = errorViewModel('f', 'x');
    const fine = assessSetup({ hasWorkspaceDir: true, analysis: demoModelAnalysis(), claudeMd: '<!-- planmaster:begin v1 -->\nx\n<!-- planmaster:end -->' });
    expect(withSetup(base, fine)).toBe(base);
    expect(withSetup(base, undefined)).toBe(base);
  });

  it('is the whole content of a folder that has no PlanMaster directory', () => {
    const missing = assessSetup({ hasWorkspaceDir: false, analysis: undefined, claudeMd: undefined });
    const model = setupViewModel('plain', missing);
    expect(model).toMatchObject({ folder: 'plain', lanes: [], blocked: [], blockedCount: 0, setup: { reason: 'missing' } });
    expect(JSON.parse(JSON.stringify(model))).toEqual(model);
  });
});
