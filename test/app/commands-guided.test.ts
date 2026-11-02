import { describe, expect, it } from 'vitest';
import { guidedSetup } from '../../src/app/commands/setup.js';
import type { CommandContext } from '../../src/app/commands/ports.js';
import { HOOK_SCRIPT_PATH, SETTINGS_PATH, mergeHookSettings } from '../../src/app/hook-settings.js';
import { laneFile, run } from '../helpers.js';
import { FakeUi, MemoryFiles, type Script } from '../support/fake-ui.js';
import { HOOK_SCRIPT, TEMPLATES } from '../support/templates.js';

function context(script: Script, files = new MemoryFiles(), analysis = undefined as CommandContext['analysis'], configError?: string): CommandContext & { ui: FakeUi; files: MemoryFiles } {
  const base = { ui: new FakeUi(script), files, templates: TEMPLATES, readHookScript: () => Promise.resolve(HOOK_SCRIPT), analysis };
  return configError === undefined ? base : { ...base, configError };
}

const merged = (): string => {
  const result = mergeHookSettings(undefined);
  if (result.kind === 'refuse') throw new Error(result.reason);
  return result.text;
};

const BLOCK = `${TEMPLATES.managedBlock}\n`;
const FORMAT = `${TEMPLATES.formatReference}\n`;

describe('guidedSetup on a project that has nothing yet', () => {
  it('prepares everything, then hands the user one message for Claude', async () => {
    const ctx = context({ picks: [0], offers: [undefined] });
    expect(await guidedSetup(ctx)).toBe('done');
    expect([...ctx.files.files.keys()].sort((a, b) => a.localeCompare(b))).toEqual(['.claude/settings.json', '.planmaster/config.json', '.planmaster/FORMAT.md', '.planmaster/hooks/planmaster-hook.cjs', 'CLAUDE.md']);
    expect(ctx.files.files.get('CLAUDE.md')).toBe(BLOCK);
    expect(ctx.files.files.get(SETTINGS_PATH)).toBe(merged());
    expect(ctx.ui.copied).toHaveLength(1);
    expect(ctx.ui.copied[0]).toContain('Current situation: PlanMaster is not set up in this project yet.');
    expect(ctx.ui.copied[0]).toContain('PHASE 1');
  });

  it('starts by explaining in plain words what will happen, and asks to begin', async () => {
    const ctx = context({ confirm: false });
    await guidedSetup(ctx);
    const [intro] = ctx.ui.confirmations;
    expect(intro?.action).toBe('Start');
    expect(intro?.detail).toContain('PlanMaster is not set up in this project yet.');
    expect(intro?.detail).toMatch(/paste one message into Claude/);
    expect(intro?.detail).toMatch(/asks you before writing anything/);
  });

  it('writes nothing if the user does not want to begin', async () => {
    const ctx = context({ confirm: false });
    expect(await guidedSetup(ctx)).toBe('cancelled');
    expect(ctx.files.writes).toEqual([]);
    expect(ctx.ui.copied).toEqual([]);
  });

  it('tells the user exactly what to do with the copied message', async () => {
    const ctx = context({ picks: [0], offers: [undefined] });
    await guidedSetup(ctx);
    expect(ctx.ui.offered[0]?.message).toMatch(/open a Claude chat in this project and paste it/);
    expect(ctx.ui.offered[0]?.actions).toEqual(['Copy again', 'Show the message']);
  });

  it('lets the user copy the message again or read it, until they are done', async () => {
    const ctx = context({ picks: [0], offers: ['Copy again', 'Show the message', 'Copy again', undefined] });
    await guidedSetup(ctx);
    expect(ctx.ui.copied).toHaveLength(3);
    expect(ctx.ui.texts).toHaveLength(1);
    expect(ctx.ui.texts[0]).toBe(ctx.ui.copied[0]);
    expect(ctx.ui.offered).toHaveLength(4);
  });
});

describe('guidedSetup: the files', () => {
  it('never overwrites the configuration that is already there', async () => {
    const files = new MemoryFiles({ '.planmaster/config.json': '{"people":["zed"]}' });
    const ctx = context({ picks: [1], offers: [undefined] }, files, run([]));
    await guidedSetup(ctx);
    expect(files.files.get('.planmaster/config.json')).toBe('{"people":["zed"]}');
    expect(files.files.get('.planmaster/FORMAT.md')).toBe(FORMAT);
  });

  it('adds to an existing CLAUDE.md without touching the rest, after showing the change', async () => {
    const files = new MemoryFiles({ 'CLAUDE.md': '# Mine\n\nKeep this.\n' });
    const ctx = context({ picks: [1], offers: [undefined] }, files);
    await guidedSetup(ctx);
    expect(files.files.get('CLAUDE.md')).toBe(`# Mine\n\nKeep this.\n\n${BLOCK}`);
    expect(ctx.ui.previews[0]?.path).toBe('CLAUDE.md');
  });

  it('stops, and says why, when CLAUDE.md has damaged markers', async () => {
    const files = new MemoryFiles({ 'CLAUDE.md': '<!-- planmaster:begin v1 -->\nno end\n' });
    const ctx = context({ picks: [0], offers: [undefined] }, files);
    expect(await guidedSetup(ctx)).toBe('refused');
    expect(ctx.ui.warned[0]).toMatch(/end marker/);
    expect(ctx.ui.copied).toEqual([]);
  });

  it('stops when the user declines the change to CLAUDE.md', async () => {
    const ctx = context({ confirms: [true, false], picks: [0] });
    expect(await guidedSetup(ctx)).toBe('cancelled');
    expect(ctx.files.files.has('CLAUDE.md')).toBe(false);
    expect(ctx.ui.copied).toEqual([]);
  });
});

describe('guidedSetup: the hooks', () => {
  it('asks in plain words and installs them on a yes', async () => {
    const ctx = context({ picks: [0], offers: [undefined] });
    await guidedSetup(ctx);
    const [list] = ctx.ui.pickLists;
    expect(list?.placeholder).toBe('Should PlanMaster check Claude’s work automatically?');
    expect(list?.items.map((i) => i.label)).toEqual(['Yes, check automatically (recommended)', 'No thanks']);
    expect(ctx.files.files.get(HOOK_SCRIPT_PATH)).toBe(HOOK_SCRIPT);
  });

  it('installs nothing on a no, and still goes on', async () => {
    const ctx = context({ picks: [1], offers: [undefined] });
    expect(await guidedSetup(ctx)).toBe('done');
    expect(ctx.files.files.has(HOOK_SCRIPT_PATH)).toBe(false);
    expect(ctx.files.files.has(SETTINGS_PATH)).toBe(false);
    expect(ctx.ui.copied).toHaveLength(1);
  });

  it('treats a dismissed question as a no', async () => {
    const ctx = context({ picks: [undefined], offers: [undefined] });
    expect(await guidedSetup(ctx)).toBe('done');
    expect(ctx.files.files.has(HOOK_SCRIPT_PATH)).toBe(false);
  });

  it('does not ask again when the hooks are already installed', async () => {
    const files = new MemoryFiles({ [SETTINGS_PATH]: merged(), [HOOK_SCRIPT_PATH]: HOOK_SCRIPT });
    const ctx = context({ offers: [undefined] }, files);
    await guidedSetup(ctx);
    expect(ctx.ui.pickLists).toEqual([]);
  });

  it('goes on when the hooks cannot be installed, and says so', async () => {
    const files = new MemoryFiles({ [SETTINGS_PATH]: '{ not json' });
    const ctx = context({ picks: [0], offers: [undefined] }, files);
    expect(await guidedSetup(ctx)).toBe('done');
    expect(ctx.ui.warned[0]).toMatch(/JSON/);
    expect(files.files.get(SETTINGS_PATH)).toBe('{ not json');
  });
});

describe('guidedSetup: what Claude is told about the project', () => {
  it('says the queue is empty when there are no items', async () => {
    const ctx = context({ picks: [1], offers: [undefined] }, new MemoryFiles({ [`.planmaster/config.json`]: '{}' }), run([]));
    await guidedSetup(ctx);
    expect(ctx.ui.copied[0]).toContain('Current situation: Your queue is empty.');
  });

  it('names what cannot be read', async () => {
    const analysis = run([{ path: '.planmaster/lanes/B.md', kind: 'lane', text: 'no front matter\n- [?] B-1 x\n' }]);
    const ctx = context({ picks: [1], offers: [undefined] }, new MemoryFiles(), analysis);
    await guidedSetup(ctx);
    expect(ctx.ui.copied[0]).toContain('Some queue files cannot be read.');
    expect(ctx.ui.copied[0]).toMatch(/- \.planmaster\/lanes\/B\.md:1 /);
  });

  it('reports an unreadable configuration', async () => {
    const ctx = context({ picks: [1], offers: [undefined] }, new MemoryFiles({ '.planmaster/config.json': '{ nope' }), undefined, 'config.json is not valid JSON: boom');
    await guidedSetup(ctx);
    expect(ctx.ui.copied[0]).toContain('config.json is not valid JSON: boom');
  });
});

describe('guidedSetup on a project that is already set up', () => {
  const healthy = (): { files: MemoryFiles; analysis: CommandContext['analysis'] } => ({
    files: new MemoryFiles({ 'CLAUDE.md': BLOCK, '.planmaster/FORMAT.md': FORMAT, '.planmaster/config.json': '{}' }),
    analysis: run([laneFile('A', '- [~] A-1 Work since:2026-11-02T11:40'), laneFile('B', '- [ ] B-1 Next')]),
  });

  it('says so and does nothing unless the user asks to run it again', async () => {
    const { files, analysis } = healthy();
    const ctx = context({ offers: [undefined] }, files, analysis);
    expect(await guidedSetup(ctx)).toBe('nothing');
    expect(ctx.ui.offered[0]?.message).toContain('already set up (2 lanes, 2 items)');
    expect(ctx.ui.offered[0]?.actions).toEqual(['Run it again']);
    expect(ctx.ui.copied).toEqual([]);
  });

  it('goes through the steps again when asked', async () => {
    const { files, analysis } = healthy();
    const ctx = context({ offers: ['Run it again', undefined], picks: [1] }, files, analysis);
    expect(await guidedSetup(ctx)).toBe('done');
    expect(ctx.ui.copied[0]).toContain('Current situation: PlanMaster is set up.');
    expect(ctx.ui.copied[0]).toContain('A: Test lane title');
  });
});
