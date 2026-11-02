import { DEFAULT_CONFIG, type Config, type LaneFile } from '../../core/index.js';
import { fillTemplate, lanesText, peopleText } from '../prompts.js';
import type { CommandContext, CommandStatus } from './ports.js';

function configOf(context: CommandContext): Config {
  return context.analysis?.config ?? DEFAULT_CONFIG;
}

/** Puts the text on the clipboard and says so. Nothing is sent anywhere. */
async function deliver({ ui }: CommandContext, name: string, text: string): Promise<CommandStatus> {
  await ui.copy(text);
  ui.inform(`${name} copied. Paste it into the chat.`);
  return 'done';
}

/** Asks which lane, then copies the prompt built for it. */
async function forChosenLane(context: CommandContext, name: string, build: (lane: LaneFile, config: Config) => string): Promise<CommandStatus> {
  const lanes = context.analysis?.lanes ?? [];
  if (lanes.length === 0) {
    context.ui.warn('There are no lanes yet. Run "PlanMaster: Initialize Workspace" first.');
    return 'nothing';
  }
  const items = lanes.map((lane) => ({ label: `${lane.lane} · ${lane.frontMatter.title ?? '(untitled)'}`, value: lane }));
  const lane = await context.ui.pick(items, 'Choose a lane');
  if (lane === undefined) return 'cancelled';
  return deliver(context, name, build(lane, configOf(context)));
}

export function copyLaneStartPrompt(context: CommandContext): Promise<CommandStatus> {
  return forChosenLane(context, 'Lane start prompt', (lane, config) => fillTemplate(context.templates.laneStart, {
    LANE_ID: lane.lane,
    LANE_TITLE: lane.frontMatter.title ?? '',
    PEOPLE: peopleText(config.people),
  }));
}

export function copyReconcilePrompt(context: CommandContext): Promise<CommandStatus> {
  return forChosenLane(context, 'Reconcile prompt', (lane) => fillTemplate(context.templates.reconcile, { LANE_ID: lane.lane }));
}

export function copyArchivePrompt(context: CommandContext): Promise<CommandStatus> {
  return forChosenLane(context, 'Archive prompt', (lane, config) => fillTemplate(context.templates.archive, {
    LANE_ID: lane.lane,
    ARCHIVE_AFTER_DAYS: String(config.archiveAfterDays),
  }));
}

export async function copyMigrationPrompt(context: CommandContext): Promise<CommandStatus> {
  const source = await context.ui.chooseFile('Select the to-do document to migrate');
  if (source === undefined) return 'cancelled';
  const config = configOf(context);
  const text = fillTemplate(context.templates.migrate, {
    SOURCE_FILE: source,
    LANES: context.analysis ? lanesText(context.analysis) : '(no lanes yet)',
    PEOPLE: peopleText(config.people),
    DONE_WINDOW_DAYS: String(config.doneVisibleDays),
  });
  return deliver(context, 'Migration prompt', text);
}

export function copyPlanToQueuePrompt(context: CommandContext): Promise<CommandStatus> {
  return deliver(context, 'Plan-to-queue prompt', context.templates.planToQueue);
}
