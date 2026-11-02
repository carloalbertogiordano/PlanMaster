import { describe, expect, it } from 'vitest';
import { ConfigError, DEFAULT_CONFIG, parseConfig } from '../src/core/index.js';

describe('parseConfig', () => {
  it('returns the defaults when there is no file', () => {
    expect(parseConfig(undefined)).toEqual(DEFAULT_CONFIG);
  });

  it('does not share the people array between calls', () => {
    parseConfig(undefined).people.push('mallory');
    expect(parseConfig(undefined).people).toEqual([]);
  });

  it('merges known keys over the defaults and ignores unknown ones', () => {
    const config = parseConfig('{"people":["alice"],"staleAfterMinutes":30,"future":true}');
    expect(config.people).toEqual(['alice']);
    expect(config.staleAfterMinutes).toBe(30);
    expect(config.doneVisibleDays).toBe(DEFAULT_CONFIG.doneVisibleDays);
  });

  it.each([
    ['not json', '{'],
    ['an array', '[]'],
    ['a string root', '"x"'],
    ['a non-integer threshold', '{"staleAfterMinutes":1.5}'],
    ['a zero threshold', '{"doneVisibleDays":0}'],
    ['a string threshold', '{"archiveAfterDays":"7"}'],
    ['people that is not an array', '{"people":"alice"}'],
    ['a person with a space', '{"people":["alice smith"]}'],
    ['an empty lanes directory', '{"lanesDir":""}'],
  ])('rejects %s', (_name, text) => {
    expect(() => parseConfig(text)).toThrow(ConfigError);
  });
});
