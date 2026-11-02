import { describe, expect, it } from 'vitest';
import { HOOK_SCRIPT_PATH, mergeHookSettings, type MergeResult } from '../../src/app/hook-settings.js';

const ours = (event: string, extra: object = {}) => ({ type: 'command', command: `node "$CLAUDE_PROJECT_DIR/${HOOK_SCRIPT_PATH}" ${event}`, timeout: 30, ...extra });

function textOf(result: MergeResult): string {
  if (result.kind === 'refuse') throw new Error(`Refused: ${result.reason}`);
  return result.text;
}

const parsed = (result: MergeResult): { hooks: Record<string, { matcher?: string; hooks: object[] }[]> } & Record<string, unknown> =>
  JSON.parse(textOf(result)) as ReturnType<typeof parsed>;

describe('mergeHookSettings on a project without settings', () => {
  const result = mergeHookSettings(undefined);

  it('creates the file with the three hooks', () => {
    expect(result.kind).toBe('create');
    expect(parsed(result).hooks).toEqual({
      PostToolUse: [{ matcher: 'Edit|Write|MultiEdit', hooks: [ours('post-edit')] }],
      Stop: [{ hooks: [ours('stop')] }],
      SessionStart: [{ hooks: [ours('session-start')] }],
    });
  });

  it('writes readable JSON with a final newline', () => {
    const text = textOf(result);
    expect(text.startsWith('{\n  "hooks": {')).toBe(true);
    expect(text.endsWith('}\n')).toBe(true);
  });

  it('treats an empty file like a missing one', () => {
    expect(mergeHookSettings('').kind).toBe('create');
    expect(mergeHookSettings('  \n').kind).toBe('create');
  });

  it('runs the script from the project directory, so it works for everyone who has the repository', () => {
    expect(textOf(result)).toContain('node \\"$CLAUDE_PROJECT_DIR/.planmaster/hooks/planmaster-hook.cjs\\" post-edit');
  });
});

describe('mergeHookSettings on existing settings', () => {
  const existing = JSON.stringify({
    permissions: { allow: ['Bash(npm test)'] },
    env: { A: '1' },
    hooks: {
      PostToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo done' }] }],
      PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'check.sh' }] }],
    },
  }, null, 2);

  it('keeps every other setting and every other hook', () => {
    const merged = parsed(mergeHookSettings(existing));
    expect(merged.permissions).toEqual({ allow: ['Bash(npm test)'] });
    expect(merged.env).toEqual({ A: '1' });
    expect(merged.hooks.PreToolUse).toEqual([{ matcher: 'Bash', hooks: [{ type: 'command', command: 'check.sh' }] }]);
    expect(merged.hooks.PostToolUse).toEqual([
      { matcher: 'Bash', hooks: [{ type: 'command', command: 'echo done' }] },
      { matcher: 'Edit|Write|MultiEdit', hooks: [ours('post-edit')] },
    ]);
  });

  it('is idempotent', () => {
    const first = textOf(mergeHookSettings(existing));
    expect(mergeHookSettings(first)).toEqual({ kind: 'unchanged', text: first });
  });

  it('replaces an older PlanMaster handler instead of adding a second one', () => {
    const old = JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'node .planmaster/hooks/planmaster-hook.cjs stop', timeout: 5 }] }] } });
    const merged = parsed(mergeHookSettings(old));
    expect(merged.hooks.Stop).toEqual([{ hooks: [ours('stop')] }]);
  });

  it('takes only its own handler out of a group that also holds the user\'s', () => {
    const mixed = JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'mine.sh' }, ours('stop', { timeout: 99 })] }] } });
    const merged = parsed(mergeHookSettings(mixed));
    expect(merged.hooks.Stop).toEqual([{ hooks: [{ type: 'command', command: 'mine.sh' }] }, { hooks: [ours('stop')] }]);
  });

  it('keeps the indentation style of the file', () => {
    expect(textOf(mergeHookSettings('{\n    "env": {}\n}\n'))).toContain('\n    "env": {},\n');
    expect(textOf(mergeHookSettings('{\n\t"env": {}\n}\n'))).toContain('\n\t"env": {},\n');
  });

  it('reports a change as an update', () => {
    expect(mergeHookSettings(existing).kind).toBe('update');
  });
});

describe('mergeHookSettings refuses what it cannot merge safely', () => {
  it.each([
    ['text that is not JSON', '{ "hooks": ', /JSON/],
    ['JSON that is not an object', '[1, 2]', /object/],
    ['a hooks entry that is not an object', '{ "hooks": [] }', /"hooks"/],
    ['an event that is not a list', '{ "hooks": { "Stop": {} } }', /Stop/],
    ['a matcher group that is not an object', '{ "hooks": { "Stop": [1] } }', /Stop/],
    ['a matcher group whose hooks are not a list', '{ "hooks": { "Stop": [{ "hooks": 1 }] } }', /Stop/],
  ])('refuses %s', (_name, text, reason) => {
    const result = mergeHookSettings(text);
    expect(result.kind).toBe('refuse');
    expect(result.kind === 'refuse' && result.reason).toMatch(reason);
  });
});
