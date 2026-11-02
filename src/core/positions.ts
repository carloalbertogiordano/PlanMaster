import { ITEM_ID, ITEM_LINE } from './parser.js';
import { splitTokens } from './tokens.js';

export interface ColumnRange {
  start: number;
  /** Exclusive. */
  end: number;
}

export interface IdReference extends ColumnRange {
  id: string;
}

const ITEM_LINE_WITH_OFFSETS = new RegExp(ITEM_LINE.source, 'd');
const WAIT_PREFIX = 'wait:'.length;

/**
 * The columns a finding should underline: an item from its ID to the end of
 * the line, anything else the whole line without its surrounding blanks.
 */
export function findingRange(lineText: string | undefined, itemId?: string): ColumnRange {
  const text = lineText ?? '';
  const end = text.trimEnd().length;
  const firstNonBlank = text.length - text.trimStart().length;
  if (firstNonBlank >= end) return { start: 0, end: 0 };

  const idStart = itemId === undefined ? -1 : indexOfId(text, itemId);
  return { start: idStart >= 0 ? idStart : firstNonBlank, end };
}

/** Finds `id` as a whole word, so that `B-12` does not match inside `B-12a`. */
function indexOfId(text: string, id: string): number {
  for (let from = text.indexOf(id); from >= 0; from = text.indexOf(id, from + 1)) {
    const before = text.charAt(from - 1);
    const after = text.charAt(from + id.length);
    if (before === ' ' && (after === '' || after === ' ')) return from;
  }
  return -1;
}

/**
 * The item ID named by a `wait:` token under `column`, if any. Only real
 * trailing tokens count, so a `wait:` word inside a title is not a reference.
 */
export function waitReferenceAt(lineText: string, column: number): IdReference | null {
  const rest = ITEM_LINE_WITH_OFFSETS.exec(lineText)?.indices?.groups?.rest;
  if (!rest) return null;

  const offset = rest[0];
  for (const word of splitTokens(lineText.slice(offset)).words) {
    if (word.key !== 'wait' || !ITEM_ID.test(word.value)) continue;
    const start = offset + word.start + WAIT_PREFIX;
    const end = offset + word.end;
    if (column >= start && column < end) return { id: word.value, start, end };
  }
  return null;
}
