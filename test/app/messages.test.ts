import { describe, expect, it } from 'vitest';
import { isKnownPath, parseHostMessage, parseWebviewMessage } from '../../src/app/messages.js';
import { archiveFile, laneFile, run } from '../helpers.js';

describe('parseWebviewMessage', () => {
  it('accepts the messages the view sends', () => {
    expect(parseWebviewMessage({ type: 'ready' })).toEqual({ type: 'ready' });
    expect(parseWebviewMessage({ type: 'reveal', folder: 'demo', path: '.planmaster/lanes/A.md', line: 7 })).toEqual({ type: 'reveal', folder: 'demo', path: '.planmaster/lanes/A.md', line: 7 });
    expect(parseWebviewMessage({ type: 'markSeen', folder: 'demo' })).toEqual({ type: 'markSeen', folder: 'demo' });
    expect(parseWebviewMessage({ type: 'drawn', lanes: 5 })).toEqual({ type: 'drawn', lanes: 5 });
    expect(parseWebviewMessage({ type: 'setup', folder: 'demo' })).toEqual({ type: 'setup', folder: 'demo' });
    expect(parseWebviewMessage({ type: 'filter', folder: 'demo', tags: ['SEC', 'OPS'] })).toEqual({ type: 'filter', folder: 'demo', tags: ['SEC', 'OPS'] });
    expect(parseWebviewMessage({ type: 'filter', folder: 'demo', tags: [] })).toEqual({ type: 'filter', folder: 'demo', tags: [] });
  });

  it.each([
    ['tags that are not a list', { type: 'filter', folder: 'f', tags: 'SEC' }],
    ['a tag that is not valid', { type: 'filter', folder: 'f', tags: ['<script>'] }],
    ['no folder', { type: 'filter', tags: ['SEC'] }],
  ])('drops a filter with %s', (_name, raw) => {
    expect(parseWebviewMessage(raw)).toBeNull();
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
    ['a setup without a folder', { type: 'setup' }],
    ['a setup with an empty folder', { type: 'setup', folder: '' }],
    ['a setup with a folder that is not a string', { type: 'setup', folder: ['a'] }],
    ['a drawn without a count', { type: 'drawn' }],
    ['a drawn with a negative count', { type: 'drawn', lanes: -1 }],
    ['a drawn with a fractional count', { type: 'drawn', lanes: 1.5 }],
    ['a drawn with a huge count', { type: 'drawn', lanes: 100_000 }],
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
