import { describe, expect, it } from 'vitest';
import { configErrorHook, parseHookInput, postEditHook, sessionStartHook, stopHook, workspacePathOf, type HookInput } from '../../src/app/hooks.js';
import { laneFile, run } from '../helpers.js';
import { TEMPLATES } from '../support/templates.js';

const ROOT = '/work/project';
const input = (overrides: Partial<HookInput> = {}): HookInput => ({ event: 'PostToolUse', cwd: ROOT, sessionId: 's1', filePath: undefined, stopHookActive: false, ...overrides });
const lanePath = (lane: string): string => `${ROOT}/.planmaster/lanes/${lane}.md`;

describe('parseHookInput', () => {
  it('reads a PostToolUse payload', () => {
    const raw = { session_id: 'abc', cwd: ROOT, hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: lanePath('A'), old_string: 'x' }, tool_response: {} };
    expect(parseHookInput(raw)).toEqual({ event: 'PostToolUse', cwd: ROOT, sessionId: 'abc', filePath: lanePath('A'), stopHookActive: false });
  });

  it('reads a Stop payload with its loop flag', () => {
    expect(parseHookInput({ cwd: ROOT, hook_event_name: 'Stop', stop_hook_active: true })).toMatchObject({ event: 'Stop', stopHookActive: true, sessionId: '', filePath: undefined });
  });

  it('ignores a tool input that has no usable path', () => {
    expect(parseHookInput({ cwd: ROOT, hook_event_name: 'PostToolUse', tool_input: { file_path: 5 } })?.filePath).toBeUndefined();
    expect(parseHookInput({ cwd: ROOT, hook_event_name: 'PostToolUse', tool_input: 'x' })?.filePath).toBeUndefined();
  });

  it.each([
    ['null', null],
    ['a string', 'Stop'],
    ['an array', []],
    ['no event', { cwd: ROOT }],
    ['no cwd', { hook_event_name: 'Stop' }],
    ['an empty cwd', { hook_event_name: 'Stop', cwd: '' }],
  ])('rejects %s', (_name, raw) => {
    expect(parseHookInput(raw)).toBeNull();
  });
});

describe('workspacePathOf', () => {
  it('gives the path relative to the root, with forward slashes', () => {
    expect(workspacePathOf(ROOT, lanePath('A'))).toBe('.planmaster/lanes/A.md');
    expect(workspacePathOf(`${ROOT}/`, lanePath('A'))).toBe('.planmaster/lanes/A.md');
  });

  it('handles Windows paths', () => {
    expect(workspacePathOf('C:\\work\\project', 'C:\\work\\project\\.planmaster\\lanes\\A.md')).toBe('.planmaster/lanes/A.md');
  });

  it('refuses anything outside the root, including look-alike folders and parent references', () => {
    expect(workspacePathOf(ROOT, '/work/other/.planmaster/lanes/A.md')).toBeNull();
    expect(workspacePathOf(ROOT, '/work/project-two/.planmaster/lanes/A.md')).toBeNull();
    expect(workspacePathOf(ROOT, `${ROOT}/../elsewhere/x.md`)).toBeNull();
    expect(workspacePathOf(ROOT, ROOT)).toBeNull();
  });
});

describe('postEditHook', () => {
  const broken = run([laneFile('A', '- [!] A-1 Broken'), laneFile('B', '- [ ] B-1 Fine')]);

  it('stays silent for a file that is not a lane file', () => {
    expect(postEditHook(input({ filePath: `${ROOT}/src/index.ts` }), broken, ROOT)).toEqual({ exitCode: 0, stdout: '', stderr: '' });
    expect(postEditHook(input({ filePath: undefined }), broken, ROOT)).toEqual({ exitCode: 0, stdout: '', stderr: '' });
    expect(postEditHook(input({ filePath: '/elsewhere/.planmaster/lanes/A.md' }), broken, ROOT).exitCode).toBe(0);
  });

  it('tells the assistant about the errors in the lane file that was just edited', () => {
    const result = postEditHook(input({ filePath: lanePath('A') }), broken, ROOT);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('.planmaster/lanes/A.md');
    expect(result.stderr).toContain('error PM004');
    expect(result.stderr).toContain('error PM006');
    expect(result.stderr).toContain('.planmaster/FORMAT.md');
  });

  it('does not mention problems of other files', () => {
    const files = [laneFile('A', '- [ ] A-1 Fine'), laneFile('B', '- [!] B-1 Broken')];
    expect(postEditHook(input({ filePath: lanePath('A') }), run(files), ROOT).exitCode).toBe(0);
  });

  it('stays silent when the file only has warnings', () => {
    const warnings = run([laneFile('A', 'stray prose\n- [ ] A-1 Fine')]);
    expect(warnings.findings.map((f) => f.severity)).toEqual(['warning']);
    expect(postEditHook(input({ filePath: lanePath('A') }), warnings, ROOT).exitCode).toBe(0);
  });

  it('checks archive files too', () => {
    const analysis = run([{ path: '.planmaster/archive/A.md', kind: 'archive', text: '---\nformat: 1\nlane: A\ntitle: Test lane title\n---\n- [x] A-1 No done\n' }]);
    const result = postEditHook(input({ filePath: `${ROOT}/.planmaster/archive/A.md` }), analysis, ROOT);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('PM005');
  });

  it('lists at most twenty findings and says how many more there are', () => {
    const body = Array.from({ length: 30 }, (_, i) => `- [x] A-${i + 1} No done`).join('\n');
    const result = postEditHook(input({ filePath: lanePath('A') }), run([laneFile('A', body)]), ROOT);
    expect(result.stderr.split('\n').filter((l) => l.includes('error PM005'))).toHaveLength(20);
    expect(result.stderr).toContain('and 10 more');
  });
});

describe('configErrorHook', () => {
  it('reports an invalid config.json when it is the file that was edited', () => {
    const result = configErrorHook(input({ filePath: `${ROOT}/.planmaster/config.json` }), ROOT, 'config.json is not valid JSON: boom');
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('config.json is not valid JSON: boom');
  });

  it('stays silent for any other file', () => {
    expect(configErrorHook(input({ filePath: lanePath('A') }), ROOT, 'boom').exitCode).toBe(0);
    expect(configErrorHook(input({ filePath: undefined }), ROOT, 'boom').exitCode).toBe(0);
  });
});

describe('stopHook', () => {
  const stopInput = input({ event: 'Stop' });
  const stale = run([laneFile('A', '- [~] A-1 Long job since:2026-11-02T08:05', '2026-11-02T08:07'), laneFile('B', '- [!] B-1 Other lane broken')]);

  it('stays silent when the chat is not bound to a lane', () => {
    expect(stopHook(stopInput, stale, undefined, undefined)).toEqual({ result: { exitCode: 0, stdout: '', stderr: '' } });
  });

  it('lets the assistant stop when it is already continuing because of a hook', () => {
    expect(stopHook({ ...stopInput, stopHookActive: true }, stale, 'A', undefined).result.exitCode).toBe(0);
  });

  it('asks to update the queue when the item in progress has not been touched for hours', () => {
    const { result, fingerprint } = stopHook(stopInput, stale, 'A', undefined);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('lane A');
    expect(result.stderr).toContain('A-1');
    expect(result.stderr).toContain('3 h 43 min');
    expect(fingerprint).toBe('PM012:A-1');
  });

  it('also asks when the lane file has errors', () => {
    const { result, fingerprint } = stopHook(stopInput, stale, 'B', undefined);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('PM004');
    expect(fingerprint).toBe('PM004:B-1,PM006:B-1');
  });

  it('does not nag about other lanes', () => {
    const clean = run([laneFile('A', '- [~] A-1 Fine since:2026-11-02T11:40', '2026-11-02T11:44'), laneFile('B', '- [!] B-1 Broken')]);
    expect(stopHook(stopInput, clean, 'A', undefined).result.exitCode).toBe(0);
  });

  it('ignores warnings other than staleness', () => {
    const analysis = run([laneFile('A', 'stray prose\n- [ ] A-1 Fine')]);
    expect(stopHook(stopInput, analysis, 'A', undefined).result.exitCode).toBe(0);
  });

  it('does not repeat a request that was already made in this session', () => {
    const first = stopHook(stopInput, stale, 'A', undefined);
    const second = stopHook(stopInput, stale, 'A', first.fingerprint);
    expect(second.result.exitCode).toBe(0);
  });

  it('asks again when the problems are different', () => {
    expect(stopHook(stopInput, stale, 'A', 'PM004:A-9').result.exitCode).toBe(2);
  });

  it('stays silent for a lane that has no file', () => {
    expect(stopHook(stopInput, stale, 'Z', undefined).result.exitCode).toBe(0);
  });
});

describe('sessionStartHook', () => {
  const analysis = run([laneFile('B', '- [ ] B-1 x')]);
  const start = (lane: string | undefined, a = analysis) => sessionStartHook(lane, a, TEMPLATES.laneStart);

  it('stays silent when the chat is not bound to a lane', () => {
    expect(start(undefined)).toEqual({ exitCode: 0, stdout: '', stderr: '' });
  });

  it('tells the chat which lane it is, with the start prompt for it', () => {
    const result = start('B');
    expect(result.exitCode).toBe(0);
    expect(result.stdout.startsWith('PlanMaster: PLANMASTER_LANE is set to B')).toBe(true);
    expect(result.stdout).toContain('You are lane B: "Test lane title".');
    expect(result.stdout).toContain('People allowed in wait: alice, bob.');
    expect(result.stderr).toBe('');
  });

  it('says what is wrong when the lane has no file or the ID is invalid', () => {
    expect(start('Z').stdout).toContain('.planmaster/lanes/Z.md does not exist');
    expect(start('b').stdout).toContain('not a valid lane ID');
  });
});
