import { describe, expect, it } from 'vitest';
import { runHook, type HookRunOptions } from '../../src/cli/hook-runner.js';
import { ConfigError, type WorkspaceInput } from '../../src/core/index.js';
import { NOW, laneFile } from '../helpers.js';
import { TEMPLATES } from '../support/templates.js';

const ROOT = '/work/project';
const lanePath = (lane: string): string => `${ROOT}/.planmaster/lanes/${lane}.md`;
const payload = (event: string, extra: object = {}): string => JSON.stringify({ session_id: 's1', cwd: ROOT, hook_event_name: event, ...extra });

const stale = laneFile('A', '- [~] A-1 Long job since:2026-11-02T08:05', '2026-11-02T08:07');
const broken = laneFile('B', '- [!] B-1 Broken');

function options(event: string, stdin: string, overrides: Partial<HookRunOptions> = {}): HookRunOptions & { remembered: Map<string, string> } {
  const remembered = new Map<string, string>();
  const input: WorkspaceInput = { files: [stale, broken], configText: JSON.stringify({ people: ['alice'] }) };
  return {
    event,
    stdin,
    env: {},
    now: NOW,
    laneStartTemplate: TEMPLATES.laneStart,
    findRoot: () => ROOT,
    load: () => input,
    guard: { get: (session, lane) => remembered.get(`${session}/${lane}`), set: (session, lane, fingerprint) => { remembered.set(`${session}/${lane}`, fingerprint); } },
    remembered,
    ...overrides,
  };
}

const silent = { exitCode: 0, stdout: '', stderr: '' };

describe('runHook: input that is not for it', () => {
  it.each([
    ['text that is not JSON', 'not json'],
    ['JSON that is not an object', '[1]'],
    ['an object without the usual fields', '{}'],
    ['an empty input', ''],
  ])('stays silent for %s, since a hook must never get in the way', (_name, stdin) => {
    expect(runHook(options('post-edit', stdin))).toEqual(silent);
  });

  it('stays silent when the hook is wired to the wrong event', () => {
    expect(runHook(options('post-edit', payload('Stop')))).toEqual(silent);
    expect(runHook(options('stop', payload('PostToolUse')))).toEqual(silent);
  });

  it('stays silent outside a PlanMaster project', () => {
    expect(runHook(options('post-edit', payload('PostToolUse', { tool_input: { file_path: lanePath('B') } }), { findRoot: () => null }))).toEqual(silent);
  });

  it('fails visibly, without blocking, for a hook name it does not know', () => {
    const result = runHook(options('frobnicate', payload('Stop')));
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('post-edit, stop or session-start');
  });
});

describe('runHook: post-edit', () => {
  it('sends the errors of the edited lane file to the assistant', () => {
    const result = runHook(options('post-edit', payload('PostToolUse', { tool_name: 'Edit', tool_input: { file_path: lanePath('B') } })));
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('.planmaster/lanes/B.md:7 error PM004');
  });

  it('stays silent for a clean file and for files outside the queue', () => {
    expect(runHook(options('post-edit', payload('PostToolUse', { tool_input: { file_path: lanePath('A') } }))).exitCode).toBe(0);
    expect(runHook(options('post-edit', payload('PostToolUse', { tool_input: { file_path: `${ROOT}/README.md` } }))).exitCode).toBe(0);
  });

  it('reports a config.json that can no longer be read when that is the file just edited', () => {
    const load = (): never => { throw new ConfigError('config.json is not valid JSON: boom'); };
    const edited = runHook(options('post-edit', payload('PostToolUse', { tool_input: { file_path: `${ROOT}/.planmaster/config.json` } }), { load }));
    expect(edited.exitCode).toBe(2);
    expect(edited.stderr).toContain('boom');
    expect(runHook(options('post-edit', payload('PostToolUse', { tool_input: { file_path: lanePath('A') } }), { load }))).toEqual(silent);
  });

  it('lets an unexpected failure to read the workspace surface', () => {
    const load = (): never => { throw new Error('disk on fire'); };
    expect(() => runHook(options('post-edit', payload('PostToolUse', { tool_input: { file_path: lanePath('B') } }), { load }))).toThrow('disk on fire');
  });
});

describe('runHook: stop', () => {
  const stopPayload = payload('Stop');

  it('stays silent for a chat that is not bound to a lane', () => {
    expect(runHook(options('stop', stopPayload))).toEqual(silent);
    expect(runHook(options('stop', stopPayload, { env: { PLANMASTER_LANE: '  ' } }))).toEqual(silent);
  });

  it('asks the chat bound to a lane to bring its queue up to date', () => {
    const result = runHook(options('stop', stopPayload, { env: { PLANMASTER_LANE: 'A' } }));
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('lane A');
    expect(result.stderr).toContain('A-1');
  });

  it('asks only once for the same problems in the same session', () => {
    const first = options('stop', stopPayload, { env: { PLANMASTER_LANE: 'A' } });
    expect(runHook(first).exitCode).toBe(2);
    expect(first.remembered.get('s1/A')).toBe('PM012:A-1');
    expect(runHook({ ...first }).exitCode).toBe(0);
  });

  it('keeps the memory per session and per lane', () => {
    const first = options('stop', stopPayload, { env: { PLANMASTER_LANE: 'A' } });
    runHook(first);
    expect(runHook({ ...first, stdin: payload('Stop', { session_id: 's2' }) }).exitCode).toBe(2);
    expect(runHook({ ...first, env: { PLANMASTER_LANE: 'B' } }).exitCode).toBe(2);
  });

  it('lets the assistant stop when it is already continuing because of a hook', () => {
    expect(runHook(options('stop', payload('Stop', { stop_hook_active: true }), { env: { PLANMASTER_LANE: 'A' } }))).toEqual(silent);
  });

  it('stays silent when the workspace cannot be analysed', () => {
    const load = (): never => { throw new ConfigError('broken'); };
    expect(runHook(options('stop', stopPayload, { env: { PLANMASTER_LANE: 'A' }, load }))).toEqual(silent);
  });
});

describe('runHook: session-start', () => {
  it('tells a chat bound to a lane which lane it is', () => {
    const result = runHook(options('session-start', payload('SessionStart', { source: 'startup' }), { env: { PLANMASTER_LANE: 'A' } }));
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('You are lane A: "Test lane title".');
    expect(result.stdout).toContain('People allowed in wait: alice.');
  });

  it('stays silent for a chat that is not bound to a lane', () => {
    expect(runHook(options('session-start', payload('SessionStart')))).toEqual(silent);
  });
});
