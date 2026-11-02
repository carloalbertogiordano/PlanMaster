import { parsePeople, planInit, validateLaneId, validateLaneTitle, validatePeople, type InitAnswers, type PlannedFile } from '../scaffold.js';
import type { CommandContext, CommandStatus } from './ports.js';

const CONFIG_PATH = '.planmaster/config.json';

/** Creates `.planmaster/` with its configuration, the format reference and, optionally, the first lane. */
export async function initWorkspace(context: CommandContext): Promise<CommandStatus> {
  const { ui, files, templates } = context;
  const answers = await askAnswers(context);
  if (answers === null) return 'cancelled';

  const existing = await existingFiles(context, answers);
  let plan: PlannedFile[];
  try {
    plan = planInit(existing, answers, templates.formatReference);
  } catch (error) {
    ui.warn(error instanceof Error ? error.message : String(error));
    return 'refused';
  }
  if (plan.length === 0) {
    ui.inform('.planmaster is already set up; there is nothing to create.');
    return 'nothing';
  }

  const detail = [...plan.map((file) => `Create ${file.path}`), ...leftAlone(existing, answers)].join('\n');
  if (!(await ui.confirm(`Create ${plan.length} file${plan.length === 1 ? '' : 's'} in .planmaster?`, detail, 'Create'))) return 'cancelled';
  for (const file of plan) await files.write(file.path, file.content);
  ui.inform(`Created ${plan.map((file) => file.path).join(', ')}.`);
  return 'done';
}

async function askAnswers({ ui, analysis }: CommandContext): Promise<InitAnswers | null> {
  const people = await ui.input({ prompt: 'People who can be waited on, separated by commas (optional)', validate: validatePeople });
  if (people === undefined) return null;

  const knownLanes = new Set((analysis?.lanes ?? []).map((lane) => lane.lane));
  const laneId = await ui.input({
    prompt: 'ID of the first lane, for example A (leave empty to skip)',
    validate: (value) => (value === '' ? undefined : validateLaneId(value, knownLanes)),
  });
  if (laneId === undefined) return null;
  if (laneId === '') return { people: parsePeople(people) };

  const laneTitle = await ui.input({ prompt: `Title of lane ${laneId}`, validate: validateLaneTitle });
  return laneTitle === undefined ? null : { people: parsePeople(people), laneId, laneTitle };
}

async function existingFiles({ files }: CommandContext, answers: InitAnswers): Promise<Set<string>> {
  const candidates = [CONFIG_PATH, '.planmaster/FORMAT.md'];
  if (answers.laneId !== undefined) candidates.push(`.planmaster/lanes/${answers.laneId}.md`);
  const found = await Promise.all(candidates.map(async (path) => ((await files.read(path)) === undefined ? null : path)));
  return new Set(found.filter((path): path is string => path !== null));
}

/** Notes about answers that cannot be applied because the file is already there. */
function leftAlone(existing: ReadonlySet<string>, answers: InitAnswers): string[] {
  const notes: string[] = [];
  if (existing.has(CONFIG_PATH) && (answers.people?.length ?? 0) > 0) {
    notes.push('config.json already exists and is left unchanged; add the people there by hand.');
  }
  if (answers.laneId !== undefined && existing.has(`.planmaster/lanes/${answers.laneId}.md`)) {
    notes.push(`Lane ${answers.laneId} already exists and is left unchanged.`);
  }
  return notes;
}
