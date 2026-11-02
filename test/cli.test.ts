import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CLI = path.join(ROOT, 'out', 'cli', 'main.js');
const DEMO = path.join(ROOT, 'docs', 'examples', 'demo-workspace');
const DEMO_ARGS = [DEMO, '--now', '2026-11-02T11:48', '--mtime', 'E=2026-11-02T08:07'];

function run(args: string[]) {
  const result = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

let tmp: string;

beforeAll(() => {
  const build = spawnSync('npx', ['tsc', '-p', 'tsconfig.build.json'], { cwd: ROOT, encoding: 'utf8' });
  if (build.status !== 0) throw new Error(`build failed:\n${build.stdout}${build.stderr}`);
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'planmaster-cli-'));
}, 60_000);

afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

function workspace(name: string, files: Record<string, string>): string {
  const dir = path.join(tmp, name);
  for (const [relative, text] of Object.entries(files)) {
    const target = path.join(dir, '.planmaster', relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text);
  }
  return dir;
}

describe('planmaster-lint', () => {
  it('prints findings to stderr and a summary to stdout, and exits 1 on errors', () => {
    const { code, stdout, stderr } = run(DEMO_ARGS);
    expect(code).toBe(1);
    expect(stdout.trim()).toBe('2 errors, 1 warning in 5 lanes, 30 items');
    expect(stderr.trim().split('\n')).toEqual([
      expect.stringMatching(/^\.planmaster\/lanes\/B\.md:12 error PM004 B-14 is blocked/),
      expect.stringMatching(/^\.planmaster\/lanes\/B\.md:12 error PM006 B-14 is blocked/),
      expect.stringMatching(/^\.planmaster\/lanes\/E\.md:7 warning PM012 E-05 has been in progress for 3 h 43 min/),
    ]);
  });

  it('accepts the .planmaster directory itself', () => {
    const { code, stdout } = run([path.join(DEMO, '.planmaster'), ...DEMO_ARGS.slice(1)]);
    expect(code).toBe(1);
    expect(stdout.trim()).toBe('2 errors, 1 warning in 5 lanes, 30 items');
  });

  it('prints JSON on stdout with --json', () => {
    const { code, stdout, stderr } = run([...DEMO_ARGS, '--json']);
    expect(code).toBe(1);
    expect(stderr).toBe('');
    const findings = JSON.parse(stdout) as Array<{ code: string; line: number; severity: string }>;
    expect(findings.map((f) => f.code)).toEqual(['PM004', 'PM006', 'PM012']);
    expect(findings[2]).toMatchObject({ line: 7, severity: 'warning' });
  });

  it('exits 0 when there are only warnings', () => {
    const dir = workspace('warnings-only', {
      'lanes/A.md': '---\nformat: 1\nlane: A\ntitle: Warning only lane\n---\n\nstray prose\n- [ ] A-1 Item\n',
    });
    const { code, stdout, stderr } = run([dir]);
    expect(code).toBe(0);
    expect(stdout.trim()).toBe('0 errors, 1 warning in 1 lane, 1 item');
    expect(stderr).toContain('warning PM016');
  });

  it('exits 0 for an empty workspace', () => {
    const dir = workspace('empty', { 'config.json': '{}' });
    const { code, stdout } = run([dir]);
    expect(code).toBe(0);
    expect(stdout.trim()).toBe('0 errors, 0 warnings in 0 lanes, 0 items');
  });

  it('exits 2 for a broken config.json', () => {
    const dir = workspace('bad-config', { 'config.json': '{ nope' });
    const { code, stderr } = run([dir]);
    expect(code).toBe(2);
    expect(stderr).toContain('config.json is not valid JSON');
  });

  it.each([
    ['no directory', []],
    ['an unknown option', [DEMO, '--frobnicate']],
    ['a bad --now', [DEMO, '--now', 'soon']],
    ['a bad --mtime', [DEMO, '--mtime', 'E']],
    ['two directories', [DEMO, DEMO]],
  ])('exits 2 for %s', (_name, args) => {
    const { code, stderr } = run(args);
    expect(code).toBe(2);
    expect(stderr).toContain('Usage: planmaster-lint');
  });

  it('prints usage and exits 0 for --help', () => {
    const { code, stdout } = run(['--help']);
    expect(code).toBe(0);
    expect(stdout).toContain('Usage: planmaster-lint');
  });

  it('reports files that are too large (PM021) without parsing them', () => {
    const dir = workspace('large', {
      'lanes/A.md': `---\nformat: 1\nlane: A\ntitle: Large lane file\n---\n${'- [ ] A-1 filler\n'.repeat(80_000)}`,
    });
    const { code, stderr } = run([dir]);
    expect(code).toBe(1);
    expect(stderr).toContain('error PM021');
  });
});
