import type { Analysis } from './model.js';
import { stateTime } from './model.js';
import type { Item } from './types.js';

export type EventKind = 'closed' | 'dropped' | 'started' | 'blocked';

export interface QueueEvent {
  kind: EventKind;
  time: number;
  item: Item;
  /** Person key or item ID a blocked item waits for. */
  waitingOn?: string;
}

const KIND_BY_MARKER = {
  x: 'closed',
  '-': 'dropped',
  '~': 'started',
  '!': 'blocked',
} as const;

/**
 * Derives the "what's new" feed: items whose present state began after
 * `lastSeen`, newest first. An item appears once, with its current state.
 * Edits that carry no timestamp are not events.
 */
export function deriveEvents(analysis: Analysis, lastSeen: number): QueueEvent[] {
  return analysis.lanes
    .flatMap((lane) => lane.items)
    .map((item) => eventFor(item, lastSeen))
    .filter((event): event is QueueEvent => event !== null)
    .sort((a, b) => b.time - a.time || a.item.id.localeCompare(b.item.id));
}

function eventFor(item: Item, lastSeen: number): QueueEvent | null {
  if (item.marker === ' ') return null;
  const time = stateTime(item);
  if (time === null || time <= lastSeen) return null;

  const event: QueueEvent = { kind: KIND_BY_MARKER[item.marker], time, item };
  if (item.marker === '!' && item.tokens.wait !== undefined) event.waitingOn = item.tokens.wait;
  return event;
}
