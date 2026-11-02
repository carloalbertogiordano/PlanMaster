import { describe, expect, it } from 'vitest';
import { ITEM_LINE, parseLaneFile } from '../src/core/index.js';
import { blockContaining, fencedBlocks, markdownFiles, plainTextTemplate, read, type Block } from './support/docs.js';

const DOC_FILES = ['README.md', 'CLAUDE.md', ...markdownFiles('docs')];
const ALL_BLOCKS = DOC_FILES.flatMap((file) => fencedBlocks(file));
const QUEUE_LINE = /^\s*- \[[ ~!x-]\] [A-Z][A-Z0-9]{0,3}-\d/;
const indentOf = (text: string): number => text.length - text.trimStart().length;

interface QueueLine {
  where: string;
  text: string;
}

/** Queue lines of a block, with the indentation the markdown code fence adds removed. */
function queueLinesOf(block: Block): QueueLine[] {
  const found = block.lines
    .map((text, i) => ({ text, where: `${block.file}:${block.startLine + i}` }))
    .filter((l) => QUEUE_LINE.test(l.text));
  const base = Math.min(...found.map((l) => indentOf(l.text)));
  return found.map((l) => ({ where: l.where, text: l.text.slice(base) }));
}

function laneFileProblems(block: Block): string[] {
  const lane = block.lines.find((l) => l.startsWith('lane: '))?.slice(6).trim() ?? 'X';
  const text = block.lines.join('\n');
  const result = parseLaneFile({ path: `.planmaster/lanes/${lane}.md`, kind: 'lane', text });
  return result.findings.map((f) => `${block.file}:${block.startLine + f.line - 1} ${f.code} ${f.message}`);
}

const isLaneFileBlock = (block: Block): boolean => block.lines[0] === '---' && block.lines.includes('format: 1');

describe('queue lines shown in the documentation', () => {
  const lines = ALL_BLOCKS.flatMap(queueLinesOf);

  it('finds queue lines to check', () => {
    expect(lines.length).toBeGreaterThan(10);
  });

  it('parses every one of them under the grammar', () => {
    const failures = lines.filter((l) => !ITEM_LINE.test(l.text)).map((l) => `${l.where} ${l.text.trim()}`);
    expect(failures).toEqual([]);
  });
});

describe('lane files shown in the documentation', () => {
  const blocks = ALL_BLOCKS.filter(isLaneFileBlock);

  it('exist', () => {
    expect(blocks.length).toBeGreaterThan(1);
  });

  it('parse without parse-level findings', () => {
    expect(blocks.flatMap(laneFileProblems)).toEqual([]);
  });
});

describe('prompts stay in sync with the mockup', () => {
  const mockup = read('docs/mockup/queue-view.html');
  const managedBlock = blockContaining('docs/prompts/claude-md-block.md', 'planmaster:begin');
  const laneStart = blockContaining('docs/prompts/lane-start.md', '{{LANE_ID}}');

  it('uses the same managed block text', () => {
    expect(plainTextTemplate(mockup, 'tpl-claude-block')).toBe(managedBlock);
  });

  it('uses the same lane start prompt template', () => {
    expect(plainTextTemplate(mockup, 'tpl-lane-start')).toBe(laneStart);
  });

  it('keeps the managed block under 350 words', () => {
    expect(managedBlock.split(/\s+/).filter(Boolean).length).toBeLessThanOrEqual(350);
  });

  it('uses only documented placeholders', () => {
    const documented = new Set([...read('docs/prompts/README.md').matchAll(/`(\{\{[A-Z_]+\}\})`/g)].map((m) => m[1]));
    const used = markdownFiles('docs/prompts')
      .flatMap((file) => fencedBlocks(file))
      .flatMap((block) => [...block.lines.join('\n').matchAll(/\{\{[A-Z_]+\}\}/g)].map((m) => m[0]));
    expect(used.filter((placeholder) => !documented.has(placeholder))).toEqual([]);
  });
});
