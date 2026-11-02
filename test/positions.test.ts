import { describe, expect, it } from 'vitest';
import { findingRange, waitReferenceAt } from '../src/core/positions.js';

describe('findingRange', () => {
  it('covers an item from its ID to the end of the line', () => {
    const line = '- [!] B-14 Make it a ratchet since:2026-11-01T17:30';
    expect(findingRange(line, 'B-14')).toEqual({ start: 6, end: line.length });
  });

  it('finds the ID of an indented child', () => {
    const line = '    - [x] A-1a1 Done done:2026-11-02T10:00';
    expect(findingRange(line, 'A-1a1')).toEqual({ start: 10, end: line.length });
  });

  it('covers the trimmed line when the finding is not about an item', () => {
    expect(findingRange('  stray prose here  ')).toEqual({ start: 2, end: 18 });
  });

  it('covers the trimmed line when the item ID is no longer on the line', () => {
    expect(findingRange('- [ ] B-9 Something else', 'B-1')).toEqual({ start: 0, end: 24 });
  });

  it('does not match an ID that is only a prefix of another ID', () => {
    const line = '- [ ] B-12a Child';
    expect(findingRange(line, 'B-12')).toEqual({ start: 0, end: line.length });
  });

  it('gives an empty range at the start for a missing or empty line', () => {
    expect(findingRange(undefined)).toEqual({ start: 0, end: 0 });
    expect(findingRange('')).toEqual({ start: 0, end: 0 });
    expect(findingRange('   ')).toEqual({ start: 0, end: 0 });
  });
});

describe('waitReferenceAt', () => {
  const line = '- [!] D-08 Session revocation ref:P-010 wait:D-04 since:2026-11-02T10:20';
  const start = line.indexOf('D-04');

  it('returns the referenced item ID when the column is on it', () => {
    expect(waitReferenceAt(line, start)).toEqual({ id: 'D-04', start, end: start + 4 });
    expect(waitReferenceAt(line, start + 3)).toEqual({ id: 'D-04', start, end: start + 4 });
  });

  it('does not include the position just after the ID or the wait: key', () => {
    expect(waitReferenceAt(line, start + 4)).toBeNull();
    expect(waitReferenceAt(line, start - 1)).toBeNull();
    expect(waitReferenceAt(line, line.indexOf('wait:'))).toBeNull();
  });

  it('ignores the item own ID, ref values and the title', () => {
    expect(waitReferenceAt(line, line.indexOf('D-08'))).toBeNull();
    expect(waitReferenceAt(line, line.indexOf('P-010'))).toBeNull();
    expect(waitReferenceAt(line, line.indexOf('revocation'))).toBeNull();
  });

  it('ignores a person key', () => {
    const person = '- [!] D-07 Release wait:bob since:2026-11-02T10:50';
    expect(waitReferenceAt(person, person.indexOf('bob'))).toBeNull();
  });

  it('ignores a wait-like word inside the title', () => {
    const inTitle = '- [ ] D-01 Rename wait:D-04 handling';
    expect(waitReferenceAt(inTitle, inTitle.indexOf('D-04'))).toBeNull();
  });

  it('ignores lines that are not items and columns outside the line', () => {
    expect(waitReferenceAt('wait:D-04', 5)).toBeNull();
    expect(waitReferenceAt(line, -1)).toBeNull();
    expect(waitReferenceAt(line, line.length + 5)).toBeNull();
  });
});
