import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fileGuard, stateDirectory } from '../../src/cli/guard.js';

describe('stateDirectory', () => {
  it('uses the directory named by PLANMASTER_STATE_DIR when it is set', () => {
    expect(stateDirectory({ PLANMASTER_STATE_DIR: '/custom/state' }, '/home/ann', 'linux')).toBe('/custom/state');
  });

  it('ignores an empty PLANMASTER_STATE_DIR', () => {
    expect(stateDirectory({ PLANMASTER_STATE_DIR: '' }, '/home/ann', 'linux')).toBe('/home/ann/.cache/planmaster');
  });

  it('follows XDG_CACHE_HOME on Linux and macOS, else the home directory', () => {
    expect(stateDirectory({ XDG_CACHE_HOME: '/xdg/cache' }, '/home/ann', 'linux')).toBe('/xdg/cache/planmaster');
    expect(stateDirectory({}, '/home/ann', 'darwin')).toBe('/home/ann/.cache/planmaster');
  });

  it('uses the local application data directory on Windows', () => {
    expect(stateDirectory({ LOCALAPPDATA: 'C:\\Users\\ann\\AppData\\Local' }, 'C:\\Users\\ann', 'win32')).toBe('C:\\Users\\ann\\AppData\\Local\\planmaster');
    expect(stateDirectory({}, 'C:\\Users\\ann', 'win32')).toBe('C:\\Users\\ann\\AppData\\Local\\planmaster');
  });
});

describe('fileGuard', () => {
  let parent: string;
  let directory: string;

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), 'planmaster-guard-'));
    directory = path.join(parent, 'state');
  });

  afterEach(() => {
    fs.rmSync(parent, { recursive: true, force: true });
  });

  it('remembers what was asked, per session and lane', () => {
    const guard = fileGuard(directory);
    guard.set('s1', 'A', 'PM012:A-1');
    guard.set('s1', 'B', 'PM004:B-1');
    expect(guard.get('s1', 'A')).toBe('PM012:A-1');
    expect(guard.get('s1', 'B')).toBe('PM004:B-1');
    expect(guard.get('s2', 'A')).toBeUndefined();
    expect(fileGuard(directory).get('s1', 'A')).toBe('PM012:A-1');
  });

  it('creates its directory and keeps it private on systems that have permissions', () => {
    fileGuard(directory).set('s1', 'A', 'x');
    expect(fs.statSync(directory).isDirectory()).toBe(true);
    if (process.platform !== 'win32') {
      expect(fs.statSync(directory).mode & 0o777).toBe(0o700);
      const [file] = fs.readdirSync(directory);
      expect(fs.statSync(path.join(directory, file ?? '')).mode & 0o777).toBe(0o600);
    }
  });

  it('never writes outside its directory, whatever the session ID says', () => {
    fileGuard(directory).set('../../evil', 'A', 'x');
    expect(fs.readdirSync(directory)).toHaveLength(1);
    expect(fs.readdirSync(parent)).toEqual(['state']);
  });

  it('treats a damaged file as empty and replaces it', () => {
    const guard = fileGuard(directory);
    guard.set('s1', 'A', 'x');
    const [file] = fs.readdirSync(directory);
    fs.writeFileSync(path.join(directory, file ?? ''), '{ not json');
    expect(guard.get('s1', 'A')).toBeUndefined();
    guard.set('s1', 'A', 'y');
    expect(guard.get('s1', 'A')).toBe('y');
  });

  it('answers nothing when the directory does not exist yet', () => {
    expect(fileGuard(path.join(parent, 'missing')).get('s1', 'A')).toBeUndefined();
  });
});
