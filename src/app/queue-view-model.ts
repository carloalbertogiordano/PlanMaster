import {
  ITEM_ID,
  blockedGroups,
  deriveEvents,
  formatClock,
  formatDayMonth,
  isClosed,
  isVisible,
  laneCounts,
  sameLocalDay,
  upNext,
  type Analysis,
  type BlockedGroup,
  type Item,
  type LaneFile,
  type QueueEvent,
} from '../core/index.js';
import { dependencyChip, rowOf, type Chip, type RowContext, type RowModel } from './rows.js';
import type { SetupAssessment, SetupReason } from './setup.js';

export interface LaneBlockModel {
  lane: string;
  title: string;
  closed: number;
  total: number;
  /** Whole percentages for the progress bar. */
  closedPercent: number;
  doingPercent: number;
  blockedCount: number;
  closedCount: number;
  /** True when no top-level item is in progress. */
  idle: boolean;
  /** Items in progress at the top level, with their subtrees. */
  focus: RowModel[];
  next: RowModel[];
  /** The whole tree in file order, without closed items older than doneVisibleDays. */
  all: RowModel[];
  hiddenClosed: number;
}

export interface BlockedRowModel extends RowModel {
  lane: string;
  /** For items that wait on another item: where that item stands. */
  dependency?: Chip;
}

export interface BlockedGroupModel {
  kind: BlockedGroup['kind'];
  title: string;
  rows: BlockedRowModel[];
}

export interface NewsEventModel {
  time: string;
  verb: QueueEvent['kind'];
  /** For example ", waiting on bob"; empty when there is nothing to add. */
  detail: string;
  row: RowModel & { lane: string };
}

/** What the get-started card says, in plain words. */
export interface SetupNotice {
  reason: SetupReason;
  headline: string;
  detail: string;
  problems: string[];
}

export interface QueueViewModel {
  folder: string;
  lanes: LaneBlockModel[];
  blocked: BlockedGroupModel[];
  blockedCount: number;
  news: { sinceLabel: string; events: NewsEventModel[] };
  /** Set instead of the content above when the folder cannot be analysed, for example a broken config.json. */
  error?: string;
  /** Set when the project needs the guided setup. */
  setup?: SetupNotice;
}

export interface BuildOptions {
  folder: string;
  /** Time of the last "mark as seen"; 0 when never. */
  lastSeen: number;
  /** What the guided setup found; shown as a card when it says setup is needed. */
  setup?: SetupAssessment;
}

function noticeOf({ reason, headline, detail, problems }: SetupAssessment): SetupNotice | undefined {
  return reason === null ? undefined : { reason, headline, detail, problems };
}

/** `model` with the get-started notice added, when the assessment says setup is needed. */
export function withSetup(model: QueueViewModel, assessment: SetupAssessment | undefined): QueueViewModel {
  const notice = assessment ? noticeOf(assessment) : undefined;
  return notice ? { ...model, setup: notice } : model;
}

/** What a folder without any PlanMaster files shows: only the invitation to set up. */
export function setupViewModel(folder: string, assessment: SetupAssessment): QueueViewModel {
  return withSetup({ folder, lanes: [], blocked: [], blockedCount: 0, news: { sinceLabel: '', events: [] } }, assessment);
}

/** What a folder shows when its queue cannot be analysed. */
export function errorViewModel(folder: string, message: string): QueueViewModel {
  return { folder, lanes: [], blocked: [], blockedCount: 0, news: { sinceLabel: '', events: [] }, error: message };
}

export function buildQueueViewModel(analysis: Analysis, options: BuildOptions): QueueViewModel {
  const context: RowContext = {
    now: analysis.now,
    staleIds: new Set(analysis.findings.filter((f) => f.code === 'PM012').map((f) => f.itemId ?? '')),
  };
  const blocked = blockedGroups(analysis).map((group) => blockedGroupModel(group, analysis, context));
  const notice = options.setup ? noticeOf(options.setup) : undefined;
  return {
    ...(notice ? { setup: notice } : {}),
    folder: options.folder,
    lanes: analysis.lanes.map((lane) => laneBlock(lane, analysis, context)),
    blocked,
    blockedCount: blocked.reduce((sum, group) => sum + group.rows.length, 0),
    news: {
      sinceLabel: sinceLabel(options.lastSeen, analysis.now),
      events: deriveEvents(analysis, options.lastSeen).map((event) => newsEvent(event, context)),
    },
  };
}

/* ---------- stack ---------- */

function laneBlock(lane: LaneFile, analysis: Analysis, context: RowContext): LaneBlockModel {
  const counts = laneCounts(lane);
  const days = analysis.config.doneVisibleDays;
  const focusItems = lane.roots.filter((item) => item.marker === '~');
  const all = flatten(lane.roots, context, days);
  return {
    lane: lane.lane,
    title: lane.frontMatter.title ?? '(untitled)',
    closed: counts.closed,
    total: counts.total,
    closedPercent: percent(counts.closed, counts.total),
    doingPercent: percent(counts.inProgress, counts.total),
    blockedCount: counts.blocked,
    closedCount: counts.closed,
    idle: focusItems.length === 0,
    focus: flatten(focusItems, context, days).rows,
    next: upNext(lane).map((item) => rowOf(item, context)),
    all: all.rows,
    hiddenClosed: all.hidden,
  };
}

function percent(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 100);
}

/** An old closed subtree is hidden only when nothing inside it is still open. */
function hideable(item: Item, context: RowContext, days: number): boolean {
  return isClosed(item) && !isVisible(item, context.now, days) && item.children.every((child) => hideable(child, context, days));
}

function flatten(items: Item[], context: RowContext, days: number): { rows: RowModel[]; hidden: number } {
  const result = { rows: [] as RowModel[], hidden: 0 };
  for (const item of items) {
    if (hideable(item, context, days)) {
      result.hidden += 1 + countDescendants(item);
      continue;
    }
    result.rows.push(rowOf(item, context));
    const inner = flatten(item.children, context, days);
    result.rows.push(...inner.rows);
    result.hidden += inner.hidden;
  }
  return result;
}

function countDescendants(item: Item): number {
  return item.children.reduce((sum, child) => sum + 1 + countDescendants(child), 0);
}

/* ---------- blocked ---------- */

const GROUP_TITLES = {
  item: 'Dependencies between items',
  missing: 'No reason given, needs fixing',
} as const;

function blockedGroupModel(group: BlockedGroup, analysis: Analysis, context: RowContext): BlockedGroupModel {
  return {
    kind: group.kind,
    title: group.kind === 'person' ? `Waiting on ${group.key}` : GROUP_TITLES[group.kind],
    rows: group.items.map((item) => blockedRow(item, analysis, context)),
  };
}

function blockedRow(item: Item, analysis: Analysis, context: RowContext): BlockedRowModel {
  const row: BlockedRowModel = { ...rowOf(item, context), lane: item.lane };
  const wait = item.tokens.wait;
  if (wait !== undefined && ITEM_ID.test(wait)) row.dependency = dependencyChip(analysis.index.get(wait)?.item, wait);
  return row;
}

/* ---------- what's new ---------- */

function newsEvent(event: QueueEvent, context: RowContext): NewsEventModel {
  return {
    time: eventTime(event.time, context.now),
    verb: event.kind,
    detail: waitDetail(event.waitingOn),
    row: { ...rowOf(event.item, context), lane: event.item.lane },
  };
}

function waitDetail(wait: string | undefined): string {
  if (wait === undefined) return '';
  return `, ${ITEM_ID.test(wait) ? 'after' : 'waiting on'} ${wait}`;
}

function eventTime(time: number, now: number): string {
  return sameLocalDay(time, now) ? formatClock(time) : `${formatDayMonth(time)} ${formatClock(time)}`;
}

function sinceLabel(lastSeen: number, now: number): string {
  return lastSeen <= 0 ? 'the beginning' : eventTime(lastSeen, now);
}
