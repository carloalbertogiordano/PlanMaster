import { configErrorHook, parseHookInput, postEditHook, sessionStartHook, stopHook, type HookInput } from '../app/hooks.js';
import { ConfigError, analyze, formatFinding, type Analysis, type WorkspaceInput } from '../core/index.js';
import { summaryLine } from './report.js';

/** Remembers, for each session and lane, the last request made by the stop hook. */
export interface AskedGuard {
  get(session: string, lane: string): string | undefined;
  set(session: string, lane: string, fingerprint: string): void;
}

export interface HookRunOptions {
  /** Which hook this is: `post-edit`, `stop` or `session-start`. */
  event: string;
  /** What Claude Code sent on standard input. */
  stdin: string;
  env: Readonly<Record<string, string | undefined>>;
  now: number;
  laneStartTemplate: string;
  /** The PlanMaster workspace that contains `cwd`, or null when there is none. */
  findRoot(cwd: string): string | null;
  /** Reads the workspace; throws ConfigError when config.json is invalid. */
  load(root: string): WorkspaceInput;
  guard: AskedGuard;
}

export interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

const SILENT: RunResult = { exitCode: 0, stdout: '', stderr: '' };
const CLAUDE_EVENTS: Readonly<Record<string, string>> = { 'post-edit': 'PostToolUse', stop: 'Stop', 'session-start': 'SessionStart' };

/**
 * Runs one hook. A hook must never get in the way of the session, so input
 * that is not for it, a project without PlanMaster and a workspace that
 * cannot be analysed all end quietly; only a real request to the assistant
 * is a non-zero exit, and only an unknown hook name is reported as an error.
 */
export function runHook(options: HookRunOptions): RunResult {
  const expected = CLAUDE_EVENTS[options.event];
  if (expected === undefined) {
    return { exitCode: 1, stdout: '', stderr: `Unknown hook "${options.event}": use post-edit, stop or session-start.\n` };
  }
  const input = parseInput(options.stdin);
  if (input?.event !== expected) return SILENT;
  const root = options.findRoot(input.cwd);
  if (root === null) return SILENT;

  const analysis = analyse((path) => options.load(path), options.now, root);
  if (analysis instanceof ConfigError) {
    return options.event === 'post-edit' ? configErrorHook(input, root, analysis.message) : SILENT;
  }
  return dispatch(options, input, root, analysis);
}

function parseInput(stdin: string): HookInput | null {
  try {
    return parseHookInput(JSON.parse(stdin));
  } catch {
    return null;
  }
}

function analyse(load: (root: string) => WorkspaceInput, now: number, root: string): Analysis | ConfigError {
  try {
    return analyze(load(root), now);
  } catch (error) {
    if (error instanceof ConfigError) return error;
    throw error;
  }
}

function dispatch(options: HookRunOptions, input: HookInput, root: string, analysis: Analysis): RunResult {
  const lane = laneFrom(options.env);
  switch (options.event) {
    case 'post-edit':
      return postEditHook(input, analysis, root);
    case 'session-start':
      return sessionStartHook(lane, analysis, options.laneStartTemplate);
    default:
      return stop(options, input, analysis, lane);
  }
}

/** The lane this chat is bound to through PLANMASTER_LANE, if any. */
function laneFrom(env: HookRunOptions['env']): string | undefined {
  const value = env.PLANMASTER_LANE?.trim();
  return value === undefined || value === '' ? undefined : value;
}

function stop(options: HookRunOptions, input: HookInput, analysis: Analysis, lane: string | undefined): RunResult {
  const asked = lane === undefined ? undefined : options.guard.get(input.sessionId, lane);
  const { result, fingerprint } = stopHook(input, analysis, lane, asked);
  if (lane !== undefined && fingerprint !== undefined) options.guard.set(input.sessionId, lane, fingerprint);
  return result;
}

export interface CheckOptions {
  /** The directory the command runs in. */
  cwd: string;
  now: number;
  findRoot(cwd: string): string | null;
  load(root: string): WorkspaceInput;
}

/**
 * `check`: for a person, or an assistant that was asked to verify its work.
 * Prints every finding and a summary on standard output; exit code 1 when
 * there is at least one error.
 */
export function runCheck(options: CheckOptions): RunResult {
  const root = options.findRoot(options.cwd);
  if (root === null) return { exitCode: 2, stdout: '', stderr: 'No .planmaster directory was found here or in any parent directory.\n' };

  const analysis = analyse((path) => options.load(path), options.now, root);
  if (analysis instanceof ConfigError) return { exitCode: 1, stdout: `${analysis.message}\n`, stderr: '' };

  const lines = [...analysis.findings.map(formatFinding), summaryLine(analysis)];
  return { exitCode: analysis.findings.some((f) => f.severity === 'error') ? 1 : 0, stdout: `${lines.join('\n')}\n`, stderr: '' };
}
