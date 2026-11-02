import { describe, expect, it } from 'vitest';
import { formatDuration, formatTimestamp, parseTimestamp } from '../src/core/index.js';

describe('parseTimestamp', () => {
  it('parses a valid local timestamp and round-trips it', () => {
    const ms = parseTimestamp('2026-11-02T11:48');
    expect(ms).not.toBeNull();
    expect(formatTimestamp(ms!)).toBe('2026-11-02T11:48');
  });

  it.each([
    '2026-11-02',
    '2026-11-02 11:48',
    '2026-11-02T11:48:00',
    '2026-11-02T11:48Z',
    '2026-13-02T11:48',
    '2026-00-10T11:48',
    '2026-02-30T11:48',
    '2026-11-31T11:48',
    '2026-11-02T24:00',
    '2026-11-02T11:60',
    'yesterday',
    '',
  ])('rejects %j', (text) => {
    expect(parseTimestamp(text)).toBeNull();
  });

  it('accepts the last day of a leap-year February', () => {
    expect(parseTimestamp('2028-02-29T00:00')).not.toBeNull();
    expect(parseTimestamp('2027-02-29T00:00')).toBeNull();
  });
});

describe('formatDuration', () => {
  it.each([
    [0, '1 min'],
    [12 * 60_000, '12 min'],
    [60 * 60_000, '1 h'],
    [221 * 60_000, '3 h 41 min'],
    [48 * 60 * 60_000, '2 d'],
  ])('formats %d ms as %s', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });
});
