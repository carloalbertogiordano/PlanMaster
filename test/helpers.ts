import { analyze, parseTimestamp, type Analysis, type Finding, type SourceFile } from '../src/core/index.js';

export function T(text: string): number {
  const ms = parseTimestamp(text);
  if (ms === null) throw new Error(`Invalid test timestamp: ${text}`);
  return ms;
}

/** The reference time of the demo workspace. */
export const NOW = T('2026-11-02T11:48');

export function laneText(lane: string, body: string, title = 'Test lane title'): string {
  return `---\nformat: 1\nlane: ${lane}\ntitle: ${title}\n---\n\n${body.trim()}\n`;
}

export function laneFile(lane: string, body: string, mtime?: string): SourceFile {
  return {
    path: `.planmaster/lanes/${lane}.md`,
    kind: 'lane',
    text: laneText(lane, body),
    mtimeMs: mtime === undefined ? undefined : T(mtime),
  };
}

export function archiveFile(lane: string, body: string): SourceFile {
  return { path: `.planmaster/archive/${lane}.md`, kind: 'archive', text: laneText(lane, body) };
}

export const CONFIG = JSON.stringify({ people: ['alice', 'bob'] });

export function run(files: SourceFile[], now: number = NOW, configText: string | undefined = CONFIG): Analysis {
  return analyze({ files, configText }, now);
}

export function runWithoutConfig(files: SourceFile[], now: number = NOW): Analysis {
  return analyze({ files }, now);
}

export function codes(findings: Finding[]): string[] {
  return findings.map((f) => f.code);
}

export function codesOf(files: SourceFile[], now: number = NOW): string[] {
  return codes(run(files, now).findings);
}
