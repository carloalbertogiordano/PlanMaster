import { DEFAULT_CONFIG, LANE_ID } from '../core/index.js';

export interface InitAnswers {
  laneId?: string;
  laneTitle?: string;
  people?: readonly string[];
}

export interface PlannedFile {
  /** Workspace-relative path. */
  path: string;
  content: string;
}

const CONFIG_PATH = '.planmaster/config.json';
const FORMAT_PATH = '.planmaster/FORMAT.md';
const MIN_TITLE = 3;
const MAX_TITLE = 80;

/** An error message for an invalid lane ID, or undefined when it is fine. */
export function validateLaneId(value: string, existing: ReadonlySet<string> = new Set()): string | undefined {
  if (!LANE_ID.test(value)) return 'A lane ID is 1 to 4 uppercase letters or digits and starts with a letter.';
  return existing.has(value) ? `Lane ${value} already exists.` : undefined;
}

export function validateLaneTitle(value: string): string | undefined {
  const length = value.trim().length;
  return length >= MIN_TITLE && length <= MAX_TITLE ? undefined : `A lane title is ${MIN_TITLE} to ${MAX_TITLE} characters.`;
}

/** Splits "alice, bob" into person keys, dropping blanks and repeats. */
export function parsePeople(value: string): string[] {
  const names = value.split(',').map((name) => name.trim()).filter((name) => name !== '');
  return [...new Set(names)];
}

export function validatePeople(value: string): string | undefined {
  const bad = parsePeople(value).find((name) => /\s/.test(name));
  return bad === undefined ? undefined : `Names cannot contain spaces: "${bad}".`;
}

/**
 * The files `Initialize Workspace` would create. Files that already exist
 * are never planned, so nothing is ever overwritten.
 */
export function planInit(existing: ReadonlySet<string>, answers: InitAnswers, formatReference: string): PlannedFile[] {
  const people = answers.people ?? [];
  const problem = validatePeople(people.join(','));
  if (problem !== undefined) throw new Error(problem);
  const planned: PlannedFile[] = [
    { path: CONFIG_PATH, content: configText(people) },
    { path: FORMAT_PATH, content: `${formatReference}\n` },
  ];
  if (answers.laneId !== undefined) planned.push(laneFile(answers.laneId, answers.laneTitle));
  return planned.filter((file) => !existing.has(file.path));
}

function configText(people: readonly string[]): string {
  const { format, staleAfterMinutes, doneVisibleDays, archiveAfterDays } = DEFAULT_CONFIG;
  return `${JSON.stringify({ format, people, staleAfterMinutes, doneVisibleDays, archiveAfterDays }, null, 2)}\n`;
}

function laneFile(id: string, title: string | undefined): PlannedFile {
  const idProblem = validateLaneId(id);
  if (idProblem !== undefined) throw new Error(idProblem);
  if (title === undefined) throw new Error('A lane needs a title');
  const titleProblem = validateLaneTitle(title);
  if (titleProblem !== undefined) throw new Error(titleProblem);
  return { path: `.planmaster/lanes/${id}.md`, content: `---\nformat: 1\nlane: ${id}\ntitle: ${title.trim()}\n---\n\n` };
}
