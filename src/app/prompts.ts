import type { Analysis } from '../core/index.js';

/** The raw markdown of each prompt document in docs/prompts. */
export interface PromptSources {
  managedBlock: string;
  formatReference: string;
  laneStart: string;
  migrate: string;
  planToQueue: string;
  reconcile: string;
  archive: string;
  setup: string;
}

/** The text of each template, with `{{PLACEHOLDER}}` fields still to fill. */
export type Templates = PromptSources;

const PLACEHOLDER = /\{\{([A-Z_]+)\}\}/g;
const OPENING_FENCE = /^```(\S*)\s*$/;

interface FencedBlock {
  kind: string;
  lines: string[];
}

const CLOSING_FENCE = /^```\s*$/;

function fencedBlocks(markdown: string): FencedBlock[] {
  const blocks: FencedBlock[] = [];
  let open: FencedBlock | null = null;
  for (const line of markdown.split(/\r?\n/)) {
    if (open === null) {
      const fence = OPENING_FENCE.exec(line);
      open = fence ? { kind: fence[1] ?? '', lines: [] } : null;
    } else if (CLOSING_FENCE.test(line)) {
      blocks.push(open);
      open = null;
    } else {
      open.lines.push(line);
    }
  }
  return blocks;
}

/** The text of the one ```text block in a prompt document. */
export function extractTemplate(markdown: string): string {
  const texts = fencedBlocks(markdown).filter((block) => block.kind === 'text');
  if (texts.length !== 1) throw new Error(`Expected exactly one text block, found ${texts.length}`);
  return (texts[0]?.lines ?? []).join('\n');
}

export function loadTemplates(sources: PromptSources): Templates {
  return {
    managedBlock: extractTemplate(sources.managedBlock),
    formatReference: extractTemplate(sources.formatReference),
    laneStart: extractTemplate(sources.laneStart),
    migrate: extractTemplate(sources.migrate),
    planToQueue: extractTemplate(sources.planToQueue),
    reconcile: extractTemplate(sources.reconcile),
    archive: extractTemplate(sources.archive),
    setup: extractTemplate(sources.setup),
  };
}

/** The placeholders of a template, each once, in order of first appearance. */
export function templatePlaceholders(template: string): string[] {
  return [...new Set([...template.matchAll(PLACEHOLDER)].map((match) => match[1] ?? ''))];
}

/**
 * Fills the placeholders in one pass, so text inside a value is never
 * treated as a placeholder or as a replacement pattern.
 */
export function fillTemplate(template: string, values: Readonly<Record<string, string>>): string {
  const missing = templatePlaceholders(template).filter((key) => !Object.hasOwn(values, key));
  if (missing.length > 0) throw new Error(`No value for placeholder ${missing.join(', ')}`);
  return template.replace(PLACEHOLDER, (_whole, key: string) => values[key] ?? '');
}

export function lanesText(analysis: Analysis): string {
  if (analysis.lanes.length === 0) return '(no lanes yet)';
  return analysis.lanes.map((lane) => `${lane.lane}: ${lane.frontMatter.title ?? '(untitled)'}`).join('\n');
}

export function peopleText(people: readonly string[]): string {
  return people.length === 0 ? '(none configured)' : people.join(', ');
}
