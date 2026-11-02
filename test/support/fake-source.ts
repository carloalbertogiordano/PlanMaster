import type { WorkspaceSnapshot, WorkspaceSource, FileReadResult } from '../../src/app/ports.js';
import type { FileKind } from '../../src/core/index.js';

interface StoredFile {
  text: string;
  mtimeMs?: number;
}

/** An in-memory workspace for controller tests. Calls are recorded; reads can be held back. */
export class FakeSource implements WorkspaceSource {
  readonly files = new Map<string, StoredFile>();
  readonly unreadable = new Map<string, string>();
  readonly readFileCalls: string[] = [];
  configText: string | undefined;
  /** When set, readFile waits for it, so a test can change things while a read is in flight. */
  gate: Promise<void> | undefined;

  put(path: string, text: string, mtimeMs?: number): void {
    this.files.set(path, mtimeMs === undefined ? { text } : { text, mtimeMs });
  }

  readAll(): Promise<WorkspaceSnapshot> {
    const files = [...this.files].map(([path, file]) => ({ path, kind: kindOf(path), text: file.text, mtimeMs: file.mtimeMs }));
    const unreadable = [...this.unreadable].map(([path, reason]) => ({ path, kind: kindOf(path), reason }));
    return Promise.resolve({ files, unreadable, configText: this.configText });
  }

  async readFile(path: string): Promise<FileReadResult | null> {
    this.readFileCalls.push(path);
    await this.gate;
    const reason = this.unreadable.get(path);
    if (reason !== undefined) return { kind: 'unreadable', file: { path, kind: kindOf(path), reason } };
    const file = this.files.get(path);
    if (!file) return null;
    return { kind: 'ok', file: { path, kind: kindOf(path), text: file.text, mtimeMs: file.mtimeMs } };
  }

  readConfig(): Promise<string | undefined> {
    return Promise.resolve(this.configText);
  }
}

function kindOf(path: string): FileKind {
  return path.includes('/archive/') ? 'archive' : 'lane';
}
