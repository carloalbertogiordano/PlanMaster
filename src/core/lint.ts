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

const FUTURE_TOLERANCE = 5 * MINUTE;

/** Which tokens each marker does not allow (queue-format section 6.2). */
const DISALLOWED: Readonly<Record<Marker, ReadonlyArray<keyof Tokens>>> = {
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
    for (const item of file.items) lintItem(item, file, context, findings);
    lintHierarchy(file, findings);
    if (file.kind === 'lane') lintStale(file, context, findings);
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

function lintItem(item: Item, file: LaneFile, context: LintContext, out: Finding[]): void {
  const at = (code: string, message: string, severity?: 'error' | 'warning'): void => {
    out.push(finding(code, file.path, item.line, message, severity ? { itemId: item.id, severity } : { itemId: item.id }));
  };
  const { tokens, marker } = item;

  const prefix = item.id.slice(0, item.id.indexOf('-'));
  if (prefix !== file.lane) at('PM003', `${item.id} does not carry the prefix of lane ${file.lane}`);

  const first = context.index.get(item.id);
  if (first && first.item !== item) {
    at('PM002', `Duplicate ID ${item.id}, first used in ${first.file.path}:${first.item.line}`);
  }

  if (marker === '!' && tokens.wait === undefined) at('PM004', `${item.id} is blocked but has no wait: naming a person or an item ID`);
  if (isClosed(item) && tokens.done === undefined) at('PM005', `${item.id} is ${STATE_NAME[marker]} but has no done:`);
  if ((marker === '~' || marker === '!') && tokens.since === undefined) at('PM006', `${item.id} is ${STATE_NAME[marker]} but has no since:`);

  if (tokens.wait !== undefined) lintWait(item, tokens.wait, context, at);

  const unexpected = DISALLOWED[marker].filter((key) => tokens[key] !== undefined);
  if (unexpected.length > 0) {
    at('PM013', `${item.id} is ${STATE_NAME[marker]}, so ${unexpected.map((k) => `${k}:`).join(', ')} should not be set`);
  }

  for (const key of ['since', 'done'] as const) {
    const value = tokens[key];
    if (value === undefined) continue;
    const time = parseTimestamp(value);
    if (time === null) continue;
    if (time > context.now + FUTURE_TOLERANCE) {
      at('PM015', `${item.id}: ${key}:${value} is in the future`);
    } else if (file.mtimeMs !== undefined && time > file.mtimeMs + FUTURE_TOLERANCE) {
      at('PM015', `${item.id}: ${key}:${value} is later than the last change to the file; was the time guessed?`);
    }
  }
}

function lintWait(
  item: Item,
  wait: string,
  context: LintContext,
  at: (code: string, message: string) => void,
): void {
  if (ITEM_ID.test(wait)) {
    const target = context.index.get(wait);
    if (!target) at('PM007', `${item.id} waits on ${wait}, which does not exist`);
    else if (isClosed(target.item)) at('PM018', `${item.id} waits on ${wait}, which is already ${STATE_NAME[target.item.marker]}; the block is probably resolved`);
  } else if (!context.config.people.includes(wait)) {
    at('PM007', `wait:${wait} on ${item.id} is neither a configured person nor an item ID`);
  }
}

function lintHierarchy(file: LaneFile, out: Finding[]): void {
  const report = (code: string, item: Item, message: string): void => {
    out.push(finding(code, file.path, item.line, message, { itemId: item.id }));
  };

  const topDoing = file.roots.filter((i) => i.marker === '~');
  for (const item of topDoing.slice(1)) {
    report('PM008', item, `Lane ${file.lane} has more than one top-level item in progress (${topDoing.map((i) => i.id).join(', ')})`);
  }

  for (const parent of file.items) {
    const childrenDoing = parent.children.filter((c) => c.marker === '~');
    for (const child of childrenDoing.slice(1)) {
      report('PM009', child, `${parent.id} has more than one child in progress (${childrenDoing.map((c) => c.id).join(', ')})`);
    }

    if (isClosed(parent)) {
      const open = parent.children.find((c) => !isClosed(c));
      if (open) report('PM010', parent, `${parent.id} is ${STATE_NAME[parent.marker]} but its child ${open.id} is still ${STATE_NAME[open.marker]}`);
    } else if (parent.marker === ' ') {
      const started = parent.children.find((c) => c.marker === '~');
      if (started) report('PM011', parent, `${parent.id} is still to do but its child ${started.id} is in progress`);
    }
  }
}

function lintStale(file: LaneFile, context: LintContext, out: Finding[]): void {
  if (file.mtimeMs === undefined) return;
  const threshold = context.config.staleAfterMinutes * MINUTE;
  const idle = context.now - file.mtimeMs;
  if (idle <= threshold) return;

  for (const item of file.roots) {
    if (item.marker !== '~' || item.tokens.since === undefined) continue;
    const since = parseTimestamp(item.tokens.since);
    if (since === null) continue;
    const age = context.now - since;
    if (age > threshold) {
      out.push(finding(
        'PM012',
        file.path,
        item.line,
        `${item.id} has been in progress for ${formatDuration(age)} and the file has not changed for ${formatDuration(idle)}; it is probably stale`,
        { itemId: item.id },
      ));
    }
  }
}
