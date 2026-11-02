import { describe, expect, it } from 'vitest';
import type { CommandContext } from '../../src/app/commands/ports.js';
import { initWorkspace } from '../../src/app/commands/init.js';
import { installInstructions } from '../../src/app/commands/install.js';
import { parseConfig } from '../../src/core/index.js';
import { laneFile, run } from '../helpers.js';
import { FakeUi, MemoryFiles, type Script } from '../support/fake-ui.js';
import { HOOK_SCRIPT, TEMPLATES } from '../support/templates.js';

function context(script: Script, files = new MemoryFiles(), analysis = run([])): CommandContext & { ui: FakeUi; files: MemoryFiles } {
  return { ui: new FakeUi(script), files, templates: TEMPLATES, hookScript: HOOK_SCRIPT, analysis };
}

const FORMAT_FILE = `${TEMPLATES.formatReference}\n`;

describe('initWorkspace', () => {
  it('creates the config, the format reference and the first lane after confirmation', async () => {
    const ctx = context({ inputs: ['alice, bob', 'B', 'Automated checks'], confirm: true });
    expect(await initWorkspace(ctx)).toBe('done');
    expect(ctx.files.writes).toEqual(['.planmaster/config.json', '.planmaster/FORMAT.md', '.planmaster/lanes/B.md']);
    expect(parseConfig(ctx.files.files.get('.planmaster/config.json')).people).toEqual(['alice', 'bob']);
    expect(ctx.files.files.get('.planmaster/lanes/B.md')).toContain('title: Automated checks');
    expect(ctx.ui.informed[0]).toContain('Created');
  });

  it('tells the user what will be created before writing anything', async () => {
    const ctx = context({ inputs: ['', 'B', 'Automated checks'] });
    await initWorkspace(ctx);
    const [confirmation] = ctx.ui.confirmations;
    expect(confirmation?.action).toBe('Create');
    expect(confirmation?.detail).toContain('.planmaster/config.json');
    expect(confirmation?.detail).toContain('.planmaster/FORMAT.md');
    expect(confirmation?.detail).toContain('.planmaster/lanes/B.md');
  });

  it('skips the first lane when its ID is left empty', async () => {
    const ctx = context({ inputs: ['', ''] });
    expect(await initWorkspace(ctx)).toBe('done');
    expect(ctx.files.writes).toEqual(['.planmaster/config.json', '.planmaster/FORMAT.md']);
    expect(ctx.ui.inputs).toHaveLength(2);
  });

  it.each([
    ['the people', { inputs: [undefined] }],
    ['the lane ID', { inputs: ['', undefined] }],
    ['the lane title', { inputs: ['', 'B', undefined] }],
    ['the confirmation', { inputs: ['', 'B', 'Automated checks'], confirm: false }],
  ] as [string, Script][])('writes nothing when the user cancels at %s', async (_name, script) => {
    const ctx = context(script);
    expect(await initWorkspace(ctx)).toBe('cancelled');
    expect(ctx.files.writes).toEqual([]);
  });

  it('does nothing when the workspace is already set up', async () => {
    const files = new MemoryFiles({ '.planmaster/config.json': '{}', '.planmaster/FORMAT.md': 'x' });
    const ctx = context({ inputs: ['', ''] }, files);
    expect(await initWorkspace(ctx)).toBe('nothing');
    expect(ctx.ui.confirmations).toEqual([]);
    expect(ctx.ui.informed[0]).toContain('already set up');
    expect(ctx.files.writes).toEqual([]);
  });

  it('never overwrites an existing file and says that it left it alone', async () => {
    const files = new MemoryFiles({ '.planmaster/config.json': '{"people":["zed"]}' });
    const ctx = context({ inputs: ['alice', ''] }, files);
    await initWorkspace(ctx);
    expect(files.files.get('.planmaster/config.json')).toBe('{"people":["zed"]}');
    expect(ctx.ui.confirmations[0]?.detail).toContain('config.json already exists and is left unchanged');
  });

  it('does not recreate a lane file that exists, even if the lane is unknown to the analysis', async () => {
    const files = new MemoryFiles({ '.planmaster/lanes/B.md': 'precious' });
    const ctx = context({ inputs: ['', 'B', 'Automated checks'] }, files);
    await initWorkspace(ctx);
    expect(files.files.get('.planmaster/lanes/B.md')).toBe('precious');
  });

  it('asks questions that refuse bad answers', async () => {
    const analysis = run([laneFile('A', '- [ ] A-1 x')]);
    const ctx = context({ inputs: ['alice smith', 'A', 'ab'], confirm: false }, new MemoryFiles(), analysis);
    await initWorkspace(ctx);
    expect(ctx.ui.inputs.map((i) => i.validation)).toEqual([
      expect.stringContaining('alice smith'),
      expect.stringContaining('already exists'),
      expect.stringContaining('3 to 80'),
    ]);
  });
});

describe('installInstructions', () => {
  const block = TEMPLATES.managedBlock;

  it('creates CLAUDE.md and FORMAT.md after showing the change and asking', async () => {
    const ctx = context({ confirm: true });
    expect(await installInstructions(ctx)).toBe('done');
    expect(ctx.ui.previews).toEqual([{ path: 'CLAUDE.md', before: '', after: `${block}\n` }]);
    expect(ctx.ui.confirmations[0]?.detail).toContain('.planmaster/FORMAT.md');
    expect(ctx.files.files.get('CLAUDE.md')).toBe(`${block}\n`);
    expect(ctx.files.files.get('.planmaster/FORMAT.md')).toBe(FORMAT_FILE);
  });

  it('adds the block to an existing file without touching the rest', async () => {
    const files = new MemoryFiles({ 'CLAUDE.md': '# Mine\n\nKeep   this.\n' });
    const ctx = context({ confirm: true }, files);
    await installInstructions(ctx);
    expect(files.files.get('CLAUDE.md')).toBe(`# Mine\n\nKeep   this.\n\n${block}\n`);
  });

  it('replaces an older block in place', async () => {
    const old = '<!-- planmaster:begin v0 -->\nold\n<!-- planmaster:end -->';
    const files = new MemoryFiles({ 'CLAUDE.md': `Top\n\n${old}\n\nBottom\n`, '.planmaster/FORMAT.md': FORMAT_FILE });
    const ctx = context({ confirm: true }, files);
    expect(await installInstructions(ctx)).toBe('done');
    expect(files.files.get('CLAUDE.md')).toBe(`Top\n\n${block}\n\nBottom\n`);
    expect(files.writes).toEqual(['CLAUDE.md']);
  });

  it('does nothing when everything is up to date', async () => {
    const files = new MemoryFiles({ 'CLAUDE.md': `${block}\n`, '.planmaster/FORMAT.md': FORMAT_FILE });
    const ctx = context({}, files);
    expect(await installInstructions(ctx)).toBe('nothing');
    expect(ctx.ui.informed[0]).toContain('up to date');
    expect(ctx.ui.confirmations).toEqual([]);
    expect(files.writes).toEqual([]);
  });

  it('refreshes only FORMAT.md when CLAUDE.md is already current', async () => {
    const files = new MemoryFiles({ 'CLAUDE.md': `${block}\n`, '.planmaster/FORMAT.md': 'outdated' });
    const ctx = context({ confirm: true }, files);
    expect(await installInstructions(ctx)).toBe('done');
    expect(ctx.ui.previews).toEqual([]);
    expect(files.writes).toEqual(['.planmaster/FORMAT.md']);
    expect(files.files.get('.planmaster/FORMAT.md')).toBe(FORMAT_FILE);
  });

  it('refuses damaged markers and changes nothing', async () => {
    const files = new MemoryFiles({ 'CLAUDE.md': '<!-- planmaster:begin v1 -->\nno end\n' });
    const ctx = context({ confirm: true }, files);
    expect(await installInstructions(ctx)).toBe('refused');
    expect(ctx.ui.warned[0]).toMatch(/end marker/);
    expect(files.writes).toEqual([]);
  });

  it('writes nothing when the user declines', async () => {
    const ctx = context({ confirm: false });
    expect(await installInstructions(ctx)).toBe('cancelled');
    expect(ctx.files.writes).toEqual([]);
    expect(ctx.ui.previews).toHaveLength(1);
  });
});
