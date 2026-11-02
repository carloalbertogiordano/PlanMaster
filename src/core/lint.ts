import { finding, sortFindings } from './findings.js';
import { ITEM_ID } from './parser.js';
import { MINUTE, formatDuration, parseTimestamp } from './time.js';
import { isClosed, type Config, type Finding, type Item, type LaneFile, type Marker, type Tokens } from './types.js';

export interface IndexedItem {
  item: Item;
  file: LaneFile;
}

export interface LintContext {
  /** Live lane files, in lane ID order. */
  lanes: LaneFile[];
  archives: LaneFile[];
  config: Config;
  now: number;
  index: Map<string, IndexedItem>;
}

/** Reports a finding on an item's line. */
type Emit = (code: string, item: Item, message: string) => void;
type ItemRule = (item: Item, file: LaneFile, context: LintContext, emit: Emit) => void;

const FUTURE_TOLERANCE = 5 * MINUTE;

/** Which tokens each marker does not allow (queue-format section 6.2). */
const DISALLOWED: Readonly<Record<Marker, readonly (keyof Tokens)[]>> = {
  ' ': ['wait', 'since', 'done'],
  '~': ['wait', 'done'],
  '!': ['done'],
  'x': ['wait', 'since'],
  '-': ['wait', 'since'],
};

const STATE_NAME: Readonly<Record<Marker, string>> = {
  ' ': 'to do',
  '~': 'in progress',
  '!': 'blocked',
  'x': 'done',
  '-': 'dropped',
};

/** Workspace-level rules. Parse-level rules (PM001, PM014, PM016, PM017, PM019, PM020) come from the parser. */
export function lint(context: LintContext): Finding[] {
  const findings: Finding[] = [];
  for (const file of [...context.lanes, ...context.archives]) {
    const emit = emitterFor(file, findings);
    for (const item of file.items) {
      for (const rule of ITEM_RULES) rule(item, file, context, emit);
    }
    checkHierarchy(file, emit);
    if (file.kind === 'lane') checkStale(file, context, emit);
  }
  return sortFindings(findings);
}

export function buildIndex(files: LaneFile[]): Map<string, IndexedItem> {
  const index = new Map<string, IndexedItem>();
  for (const file of files) {
    for (const item of file.items) {
      if (!index.has(item.id)) index.set(item.id, { item, file });
    }
  }
  return index;
}

function emitterFor(file: LaneFile, out: Finding[]): Emit {
  return (code, item, message) => {
    out.push(finding(code, { file: file.path, line: item.line }, message, { itemId: item.id }));
  };
}

/* ---------- item rules ---------- */

const ITEM_RULES: readonly ItemRule[] = [
  checkIdentity,
  checkRequiredTokens,
  checkWaitTarget,
  checkUnexpectedTokens,
  checkTimes,
];

function checkIdentity(item: Item, file: LaneFile, context: LintContext, emit: Emit): void {
  const prefix = item.id.slice(0, item.id.indexOf('-'));
  if (prefix !== file.lane) emit('PM003', item, `${item.id} does not carry the prefix of lane ${file.lane}`);

  const first = context.index.get(item.id);
  if (first && first.item !== item) {
    emit('PM002', item, `Duplicate ID ${item.id}, first used in ${first.file.path}:${first.item.line}`);
  }
}

function checkRequiredTokens(item: Item, _file: LaneFile, _context: LintContext, emit: Emit): void {
  const { marker, tokens } = item;
  const state = STATE_NAME[marker];
  if (marker === '!' && tokens.wait === undefined) emit('PM004', item, `${item.id} is blocked but has no wait: naming a person or an item ID`);
  if (isClosed(item) && tokens.done === undefined) emit('PM005', item, `${item.id} is ${state} but has no done:`);
  if ((marker === '~' || marker === '!') && tokens.since === undefined) emit('PM006', item, `${item.id} is ${state} but has no since:`);
}

function checkWaitTarget(item: Item, _file: LaneFile, context: LintContext, emit: Emit): void {
  const wait = item.tokens.wait;
  if (wait === undefined) return;

  if (!ITEM_ID.test(wait)) {
    if (!context.config.people.includes(wait)) {
      emit('PM007', item, `wait:${wait} on ${item.id} is neither a configured person nor an item ID`);
    }
    return;
  }
  const target = context.index.get(wait)?.item;
  if (!target) emit('PM007', item, `${item.id} waits on ${wait}, which does not exist`);
  else if (isClosed(target)) emit('PM018', item, `${item.id} waits on ${wait}, which is already ${STATE_NAME[target.marker]}; the block is probably resolved`);
}

function checkUnexpectedTokens(item: Item, _file: LaneFile, _context: LintContext, emit: Emit): void {
  const unexpected = DISALLOWED[item.marker].filter((key) => item.tokens[key] !== undefined);
  if (unexpected.length === 0) return;
  const names = unexpected.map((key) => `${key}:`).join(', ');
  emit('PM013', item, `${item.id} is ${STATE_NAME[item.marker]}, so ${names} should not be set`);
}

function checkTimes(item: Item, file: LaneFile, context: LintContext, emit: Emit): void {
  for (const key of ['since', 'done'] as const) {
    const value = item.tokens[key];
    const time = value === undefined ? null : parseTimestamp(value);
    if (time === null) continue;
    if (time > context.now + FUTURE_TOLERANCE) {
      emit('PM015', item, `${item.id}: ${key}:${value} is in the future`);
    } else if (file.mtimeMs !== undefined && time > file.mtimeMs + FUTURE_TOLERANCE) {
      emit('PM015', item, `${item.id}: ${key}:${value} is later than the last change to the file; was the time guessed?`);
    }
  }
}

/* ---------- hierarchy and staleness ---------- */

function checkHierarchy(file: LaneFile, emit: Emit): void {
  checkSingleFocus(file, emit);
  for (const parent of file.items) {
    checkSingleChildInProgress(parent, emit);
    checkParentState(parent, emit);
  }
}

function checkSingleFocus(file: LaneFile, emit: Emit): void {
  const doing = file.roots.filter((i) => i.marker === '~');
  const ids = doing.map((i) => i.id).join(', ');
  for (const item of doing.slice(1)) {
    emit('PM008', item, `Lane ${file.lane} has more than one top-level item in progress (${ids})`);
  }
}

function checkSingleChildInProgress(parent: Item, emit: Emit): void {
  const doing = parent.children.filter((c) => c.marker === '~');
  const ids = doing.map((c) => c.id).join(', ');
  for (const child of doing.slice(1)) {
    emit('PM009', child, `${parent.id} has more than one child in progress (${ids})`);
  }
}

function checkParentState(parent: Item, emit: Emit): void {
  if (isClosed(parent)) {
    const open = parent.children.find((c) => !isClosed(c));
    if (open) emit('PM010', parent, `${parent.id} is ${STATE_NAME[parent.marker]} but its child ${open.id} is still ${STATE_NAME[open.marker]}`);
  } else if (parent.marker === ' ') {
    const started = parent.children.find((c) => c.marker === '~');
    if (started) emit('PM011', parent, `${parent.id} is still to do but its child ${started.id} is in progress`);
  }
}

function checkStale(file: LaneFile, context: LintContext, emit: Emit): void {
  if (file.mtimeMs === undefined) return;
  const threshold = context.config.staleAfterMinutes * MINUTE;
  const idle = context.now - file.mtimeMs;
  if (idle <= threshold) return;

  for (const item of file.roots) {
    const since = item.marker === '~' && item.tokens.since !== undefined ? parseTimestamp(item.tokens.since) : null;
    if (since === null) continue;
    const age = context.now - since;
    if (age > threshold) {
      emit('PM012', item, `${item.id} has been in progress for ${formatDuration(age)} and the file has not changed for ${formatDuration(idle)}; it is probably stale`);
    }
  }
}
