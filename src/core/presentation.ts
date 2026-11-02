import { currentStep, laneFocus, summarize, type Analysis, type Summary } from './model.js';
import { ITEM_ID } from './parser.js';
import { formatDuration, parseTimestamp } from './time.js';
import type { Item, LaneFile } from './types.js';

export type StatusLevel = 'normal' | 'warning' | 'error';

export interface StatusBarModel {
  text: string;
  level: StatusLevel;
  tooltip: string[];
}

const MARKDOWN_SPECIAL = /[\\`*_{}[\]()#+\-.!|<>~&]/g;

/** Escapes text from a lane file so it renders literally in markdown, and flattens line breaks. */
export function escapeMarkdown(text: string): string {
  return text.replace(/\r?\n/g, ' ').replace(MARKDOWN_SPECIAL, '\\$&');
}

export function statusBarModel(analysis: Analysis): StatusBarModel {
  if (analysis.lanes.length === 0) return { text: 'PlanMaster: no lanes', level: 'normal', tooltip: [] };

  const summary = summarize(analysis);
  const parts = [`▶ ${plural(summary.lanesActive, 'lane')} active`, `${summary.open} open`, `${summary.blocked} blocked`];
  if (summary.newestChangeMs !== null) parts.push(`updated ${formatDuration(analysis.now - summary.newestChangeMs)} ago`);
  return { text: parts.join(' · '), level: levelOf(summary), tooltip: tooltipOf(analysis) };
}

function levelOf(summary: Summary): StatusLevel {
  if (summary.errors > 0) return 'error';
  return summary.stale > 0 ? 'warning' : 'normal';
}

function tooltipOf(analysis: Analysis): string[] {
  const lines = analysis.lanes.map((lane) => `${lane.lane} · ${laneTitle(lane)} — ${currentWork(lane)}`);
  if (analysis.findings.length > 0) lines.push(plural(analysis.findings.length, 'problem'));
  return lines;
}

function currentWork(lane: LaneFile): string {
  const focus = laneFocus(lane);
  if (!focus) return 'idle';
  const step = currentStep(focus);
  return `${step.id} ${step.title}`;
}

function laneTitle(lane: LaneFile): string {
  return lane.frontMatter.title ?? '(untitled)';
}

/** Markdown for the hover over an item ID, or null when no such item exists. All file text is escaped. */
export function hoverMarkdown(analysis: Analysis, id: string): string | null {
  const entry = analysis.index.get(id);
  if (!entry) return null;

  const { item, file } = entry;
  const heading = `**${item.id}** · ${stateDescription(item, analysis.now)}`;
  const laneLine = `_Lane ${file.lane} · ${escapeMarkdown(laneTitle(file))}_`;
  return [heading, escapeMarkdown(item.title), laneLine].join('\n\n');
}

function stateDescription(item: Item, now: number): string {
  switch (item.marker) {
    case ' ':
      return 'to do';
    case '~':
      return ['in progress', sinceText(item, now)].filter(Boolean).join(' ');
    case '!':
      return ['blocked', waitText(item), sinceText(item, now)].filter(Boolean).join(', ');
    case 'x':
      return closedText('done', item, now);
    case '-':
      return closedText('dropped', item, now);
  }
}

function sinceText(item: Item, now: number): string {
  const since = item.tokens.since === undefined ? null : parseTimestamp(item.tokens.since);
  return since === null ? '' : `for ${formatDuration(now - since)}`;
}

function waitText(item: Item): string {
  const wait = item.tokens.wait;
  if (wait === undefined) return '';
  // A valid item ID contains nothing markdown can act on; any other value is a person key from the file.
  return ITEM_ID.test(wait) ? `after ${wait}` : `waiting on ${escapeMarkdown(wait)}`;
}

function closedText(verb: string, item: Item, now: number): string {
  const done = item.tokens.done === undefined ? null : parseTimestamp(item.tokens.done);
  return done === null ? verb : `${verb} ${formatDuration(now - done)} ago`;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}
