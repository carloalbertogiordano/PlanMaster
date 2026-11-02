import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ITEM_LINE, parseLaneFile } from '../src/core/index.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (relative: string): string => fs.readFileSync(path.join(ROOT, relative), 'utf8');

function markdownFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(path.join(ROOT, directory), { withFileTypes: true })) {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...markdownFiles(relative));
    else if (entry.name.endsWith('.md')) found.push(relative);
  }
  return found;
}

interface Block {
  file: string;
  startLine: number;
  lines: string[];
}

function fencedBlocks(file: string): Block[] {
  const blocks: Block[] = [];
  const lines = read(file).split('\n');
  let current: Block | null = null;
  lines.forEach((text, i) => {
    if (/^\s*```/.test(text)) {
      if (current) {
        blocks.push(current);
        current = null;
      } else {
        current = { file, startLine: i + 2, lines: [] };
      }
    } else if (current) {
      current.lines.push(text);
    }
  });
  return blocks;
}

const DOC_FILES = ['README.md', 'CLAUDE.md', ...markdownFiles('docs')];
const QUEUE_LINE = /^\s*- \[[ ~!x-]\] [A-Z][A-Z0-9]{0,3}-\d/;

describe('queue lines shown in the documentation', () => {
  const failures: string[] = [];
  let checked = 0;

  for (const file of DOC_FILES) {
    for (const block of fencedBlocks(file)) {
      const queueLines = block.lines
        .map((text, i) => ({ text, line: block.startLine + i }))
        .filter((l) => QUEUE_LINE.test(l.text));
      if (queueLines.length === 0) continue;
      // Blocks indented as markdown code carry a common prefix that is not part of the grammar.
      const baseIndent = Math.min(...queueLines.map((l) => (l.text.match(/^ */) as RegExpMatchArray)[0].length));
      for (const l of queueLines) {
        checked++;
        if (!ITEM_LINE.test(l.text.slice(baseIndent))) failures.push(`${file}:${l.line} ${l.text.trim()}`);
      }
    }
  }

  it('finds queue lines to check', () => {
    expect(checked).toBeGreaterThan(10);
  });

  it('parses every one of them under the grammar', () => {
    expect(failures).toEqual([]);
  });
});

describe('lane files shown in the documentation', () => {
  it('parse without parse-level findings', () => {
    const problems: string[] = [];
    let files = 0;
    for (const file of DOC_FILES) {
      for (const block of fencedBlocks(file)) {
        if (block.lines[0] !== '---' || !block.lines.some((l) => l === 'format: 1')) continue;
        const lane = block.lines.find((l) => l.startsWith('lane: '))?.slice(6).trim() ?? 'X';
        files++;
        const result = parseLaneFile({ path: `.planmaster/lanes/${lane}.md`, kind: 'lane', text: block.lines.join('\n') });
        for (const f of result.findings) problems.push(`${file}:${block.startLine + f.line - 1} ${f.code} ${f.message}`);
      }
    }
    expect(files).toBeGreaterThan(1);
    expect(problems).toEqual([]);
  });
});

describe('prompts stay in sync with the mockup', () => {
  const mockup = read('docs/mockup/queue-view.html');
  const textBlock = (file: string, marker: string): string => {
    const block = fencedBlocks(file).find((b) => b.lines.join('\n').includes(marker));
    if (!block) throw new Error(`No block containing ${marker} in ${file}`);
    return block.lines.join('\n');
  };

  it('uses the same managed block text', () => {
    const fromDocs = textBlock('docs/prompts/claude-md-block.md', 'planmaster:begin');
    const array = /var CLAUDE_BLOCK = (\[[\s\S]*?\])\.join\('\\n'\);/.exec(mockup);
    expect(array).not.toBeNull();
    const fromMockup = new Function(`return ${array![1]}.join('\\n');`)() as string;
    expect(fromMockup).toBe(fromDocs);
  });

  it('keeps the managed block under 350 words', () => {
    const words = textBlock('docs/prompts/claude-md-block.md', 'planmaster:begin').split(/\s+/).filter(Boolean).length;
    expect(words).toBeLessThanOrEqual(350);
  });

  it('uses the same lane start prompt text', () => {
    const template = textBlock('docs/prompts/lane-start.md', '{{LANE_ID}}');
    const fn = /function promptFor\(lane\) \{\s*return (\[[\s\S]*?\])\.join\('\\n'\);\s*\}/.exec(mockup);
    expect(fn).not.toBeNull();
    const people = ['alice', 'bob', 'carol'];
    const fromMockup = new Function('lane', 'PEOPLE', `return ${fn![1]}.join('\\n');`)({ id: 'B', title: 'Some title' }, people) as string;
    const fromDocs = template
      .replaceAll('{{LANE_ID}}', 'B')
      .replaceAll('{{LANE_TITLE}}', 'Some title')
      .replaceAll('{{PEOPLE}}', people.join(', '));
    expect(fromMockup).toBe(fromDocs);
  });

  it('uses only documented placeholders', () => {
    const documented = new Set(
      [...read('docs/prompts/README.md').matchAll(/`(\{\{[A-Z_]+\}\})`/g)].map((m) => m[1] as string),
    );
    for (const file of markdownFiles('docs/prompts')) {
      for (const block of fencedBlocks(file)) {
        for (const m of block.lines.join('\n').matchAll(/\{\{[A-Z_]+\}\}/g)) {
          expect(documented.has(m[0]), `${file} uses undocumented ${m[0]}`).toBe(true);
        }
      }
    }
  });
});
