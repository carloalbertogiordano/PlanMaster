import { describe, expect, it } from 'vitest';
import { buildQueueViewModel, type QueueViewModel } from '../../src/app/queue-view-model.js';
import { NOW, laneFile, run } from '../helpers.js';

const CONFIG = JSON.stringify({ people: ['alice'], tags: { SEC: 'Security review', OPS: 'Operations', OLD: 'Not used any more' } });

const files = () => [
  laneFile('A', `
- [~] A-1 Rotate the keys tag:SEC since:2026-11-02T11:00
  - [x] A-1a Inventory the keys done:2026-11-02T10:30
  - [~] A-1b Replace them since:2026-11-02T11:10
- [ ] A-2 Quarterly report tag:OPS
- [ ] A-3 Untagged
- [!] A-4 Wait for sign-off tag:OPS wait:alice since:2026-11-02T10:00`),
  laneFile('B', `
- [~] B-1 Audit the exports tag:DOC since:2026-11-02T11:20
- [ ] B-2 Parent without a tag
  - [ ] B-2a Child with a tag tag:SEC`),
];

function model(tagFilter: readonly string[] = []): QueueViewModel {
  return buildQueueViewModel(run(files(), NOW, CONFIG), { folder: 'demo', lastSeen: 0, tagFilter });
}

const byText = (a: string, b: string): number => a.localeCompare(b);
const laneIds = (m: QueueViewModel): string[] => m.lanes.map((l) => l.lane);
const lane = (m: QueueViewModel, id: string) => m.lanes.find((l) => l.lane === id)!;

describe('the tags offered for filtering', () => {
  it('lists the tags in use with their labels and how many items carry them', () => {
    expect(model().tags).toEqual([
      { key: 'SEC', label: 'Security review', count: 4, declared: true },
      { key: 'OPS', label: 'Operations', count: 2, declared: true },
      { key: 'DOC', label: 'DOC', count: 1, declared: false },
    ]);
  });

  it('leaves out declared tags that nothing uses', () => {
    expect(model().tags.map((t) => t.key)).not.toContain('OLD');
  });

  it('keeps a selected tag in the list even when nothing carries it, so that it can be cleared', () => {
    const tags = model(['OLD']).tags;
    expect(tags.find((t) => t.key === 'OLD')).toEqual({ key: 'OLD', label: 'Not used any more', count: 0, declared: true });
  });

  it('is empty when no item is tagged', () => {
    const plain = buildQueueViewModel(run([laneFile('A', '- [ ] A-1 x')]), { folder: 'demo', lastSeen: 0 });
    expect(plain.tags).toEqual([]);
    expect(plain.filter).toEqual([]);
  });
});

describe('with no filter', () => {
  it('shows every lane and reports an empty filter', () => {
    expect(laneIds(model())).toEqual(['A', 'B']);
    expect(model().filter).toEqual([]);
    expect(model().blockedCount).toBe(1);
  });

  it('puts a chip on a tagged item, none on its children, which inherit the tag', () => {
    const rows = lane(model(), 'A').all;
    expect(rows.find((r) => r.id === 'A-1')?.chips).toContainEqual({ kind: 'tag', text: 'SEC' });
    expect(rows.find((r) => r.id === 'A-1a')?.chips.some((c) => c.kind === 'tag')).toBe(false);
  });
});

describe('with a filter', () => {
  it('keeps the items that carry the tag, their children, and the parents of those, for context', () => {
    const filtered = model(['SEC']);
    expect(filtered.filter).toEqual(['SEC']);
    expect(lane(filtered, 'A').all.map((r) => r.id)).toEqual(['A-1', 'A-1a', 'A-1b']);
    expect(lane(filtered, 'B').all.map((r) => r.id)).toEqual(['B-2', 'B-2a']);
  });

  it('counts only the items in scope, not the parents shown for context', () => {
    const b = lane(model(['SEC']), 'B');
    expect(b.total).toBe(1);
    expect(b.closed).toBe(0);
    const a = lane(model(['SEC']), 'A');
    expect([a.total, a.closed, a.blockedCount]).toEqual([3, 1, 0]);
  });

  it('shows no focus and no up-next for items outside the scope', () => {
    const b = lane(model(['SEC']), 'B');
    expect(b.focus).toEqual([]);
    expect(b.idle).toBe(true);
    expect(b.next).toEqual([]);
    expect(lane(model(['OPS']), 'A').next.map((r) => r.id)).toEqual(['A-2']);
  });

  it('drops lanes with nothing in scope', () => {
    expect(laneIds(model(['OPS']))).toEqual(['A']);
    expect(laneIds(model(['DOC']))).toEqual(['B']);
  });

  it('shows items that carry any of several selected tags', () => {
    const filtered = model(['OPS', 'DOC']);
    expect(laneIds(filtered)).toEqual(['A', 'B']);
    expect(lane(filtered, 'A').all.map((r) => r.id)).toEqual(['A-2', 'A-4']);
    expect(lane(filtered, 'B').all.map((r) => r.id)).toEqual(['B-1']);
  });

  it('shows an empty queue when the selected tag matches nothing', () => {
    expect(laneIds(model(['OLD']))).toEqual([]);
  });

  it('filters the blocked tab', () => {
    expect(model(['SEC']).blockedCount).toBe(0);
    expect(model(['SEC']).blocked).toEqual([]);
    const apr = model(['OPS']);
    expect(apr.blockedCount).toBe(1);
    expect(apr.blocked[0]?.rows.map((r) => r.id)).toEqual(['A-4']);
  });

  it("filters the what's-new feed", () => {
    const ids = (m: QueueViewModel): string[] => m.news.events.map((e) => e.row.id);
    expect(ids(model()).sort(byText)).toEqual(['A-1', 'A-1a', 'A-1b', 'A-4', 'B-1']);
    expect(ids(model(['DOC']))).toEqual(['B-1']);
    expect(ids(model(['SEC'])).sort(byText)).toEqual(['A-1', 'A-1a', 'A-1b']);
  });
});
