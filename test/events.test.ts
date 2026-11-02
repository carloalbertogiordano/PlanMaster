import { describe, expect, it } from 'vitest';
import { deriveEvents } from '../src/core/index.js';
import { T, laneFile, run } from './helpers.js';

const BODY = `
- [~] A-1 Started since:2026-11-02T11:00
  - [x] A-1a Closed done:2026-11-02T10:30
- [!] A-2 Blocked on a person wait:alice since:2026-11-02T10:45
- [-] A-3 Dropped done:2026-11-02T10:50
- [ ] A-4 Not started
- [x] A-5 Closed long ago done:2026-10-30T10:00`;

describe('deriveEvents', () => {
  const analysis = run([laneFile('A', BODY)]);

  it('returns events newer than last seen, newest first', () => {
    const events = deriveEvents(analysis, T('2026-11-02T10:40'));
    expect(events.map((e) => `${e.item.id}:${e.kind}`)).toEqual(['A-1:started', 'A-3:dropped', 'A-2:blocked']);
  });

  it('carries the wait target of blocked items', () => {
    const blocked = deriveEvents(analysis, T('2026-11-02T10:40')).find((e) => e.kind === 'blocked');
    expect(blocked?.waitingOn).toBe('alice');
  });

  it('excludes events at or before last seen', () => {
    const events = deriveEvents(analysis, T('2026-11-02T10:50'));
    expect(events.map((e) => e.item.id)).toEqual(['A-1']);
  });

  it('returns nothing when everything was seen', () => {
    expect(deriveEvents(analysis, T('2026-11-02T11:48'))).toEqual([]);
  });

  it('returns every timestamped event when last seen is very old', () => {
    expect(deriveEvents(analysis, 0)).toHaveLength(5);
  });

  it('never reports items without a timestamp for their state', () => {
    const events = deriveEvents(run([laneFile('A', '- [ ] A-1 Todo\n- [!] A-2 No time wait:alice')]), 0);
    expect(events).toEqual([]);
  });

  it('ignores archive files', () => {
    const files = [laneFile('A', '- [ ] A-1 Todo'), { path: '.planmaster/archive/A.md', kind: 'archive' as const, text: '---\nformat: 1\nlane: A\ntitle: Test lane title\n---\n- [x] A-9 Old done:2026-11-02T11:00\n' }];
    expect(deriveEvents(run(files), 0)).toEqual([]);
  });

  it('lists an item once, with its current state', () => {
    const events = deriveEvents(run([laneFile('A', '- [x] A-1 Was started, now done done:2026-11-02T11:00')]), 0);
    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe('closed');
  });
});
