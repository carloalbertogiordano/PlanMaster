export type InstallResult =
  | { kind: 'create' | 'append' | 'update' | 'unchanged'; text: string }
  | { kind: 'refuse'; reason: string };

const BEGIN_MARKER = /<!-- planmaster:begin v\d+ -->/g;
const END_MARKER = '<!-- planmaster:end -->';

/**
 * Works out the new text of CLAUDE.md after installing the managed block.
 * Only the text between the markers is ever replaced. If the markers cannot
 * be told apart from damage, nothing is changed and the reason is returned.
 */
export function installBlock(existing: string | undefined, block: string): InstallResult {
  if (countBegins(block) !== 1 || countEnds(block) !== 1) throw new Error('The block must contain exactly one pair of planmaster markers');
  if (existing === undefined) return { kind: 'create', text: `${block}\n` };

  const eol = existing.includes('\r\n') ? '\r\n' : '\n';
  const text = block.replace(/\r?\n/g, eol);
  const begins = countBegins(existing);
  const ends = countEnds(existing);

  if (begins === 0 && ends === 0) return { kind: 'append', text: appendBlock(existing, text, eol) };
  const problem = markerProblem(existing, begins, ends);
  if (problem !== null) return { kind: 'refuse', reason: problem };
  return replaceBlock(existing, text);
}

function countBegins(text: string): number {
  return [...text.matchAll(BEGIN_MARKER)].length;
}

function countEnds(text: string): number {
  return text.split(END_MARKER).length - 1;
}

function markerProblem(text: string, begins: number, ends: number): string | null {
  if (begins > 1 || ends > 1) return 'The file has more than one PlanMaster block; remove the extra markers by hand.';
  if (ends === 0) return 'The begin marker has no matching end marker, so the extent of the block is unknown.';
  if (begins === 0) return 'The end marker has no matching begin marker, so the extent of the block is unknown.';
  const begin = text.search(/<!-- planmaster:begin v\d+ -->/);
  return text.indexOf(END_MARKER) < begin ? 'The end marker comes before the begin marker; the markers are in the wrong order.' : null;
}

function appendBlock(existing: string, block: string, eol: string): string {
  if (existing.trim() === '') return `${block}${eol}`;
  const ended = existing.endsWith(eol) ? existing : `${existing}${eol}`;
  const separated = ended.endsWith(`${eol}${eol}`) ? ended : `${ended}${eol}`;
  return `${separated}${block}${eol}`;
}

function replaceBlock(existing: string, block: string): InstallResult {
  const start = existing.search(/<!-- planmaster:begin v\d+ -->/);
  const end = existing.indexOf(END_MARKER) + END_MARKER.length;
  const text = `${existing.slice(0, start)}${block}${existing.slice(end)}`;
  return text === existing ? { kind: 'unchanged', text } : { kind: 'update', text };
}
