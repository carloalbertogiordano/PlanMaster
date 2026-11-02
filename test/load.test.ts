import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConfigError } from '../src/core/index.js';
import { loadWorkspace } from '../src/node/load.js';

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'planmaster-load-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function write(relative: string, text = 'x'): void {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, text);
}

const paths = (files: { path: string }[]): string[] => files.map((f) => f.path);

describe('loadWorkspace', () => {
  it('returns no files for a directory without .planmaster', () => {
    const { input } = loadWorkspace(root);
    expect(input.files).toEqual([]);
    expect(input.configText).toBeUndefined();
  });

  it('reads lane and archive files in name order with workspace-relative paths', () => {
    write('.planmaster/lanes/B.md');
    write('.planmaster/lanes/A.md');
    write('.planmaster/archive/A.md');
    const { input } = loadWorkspace(root);
    expect(input.files.map((f) => `${f.kind}:${f.path}`)).toEqual([
      'lane:.planmaster/lanes/A.md',
      'lane:.planmaster/lanes/B.md',
      'archive:.planmaster/archive/A.md',
    ]);
  });

  it('records the modification time and the text of each file', () => {
    write('.planmaster/lanes/A.md', 'hello');
    const file = loadWorkspace(root).input.files[0];
    expect(file?.text).toBe('hello');
    expect(file?.mtimeMs).toBeGreaterThan(0);
  });

  it('accepts the .planmaster directory itself', () => {
    write('.planmaster/lanes/A.md');
    expect(paths(loadWorkspace(path.join(root, '.planmaster')).input.files)).toEqual(['.planmaster/lanes/A.md']);
  });

  it('ignores hidden files, other extensions and directories named like lane files', () => {
    write('.planmaster/lanes/.hidden.md');
    write('.planmaster/lanes/notes.txt');
    fs.mkdirSync(path.join(root, '.planmaster/lanes/dir.md'), { recursive: true });
    write('.planmaster/lanes/A.md');
    expect(paths(loadWorkspace(root).input.files)).toEqual(['.planmaster/lanes/A.md']);
  });

  it('reads lane files from the directory named in config.json', () => {
    write('.planmaster/config.json', '{"lanesDir":"work/lanes"}');
    write('work/lanes/A.md');
    write('.planmaster/lanes/B.md');
    const { input } = loadWorkspace(root);
    expect(paths(input.files)).toEqual(['work/lanes/A.md']);
    expect(input.configText).toBe('{"lanesDir":"work/lanes"}');
  });

  it('reports files over 1 MB as unreadable instead of reading them', () => {
    write('.planmaster/lanes/A.md', 'x'.repeat(1024 * 1024 + 1));
    const { input } = loadWorkspace(root);
    expect(input.files).toEqual([]);
    expect(input.unreadable).toHaveLength(1);
    expect(input.unreadable?.[0]).toMatchObject({ path: '.planmaster/lanes/A.md', kind: 'lane' });
    expect(input.unreadable?.[0]?.reason).toContain('larger than');
  });

  it('throws on a broken config.json', () => {
    write('.planmaster/config.json', '{');
    expect(() => loadWorkspace(root)).toThrow(ConfigError);
  });
});
