import { describe, expect, it } from 'vitest';
import { splitTokens } from '../src/core/tokens.js';

describe('splitTokens', () => {
  it('splits the title from trailing tokens and reports where each token sits', () => {
    const rest = 'Make it ref:R-1 wait:alice';
    const split = splitTokens(rest);
    expect(split.title).toBe('Make it');
    expect(split.tokens).toEqual({ ref: 'R-1', wait: 'alice' });
    expect(split.words).toEqual([
      { key: 'ref', value: 'R-1', start: 8, end: 15 },
      { key: 'wait', value: 'alice', start: 16, end: 26 },
    ]);
    expect(rest.slice(16, 26)).toBe('wait:alice');
  });

  it('returns the whole text as the title when there are no tokens', () => {
    expect(splitTokens('Just a title')).toEqual({ title: 'Just a title', tokens: {}, duplicated: [], words: [] });
  });

  it('ignores trailing whitespace but keeps positions relative to the original text', () => {
    const split = splitTokens('Title ref:x   ');
    expect(split.title).toBe('Title');
    expect(split.words).toEqual([{ key: 'ref', value: 'x', start: 6, end: 11 }]);
  });

  it('does not treat a token-like word inside the title as a token', () => {
    const split = splitTokens('Rename wait:D-04 handling');
    expect(split.title).toBe('Rename wait:D-04 handling');
    expect(split.words).toEqual([]);
  });

  it('keeps the rightmost value of a repeated key and reports the repetition', () => {
    const split = splitTokens('T since:2026-11-02T09:00 since:2026-11-02T10:00');
    expect(split.tokens.since).toBe('2026-11-02T10:00');
    expect(split.duplicated).toEqual(['since']);
    expect(split.words).toHaveLength(2);
  });

  it('gives an empty title when the text is only tokens', () => {
    expect(splitTokens('ref:P-1').title).toBe('');
  });

  it('stops after a fixed number of trailing tokens', () => {
    const split = splitTokens(`Title ${'ref:x '.repeat(20)}`.trimEnd());
    expect(split.words).toHaveLength(8);
    expect(split.title.startsWith('Title ref:x')).toBe(true);
  });
});
