import type { SourceFile, UnreadableFile } from '../core/index.js';

export interface WorkspaceSnapshot {
  files: SourceFile[];
  unreadable: UnreadableFile[];
  configText: string | undefined;
}

export type FileReadResult =
  | { kind: 'ok'; file: SourceFile }
  | { kind: 'unreadable'; file: UnreadableFile };

/**
 * Where the controller gets workspace contents from. Implementations turn
 * their own read errors into `unreadable` results; a rejected promise means
 * something unexpected went wrong and is passed to the controller's error handler.
 */
export interface WorkspaceSource {
  /** Reads every lane and archive file and config.json. */
  readAll(): Promise<WorkspaceSnapshot>;
  /** Re-reads one file by workspace-relative path. Returns null when it does not exist. */
  readFile(path: string): Promise<FileReadResult | null>;
  readConfig(): Promise<string | undefined>;
}

export interface Timers {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  setInterval(callback: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}
