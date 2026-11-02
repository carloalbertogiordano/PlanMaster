import { describe, expect, it } from 'vitest';
import { installHooks } from '../../src/app/commands/hooks.js';
import type { CommandContext } from '../../src/app/commands/ports.js';
import { HOOK_SCRIPT_PATH, SETTINGS_PATH, mergeHookSettings } from '../../src/app/hook-settings.js';
import { run } from '../helpers.js';
import { FakeUi, MemoryFiles, type Script } from '../support/fake-ui.js';
import { HOOK_SCRIPT, TEMPLATES } from '../support/templates.js';

function context(script: Script, files = new MemoryFiles()): CommandContext & { ui: FakeUi; files: MemoryFiles } {
  return { ui: new FakeUi(script), files, templates: TEMPLATES, hookScript: HOOK_SCRIPT, analysis: run([]) };
}

const merged = (existing?: string): string => {
  const result = mergeHookSettings(existing);
  if (result.kind === 'refuse') throw new Error(result.reason);
  return result.text;
};

describe('installHooks', () => {
  it('writes the script and the settings after showing the settings change and asking', async () => {
    const ctx = context({ confirm: true });
    expect(await installHooks(ctx)).toBe('done');
    expect(ctx.files.files.get(HOOK_SCRIPT_PATH)).toBe(HOOK_SCRIPT);
    expect(ctx.files.files.get(SETTINGS_PATH)).toBe(merged());
    expect(ctx.ui.previews).toEqual([{ path: SETTINGS_PATH, before: '', after: merged() }]);
  });

  it('warns that the script will run on the machines of everyone who uses the project', async () => {
    const ctx = context({ confirm: true });
    await installHooks(ctx);
    const [confirmation] = ctx.ui.confirmations;
    expect(confirmation?.action).toBe('Install hooks');
    expect(confirmation?.detail).toContain(HOOK_SCRIPT_PATH);
    expect(confirmation?.detail).toContain(SETTINGS_PATH);
    expect(confirmation?.detail).toMatch(/will run this script on your machine/);
  });

  it('tells the user how to bind a chat to its lane', async () => {
    const ctx = context({ confirm: true });
    await installHooks(ctx);
    expect(ctx.ui.informed[0]).toContain('PLANMASTER_LANE=B claude');
  });

  it('keeps the other settings of the project', async () => {
    const files = new MemoryFiles({ [SETTINGS_PATH]: '{\n  "env": { "A": "1" }\n}\n' });
    const ctx = context({ confirm: true }, files);
    await installHooks(ctx);
    expect(JSON.parse(files.files.get(SETTINGS_PATH) ?? '{}')).toMatchObject({ env: { A: '1' }, hooks: { Stop: [expect.anything()] } });
  });

  it('does nothing when the hooks and the script are already current', async () => {
    const files = new MemoryFiles({ [SETTINGS_PATH]: merged(), [HOOK_SCRIPT_PATH]: HOOK_SCRIPT });
    const ctx = context({}, files);
    expect(await installHooks(ctx)).toBe('nothing');
    expect(ctx.ui.confirmations).toEqual([]);
    expect(files.writes).toEqual([]);
  });

  it('refreshes only the script when it is out of date', async () => {
    const files = new MemoryFiles({ [SETTINGS_PATH]: merged(), [HOOK_SCRIPT_PATH]: '// old\n' });
    const ctx = context({ confirm: true }, files);
    expect(await installHooks(ctx)).toBe('done');
    expect(ctx.ui.previews).toEqual([]);
    expect(files.writes).toEqual([HOOK_SCRIPT_PATH]);
  });

  it('refuses settings it cannot merge and writes nothing at all', async () => {
    const files = new MemoryFiles({ [SETTINGS_PATH]: '{ not json' });
    const ctx = context({ confirm: true }, files);
    expect(await installHooks(ctx)).toBe('refused');
    expect(ctx.ui.warned[0]).toMatch(/JSON/);
    expect(files.writes).toEqual([]);
    expect(files.files.get(SETTINGS_PATH)).toBe('{ not json');
  });

  it('writes nothing when the user declines', async () => {
    const ctx = context({ confirm: false });
    expect(await installHooks(ctx)).toBe('cancelled');
    expect(ctx.files.writes).toEqual([]);
  });
});
