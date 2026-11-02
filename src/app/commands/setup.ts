import { HOOK_SCRIPT_PATH, SETTINGS_PATH, mergeHookSettings } from '../hook-settings.js';
import { planInit } from '../scaffold.js';
import { assessSetup, type SetupAssessment } from '../setup.js';
import { buildSetupPrompt } from '../setup-prompt.js';
import { installHooks } from './hooks.js';
import { installInstructions } from './install.js';
import type { CommandContext, CommandStatus } from './ports.js';

const CONFIG_PATH = '.planmaster/config.json';
const FORMAT_PATH = '.planmaster/FORMAT.md';

const AGAIN = 'Run it again';
const COPY_AGAIN = 'Copy again';
const SHOW_MESSAGE = 'Show the message';

/**
 * The guided setup. The mechanical parts are done here, each shown and
 * confirmed where it changes something of the user's; the part that needs
 * judgment, finding and organising the old to-do lists, is handed to Claude
 * as one message to paste.
 */
export async function guidedSetup(context: CommandContext): Promise<CommandStatus> {
  const assessment = await assess(context);
  if (!assessment.needsSetup && !(await wantsAnotherRun(context))) return 'nothing';
  if (!(await introduce(context, assessment))) return 'cancelled';

  await createBasics(context);
  const instructions = await installInstructions(context);
  if (instructions === 'refused' || instructions === 'cancelled') return instructions;

  await offerHooks(context);
  await handOver(context, buildSetupPrompt(context.templates.setup, assessment, context.analysis));
  return 'done';
}

async function assess({ files, analysis, configError }: CommandContext): Promise<SetupAssessment> {
  const hasWorkspaceDir = analysis !== undefined || (await files.read(CONFIG_PATH)) !== undefined;
  const claudeMd = await files.read('CLAUDE.md');
  return assessSetup({ hasWorkspaceDir, analysis, claudeMd, ...(configError === undefined ? {} : { configError }) });
}

async function wantsAnotherRun({ ui, analysis }: CommandContext): Promise<boolean> {
  const lanes = analysis?.lanes ?? [];
  const items = lanes.reduce((count, lane) => count + lane.items.length, 0);
  const summary = `${lanes.length} lane${lanes.length === 1 ? '' : 's'}, ${items} item${items === 1 ? '' : 's'}`;
  return (await ui.offer(`PlanMaster is already set up (${summary}). Run the guided setup again?`, [AGAIN])) === AGAIN;
}

async function introduce({ ui }: CommandContext, assessment: SetupAssessment): Promise<boolean> {
  const detail = [
    assessment.headline,
    assessment.detail,
    '',
    'What happens:',
    '1. PlanMaster creates a few small files in a .planmaster folder (it never overwrites anything).',
    '2. PlanMaster adds a short note to this project, so that every Claude chat knows how to use the queue. You see the change first.',
    '3. You choose whether PlanMaster should check Claude’s work automatically.',
    '4. You paste one message into Claude. Claude finds your old to-do lists, proposes how to organise them, and asks you before writing anything.',
  ].join('\n');
  return ui.confirm('Set up PlanMaster', detail, 'Start');
}

/** The configuration and the format reference: new files only, an existing one is never touched. */
async function createBasics({ files, templates }: CommandContext): Promise<void> {
  const found = await Promise.all([CONFIG_PATH, FORMAT_PATH].map(async (path) => ((await files.read(path)) === undefined ? null : path)));
  const existing = new Set(found.filter((path): path is string => path !== null));
  for (const file of planInit(existing, {}, templates.formatReference)) await files.write(file.path, file.content);
}

async function offerHooks(context: CommandContext): Promise<void> {
  if (await hooksAreCurrent(context)) return;
  const wanted = await context.ui.pick(
    [
      { label: 'Yes, check automatically (recommended)', description: 'Claude is told at once if it breaks the queue, and reminded to update it. Adds a small script to this project.', value: true },
      { label: 'No thanks', description: 'You can turn this on later by running the setup again.', value: false },
    ],
    'Should PlanMaster check Claude’s work automatically?',
  );
  if (wanted === true) await installHooks(context);
}

async function hooksAreCurrent({ files, readHookScript }: CommandContext): Promise<boolean> {
  const settings = mergeHookSettings(await files.read(SETTINGS_PATH));
  return settings.kind === 'unchanged' && (await files.read(HOOK_SCRIPT_PATH)) === (await readHookScript());
}

/** Copies the message and keeps it available until the user says they are done. */
async function handOver({ ui }: CommandContext, message: string): Promise<void> {
  await ui.copy(message);
  const instruction = 'Everything is ready and the message for Claude is copied: open a Claude chat in this project and paste it (Ctrl+V). Claude will look for your old to-do lists and ask you before writing anything.';
  for (let choice = await ui.offer(instruction, [COPY_AGAIN, SHOW_MESSAGE]); choice !== undefined; choice = await ui.offer(instruction, [COPY_AGAIN, SHOW_MESSAGE])) {
    if (choice === COPY_AGAIN) await ui.copy(message);
    else await ui.showText(message);
  }
}
