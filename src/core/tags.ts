import type { Item } from './types.js';

/** A tag key: a letter, then letters, digits, dashes and underscores, at most 20 characters in all. */
export const TAG_KEY = /^[A-Za-z][A-Za-z0-9_-]{0,19}$/;

export interface TagList {
  /** The valid tags, each once, in the order written. */
  tags: string[];
  /** The entries that are not valid tags, for example an empty one between two commas. */
  invalid: string[];
}

/** Reads the value of a `tag:` token, which is a comma-separated list of tag keys. */
export function parseTagList(value: string | undefined): TagList {
  const list: TagList = { tags: [], invalid: [] };
  if (value === undefined) return list;
  for (const entry of value.split(',')) {
    if (!TAG_KEY.test(entry)) list.invalid.push(entry);
    else if (!list.tags.includes(entry)) list.tags.push(entry);
  }
  return list;
}

/** The tags the item's own line carries. */
export function ownTags(item: Item): string[] {
  return parseTagList(item.tokens.tag).tags;
}

/** The tags of the item and of all its ancestors: children inherit what their parents are tagged with. */
export function effectiveTags(item: Item): string[] {
  const tags = new Set<string>();
  for (let current: Item | null = item; current !== null; current = current.parent) {
    for (const tag of ownTags(current)) tags.add(tag);
  }
  return [...tags];
}

/** How many of the items carry each tag, inherited tags included, in order of first appearance. */
export function tagCounts(items: readonly Item[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const tag of effectiveTags(item)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return counts;
}
