import { describe, expect, it } from 'vitest';
import { formatClock, formatDayMonth, formatDuration, formatTimestamp, parseTimestamp, sameLocalDay } from '../src/core/index.js';
import { T } from './helpers.js';

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

describe('clock and day formatting', () => {
  it('formats the time of day with two digits', () => {
    expect(formatClock(T('2026-11-02T09:05'))).toBe('09:05');
    expect(formatClock(T('2026-11-02T23:59'))).toBe('23:59');
  });

  it('formats the day and month in English, independent of the machine locale', () => {
    expect(formatDayMonth(T('2026-11-02T09:05'))).toBe('2 Nov');
    expect(formatDayMonth(T('2026-10-30T16:00'))).toBe('30 Oct');
    expect(formatDayMonth(T('2027-01-01T00:00'))).toBe('1 Jan');
  });

  it('tells whether two instants fall on the same local day', () => {
    expect(sameLocalDay(T('2026-11-02T00:00'), T('2026-11-02T23:59'))).toBe(true);
    expect(sameLocalDay(T('2026-11-02T23:59'), T('2026-11-03T00:00'))).toBe(false);
    expect(sameLocalDay(T('2025-11-02T10:00'), T('2026-11-02T10:00'))).toBe(false);
  });
});
