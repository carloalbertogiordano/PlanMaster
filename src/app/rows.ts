import { ITEM_ID, formatClock, formatDayMonth, formatDuration, parseTimestamp, sameLocalDay, type Item, type Marker } from '../core/index.js';

export type RowState = 'todo' | 'doing' | 'blocked' | 'done' | 'dropped';
export type ChipKind = 'plain' | 'doing' | 'block' | 'done' | 'error' | 'stale';

export interface Chip {
  kind: ChipKind;
  text: string;
}

/** One item as the queue view shows it. Plain data: text is as written in the file, never escaped. */
export interface RowModel {
  id: string;
  /** Workspace-relative path of the file and 1-based line, to reveal the item. */
  path: string;
  line: number;
  depth: number;
  state: RowState;
  /** The state in words, for assistive technology. */
  stateLabel: string;
  title: string;
  chips: Chip[];
}

export interface RowContext {
  now: number;
  /** IDs of items reported as stale. */
  staleIds: ReadonlySet<string>;
}

const STATES: Readonly<Record<Marker, { state: RowState; label: string }>> = {
  ' ': { state: 'todo', label: 'to do' },
  '~': { state: 'doing', label: 'in progress' },
  '!': { state: 'blocked', label: 'blocked' },
  'x': { state: 'done', label: 'done' },
  '-': { state: 'dropped', label: 'dropped' },
};

/** The state of a marker in words: "to do", "in progress", "blocked", "done" or "dropped". */
export function stateLabelOf(marker: Marker): string {
  return STATES[marker].label;
}

export function rowOf(item: Item, context: RowContext): RowModel {
  const { state, label } = STATES[item.marker];
  return {
    id: item.id,
    path: item.file,
    line: item.line,
    depth: item.depth,
    state,
    stateLabel: label,
    title: item.title,
    chips: [...stateChips(item, context), ...referenceChips(item)],
  };
}

function stateChips(item: Item, context: RowContext): Chip[] {
  switch (item.marker) {
    case '~':
      return doingChips(item, context);
    case '!':
      return blockedChips(item, context.now);
    case 'x':
    case '-':
      return closedChips(item, context.now);
    case ' ':
      return [];
  }
}

function doingChips(item: Item, { now, staleIds }: RowContext): Chip[] {
  const chips = [sinceChip(item, now, 'doing')];
  if (staleIds.has(item.id)) chips.push({ kind: 'stale', text: 'stale' });
  return chips.filter((chip): chip is Chip => chip !== null);
}

function blockedChips(item: Item, now: number): Chip[] {
  const wait = item.tokens.wait;
  const reason: Chip =
    wait === undefined ? { kind: 'error', text: 'missing wait:' }
    : { kind: 'block', text: `${ITEM_ID.test(wait) ? 'after' : 'waiting on'} ${wait}` };
  return [reason, sinceChip(item, now, 'plain')].filter((chip): chip is Chip => chip !== null);
}

/** "for 28 min", an error chip when `since:` is missing, nothing when it is present but invalid. */
function sinceChip(item: Item, now: number, kind: ChipKind): Chip | null {
  const since = item.tokens.since;
  if (since === undefined) return { kind: 'error', text: 'missing since:' };
  const time = parseTimestamp(since);
  return time === null ? null : { kind, text: `for ${formatDuration(now - time)}` };
}

function closedChips(item: Item, now: number): Chip[] {
  const done = item.tokens.done === undefined ? null : parseTimestamp(item.tokens.done);
  if (done === null) return [];
  const when = sameLocalDay(done, now) ? `at ${formatClock(done)}` : formatDayMonth(done);
  return [{ kind: 'done', text: item.marker === '-' ? `dropped ${when}` : when }];
}

function referenceChips(item: Item): Chip[] {
  return (item.tokens.ref ?? '').split(',').filter((ref) => ref !== '').map((ref) => ({ kind: 'plain', text: ref }));
}

/** The state of the item that a dependency waits on, as a chip. */
export function dependencyChip(target: Item | undefined, id: string): Chip {
  if (!target) return { kind: 'error', text: `${id} not found` };
  switch (target.marker) {
    case '~':
      return { kind: 'doing', text: `${id} in progress` };
    case ' ':
      return { kind: 'block', text: `${id} not started` };
    case '!':
      return { kind: 'block', text: `${id} blocked` };
    case 'x':
    case '-':
      return { kind: 'done', text: `${id} ${STATES[target.marker].label}` };
  }
}
