import type { Tokens } from './types.js';

export type TokenKey = keyof Tokens;

export interface TokenWord {
  key: TokenKey;
  value: string;
  /** Offset of the `key:value` word in the text that was split. */
  start: number;
  /** Offset just after the word. */
  end: number;
}

export interface TokenSplit {
  title: string;
  tokens: Tokens;
  duplicated: TokenKey[];
  /** Token words in reading order. */
  words: TokenWord[];
}

const TOKEN_WORD = /^(tag|ref|wait|since|done):(\S+)$/;
const WHITESPACE = /\s/;
/** Five token keys exist; more trailing tokens than this cannot be meaningful. */
const MAX_TRAILING_TOKENS = 8;

/**
 * Splits the text after an item ID into the title and its trailing tokens,
 * reading words from the right. Linear in the length of the text.
 */
export function splitTokens(rest: string): TokenSplit {
  const tokens: Tokens = {};
  const duplicated: TokenKey[] = [];
  const words: TokenWord[] = [];
  let remaining = rest.trimEnd();

  for (let peeled = 0; peeled < MAX_TRAILING_TOKENS; peeled++) {
    const start = lastWordStart(remaining);
    const match = TOKEN_WORD.exec(remaining.slice(start));
    if (!match) break;
    const key = match[1] as TokenKey;
    const value = match[2] ?? '';
    if (key in tokens) duplicated.push(key);
    else tokens[key] = value;
    words.push({ key, value, start, end: remaining.length });
    remaining = remaining.slice(0, start).trimEnd();
  }
  words.reverse();
  return { title: remaining, tokens, duplicated, words };
}

function lastWordStart(text: string): number {
  let start = text.length;
  while (start > 0 && !WHITESPACE.test(text.charAt(start - 1))) start--;
  return start;
}
