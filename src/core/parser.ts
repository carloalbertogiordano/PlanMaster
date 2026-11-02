import { SUPPORTED_FORMAT } from './config.js';
import { finding, type FindingOptions } from './findings.js';
import { parseTimestamp } from './time.js';
import type { Finding, FrontMatter, Item, LaneFile, Marker, SourceFile, Tokens } from './types.js';

// Every pattern below is anchored and free of overlapping quantifiers, so matching is linear in the line length.
// The ID suffix must start with a letter: `\d+` followed by `[a-z0-9]*` would let digits match either part.
export const ITEM_LINE = /^(?<indent>(?: {2})*)- \[(?<marker>[ ~!x-])\] (?<id>[A-Z][A-Z0-9]{0,3}-\d+(?:[a-z][a-z0-9]*)?) (?<rest>\S.*)$/;
export const LANE_ID = /^[A-Z][A-Z0-9]{0,3}$/;
export const ITEM_ID = /^[A-Z][A-Z0-9]{0,3}-\d+(?:[a-z][a-z0-9]*)?$/;
const LOOSE_ITEM_LINE = /^\s*- \[/;
const TOKEN_WORD = /^(ref|wait|since|done):(\S+)$/;
const KEY_NAME = /^[A-Za-z][\w-]*$/;
const WHITESPACE = /\s/;

export const MAX_DEPTH = 3;
export const MAX_TITLE_LENGTH = 120;
/** Four token keys exist; more trailing tokens than this cannot be meaningful. */
const MAX_TRAILING_TOKENS = 8;
const FRONT_MATTER_KEYS = new Set(['format', 'lane', 'title']);

export interface ParseResult {
  file: LaneFile;
  findings: Finding[];
}

type Report = (code: string, line: number, message: string, options?: FindingOptions) => void;

interface FrontMatterEntry {
  value: string;
  line: number;
}

export function laneFromPath(path: string): string {
  const base = path.replace(/\\/g, '/').split('/').pop() ?? path;
  return base.replace(/\.md$/, '');
}

export function parseLaneFile(source: SourceFile): ParseResult {
  const findings: Finding[] = [];
  const report: Report = (code, line, message, options) => {
    findings.push(finding(code, { file: source.path, line }, message, options));
  };

  const lane = laneFromPath(source.path);
  const lines = source.text.split(/\r?\n/);
  const { frontMatter, bodyStart, readable } = parseFrontMatter(lines, lane, report);

  const file: LaneFile = {
    path: source.path,
    kind: source.kind,
    lane,
    frontMatter,
    roots: [],
    items: [],
    mtimeMs: source.mtimeMs,
  };
  if (readable) parseItems(lines, bodyStart, file, report);
  return { file, findings };
}

/* ---------- front matter ---------- */

function parseFrontMatter(lines: string[], lane: string, report: Report) {
  const frontMatter: FrontMatter = { unknownKeys: [] };

  if (lines[0] !== '---') {
    report('PM017', 1, 'Front matter is missing: the file must start with a --- line');
    return { frontMatter, bodyStart: 0, readable: true };
  }

  const { entries, closedAt } = readFrontMatterBlock(lines, frontMatter, report);
  if (closedAt < 0) {
    report('PM017', 1, 'Front matter is not closed with a --- line');
    return { frontMatter, bodyStart: lines.length, readable: true };
  }

  const readable = checkFormat(entries.get('format'), frontMatter, report);
  checkLane(entries.get('lane'), lane, frontMatter, report);
  checkTitle(entries.get('title'), frontMatter, report);
  return { frontMatter, bodyStart: closedAt + 1, readable };
}

interface FrontMatterBlock {
  entries: Map<string, FrontMatterEntry>;
  frontMatter: FrontMatter;
  report: Report;
}

function readFrontMatterBlock(lines: string[], frontMatter: FrontMatter, report: Report) {
  const block: FrontMatterBlock = { entries: new Map(), frontMatter, report };
  for (let i = 1; i < lines.length; i++) {
    const text = lines[i] ?? '';
    if (text === '---') return { entries: block.entries, closedAt: i };
    if (text.trim() !== '') readFrontMatterLine(text, i + 1, block);
  }
  return { entries: block.entries, closedAt: -1 };
}

function readFrontMatterLine(text: string, line: number, { entries, frontMatter, report }: FrontMatterBlock): void {
  const pair = splitKeyValue(text);
  if (!pair) {
    report('PM017', line, `Malformed front matter line: ${truncate(text)}`);
  } else if (entries.has(pair.key)) {
    report('PM017', line, `Front matter key "${pair.key}" appears twice`);
  } else {
    entries.set(pair.key, { value: pair.value, line });
    if (!FRONT_MATTER_KEYS.has(pair.key)) {
      frontMatter.unknownKeys.push(pair.key);
      report('PM017', line, `Unknown front matter key "${pair.key}"`, { severity: 'warning' });
    }
  }
}

function splitKeyValue(text: string): { key: string; value: string } | null {
  const colon = text.indexOf(':');
  if (colon < 1) return null;
  const key = text.slice(0, colon);
  return KEY_NAME.test(key) ? { key, value: text.slice(colon + 1).trim() } : null;
}

/** Returns whether the file may be read: a newer format is refused. */
function checkFormat(entry: FrontMatterEntry | undefined, frontMatter: FrontMatter, report: Report): boolean {
  if (!entry) {
    report('PM017', 1, 'Front matter has no "format" key');
    return true;
  }
  if (!/^\d+$/.test(entry.value)) {
    report('PM017', entry.line, `format must be an integer, got "${entry.value}"`);
    return true;
  }
  frontMatter.format = entry.value;
  if (Number(entry.value) <= SUPPORTED_FORMAT) return true;
  report('PM017', entry.line, `Format ${entry.value} is newer than the supported format ${SUPPORTED_FORMAT}; the file is not read`);
  return false;
}

function checkLane(entry: FrontMatterEntry | undefined, lane: string, frontMatter: FrontMatter, report: Report): void {
  if (!entry) {
    report('PM017', 1, 'Front matter has no "lane" key');
    return;
  }
  frontMatter.lane = entry.value;
  if (!LANE_ID.test(entry.value)) {
    report('PM017', entry.line, `Lane "${entry.value}" is not a valid lane ID`);
  } else if (entry.value !== lane) {
    report('PM017', entry.line, `Lane "${entry.value}" does not match the file name "${lane}"`);
  }
}

function checkTitle(entry: FrontMatterEntry | undefined, frontMatter: FrontMatter, report: Report): void {
  if (!entry) {
    report('PM017', 1, 'Front matter has no "title" key');
    return;
  }
  frontMatter.title = entry.value;
  if (entry.value.length < 3 || entry.value.length > 80) {
    report('PM017', entry.line, 'Lane title must be 3 to 80 characters');
  }
}

/* ---------- items ---------- */

function parseItems(lines: string[], bodyStart: number, file: LaneFile, report: Report): void {
  const stack: Item[] = [];
  for (let i = bodyStart; i < lines.length; i++) {
    const text = lines[i] ?? '';
    const line = i + 1;
    if (isIgnorable(text)) continue;

    const groups = ITEM_LINE.exec(text)?.groups;
    if (groups) readItem(groups, line, { file, stack, report });
    else reportUnparsable(text, line, report);
  }
}

interface ItemContext {
  file: LaneFile;
  stack: Item[];
  report: Report;
}

function readItem(groups: Record<string, string | undefined>, line: number, context: ItemContext): void {
  const id = groups.id ?? '';
  const { title, tokens, duplicated } = splitRest(groups.rest ?? '');
  const requestedDepth = (groups.indent ?? '').length / 2;
  const item: Item = {
    id,
    marker: (groups.marker ?? ' ') as Marker,
    title,
    tokens,
    depth: 0,
    line,
    parent: null,
    children: [],
    lane: context.file.lane,
    file: context.file.path,
  };
  attachItem(item, requestedDepth, context);
  checkItemContent(item, duplicated, context.report);
}

/** Places the item in the tree, repairing impossible indentation so later lines still attach sensibly. */
function attachItem(item: Item, requestedDepth: number, { file, stack, report }: ItemContext): void {
  const depth = Math.min(requestedDepth, stack.length);
  if (requestedDepth > depth) {
    const reason = stack.length === 0 ? 'is indented but has no parent item' : 'is indented more than one level deeper than the previous item';
    report('PM001', item.line, `${item.id} ${reason}`, { itemId: item.id });
  }
  if (depth > MAX_DEPTH) {
    report('PM019', item.line, `${item.id} is nested ${depth} levels deep; the maximum is ${MAX_DEPTH}`, { itemId: item.id });
  }

  item.depth = depth;
  item.parent = depth > 0 ? (stack[depth - 1] ?? null) : null;
  stack.length = depth;
  stack[depth] = item;
  if (item.parent) item.parent.children.push(item);
  else file.roots.push(item);
  file.items.push(item);
}

function checkItemContent(item: Item, duplicated: string[], report: Report): void {
  const options = { itemId: item.id };
  for (const key of duplicated) {
    report('PM001', item.line, `Token "${key}:" appears more than once on ${item.id}`, options);
  }
  if (item.title === '') report('PM001', item.line, `${item.id} has no title`, options);
  if (item.title.length > MAX_TITLE_LENGTH) {
    report('PM020', item.line, `${item.id} has a title of ${item.title.length} characters; move long context to a document linked with ref:`, options);
  }
  for (const key of ['since', 'done'] as const) {
    const value = item.tokens[key];
    if (value !== undefined && parseTimestamp(value) === null) {
      report('PM014', item.line, `${item.id}: ${key}:${value} is not a valid YYYY-MM-DDTHH:MM timestamp`, options);
    }
  }
}

function isIgnorable(text: string): boolean {
  const trimmed = text.trim();
  return trimmed === '' || (trimmed.length >= 7 && trimmed.startsWith('<!--') && trimmed.endsWith('-->'));
}

function reportUnparsable(text: string, line: number, report: Report): void {
  if (LOOSE_ITEM_LINE.test(text)) {
    report('PM001', line, 'Malformed item line: check the indentation (two spaces per level), the marker, the ID and the spacing');
  } else {
    report('PM016', line, `Line is not an item, a blank line or a comment: ${truncate(text)}`);
  }
}

/** Splits the text after the ID into the title and its trailing tokens, reading words from the right. */
function splitRest(rest: string): { title: string; tokens: Tokens; duplicated: string[] } {
  const tokens: Tokens = {};
  const duplicated: string[] = [];
  let remaining = rest.trimEnd();
  for (let peeled = 0; peeled < MAX_TRAILING_TOKENS; peeled++) {
    const start = lastWordStart(remaining);
    const match = TOKEN_WORD.exec(remaining.slice(start));
    if (!match) break;
    const key = match[1] as keyof Tokens;
    if (key in tokens) duplicated.push(key);
    else tokens[key] = match[2] ?? '';
    remaining = remaining.slice(0, start).trimEnd();
  }
  return { title: remaining, tokens, duplicated };
}

function lastWordStart(text: string): number {
  let start = text.length;
  while (start > 0 && !WHITESPACE.test(text.charAt(start - 1))) start--;
  return start;
}

function truncate(text: string): string {
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
}
