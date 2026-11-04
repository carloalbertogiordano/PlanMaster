import { LANE_ID, formatFinding, type Analysis, type Finding } from '../core/index.js';
import { classifyPath, trimTrailingSlashes } from './paths.js';
import { fillTemplate, peopleText } from './prompts.js';

/** What a Claude Code hook receives on standard input, reduced to what PlanMaster uses. */
export interface HookInput {
  event: string;
  cwd: string;
  sessionId: string;
  /** Absolute path of the file a tool just changed, when there is one. */
  filePath: string | undefined;
  /** True when the assistant is already continuing because an earlier Stop hook asked it to. */
  stopHookActive: boolean;
}

/** What a hook prints and which code it exits with. Exit code 2 sends stderr to the assistant. */
export interface HookResult {
  exitCode: 0 | 2;
  stdout: string;
  stderr: string;
}

const SILENT: HookResult = { exitCode: 0, stdout: '', stderr: '' };
const MAX_LISTED = 20;
/** Warnings that the stop hook asks about as it does about errors: a stale item, and a tag that config.json does not declare. */
const ASKED_ABOUT: ReadonlySet<string> = new Set(['PM012', 'PM022']);

type Fields = Record<string, unknown>;

const isFields = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value);

export function parseHookInput(raw: unknown): HookInput | null {
  if (!isFields(raw)) return null;
  const { hook_event_name: event, cwd, session_id: sessionId, tool_input: toolInput, stop_hook_active: active } = raw;
  if (typeof event !== 'string' || typeof cwd !== 'string' || cwd === '') return null;
  const filePath = isFields(toolInput) && typeof toolInput.file_path === 'string' ? toolInput.file_path : undefined;
  return { event, cwd, sessionId: typeof sessionId === 'string' ? sessionId : '', filePath, stopHookActive: active === true };
}

/** The path of `absolute` relative to `root` with forward slashes, or null when it is not strictly inside it. */
export function workspacePathOf(root: string, absolute: string): string | null {
  const base = trimTrailingSlashes(root.replace(/\\/g, '/'));
  const target = absolute.replace(/\\/g, '/');
  if (!target.startsWith(`${base}/`)) return null;
  const relative = target.slice(base.length + 1);
  return relative.split('/').includes('..') ? null : relative;
}

/** After the assistant changes a lane file: if it now has errors, say so, so they are fixed in the same turn. */
export function postEditHook(input: HookInput, analysis: Analysis, root: string): HookResult {
  const path = input.filePath === undefined ? null : workspacePathOf(root, input.filePath);
  if (path === null || classifyPath(path, analysis.config.lanesDir) === null) return SILENT;

  const errors = analysis.findings.filter((f) => f.file === path && f.severity === 'error');
  if (errors.length === 0) return SILENT;
  return blocking(`PlanMaster found problems in ${path}. Fix them by editing only the lines named below, then continue.`, errors, 'The format is described in .planmaster/FORMAT.md.');
}

/** When config.json itself was just changed and is now unreadable. */
export function configErrorHook(input: HookInput, root: string, message: string): HookResult {
  const path = input.filePath === undefined ? null : workspacePathOf(root, input.filePath);
  if (path !== '.planmaster/config.json') return SILENT;
  return { exitCode: 2, stdout: '', stderr: `PlanMaster cannot read .planmaster/config.json: ${message}\nFix the file so that it is valid JSON with the documented keys.\n` };
}

/**
 * When the assistant is about to stop: ask it to bring the lane's queue up
 * to date if the file has errors, a tag is not declared, or the item in
 * progress has not been touched for hours. The same request is made only
 * once per session.
 */
export function stopHook(input: HookInput, analysis: Analysis, lane: string | undefined, alreadyAsked: string | undefined): { result: HookResult; fingerprint?: string } {
  if (lane === undefined || input.stopHookActive) return { result: SILENT };
  const file = analysis.lanes.find((candidate) => candidate.lane === lane);
  if (!file) return { result: SILENT };

  const problems = analysis.findings.filter((f) => f.file === file.path && (f.severity === 'error' || ASKED_ABOUT.has(f.code)));
  if (problems.length === 0) return { result: SILENT };
  const fingerprint = fingerprintOf(problems);
  if (fingerprint === alreadyAsked) return { result: SILENT };

  const closing = `Update ${file.path} to match the real state of the work (finished items [x] with done:, blocked ones [!] with wait:), then finish.`;
  return { result: blocking(`Before you stop: the queue of lane ${lane} needs attention.`, problems, closing), fingerprint };
}

/** At the start of a chat bound to a lane (through PLANMASTER_LANE): tells it which lane it is. */
export function sessionStartHook(lane: string | undefined, analysis: Analysis, laneStartTemplate: string): HookResult {
  if (lane === undefined) return SILENT;
  const intro = `PlanMaster: PLANMASTER_LANE is set to ${lane}, so this chat works on lane ${lane}.`;
  if (!LANE_ID.test(lane)) return say(`${intro} That is not a valid lane ID: use 1 to 4 uppercase letters or digits.`);

  const file = analysis.lanes.find((candidate) => candidate.lane === lane);
  if (!file) return say(`${intro} The file .planmaster/lanes/${lane}.md does not exist yet; it can be created with the PlanMaster command Initialize Workspace.`);

  const prompt = fillTemplate(laneStartTemplate, {
    LANE_ID: lane,
    LANE_TITLE: file.frontMatter.title ?? '',
    PEOPLE: peopleText(analysis.config.people),
  });
  return say(`${intro}\n\n${prompt}`);
}

function say(text: string): HookResult {
  return { exitCode: 0, stdout: `${text}\n`, stderr: '' };
}

function blocking(heading: string, findings: Finding[], closing: string): HookResult {
  const listed = findings.slice(0, MAX_LISTED).map(formatFinding);
  const more = findings.length > MAX_LISTED ? [`and ${findings.length - MAX_LISTED} more`] : [];
  return { exitCode: 2, stdout: '', stderr: `${[heading, ...listed, ...more, closing].join('\n')}\n` };
}

function fingerprintOf(findings: Finding[]): string {
  const parts = findings.map((f) => {
    const where = f.itemId ?? `line${f.line}`;
    return `${f.code}:${where}`;
  });
  return [...new Set(parts)].sort((a, b) => a.localeCompare(b)).join(',');
}
