import type { Analysis } from '../core/index.js';

export type SetupReason = 'missing' | 'unparsable' | 'empty' | 'instructions';

export interface SetupAssessment {
  needsSetup: boolean;
  reason: SetupReason | null;
  /** One plain sentence for the user. */
  headline: string;
  /** Two plain sentences on what happens next. */
  detail: string;
  /** What exactly cannot be read, at most five lines. */
  problems: string[];
}

export interface SetupInput {
  /** Whether the project has a `.planmaster` directory. */
  hasWorkspaceDir: boolean;
  analysis: Analysis | undefined;
  /** The text of the project's CLAUDE.md, if it has one. */
  claudeMd: string | undefined;
  /** Set when config.json cannot be read. */
  configError?: string;
}

/** Findings that mean a file could not be understood, as opposed to a mistake in what it says. */
const UNREADABLE_CODES = new Set(['PM001', 'PM014', 'PM017', 'PM019', 'PM021']);
const MAX_PROBLEMS = 5;

const TEXTS: Readonly<Record<SetupReason, { headline: string; detail: string }>> = {
  missing: {
    headline: 'PlanMaster is not set up in this project yet.',
    detail: 'Setup takes about two minutes. PlanMaster prepares the files, and Claude finds your old to-do lists and turns them into the queue. Nothing is changed without showing you first.',
  },
  unparsable: {
    headline: 'Some queue files cannot be read.',
    detail: 'Claude can repair them without losing anything, and it asks you before writing.',
  },
  empty: {
    headline: 'Your queue is empty.',
    detail: 'Let Claude find your old to-do lists and turn them into the queue. You approve every step.',
  },
  instructions: {
    headline: 'Claude does not know about the queue yet.',
    detail: 'One step adds the instructions to this project, so that every Claude chat knows how to keep the queue up to date.',
  },
};

/** Works out whether the project needs the guided setup, and says why in plain words. */
export function assessSetup(input: SetupInput): SetupAssessment {
  const found = firstProblem(input);
  if (found === null) return { needsSetup: false, reason: null, headline: 'PlanMaster is set up.', detail: '', problems: [] };
  return { needsSetup: true, reason: found.reason, ...TEXTS[found.reason], problems: found.problems };
}

function firstProblem(input: SetupInput): { reason: SetupReason; problems: string[] } | null {
  if (!input.hasWorkspaceDir) return { reason: 'missing', problems: [] };
  if (input.configError !== undefined) return { reason: 'unparsable', problems: [input.configError] };

  const unreadable = unreadableProblems(input.analysis);
  if (unreadable.length > 0) return { reason: 'unparsable', problems: unreadable.slice(0, MAX_PROBLEMS) };
  if (input.analysis?.lanes.every((lane) => lane.items.length === 0) ?? true) return { reason: 'empty', problems: [] };
  return hasInstructions(input.claudeMd) ? null : { reason: 'instructions', problems: [] };
}

function unreadableProblems(analysis: Analysis | undefined): string[] {
  return (analysis?.findings ?? [])
    .filter((f) => f.severity === 'error' && UNREADABLE_CODES.has(f.code))
    .map((f) => `${f.file}:${f.line} ${f.message}`);
}

function hasInstructions(claudeMd: string | undefined): boolean {
  return claudeMd !== undefined && /<!-- planmaster:begin v\d+ -->/.test(claudeMd) && claudeMd.includes('<!-- planmaster:end -->');
}

export interface OfferContext {
  /** The user chose "do not ask again" for this project. */
  dismissedForever: boolean;
  /** Already offered in this session (the user chose "not now"). */
  offeredThisSession: boolean;
  /** The project has a CLAUDE.md or a .claude directory. */
  looksLikeClaudeProject: boolean;
}

/**
 * Whether to tell the user that setup would help. A project that has
 * nothing of PlanMaster yet is only mentioned if it already looks like a
 * Claude project, so that unrelated projects are never nagged.
 */
export function shouldOfferSetup(assessment: SetupAssessment, context: OfferContext): boolean {
  if (!assessment.needsSetup || context.dismissedForever || context.offeredThisSession) return false;
  return assessment.reason !== 'missing' || context.looksLikeClaudeProject;
}
