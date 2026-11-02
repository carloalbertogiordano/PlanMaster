import { SUPPORTED_FORMAT } from './config.js';
import { finding, type FindingOptions } from './findings.js';
import { parseTimestamp } from './time.js';
import type { Finding, FrontMatter, Item, LaneFile, Marker, SourceFile, Tokens } from './types.js';

export const ITEM_LINE = /^(?<indent>(?: {2})*)- \[(?<marker>[ ~!x-])\] (?<id>[A-Z][A-Z0-9]{0,3}-[0-9]+[a-z0-9]*) (?<rest>\S.*)$/;
const LOOSE_ITEM_LINE = /^\s*- \[/;
const COMMENT_LINE = /^\s*<!--.*-->\s*$/;
const TRAILING_TOKEN = /(?:^|\s)(ref|wait|since|done):(\S+)$/;
const FRONT_MATTER_KEY = /^([A-Za-z][\w-]*):[ \t]*(.*)$/;

export const LANE_ID = /^[A-Z][A-Z0-9]{0,3}$/;
export const ITEM_ID = /^[A-Z][A-Z0-9]{0,3}-[0-9]+[a-z0-9]*$/;
export const MAX_DEPTH = 3;
export const MAX_TITLE_LENGTH = 120;
const FRONT_MATTER_KEYS = new Set(['format', 'lane', 'title']);

export interface ParseResult {
  file: LaneFile;
  findings: Finding[];
}

type Report = (code: string, line: number, message: string, options?: FindingOptions) => void;

export function laneFromPath(path: string): string {
  const base = path.replace(/\\/g, '/').split('/').pop() ?? path;
  return base.replace(/\.md$/, '');
}

export function parseLaneFile(source: SourceFile): ParseResult {
  const findings: Finding[] = [];
  const report: Report = (code, line, message, options) => {
    findings.push(finding(code, source.path, line, message, options));
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

function parseFrontMatter(lines: string[], lane: string, report: Report) {
  const frontMatter: FrontMatter = { unknownKeys: [] };

  if (lines[0] !== '---') {
    report('PM017', 1, 'Front matter is missing: the file must start with a --- line');
    return { frontMatter, bodyStart: 0, readable: true };
  }

  const values = new Map<string, { value: string; line: number }>();
  let closedAt = -1;
  for (let i = 1; i < lines.length; i++) {
    const text = lines[i] ?? '';
    if (text === '---') {
      closedAt = i;
      break;
    }
    if (text.trim() === '') continue;
    const m = FRONT_MATTER_KEY.exec(text);
    if (!m) {
      report('PM017', i + 1, `Malformed front matter line: ${text}`);
      continue;
    }
    const key = m[1] as string;
    const value = (m[2] ?? '').trim();
    if (values.has(key)) {
      report('PM017', i + 1, `Front matter key "${key}" appears twice`);
      continue;
    }
    values.set(key, { value, line: i + 1 });
    if (!FRONT_MATTER_KEYS.has(key)) {
      frontMatter.unknownKeys.push(key);
      report('PM017', i + 1, `Unknown front matter key "${key}"`, { severity: 'warning' });
    }
  }

  if (closedAt < 0) {
    report('PM017', 1, 'Front matter is not closed with a --- line');
    return { frontMatter, bodyStart: lines.length, readable: true };
  }

  const format = values.get('format');
  const laneEntry = values.get('lane');
  const title = values.get('title');
  let readable = true;

  if (!format) {
    report('PM017', 1, 'Front matter has no "format" key');
  } else if (!/^\d+$/.test(format.value)) {
    report('PM017', format.line, `format must be an integer, got "${format.value}"`);
  } else {
    frontMatter.format = format.value;
    if (Number(format.value) > SUPPORTED_FORMAT) {
      report('PM017', format.line, `Format ${format.value} is newer than the supported format ${SUPPORTED_FORMAT}; the file is not read`);
      readable = false;
    }
  }

  if (!laneEntry) {
    report('PM017', 1, 'Front matter has no "lane" key');
  } else {
    frontMatter.lane = laneEntry.value;
    if (!LANE_ID.test(laneEntry.value)) {
      report('PM017', laneEntry.line, `Lane "${laneEntry.value}" is not a valid lane ID`);
    } else if (laneEntry.value !== lane) {
      report('PM017', laneEntry.line, `Lane "${laneEntry.value}" does not match the file name "${lane}"`);
    }
  }

  if (!title) {
    report('PM017', 1, 'Front matter has no "title" key');
  } else {
    frontMatter.title = title.value;
    if (title.value.length < 3 || title.value.length > 80) {
      report('PM017', title.line, 'Lane title must be 3 to 80 characters');
    }
  }

  return { frontMatter, bodyStart: closedAt + 1, readable };
}

function parseItems(lines: string[], bodyStart: number, file: LaneFile, report: Report): void {
  const stack: Item[] = [];

  for (let i = bodyStart; i < lines.length; i++) {
    const text = lines[i] ?? '';
    const line = i + 1;
    if (text.trim() === '' || COMMENT_LINE.test(text)) continue;

    const m = ITEM_LINE.exec(text);
    if (!m || !m.groups) {
      if (LOOSE_ITEM_LINE.test(text)) {
        report('PM001', line, 'Malformed item line: check the indentation (two spaces per level), the marker, the ID and the spacing');
      } else {
        report('PM016', line, `Line is not an item, a blank line or a comment: ${truncate(text)}`);
      }
      continue;
    }

    const id = m.groups.id as string;
    const marker = m.groups.marker as Marker;
    const requestedDepth = (m.groups.indent as string).length / 2;
    const { title, tokens, duplicated } = splitRest(m.groups.rest as string);

    let depth = requestedDepth;
    const maxAllowed = stack.length;
    if (depth > maxAllowed) {
      report('PM001', line, stack.length === 0
        ? `${id} is indented but has no parent item`
        : `${id} is indented more than one level deeper than the previous item`, { itemId: id });
      depth = maxAllowed;
    }
    if (depth > MAX_DEPTH) {
      report('PM019', line, `${id} is nested ${depth} levels deep; the maximum is ${MAX_DEPTH}`, { itemId: id });
    }

    const parent = depth > 0 ? (stack[depth - 1] ?? null) : null;
    const item: Item = {
      id,
      marker,
      title,
      tokens,
      depth,
      line,
      parent,
      children: [],
      lane: file.lane,
      file: file.path,
    };
    stack.length = depth;
    stack[depth] = item;
    if (parent) parent.children.push(item);
    else file.roots.push(item);
    file.items.push(item);

    for (const key of duplicated) {
      report('PM001', line, `Token "${key}:" appears more than once on ${id}`, { itemId: id });
    }
    if (title === '') report('PM001', line, `${id} has no title`, { itemId: id });
    if (title.length > MAX_TITLE_LENGTH) {
      report('PM020', line, `${id} has a title of ${title.length} characters; move long context to a document linked with ref:`, { itemId: id });
    }
    for (const key of ['since', 'done'] as const) {
      const value = tokens[key];
      if (value !== undefined && parseTimestamp(value) === null) {
        report('PM014', line, `${id}: ${key}:${value} is not a valid YYYY-MM-DDTHH:MM timestamp`, { itemId: id });
      }
    }
  }
}

/** Splits the text after the ID into the title and its trailing tokens, reading from the right. */
function splitRest(rest: string): { title: string; tokens: Tokens; duplicated: string[] } {
  const tokens: Tokens = {};
  const duplicated: string[] = [];
  let remaining = rest.trimEnd();
  for (;;) {
    const t = TRAILING_TOKEN.exec(remaining);
    if (!t) break;
    const key = t[1] as keyof Tokens;
    if (key in tokens) duplicated.push(key);
    else tokens[key] = t[2] as string;
    remaining = remaining.slice(0, t.index).trimEnd();
  }
  return { title: remaining, tokens, duplicated };
}

function truncate(text: string): string {
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
}
