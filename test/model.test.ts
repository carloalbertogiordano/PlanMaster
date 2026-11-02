import { describe, expect, it } from 'vitest';
import { blockedGroups, currentStep, isVisible, laneCounts, laneFocus, summarize, upNext } from '../src/core/index.js';
import { NOW, T, laneFile, run } from './helpers.js';

const BODY = `
- [~] A-1 Active since:2026-11-02T11:00
  - [x] A-1a Done step done:2026-11-02T11:10
  - [~] A-1b Current step since:2026-11-02T11:20
    - [~] A-1b1 Deepest since:2026-11-02T11:25
  - [ ] A-1c Later
- [ ] A-2 Next one
- [ ] A-3 Next two
- [ ] A-4 Next three
- [!] A-5 Blocked wait:alice since:2026-11-02T10:00
- [x] A-6 Done done:2026-11-02T09:00
- [-] A-7 Dropped done:2026-10-01T09:00`;

describe('lane helpers', () => {
  const analysis = run([laneFile('A', BODY, '2026-11-02T11:30')]);
  const lane = analysis.lanes[0]!;

  it('counts items at every level', () => {
    expect(laneCounts(lane)).toEqual({ total: 11, closed: 3, open: 8, blocked: 1, inProgress: 3 });
  });

  it('finds the focus and the deepest current step', () => {
    const focus = laneFocus(lane);
    expect(focus?.id).toBe('A-1');
    expect(currentStep(focus!).id).toBe('A-1b1');
  });

  it('has no focus when nothing top-level is in progress', () => {
    const other = run([laneFile('A', '- [ ] A-1 Only a todo')]).lanes[0]!;
    expect(laneFocus(other)).toBeNull();
  });

  it('lists the first top-level to-do items as up next', () => {
    expect(upNext(lane).map((i) => i.id)).toEqual(['A-2', 'A-3']);
    expect(upNext(lane, 3).map((i) => i.id)).toEqual(['A-2', 'A-3', 'A-4']);
  });

  it('hides closed items older than doneVisibleDays but always shows open ones', () => {
    const byId = (id: string) => lane.items.find((i) => i.id === id)!;
    expect(isVisible(byId('A-6'), NOW, 3)).toBe(true);
    expect(isVisible(byId('A-7'), NOW, 3)).toBe(false);
    expect(isVisible(byId('A-2'), NOW, 3)).toBe(true);
  });
});

describe('blockedGroups', () => {
  const files = [
    laneFile('A', `
- [!] A-1 Second oldest for bob wait:bob since:2026-11-02T10:00
- [!] A-2 Oldest for bob wait:bob since:2026-11-01T09:00
- [!] A-3 For alice wait:alice since:2026-11-02T10:30
- [!] A-4 For an unknown person wait:zed since:2026-11-02T10:30
- [!] A-5 Depends on an item wait:B-1 since:2026-11-02T10:30
- [!] A-6 No reason`),
    laneFile('B', '- [~] B-1 Target since:2026-11-02T10:00'),
  ];
  const groups = blockedGroups(run(files));

  it('orders groups: configured people in config order, others, dependencies, missing', () => {
    expect(groups.map((g) => `${g.kind}:${g.key}`)).toEqual(['person:alice', 'person:bob', 'person:zed', 'item:', 'missing:']);
  });

  it('orders items by the oldest block first', () => {
    const bob = groups.find((g) => g.key === 'bob')!;
    expect(bob.items.map((i) => i.id)).toEqual(['A-2', 'A-1']);
  });

  it('is empty when nothing is blocked', () => {
    expect(blockedGroups(run([laneFile('A', '- [ ] A-1 x')]))).toEqual([]);
  });
});

describe('summarize', () => {
  it('summarizes lanes, findings and the newest change', () => {
    const files = [
      laneFile('A', '- [~] A-1 x since:2026-11-02T08:05', '2026-11-02T08:07'),
      laneFile('B', '- [~] B-1 y since:2026-11-02T11:00\n- [!] B-2 z wait:alice since:2026-11-02T11:00\n- [ ] B-3 w', '2026-11-02T11:44'),
      laneFile('C', '- [ ] C-1 idle'),
    ];
    const summary = summarize(run(files));
    expect(summary.lanesActive).toBe(2);
    expect(summary.open).toBe(5);
    expect(summary.blocked).toBe(1);
    expect(summary.stale).toBe(1);
    expect(summary.errors).toBe(0);
    expect(summary.warnings).toBe(1);
    expect(summary.newestChangeMs).toBe(T('2026-11-02T11:44'));
  });
});
