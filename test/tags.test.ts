import { describe, expect, it } from 'vitest';
import { effectiveTags, ownTags, parseTagList, tagCounts } from '../src/core/index.js';
import { laneFile, run } from './helpers.js';

describe('parseTagList', () => {
  it('splits a comma-separated list into tags', () => {
    expect(parseTagList('SEC,DOC')).toEqual({ tags: ['SEC', 'DOC'], invalid: [] });
  });

  it('gives no tags for a missing value', () => {
    expect(parseTagList(undefined)).toEqual({ tags: [], invalid: [] });
  });

  it('keeps each tag once', () => {
    expect(parseTagList('SEC,SEC,OPS').tags).toEqual(['SEC', 'OPS']);
  });

  it.each([
    ['an empty entry', 'SEC,,OPS', ['']],
    ['a character outside letters, digits, dash and underscore', 'SEC,a!', ['a!']],
    ['an entry that starts with a digit', '2fa', ['2fa']],
    ['an entry longer than 20 characters', 'A'.repeat(21), ['A'.repeat(21)]],
  ])('reports %s as invalid and keeps the valid tags', (_name, value, invalid) => {
    const parsed = parseTagList(value);
    expect(parsed.invalid).toEqual(invalid);
    expect(parsed.tags).not.toContain(invalid[0]);
  });

  it('accepts digits, dashes and underscores after the first letter', () => {
    expect(parseTagList('Q4-plan_b').tags).toEqual(['Q4-plan_b']);
  });
});

const byText = (a: string, b: string): number => a.localeCompare(b);

describe('tags of an item', () => {
  const items = run([laneFile('A', `
- [ ] A-1 Parent tag:SEC
  - [ ] A-1a Child with its own tag tag:OPS
    - [ ] A-1b Grandchild
- [ ] A-2 Untagged`)]).lanes[0]?.items ?? [];
  const byId = (id: string) => items.find((item) => item.id === id)!;

  it('ownTags lists only what the line says', () => {
    expect(ownTags(byId('A-1a'))).toEqual(['OPS']);
    expect(ownTags(byId('A-2'))).toEqual([]);
  });

  it('effectiveTags adds the tags of every ancestor', () => {
    expect(effectiveTags(byId('A-1b')).sort(byText)).toEqual(['OPS', 'SEC']);
    expect(effectiveTags(byId('A-1a')).sort(byText)).toEqual(['OPS', 'SEC']);
    expect(effectiveTags(byId('A-1'))).toEqual(['SEC']);
    expect(effectiveTags(byId('A-2'))).toEqual([]);
  });

  it('tagCounts counts the items that carry each tag, inherited included', () => {
    expect([...tagCounts(items)]).toEqual([['SEC', 3], ['OPS', 2]]);
  });
});
