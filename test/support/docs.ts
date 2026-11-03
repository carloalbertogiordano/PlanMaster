import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// A string is passed to fileURLToPath because some test environments replace the global URL class.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function read(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

export function markdownFiles(directory: string): string[] {
  return fs.readdirSync(path.join(ROOT, directory), { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) return markdownFiles(relative);
    return entry.name.endsWith('.md') ? [relative] : [];
  });
}

export interface Block {
  file: string;
  /** 1-based line of the first line inside the fence. */
  startLine: number;
  lines: string[];
}

const FENCE = /^\s*```/;

export function fencedBlocks(file: string): Block[] {
  const blocks: Block[] = [];
  let current: Block | null = null;
  read(file).split('\n').forEach((text, i) => {
    if (!FENCE.test(text)) {
      current?.lines.push(text);
    } else if (current) {
      blocks.push(current);
      current = null;
    } else {
      current = { file, startLine: i + 2, lines: [] };
    }
  });
  return blocks;
}

/** The text of the fenced block of `file` that contains `marker`. */
export function blockContaining(file: string, marker: string): string {
  const block = fencedBlocks(file).find((b) => b.lines.join('\n').includes(marker));
  if (!block) throw new Error(`No block containing ${marker} in ${file}`);
  return block.lines.join('\n');
}

/** The text of a `<script type="text/plain" id="...">` element, without running or parsing any code. */
export function plainTextTemplate(html: string, id: string): string {
  const open = `<script type="text/plain" id="${id}">`;
  const start = html.indexOf(open);
  if (start < 0) throw new Error(`No template ${id}`);
  const end = html.indexOf('</script>', start);
  return html.slice(start + open.length, end);
}
