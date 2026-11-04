import { effectiveTags, tagCounts, type Analysis, type Item } from '../core/index.js';

/** A tag the filter bar offers. */
export interface TagOption {
  key: string;
  /** The label declared in config.json, or the key itself when the tag is not declared. */
  label: string;
  /** How many items carry the tag, inherited ones included. */
  count: number;
  declared: boolean;
}

/** Decides which items a tag filter lets through. */
export type Scope = (item: Item) => boolean;

/** Lets through the items that carry at least one of the selected tags, or every item when none is selected. */
export function scopeOf(selected: readonly string[]): Scope {
  if (selected.length === 0) return () => true;
  const wanted = new Set(selected);
  return (item) => effectiveTags(item).some((tag) => wanted.has(tag));
}

/** An item in scope, or one with a descendant in scope: such a parent is shown for context. */
export function isRelevant(item: Item, scope: Scope): boolean {
  return scope(item) || item.children.some((child) => isRelevant(child, scope));
}

/**
 * The tags the filter bar offers: those in use (declared ones first, in the
 * order of config.json, then the others alphabetically), plus any selected
 * tag, so that a selection can always be cleared.
 */
export function tagOptions(analysis: Analysis, selected: readonly string[]): TagOption[] {
  const counts = tagCounts(analysis.lanes.flatMap((lane) => lane.items));
  const declared = Object.keys(analysis.config.tags);
  const undeclared = [...new Set([...counts.keys(), ...selected])].filter((key) => !declared.includes(key)).sort((a, b) => a.localeCompare(b));
  return [...declared, ...undeclared]
    .filter((key) => (counts.get(key) ?? 0) > 0 || selected.includes(key))
    .map((key) => ({ key, label: analysis.config.tags[key] ?? key, count: counts.get(key) ?? 0, declared: declared.includes(key) }));
}
