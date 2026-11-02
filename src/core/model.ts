import { parseConfig } from './config.js';
import { finding, sortFindings } from './findings.js';
import { buildIndex, lint, type IndexedItem } from './lint.js';
import { ITEM_ID, parseLaneFile } from './parser.js';
import { DAY, parseTimestamp } from './time.js';
import { isClosed, type Config, type Finding, type Item, type LaneFile, type WorkspaceInput } from './types.js';

export interface Analysis {
  config: Config;
  lanes: LaneFile[];
  archives: LaneFile[];
  index: Map<string, IndexedItem>;
  findings: Finding[];
  now: number;
}

/**
 * Parses and lints a whole workspace. Pure: all file contents, modification
 * times and the current time come from the caller.
 * Throws ConfigError when config.json is present but invalid.
 */
export function analyze(input: WorkspaceInput, now: number): Analysis {
  const config = parseConfig(input.configText);
  const findings: Finding[] = [];
  const lanes: LaneFile[] = [];
  const archives: LaneFile[] = [];

  for (const source of input.files) {
    const result = parseLaneFile(source);
    findings.push(...result.findings);
    (source.kind === 'lane' ? lanes : archives).push(result.file);
  }
  for (const file of input.unreadable ?? []) {
    findings.push(finding('PM021', file.path, 1, `File could not be read: ${file.reason}`));
  }

  const byLane = (a: LaneFile, b: LaneFile): number => a.lane.localeCompare(b.lane);
  lanes.sort(byLane);
  archives.sort(byLane);

  const index = buildIndex([...lanes, ...archives]);
  findings.push(...lint({ lanes, archives, config, now, index }));
  return { config, lanes, archives, index, findings: sortFindings(findings), now };
}

export interface Counts {
  total: number;
  closed: number;
  open: number;
  blocked: number;
  inProgress: number;
}

export function laneCounts(file: LaneFile): Counts {
  const counts: Counts = { total: 0, closed: 0, open: 0, blocked: 0, inProgress: 0 };
  for (const item of file.items) {
    counts.total++;
    if (isClosed(item)) counts.closed++;
    else counts.open++;
    if (item.marker === '!') counts.blocked++;
    if (item.marker === '~') counts.inProgress++;
  }
  return counts;
}

/** The lane's focus: its first top-level item in progress. */
export function laneFocus(file: LaneFile): Item | null {
  return file.roots.find((i) => i.marker === '~') ?? null;
}

/** The deepest item in progress along the focus chain. */
export function currentStep(focus: Item): Item {
  let step = focus;
  for (;;) {
    const next = step.children.find((c) => c.marker === '~');
    if (!next) return step;
    step = next;
  }
}

export function upNext(file: LaneFile, count = 2): Item[] {
  return file.roots.filter((i) => i.marker === ' ').slice(0, count);
}

export type BlockedGroupKind = 'person' | 'item' | 'missing';

export interface BlockedGroup {
  kind: BlockedGroupKind;
  /** Person key for person groups, empty otherwise. */
  key: string;
  items: Item[];
}

/**
 * Blocked items grouped as in the Blocked tab: configured people in config
 * order, other wait values alphabetically, then dependencies between items,
 * then blocked items with no reason. Oldest block first inside a group.
 */
export function blockedGroups(analysis: Analysis): BlockedGroup[] {
  const people = new Map<string, Item[]>();
  const dependencies: Item[] = [];
  const missing: Item[] = [];

  for (const lane of analysis.lanes) {
    for (const item of lane.items) {
      if (item.marker !== '!') continue;
      const wait = item.tokens.wait;
      if (wait === undefined) missing.push(item);
      else if (ITEM_ID.test(wait)) dependencies.push(item);
      else people.set(wait, [...(people.get(wait) ?? []), item]);
    }
  }

  const configured = analysis.config.people.filter((p) => people.has(p));
  const others = [...people.keys()].filter((p) => !analysis.config.people.includes(p)).sort();
  const groups: BlockedGroup[] = [...configured, ...others].map((key) => ({ kind: 'person', key, items: people.get(key) ?? [] }));
  if (dependencies.length > 0) groups.push({ kind: 'item', key: '', items: dependencies });
  if (missing.length > 0) groups.push({ kind: 'missing', key: '', items: missing });

  for (const group of groups) group.items.sort(bySince);
  return groups;
}

function bySince(a: Item, b: Item): number {
  const ta = a.tokens.since ? parseTimestamp(a.tokens.since) : null;
  const tb = b.tokens.since ? parseTimestamp(b.tokens.since) : null;
  if (ta === null && tb === null) return a.id.localeCompare(b.id);
  if (ta === null) return 1;
  if (tb === null) return -1;
  return ta - tb || a.id.localeCompare(b.id);
}

/** Time at which an item entered its present state, or null when absent or invalid. */
export function stateTime(item: Item): number | null {
  const text = isClosed(item) ? item.tokens.done : item.tokens.since;
  return text === undefined ? null : parseTimestamp(text);
}

/** Whether a closed item is recent enough to be shown (doneVisibleDays). Open items are always visible. */
export function isVisible(item: Item, now: number, doneVisibleDays: number): boolean {
  if (!isClosed(item)) return true;
  const closedAt = stateTime(item);
  return closedAt === null || now - closedAt <= doneVisibleDays * DAY;
}

export interface Summary {
  lanesActive: number;
  open: number;
  blocked: number;
  errors: number;
  warnings: number;
  stale: number;
  newestChangeMs: number | null;
}

export function summarize(analysis: Analysis): Summary {
  const summary: Summary = { lanesActive: 0, open: 0, blocked: 0, errors: 0, warnings: 0, stale: 0, newestChangeMs: null };
  for (const lane of analysis.lanes) {
    const counts = laneCounts(lane);
    summary.open += counts.open;
    summary.blocked += counts.blocked;
    if (laneFocus(lane)) summary.lanesActive++;
    if (lane.mtimeMs !== undefined && (summary.newestChangeMs === null || lane.mtimeMs > summary.newestChangeMs)) {
      summary.newestChangeMs = lane.mtimeMs;
    }
  }
  for (const f of analysis.findings) {
    if (f.severity === 'error') summary.errors++;
    else summary.warnings++;
    if (f.code === 'PM012') summary.stale++;
  }
  return summary;
}
