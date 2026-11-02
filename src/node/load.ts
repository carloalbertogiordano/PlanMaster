import fs from 'node:fs';
import path from 'node:path';
import { parseConfig } from '../core/config.js';
import type { FileKind, SourceFile, UnreadableFile, WorkspaceInput } from '../core/types.js';

const MAX_FILE_BYTES = 1024 * 1024;

export interface LoadedWorkspace {
  /** Absolute path of the workspace root. */
  root: string;
  input: WorkspaceInput;
}

/**
 * Reads a workspace from disk. `dir` is either the workspace root (the
 * directory that contains `.planmaster/`) or the `.planmaster` directory.
 * Paths in the result are relative to the workspace root, with forward slashes.
 */
export function loadWorkspace(dir: string): LoadedWorkspace {
  const resolved = path.resolve(dir);
  const root = path.basename(resolved) === '.planmaster' ? path.dirname(resolved) : resolved;
  const planmaster = path.join(root, '.planmaster');

  const configPath = path.join(planmaster, 'config.json');
  const configText = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : undefined;
  const config = parseConfig(configText);

  const files: SourceFile[] = [];
  const unreadable: UnreadableFile[] = [];
  readDirectory(root, path.join(root, config.lanesDir), 'lane', files, unreadable);
  readDirectory(root, path.join(planmaster, 'archive'), 'archive', files, unreadable);

  return { root, input: { files, unreadable, configText } };
}

function readDirectory(root: string, directory: string, kind: FileKind, files: SourceFile[], unreadable: UnreadableFile[]): void {
  if (!fs.existsSync(directory)) return;
  const names = fs.readdirSync(directory).filter((n) => n.endsWith('.md') && !n.startsWith('.')).sort();
  for (const name of names) {
    const absolute = path.join(directory, name);
    const relative = path.relative(root, absolute).split(path.sep).join('/');
    try {
      const stat = fs.statSync(absolute);
      if (!stat.isFile()) continue;
      if (stat.size > MAX_FILE_BYTES) {
        unreadable.push({ path: relative, kind, reason: `file is larger than ${MAX_FILE_BYTES} bytes` });
        continue;
      }
      files.push({ path: relative, kind, text: fs.readFileSync(absolute, 'utf8'), mtimeMs: stat.mtimeMs });
    } catch (error) {
      unreadable.push({ path: relative, kind, reason: (error as Error).message });
    }
  }
}
