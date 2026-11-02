import { analyzeParsed, type Analysis } from './model.js';
import { parseLaneFile, type ParseResult } from './parser.js';
import type { SourceFile, UnreadableFile } from './types.js';

interface Entry {
  source: SourceFile;
  result: ParseResult;
}

/**
 * Keeps the parsed form of every lane and archive file between analyses, so
 * a change to one file costs one parse. Analyses it returns are never
 * modified afterwards.
 */
export class QueueStore {
  private readonly entries = new Map<string, Entry>();
  private readonly unreadable = new Map<string, UnreadableFile>();
  private readonly parse: (source: SourceFile) => ParseResult;
  private configText: string | undefined;

  constructor(parse: (source: SourceFile) => ParseResult = parseLaneFile) {
    this.parse = parse;
  }

  setFile(source: SourceFile): void {
    this.unreadable.delete(source.path);
    const existing = this.entries.get(source.path);
    if (existing?.source.text === source.text && existing.source.kind === source.kind) {
      const file = { ...existing.result.file, mtimeMs: source.mtimeMs };
      this.entries.set(source.path, { source, result: { ...existing.result, file } });
      return;
    }
    this.entries.set(source.path, { source, result: this.parse(source) });
  }

  setUnreadable(file: UnreadableFile): void {
    this.entries.delete(file.path);
    this.unreadable.set(file.path, file);
  }

  removeFile(path: string): void {
    this.entries.delete(path);
    this.unreadable.delete(path);
  }

  setConfigText(text: string | undefined): void {
    this.configText = text;
  }

  textOf(path: string): string | undefined {
    return this.entries.get(path)?.source.text;
  }

  /** Paths of the files that were read successfully, in name order. */
  paths(): string[] {
    return [...this.entries.keys()].sort((a, b) => a.localeCompare(b));
  }

  /** Throws ConfigError when the configuration text is invalid. */
  analyze(now: number): Analysis {
    return analyzeParsed({
      parsed: [...this.entries.values()].map((entry) => entry.result),
      unreadable: [...this.unreadable.values()],
      configText: this.configText,
    }, now);
  }
}
