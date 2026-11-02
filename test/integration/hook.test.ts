import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { formatTimestamp } from '../../src/core/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HOUR = 3_600_000;

let workspace: string;
let script: string;
let stateDir: string;

function lane(id: string, title: string, body: string): string {
  return `---\nformat: 1\nlane: ${id}\ntitle: ${title}\n---\n\n${body}\n`;
}

function writeLane(id: string, text: string, mtimeMs = Date.now()): void {
  const file = path.join(workspace, '.planmaster', 'lanes', `${id}.md`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  fs.utimesSync(file, mtimeMs / 1000, mtimeMs / 1000);
}

beforeAll(() => {
  const bundle = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'bundle.mjs')], { cwd: ROOT, encoding: 'utf8' });
  if (bundle.status !== 0) throw new Error(`bundle failed:\n${bundle.stdout}${bundle.stderr}`);

  workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'planmaster-hook-'));
  stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'planmaster-state-'));
  fs.mkdirSync(path.join(workspace, 'docs'));
  fs.mkdirSync(path.join(workspace, '.planmaster', 'hooks'), { recursive: true });
  fs.writeFileSync(path.join(workspace, '.planmaster', 'config.json'), '{"people":["alice"]}');

  // The script is copied into the project, as the install command does, and runs from there with nothing else installed.
  script = path.join(workspace, '.planmaster', 'hooks', 'planmaster-hook.cjs');
  fs.copyFileSync(path.join(ROOT, 'dist', 'planmaster-hook.cjs'), script);

  const fiveHoursAgo = Date.now() - 5 * HOUR;
  writeLane('A', lane('A', 'Healthy lane here', `- [~] A-1 Working since:${formatTimestamp(Date.now() - 10 * 60_000)}`));
  writeLane('B', lane('B', 'Broken lane here', '- [!] B-1 No reason given'));
  writeLane('E', lane('E', 'Forgotten lane here', `- [~] E-1 Forgotten job since:${formatTimestamp(fiveHoursAgo)}`), fiveHoursAgo);
});

afterAll(() => {
  fs.rmSync(workspace, { recursive: true, force: true });
  fs.rmSync(stateDir, { recursive: true, force: true });
});

function hook(event: string, payload: unknown, env: Record<string, string> = {}, cwd = workspace) {
  const stdin = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const run = spawnSync(process.execPath, [script, event], { input: stdin, cwd, encoding: 'utf8', env: { ...process.env, PLANMASTER_LANE: '', PLANMASTER_STATE_DIR: stateDir, ...env } });
  return { code: run.status, stdout: run.stdout, stderr: run.stderr };
}

const payloadFor = (event: string, extra: object = {}): object => ({ session_id: 'it-session', transcript_path: path.join(workspace, 'transcript.jsonl'), cwd: workspace, permission_mode: 'default', hook_event_name: event, ...extra });
const edit = (file: string): object => payloadFor('PostToolUse', { tool_name: 'Edit', tool_input: { file_path: file, old_string: 'a', new_string: 'b' }, tool_response: { success: true } });
const lanePath = (id: string): string => path.join(workspace, '.planmaster', 'lanes', `${id}.md`);

describe('the hook program, as Claude Code runs it', () => {
  it('post-edit sends the errors of the lane file that was edited, exit code 2 on stderr', () => {
    const result = hook('post-edit', edit(lanePath('B')));
    expect(result.code).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('.planmaster/lanes/B.md:7 error PM004');
    expect(result.stderr).toContain('.planmaster/FORMAT.md');
  });

  it('post-edit is silent for a healthy lane file and for any other file', () => {
    expect(hook('post-edit', edit(lanePath('A')))).toEqual({ code: 0, stdout: '', stderr: '' });
    expect(hook('post-edit', edit(path.join(workspace, 'docs', 'notes.md')))).toEqual({ code: 0, stdout: '', stderr: '' });
  });

  it('finds the project when Claude Code runs the hook from a subdirectory', () => {
    const result = hook('post-edit', { ...edit(lanePath('B')), cwd: path.join(workspace, 'docs') }, {}, path.join(workspace, 'docs'));
    expect(result.code).toBe(2);
  });

  it('stop asks a chat bound to a lane to update a queue it has not touched for hours, once', () => {
    const session = `it-stop-${process.pid}`;
    const payload = payloadFor('Stop', { session_id: session, stop_hook_active: false });

    const first = hook('stop', payload, { PLANMASTER_LANE: 'E' });
    expect(first.code).toBe(2);
    expect(first.stderr).toContain('lane E');
    expect(first.stderr).toContain('E-1');
    expect(first.stderr).toMatch(/5 h/);

    expect(hook('stop', payload, { PLANMASTER_LANE: 'E' })).toEqual({ code: 0, stdout: '', stderr: '' });
  });

  it('stop leaves a healthy lane and an unbound chat alone', () => {
    expect(hook('stop', payloadFor('Stop', { session_id: `it-a-${process.pid}` }), { PLANMASTER_LANE: 'A' }).code).toBe(0);
    expect(hook('stop', payloadFor('Stop', { session_id: `it-b-${process.pid}` })).code).toBe(0);
  });

  it('session-start tells a chat bound to a lane which lane it is, on stdout', () => {
    const result = hook('session-start', payloadFor('SessionStart', { source: 'startup' }), { PLANMASTER_LANE: 'B' });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('PLANMASTER_LANE is set to B');
    expect(result.stdout).toContain('You are lane B: "Broken lane here".');
    expect(result.stdout).toContain('People allowed in wait: alice.');
    expect(result.stderr).toBe('');
  });

  it('never gets in the way of a session', () => {
    expect(hook('post-edit', 'garbage')).toEqual({ code: 0, stdout: '', stderr: '' });
    expect(hook('post-edit', '')).toEqual({ code: 0, stdout: '', stderr: '' });
    const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'planmaster-no-project-'));
    try {
      expect(hook('post-edit', { ...edit(path.join(elsewhere, 'x.md')), cwd: elsewhere }, {}, elsewhere).code).toBe(0);
    } finally {
      fs.rmSync(elsewhere, { recursive: true, force: true });
    }
  });

  it('reports an unknown hook name as a visible but non-blocking error', () => {
    const result = hook('frobnicate', payloadFor('Stop'));
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('post-edit, stop or session-start');
  });

  it('reports a config.json it can no longer read when that is the file just edited', () => {
    const config = path.join(workspace, '.planmaster', 'config.json');
    const original = fs.readFileSync(config, 'utf8');
    fs.writeFileSync(config, '{ nope');
    try {
      const result = hook('post-edit', edit(config));
      expect(result.code).toBe(2);
      expect(result.stderr).toContain('not valid JSON');
      expect(hook('post-edit', edit(lanePath('B'))).code).toBe(0);
    } finally {
      fs.writeFileSync(config, original);
    }
  });
});
