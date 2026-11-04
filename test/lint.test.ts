import { describe, expect, it } from 'vitest';
import { analyze, type SourceFile } from '../src/core/index.js';
import { CONFIG, NOW, T, archiveFile, codes, codesOf, laneFile, run, runWithoutConfig } from './helpers.js';

const at = (text: string): number => T(text);

describe('a clean workspace', () => {
  it('has no findings', () => {
    const files = [
      laneFile('A', `
- [~] A-1 Active since:2026-11-02T11:00
  - [x] A-1a Done step done:2026-11-02T11:10
  - [~] A-1b Current step since:2026-11-02T11:20
- [ ] A-2 Next
- [!] A-3 Blocked on a person wait:alice since:2026-11-02T10:00
- [!] A-4 Blocked on an item wait:A-1 since:2026-11-02T10:00
- [x] A-5 Finished done:2026-11-02T09:00
- [-] A-6 Dropped done:2026-11-02T09:30`, '2026-11-02T11:30'),
    ];
    expect(run(files).findings).toEqual([]);
  });
});

describe('IDs', () => {
  it('PM002: reports a duplicate ID on the later occurrence', () => {
    const { findings } = run([laneFile('A', '- [ ] A-1 First\n- [ ] A-1 Second')]);
    expect(codes(findings)).toEqual(['PM002']);
    expect(findings[0]?.line).toBe(8);
    expect(findings[0]?.message).toContain(':7');
  });

  it('PM002: reports an ID that is also in an archive file', () => {
    const files = [laneFile('A', '- [ ] A-1 Live'), archiveFile('A', '- [x] A-1 Archived done:2026-10-01T10:00')];
    const { findings } = run(files);
    expect(codes(findings)).toEqual(['PM002']);
    expect(findings[0]?.file).toBe('.planmaster/archive/A.md');
  });

  it('PM003: reports an ID with another lane prefix', () => {
    expect(codesOf([laneFile('A', '- [ ] B-1 Wrong lane')])).toEqual(['PM003']);
  });
});

describe('required tokens', () => {
  it('PM004: blocked without wait', () => {
    expect(codesOf([laneFile('A', '- [!] A-1 Item since:2026-11-02T10:00')])).toEqual(['PM004']);
  });

  it('PM005: done and dropped without done', () => {
    expect(codesOf([laneFile('A', '- [x] A-1 Item\n- [-] A-2 Other')])).toEqual(['PM005', 'PM005']);
  });

  it('PM006: in progress and blocked without since', () => {
    expect(codesOf([laneFile('A', '- [~] A-1 Item\n- [!] A-2 Other wait:alice')])).toEqual(['PM006', 'PM006']);
  });

  it('reports PM004 and PM006 for a blocked item with neither token', () => {
    expect(codesOf([laneFile('A', '- [!] A-1 Item')])).toEqual(['PM004', 'PM006']);
  });
});

describe('wait targets', () => {
  it('PM007: unknown person', () => {
    expect(codesOf([laneFile('A', '- [!] A-1 Item wait:mallory since:2026-11-02T10:00')])).toEqual(['PM007']);
  });

  it('PM007: unknown item ID', () => {
    expect(codesOf([laneFile('A', '- [!] A-1 Item wait:Z-9 since:2026-11-02T10:00')])).toEqual(['PM007']);
  });

  it('accepts an item in another lane and one in an archive', () => {
    const files = [
      laneFile('A', '- [!] A-1 Item wait:B-1 since:2026-11-02T10:00\n- [!] A-2 Other wait:B-9 since:2026-11-02T10:00'),
      laneFile('B', '- [~] B-1 Target since:2026-11-02T10:00'),
      archiveFile('B', '- [x] B-9 Old done:2026-10-01T10:00'),
    ];
    expect(codesOf(files)).toEqual(['PM018']);
  });

  it('PM018: waiting on an item that is already closed', () => {
    const files = [laneFile('A', '- [!] A-1 Item wait:A-2 since:2026-11-02T10:00\n- [x] A-2 Done done:2026-11-02T10:30')];
    const { findings } = run(files);
    expect(codes(findings)).toEqual(['PM018']);
    expect(findings[0]?.severity).toBe('warning');
  });

  it('uses the configured people list', () => {
    const files = [laneFile('A', '- [!] A-1 Item wait:carol since:2026-11-02T10:00')];
    expect(codes(run(files, NOW, JSON.stringify({ people: ['carol'] })).findings)).toEqual([]);
    expect(codes(runWithoutConfig(files).findings)).toEqual(['PM007']);
  });
});

describe('hierarchy', () => {
  it('PM008: two top-level items in progress, reported on the second', () => {
    const { findings } = run([laneFile('A', '- [~] A-1 One since:2026-11-02T10:00\n- [~] A-2 Two since:2026-11-02T10:05')]);
    expect(codes(findings)).toEqual(['PM008']);
    expect(findings[0]?.itemId).toBe('A-2');
  });

  it('PM009: two children of one parent in progress, but not PM008 for children', () => {
    const body = `
- [~] A-1 Parent since:2026-11-02T10:00
  - [~] A-1a One since:2026-11-02T10:00
  - [~] A-1b Two since:2026-11-02T10:05`;
    const { findings } = run([laneFile('A', body)]);
    expect(codes(findings)).toEqual(['PM009']);
    expect(findings[0]?.itemId).toBe('A-1b');
  });

  it('allows one item in progress under each of two different parents', () => {
    const body = `
- [!] A-1 Parent one wait:alice since:2026-11-02T10:00
  - [~] A-1a Step since:2026-11-02T10:00
- [~] A-2 Parent two since:2026-11-02T10:00
  - [~] A-2a Step since:2026-11-02T10:00`;
    expect(codesOf([laneFile('A', body)])).toEqual([]);
  });

  it('PM010: closed parent with an open child', () => {
    const body = `
- [x] A-1 Parent done:2026-11-02T10:00
  - [x] A-1a Finished done:2026-11-02T10:00
  - [ ] A-1b Forgotten`;
    const { findings } = run([laneFile('A', body)]);
    expect(codes(findings)).toEqual(['PM010']);
    expect(findings[0]?.itemId).toBe('A-1');
  });

  it('PM010: also applies to dropped parents', () => {
    const body = `
- [-] A-1 Parent done:2026-11-02T10:00
  - [~] A-1a Still going since:2026-11-02T10:00`;
    expect(codesOf([laneFile('A', body)])).toContain('PM010');
  });

  it('PM011: to-do parent with a child in progress', () => {
    const body = `
- [ ] A-1 Parent
  - [~] A-1a Started since:2026-11-02T10:00`;
    const { findings } = run([laneFile('A', body)]);
    expect(codes(findings)).toEqual(['PM011']);
    expect(findings[0]?.severity).toBe('warning');
  });
});

describe('tokens that do not belong to the state (PM013)', () => {
  it.each([
    ['to do with since', '- [ ] A-1 Item since:2026-11-02T10:00'],
    ['to do with done', '- [ ] A-1 Item done:2026-11-02T10:00'],
    ['to do with wait', '- [ ] A-1 Item wait:alice'],
    ['in progress with done', '- [~] A-1 Item since:2026-11-02T10:00 done:2026-11-02T10:30'],
    ['in progress with wait', '- [~] A-1 Item wait:alice since:2026-11-02T10:00'],
    ['blocked with done', '- [!] A-1 Item wait:alice since:2026-11-02T10:00 done:2026-11-02T10:30'],
    ['done with since', '- [x] A-1 Item since:2026-11-02T10:00 done:2026-11-02T10:30'],
    ['dropped with wait', '- [-] A-1 Item wait:alice done:2026-11-02T10:30'],
  ])('warns for %s', (_name, line) => {
    const { findings } = run([laneFile('A', line)]);
    expect(codes(findings)).toEqual(['PM013']);
    expect(findings[0]?.severity).toBe('warning');
  });

  it('allows ref in every state', () => {
    const body = `
- [ ] A-1 One ref:P-1
- [~] A-2 Two ref:P-2 since:2026-11-02T10:00
- [!] A-3 Three ref:P-3 wait:alice since:2026-11-02T10:00
- [x] A-4 Four ref:P-4 done:2026-11-02T10:00`;
    expect(codesOf([laneFile('A', body)])).toEqual([]);
  });
});

describe('timestamps (PM015)', () => {
  it('flags a time more than five minutes in the future', () => {
    expect(codesOf([laneFile('A', '- [~] A-1 Item since:2026-11-02T12:00')])).toEqual(['PM015']);
  });

  it('tolerates up to five minutes ahead of the clock', () => {
    expect(codesOf([laneFile('A', '- [~] A-1 Item since:2026-11-02T11:53')])).toEqual([]);
    expect(codesOf([laneFile('A', '- [~] A-1 Item since:2026-11-02T11:54')])).toEqual(['PM015']);
  });

  it('flags a time later than the last change to the file', () => {
    const files = [laneFile('A', '- [~] A-1 Item since:2026-11-02T11:40', '2026-11-02T11:20')];
    const { findings } = run(files);
    expect(codes(findings)).toEqual(['PM015']);
    expect(findings[0]?.message).toContain('guessed');
  });

  it('does not check the file time when it is unknown', () => {
    expect(codesOf([laneFile('A', '- [~] A-1 Item since:2026-11-02T11:40')])).toEqual([]);
  });

  it('does not flag a time shortly after the file time', () => {
    const files = [laneFile('A', '- [~] A-1 Item since:2026-11-02T11:24', '2026-11-02T11:20')];
    expect(codes(run(files).findings)).toEqual([]);
  });
});

describe('staleness (PM012)', () => {
  const body = '- [~] A-1 Item since:2026-11-02T08:05';

  it('flags a top-level item in progress when both the item and the file are old', () => {
    const { findings } = run([laneFile('A', body, '2026-11-02T08:07')]);
    expect(codes(findings)).toEqual(['PM012']);
    expect(findings[0]?.message).toContain('3 h 43 min');
  });

  it('does not flag when the file changed recently', () => {
    expect(codesOf([laneFile('A', body, '2026-11-02T11:30')])).toEqual([]);
  });

  it('cannot tell without the file time', () => {
    expect(codesOf([laneFile('A', body)])).toEqual([]);
  });

  it('does not flag nested items', () => {
    const nested = `
- [!] A-1 Parent wait:alice since:2026-11-02T08:00
  - [~] A-1a Child since:2026-11-02T08:05`;
    expect(codesOf([laneFile('A', nested, '2026-11-02T08:07')])).toEqual([]);
  });

  it('honors staleAfterMinutes', () => {
    const files = [laneFile('A', body, '2026-11-02T08:07')];
    const config = JSON.stringify({ staleAfterMinutes: 300 });
    expect(codes(run(files, NOW, config).findings)).toEqual([]);
  });

  it('does not flag archive files', () => {
    const archive: SourceFile = { ...archiveFile('A', '- [x] A-1 Old done:2026-10-01T10:00'), mtimeMs: at('2026-10-01T10:00') };
    expect(codes(run([archive]).findings)).toEqual([]);
  });
});

describe('tags (PM022, PM023)', () => {
  const declared = JSON.stringify({ people: ['alice'], tags: { SEC: 'Security review', OPS: 'Operations' } });

  it('accepts declared tags, alone or in a list, on any state', () => {
    const files = [laneFile('A', `
- [ ] A-1 Todo tag:SEC
- [!] A-2 Blocked tag:SEC,OPS wait:alice since:2026-11-02T10:00
- [x] A-3 Done tag:OPS done:2026-11-02T09:00`)];
    expect(run(files, NOW, declared).findings).toEqual([]);
  });

  it('PM022: warns about a tag that config.json does not declare, and says how to fix it', () => {
    const { findings } = run([laneFile('A', '- [ ] A-1 Item tag:SEC,ZZZ')], NOW, declared);
    expect(codes(findings)).toEqual(['PM022']);
    expect(findings[0]?.severity).toBe('warning');
    expect(findings[0]?.message).toContain('ZZZ');
    expect(findings[0]?.message).not.toContain('SEC,');
    expect(findings[0]?.message).toContain('"tags"');
  });

  it('PM022: warns for every tag when config.json has no tags at all', () => {
    expect(codesOf([laneFile('A', '- [ ] A-1 Item tag:SEC')])).toEqual(['PM022']);
  });

  it('PM022: warns only on the line that wrote the tag, not on the children that inherit it', () => {
    const { findings } = run([laneFile('A', '- [ ] A-1 Parent tag:ZZZ\n  - [ ] A-1a Child')], NOW, declared);
    expect(findings.map((f) => f.itemId)).toEqual(['A-1']);
  });

  it('PM023: warns about a malformed tag list and still checks the valid entries', () => {
    const { findings } = run([laneFile('A', '- [ ] A-1 Item tag:SEC,bad!,ZZZ')], NOW, declared);
    expect(codes(findings)).toEqual(['PM022', 'PM023']);
    expect(findings[1]?.severity).toBe('warning');
    expect(findings[1]?.message).toContain('bad!');
  });

  it('tags are allowed where other tokens are not', () => {
    expect(run([laneFile('A', '- [ ] A-1 Item tag:SEC')], NOW, declared).findings).toEqual([]);
  });
});

describe('analysis', () => {
  it('reports unreadable files (PM021)', () => {
    const analysis = analyze({ files: [], unreadable: [{ path: '.planmaster/lanes/Z.md', kind: 'lane', reason: 'too big' }], configText: CONFIG }, NOW);
    expect(codes(analysis.findings)).toEqual(['PM021']);
  });

  it('sorts lanes by ID regardless of input order', () => {
    const analysis = run([laneFile('C', '- [ ] C-1 x'), laneFile('A', '- [ ] A-1 x'), laneFile('B', '- [ ] B-1 x')]);
    expect(analysis.lanes.map((l) => l.lane)).toEqual(['A', 'B', 'C']);
  });

  it('keeps archive files out of the lanes', () => {
    const analysis = run([laneFile('A', '- [ ] A-1 x'), archiveFile('A', '- [x] A-2 y done:2026-10-01T10:00')]);
    expect(analysis.lanes).toHaveLength(1);
    expect(analysis.archives).toHaveLength(1);
    expect(analysis.index.has('A-2')).toBe(true);
  });

  it('orders findings by file, line and code', () => {
    const files = [
      laneFile('B', '- [!] B-1 x'),
      laneFile('A', '- [!] A-1 x\n- [!] A-2 y'),
    ];
    const { findings } = run(files);
    expect(findings.map((f) => `${f.file.slice(-4)}:${f.line}:${f.code}`)).toEqual([
      'A.md:7:PM004', 'A.md:7:PM006', 'A.md:8:PM004', 'A.md:8:PM006', 'B.md:7:PM004', 'B.md:7:PM006',
    ]);
  });
});
