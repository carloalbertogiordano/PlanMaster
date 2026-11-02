import { describe, expect, it } from 'vitest';
import type { CommandContext } from '../../src/app/commands/ports.js';
import { copyArchivePrompt, copyLaneStartPrompt, copyMigrationPrompt, copyPlanToQueuePrompt, copyReconcilePrompt } from '../../src/app/commands/prompts.js';
import { revealItem } from '../../src/app/commands/reveal.js';
import { fillTemplate } from '../../src/app/prompts.js';
import { archiveFile, laneFile, run } from '../helpers.js';
import { FakeUi, MemoryFiles, type Script } from '../support/fake-ui.js';
import { TEMPLATES } from '../support/templates.js';

const CONFIG = JSON.stringify({ people: ['alice', 'bob'], doneVisibleDays: 5, archiveAfterDays: 21 });

function context(script: Script, files = [laneFile('A', '- [~] A-1 One since:2026-11-02T10:00'), laneFile('B', '- [ ] B-1 Two')]): CommandContext & { ui: FakeUi } {
  const analysis = run(files, undefined, CONFIG);
  return { ui: new FakeUi(script), files: new MemoryFiles(), templates: TEMPLATES, analysis };
}

describe('copyLaneStartPrompt', () => {
  it('offers the lanes and copies the start prompt for the chosen one', async () => {
    const ctx = context({ picks: [1] });
    expect(await copyLaneStartPrompt(ctx)).toBe('done');
    expect(ctx.ui.pickLists[0]?.items.map((i) => i.label)).toEqual(['A · Test lane title', 'B · Test lane title']);
    expect(ctx.ui.copied).toEqual([fillTemplate(TEMPLATES.laneStart, { LANE_ID: 'B', LANE_TITLE: 'Test lane title', PEOPLE: 'alice, bob' })]);
    expect(ctx.ui.copied[0]).toContain('You are lane B');
    expect(ctx.ui.informed[0]).toContain('copied');
  });

  it('copies nothing when the user cancels the choice', async () => {
    const ctx = context({ picks: [undefined] });
    expect(await copyLaneStartPrompt(ctx)).toBe('cancelled');
    expect(ctx.ui.copied).toEqual([]);
  });

  it('points to Initialize Workspace when there are no lanes', async () => {
    const ctx = context({}, []);
    expect(await copyLaneStartPrompt(ctx)).toBe('nothing');
    expect(ctx.ui.warned[0]).toContain('Initialize Workspace');
    expect(ctx.ui.copied).toEqual([]);
  });

  it('works when the folder could not be analysed', async () => {
    const ctx = { ...context({}), analysis: undefined };
    expect(await copyLaneStartPrompt(ctx)).toBe('nothing');
    expect(ctx.ui.warned).toHaveLength(1);
  });

  it('does not expand placeholders that appear in a lane title or a person key', async () => {
    const files = [{ ...laneFile('A', '- [ ] A-1 x'), text: '---\nformat: 1\nlane: A\ntitle: Uses {{PEOPLE}} and $& here\n---\n- [ ] A-1 x\n' }];
    const ctx = context({ picks: [0] }, files);
    await copyLaneStartPrompt(ctx);
    expect(ctx.ui.copied[0]).toContain('"Uses {{PEOPLE}} and $& here"');
  });
});

describe('copyMigrationPrompt', () => {
  it('asks for the source document and copies a prompt that names it, the lanes and the people', async () => {
    const ctx = context({ file: 'docs/TODO.md' });
    expect(await copyMigrationPrompt(ctx)).toBe('done');
    const text = ctx.ui.copied[0] ?? '';
    expect(text).toContain('Migrate the open work in docs/TODO.md');
    expect(text).toContain('A: Test lane title\nB: Test lane title');
    expect(text).toContain('Valid people for wait: alice, bob');
    expect(text).toContain('closed in the last 5 days');
  });

  it('copies nothing when no file is chosen', async () => {
    const ctx = context({ file: undefined });
    expect(await copyMigrationPrompt(ctx)).toBe('cancelled');
    expect(ctx.ui.copied).toEqual([]);
  });

  it('still works for a workspace with no lanes yet, with default settings', async () => {
    const ctx = { ...context({ file: 'TODO.md' }), analysis: undefined };
    expect(await copyMigrationPrompt(ctx)).toBe('done');
    expect(ctx.ui.copied[0]).toContain('(no lanes yet)');
    expect(ctx.ui.copied[0]).toContain('(none configured)');
    expect(ctx.ui.copied[0]).toContain('closed in the last 3 days');
  });
});

describe('copyPlanToQueuePrompt', () => {
  it('copies the prompt as it is', async () => {
    const ctx = context({});
    expect(await copyPlanToQueuePrompt(ctx)).toBe('done');
    expect(ctx.ui.copied).toEqual([TEMPLATES.planToQueue]);
  });
});

describe('copyReconcilePrompt and copyArchivePrompt', () => {
  it('copies the reconcile prompt for the chosen lane', async () => {
    const ctx = context({ picks: [0] });
    expect(await copyReconcilePrompt(ctx)).toBe('done');
    expect(ctx.ui.copied[0]).toContain('Reconcile the queue of lane A');
  });

  it('copies the archive prompt for the chosen lane with the configured age', async () => {
    const ctx = context({ picks: [1] });
    expect(await copyArchivePrompt(ctx)).toBe('done');
    expect(ctx.ui.copied[0]).toContain('Archive the old closed work of lane B');
    expect(ctx.ui.copied[0]).toContain('more than 21 days before now');
  });

  it('asks which lane for each, and does nothing when cancelled', async () => {
    for (const command of [copyReconcilePrompt, copyArchivePrompt]) {
      const ctx = context({ picks: [undefined] });
      expect(await command(ctx)).toBe('cancelled');
      expect(ctx.ui.copied).toEqual([]);
    }
  });
});

describe('revealItem', () => {
  const files = [laneFile('A', '- [~] A-1 First since:2026-11-02T10:00\n  - [ ] A-1a Child'), laneFile('B', '- [x] B-1 Done done:2026-11-02T09:00'), archiveFile('A', '- [x] A-9 Old done:2026-10-01T10:00')];

  it('lists every item of every lane with its lane and state, but not archived ones', async () => {
    const ctx = context({ picks: [undefined] }, files);
    await revealItem(ctx);
    expect(ctx.ui.pickLists[0]?.items.map((i) => [i.label, i.description, i.detail])).toEqual([
      ['A-1', 'lane A · in progress', 'First'],
      ['A-1a', 'lane A · to do', 'Child'],
      ['B-1', 'lane B · done', 'Done'],
    ]);
  });

  it('opens the chosen item at its line', async () => {
    const ctx = context({ picks: [1] }, files);
    expect(await revealItem(ctx)).toBe('done');
    expect(ctx.ui.shown).toEqual([{ path: '.planmaster/lanes/A.md', line: 8 }]);
  });

  it('opens nothing when the user cancels', async () => {
    const ctx = context({ picks: [undefined] }, files);
    expect(await revealItem(ctx)).toBe('cancelled');
    expect(ctx.ui.shown).toEqual([]);
  });

  it('says so when there is nothing to reveal', async () => {
    const ctx = context({}, []);
    expect(await revealItem(ctx)).toBe('nothing');
    expect(ctx.ui.warned[0]).toContain('No items');
  });
});
