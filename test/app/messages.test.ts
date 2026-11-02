import { describe, expect, it } from 'vitest';
import { isKnownPath, parseHostMessage, parseWebviewMessage } from '../../src/app/messages.js';
import { archiveFile, laneFile, run } from '../helpers.js';

describe('parseWebviewMessage', () => {
  it('accepts the three messages the view sends', () => {
    expect(parseWebviewMessage({ type: 'ready' })).toEqual({ type: 'ready' });
    expect(parseWebviewMessage({ type: 'reveal', folder: 'demo', path: '.planmaster/lanes/A.md', line: 7 })).toEqual({ type: 'reveal', folder: 'demo', path: '.planmaster/lanes/A.md', line: 7 });
    expect(parseWebviewMessage({ type: 'markSeen', folder: 'demo' })).toEqual({ type: 'markSeen', folder: 'demo' });
  });

  it('drops unexpected extra properties', () => {
    const parsed = parseWebviewMessage({ type: 'reveal', folder: 'f', path: 'a.md', line: 1, command: 'rm -rf /', __proto__: { x: 1 } });
    expect(parsed).toEqual({ type: 'reveal', folder: 'f', path: 'a.md', line: 1 });
  });

  it.each([
    ['null', null],
    ['a string', 'reveal'],
    ['a number', 7],
    ['an array', [{ type: 'ready' }]],
    ['an object without a type', { path: 'a.md' }],
    ['an unknown type', { type: 'openExternal', url: 'https://example.com' }],
    ['a type that is not a string', { type: 3 }],
    ['a reveal without a path', { type: 'reveal', folder: 'f', line: 1 }],
    ['a reveal with an empty path', { type: 'reveal', folder: 'f', path: '', line: 1 }],
    ['a reveal with a path that is not a string', { type: 'reveal', folder: 'f', path: ['a'], line: 1 }],
    ['a reveal with a very long path', { type: 'reveal', folder: 'f', path: 'a'.repeat(501), line: 1 }],
    ['a reveal without a line', { type: 'reveal', folder: 'f', path: 'a.md' }],
    ['a reveal with line 0', { type: 'reveal', folder: 'f', path: 'a.md', line: 0 }],
    ['a reveal with a negative line', { type: 'reveal', folder: 'f', path: 'a.md', line: -3 }],
    ['a reveal with a fractional line', { type: 'reveal', folder: 'f', path: 'a.md', line: 1.5 }],
    ['a reveal with a text line', { type: 'reveal', folder: 'f', path: 'a.md', line: '1' }],
    ['a reveal with an enormous line', { type: 'reveal', folder: 'f', path: 'a.md', line: 10_000_000 }],
    ['a reveal without a folder', { type: 'reveal', path: 'a.md', line: 1 }],
    ['a reveal with an empty folder', { type: 'reveal', folder: '', path: 'a.md', line: 1 }],
    ['a markSeen without a folder', { type: 'markSeen' }],
    ['a markSeen with a folder that is not a string', { type: 'markSeen', folder: 1 }],
  ])('rejects %s', (_name, raw) => {
    expect(parseWebviewMessage(raw)).toBeNull();
  });
});

describe('isKnownPath', () => {
  const analysis = run([laneFile('A', '- [ ] A-1 x'), archiveFile('A', '- [x] A-2 y done:2026-10-01T10:00')]);

  it('accepts lane and archive files of the workspace', () => {
    expect(isKnownPath(analysis, '.planmaster/lanes/A.md')).toBe(true);
    expect(isKnownPath(analysis, '.planmaster/archive/A.md')).toBe(true);
  });

  it('rejects anything else, including paths that try to leave the workspace', () => {
    expect(isKnownPath(analysis, '.planmaster/lanes/B.md')).toBe(false);
    expect(isKnownPath(analysis, '../../etc/passwd')).toBe(false);
    expect(isKnownPath(analysis, '/etc/passwd')).toBe(false);
    expect(isKnownPath(analysis, '.planmaster/lanes/../config.json')).toBe(false);
  });
});

describe('parseHostMessage', () => {
  it('accepts a state message with a list of folders', () => {
    const message = { type: 'state', folders: [{ folder: 'demo' }] };
    expect(parseHostMessage(message)).toEqual(message);
  });

  it.each([
    ['null', null],
    ['an unknown type', { type: 'other', folders: [] }],
    ['folders that are not a list', { type: 'state', folders: 'demo' }],
    ['a list with something that is not an object', { type: 'state', folders: [1] }],
    ['no folders', { type: 'state' }],
  ])('rejects %s', (_name, raw) => {
    expect(parseHostMessage(raw)).toBeNull();
  });
});
