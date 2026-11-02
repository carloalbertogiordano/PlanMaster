import { describe, expect, it } from 'vitest';
import { CONFIG_PATH, classifyPath } from '../../src/app/paths.js';

const DEFAULT_DIR = '.planmaster/lanes';

describe('classifyPath', () => {
  it.each([
    ['.planmaster/lanes/A.md', DEFAULT_DIR, 'lane'],
    ['.planmaster/archive/A.md', DEFAULT_DIR, 'archive'],
    ['work/lanes/B.md', 'work/lanes', 'lane'],
    ['work/lanes/B.md', 'work/lanes/', 'lane'],
    ['.planmaster\\lanes\\A.md', DEFAULT_DIR, 'lane'],
    ['.planmaster/archive/A.md', 'work/lanes', 'archive'],
  ])('classifies %s (lanes dir %s) as %s', (path, lanesDir, expected) => {
    expect(classifyPath(path, lanesDir)).toBe(expected);
  });

  it.each([
    ['README.md'],
    ['.planmaster/lanes/A.txt'],
    ['.planmaster/lanes/sub/A.md'],
    ['.planmaster/lanes/.hidden.md'],
    ['.planmaster/lanes/../config.md'],
    ['.planmaster/other/A.md'],
    ['A.md'],
    ['.planmaster/config.json'],
  ])('ignores %s', (path) => {
    expect(classifyPath(path, DEFAULT_DIR)).toBeNull();
  });

  it('does not treat the default lanes directory as one when the configuration moves it', () => {
    expect(classifyPath('.planmaster/lanes/A.md', 'work/lanes')).toBeNull();
  });

  it('names the configuration file', () => {
    expect(CONFIG_PATH).toBe('.planmaster/config.json');
  });
});
