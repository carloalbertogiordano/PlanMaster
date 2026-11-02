import { describe, expect, it } from 'vitest';
import { parseLaneFile, type SourceFile } from '../src/core/index.js';
import { laneText } from './helpers.js';

function parse(body: string, lane = 'B') {
  const source: SourceFile = { path: `.planmaster/lanes/${lane}.md`, kind: 'lane', text: laneText(lane, body) };
  return parseLaneFile(source);
}

function parseRaw(text: string, lane = 'B') {
  return parseLaneFile({ path: `.planmaster/lanes/${lane}.md`, kind: 'lane', text });
}

describe('item lines', () => {
  it('reads marker, ID, title and tokens', () => {
    const { file, findings } = parse('- [!] B-14 Make it a ratchet ref:R-1,R-2 wait:alice since:2026-11-01T17:30');
    expect(findings).toEqual([]);
    const item = file.items[0];
    expect(item?.marker).toBe('!');
    expect(item?.id).toBe('B-14');
    expect(item?.title).toBe('Make it a ratchet');
    expect(item?.tokens).toEqual({ ref: 'R-1,R-2', wait: 'alice', since: '2026-11-01T17:30' });
    expect(item?.line).toBe(7);
  });

  it.each([
    [' ', '- [ ] B-1 Todo item'],
    ['~', '- [~] B-1 Todo item since:2026-11-02T10:00'],
    ['!', '- [!] B-1 Todo item wait:bob since:2026-11-02T10:00'],
    ['x', '- [x] B-1 Todo item done:2026-11-02T10:00'],
    ['-', '- [-] B-1 Todo item done:2026-11-02T10:00'],
  ])('accepts the marker %j', (marker, line) => {
    const { file, findings } = parse(line);
    expect(findings).toEqual([]);
    expect(file.items[0]?.marker).toBe(marker);
  });

  it('keeps colons and token-like words inside the title', () => {
    const { file, findings } = parse('- [ ] B-1 Plan: rename ref:x to something else ref:P-7');
    expect(findings).toEqual([]);
    expect(file.items[0]?.title).toBe('Plan: rename ref:x to something else');
    expect(file.items[0]?.tokens).toEqual({ ref: 'P-7' });
  });

  it('accepts tokens in any order', () => {
    const { file, findings } = parse('- [x] B-1 Done thing done:2026-11-02T10:00 ref:P-1');
    expect(findings).toEqual([]);
    expect(file.items[0]?.tokens).toEqual({ ref: 'P-1', done: '2026-11-02T10:00' });
    expect(file.items[0]?.title).toBe('Done thing');
  });

  it('accepts child IDs with letter and digit suffixes', () => {
    const { findings } = parse(`
- [ ] B-12 Parent
  - [ ] B-12a Child
    - [ ] B-12a1 Grandchild`);
    expect(findings).toEqual([]);
  });

  it('ignores blank lines and single-line comments', () => {
    const { file, findings } = parse(`
<!-- a note for humans -->
- [ ] B-1 First

- [ ] B-2 Second`);
    expect(findings).toEqual([]);
    expect(file.items.map((i) => i.id)).toEqual(['B-1', 'B-2']);
  });

  it('tolerates CRLF line endings', () => {
    const { file, findings } = parseRaw('---\r\nformat: 1\r\nlane: B\r\ntitle: Test lane title\r\n---\r\n\r\n- [ ] B-1 First\r\n');
    expect(findings).toEqual([]);
    expect(file.items).toHaveLength(1);
  });
});

describe('hierarchy', () => {
  it('builds parents and children from indentation', () => {
    const { file } = parse(`
- [~] B-1 Parent since:2026-11-02T10:00
  - [x] B-1a First child done:2026-11-02T10:30
  - [ ] B-1b Second child
- [ ] B-2 Other`);
    expect(file.roots.map((i) => i.id)).toEqual(['B-1', 'B-2']);
    const parent = file.items[0];
    expect(parent?.children.map((c) => c.id)).toEqual(['B-1a', 'B-1b']);
    expect(file.items[1]?.parent).toBe(parent);
    expect(file.items[3]?.parent).toBeNull();
  });

  it('reports a child indented more than one level deeper (PM001)', () => {
    const { findings } = parse(`
- [ ] B-1 Parent
      - [ ] B-1a Too deep`);
    expect(findings.map((f) => f.code)).toEqual(['PM001']);
    expect(findings[0]?.line).toBe(8);
  });

  it('reports an indented first item (PM001)', () => {
    const { findings } = parseRaw(laneText('B', '- [ ] B-0 Placeholder').replace('- [ ] B-0 Placeholder', '  - [ ] B-1 Orphan'));
    expect(findings.map((f) => f.code)).toEqual(['PM001']);
  });

  it('reports nesting beyond level 3 (PM019)', () => {
    const { findings } = parse(`
- [ ] B-1 L0
  - [ ] B-1a L1
    - [ ] B-1a1 L2
      - [ ] B-1a1a L3
        - [ ] B-1a1a1 L4`);
    expect(findings.map((f) => f.code)).toEqual(['PM019']);
  });
});

describe('malformed lines', () => {
  it.each([
    ['an odd indentation', '- [ ] B-1 Parent\n   - [ ] B-1a Odd'],
    ['a bad marker', '- [?] B-1 Item'],
    ['a lowercase ID', '- [ ] b-1 Item'],
    ['an ID without a number', '- [ ] B- Item'],
    ['no title and no tokens', '- [ ] B-1'],
    ['a tab indentation', '- [ ] B-1 Parent\n\t- [ ] B-1a Tab'],
  ])('reports %s as PM001', (_name, body) => {
    const { findings } = parse(body);
    expect(findings.map((f) => f.code)).toContain('PM001');
  });

  it('reports an item with only tokens as having no title (PM001)', () => {
    const { findings } = parse('- [ ] B-1 ref:P-1');
    expect(findings.map((f) => f.code)).toEqual(['PM001']);
    expect(findings[0]?.message).toContain('no title');
  });

  it('reports a repeated token key (PM001) and keeps the rightmost value', () => {
    const { file, findings } = parse('- [~] B-1 Item since:2026-11-02T09:00 since:2026-11-02T10:00');
    expect(findings.map((f) => f.code)).toEqual(['PM001']);
    expect(file.items[0]?.tokens.since).toBe('2026-11-02T10:00');
  });

  it('reports a bullet without a marker as PM016', () => {
    expect(parse('- B-1 Item').findings.map((f) => f.code)).toEqual(['PM016']);
  });

  it('reports stray prose as PM016', () => {
    const { findings } = parse('Some prose the model added.\n- [ ] B-1 Item');
    expect(findings.map((f) => f.code)).toEqual(['PM016']);
    expect(findings[0]?.severity).toBe('warning');
  });

  it('reports a markdown heading as PM016', () => {
    expect(parse('## Section\n- [ ] B-1 Item').findings.map((f) => f.code)).toEqual(['PM016']);
  });

  it('reports invalid timestamps (PM014)', () => {
    const { findings } = parse('- [~] B-1 Item since:yesterday');
    expect(findings.map((f) => f.code)).toEqual(['PM014']);
  });

  it('reports a title longer than 120 characters (PM020)', () => {
    const { findings } = parse(`- [ ] B-1 ${'x'.repeat(121)}`);
    expect(findings.map((f) => f.code)).toEqual(['PM020']);
    expect(findings[0]?.severity).toBe('warning');
  });
});

describe('hostile input', () => {
  // Lane files are written by a model and may be arbitrary, so parsing time must stay linear in the file size.
  const LIMIT_MS = 300;
  const LINE_SEPARATOR = String.fromCharCode(0x2028);
  const elapsed = (work: () => void): number => {
    const start = performance.now();
    work();
    return performance.now() - start;
  };

  it('parses a very long digit run in an ID quickly', () => {
    const line = `- [ ] B-${'1'.repeat(60_000)}!`;
    expect(elapsed(() => parse(line))).toBeLessThan(LIMIT_MS);
  });

  it('parses a very long front matter value with an unusual terminator quickly', () => {
    const text = `---\nformat: 1\nlane: B\ntitle: Test lane title\nnote:${' \t'.repeat(40_000)}${LINE_SEPARATOR}\n---\n`;
    expect(elapsed(() => parseRaw(text))).toBeLessThan(LIMIT_MS);
  });

  it('parses a very long title with many token-like words quickly', () => {
    const line = `- [ ] B-1 ${'ref:x '.repeat(30_000)}end`;
    expect(elapsed(() => parse(line))).toBeLessThan(LIMIT_MS);
  });

  it('parses a very long run of trailing tokens quickly', () => {
    const line = `- [ ] B-1 Title ${'ref:x '.repeat(30_000)}ref:y`;
    expect(elapsed(() => parse(line))).toBeLessThan(LIMIT_MS);
  });

  it('parses a very long comment-like line quickly', () => {
    const line = `<!--${'-->  '.repeat(30_000)}x`;
    expect(elapsed(() => parse(line))).toBeLessThan(LIMIT_MS);
  });
});

describe('front matter', () => {
  it('reads format, lane and title', () => {
    const { file, findings } = parse('- [ ] B-1 Item');
    expect(findings).toEqual([]);
    expect(file.frontMatter).toEqual({ format: '1', lane: 'B', title: 'Test lane title', unknownKeys: [] });
    expect(file.lane).toBe('B');
  });

  it('keeps colons inside the title value', () => {
    const { file, findings } = parseRaw('---\nformat: 1\nlane: B\ntitle: Checks: gates and ratchets\n---\n- [ ] B-1 Item\n');
    expect(findings).toEqual([]);
    expect(file.frontMatter.title).toBe('Checks: gates and ratchets');
  });

  it('requires front matter (PM017) and still reads the items', () => {
    const { file, findings } = parseRaw('- [ ] B-1 Item\n');
    expect(findings.map((f) => f.code)).toEqual(['PM017']);
    expect(file.items).toHaveLength(1);
  });

  it('reports front matter that is never closed (PM017)', () => {
    const { findings } = parseRaw('---\nformat: 1\nlane: B\ntitle: Test lane title\n- [ ] B-1 Item\n');
    expect(findings.map((f) => f.code)).toContain('PM017');
    expect(findings.some((f) => f.message.includes('not closed'))).toBe(true);
  });

  it.each([
    ['a missing format', '---\nlane: B\ntitle: Test lane title\n---\n'],
    ['a missing lane', '---\nformat: 1\ntitle: Test lane title\n---\n'],
    ['a missing title', '---\nformat: 1\nlane: B\n---\n'],
    ['a non-numeric format', '---\nformat: one\nlane: B\ntitle: Test lane title\n---\n'],
    ['a lane that differs from the file name', '---\nformat: 1\nlane: C\ntitle: Test lane title\n---\n'],
    ['an invalid lane ID', '---\nformat: 1\nlane: b\ntitle: Test lane title\n---\n'],
    ['a title that is too short', '---\nformat: 1\nlane: B\ntitle: Ab\n---\n'],
    ['a title that is too long', `---\nformat: 1\nlane: B\ntitle: ${'t'.repeat(81)}\n---\n`],
    ['a repeated key', '---\nformat: 1\nlane: B\nlane: B\ntitle: Test lane title\n---\n'],
    ['a malformed line', '---\nformat: 1\nlane B\ntitle: Test lane title\n---\n'],
  ])('reports %s as an error PM017', (_name, text) => {
    const { findings } = parseRaw(text);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((f) => f.code === 'PM017' && f.severity === 'error')).toBe(true);
  });

  it('reports an unknown key as a warning', () => {
    const { file, findings } = parseRaw('---\nformat: 1\nlane: B\ntitle: Test lane title\nowner: alice\n---\n');
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe('warning');
    expect(file.frontMatter.unknownKeys).toEqual(['owner']);
  });

  it('refuses to read a newer format', () => {
    const { file, findings } = parseRaw('---\nformat: 2\nlane: B\ntitle: Test lane title\n---\n- [ ] B-1 Item\n');
    expect(findings.map((f) => f.code)).toEqual(['PM017']);
    expect(file.items).toEqual([]);
  });
});
