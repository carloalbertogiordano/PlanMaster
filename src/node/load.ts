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

interface DirectoryContents {
  files: SourceFile[];
  unreadable: UnreadableFile[];
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

  const lanes = readDirectory(root, path.join(root, config.lanesDir), 'lane');
  const archives = readDirectory(root, path.join(planmaster, 'archive'), 'archive');
  return {
    root,
    input: {
      files: [...lanes.files, ...archives.files],
      unreadable: [...lanes.unreadable, ...archives.unreadable],
      configText,
    },
  };
}

function readDirectory(root: string, directory: string, kind: FileKind): DirectoryContents {
  const contents: DirectoryContents = { files: [], unreadable: [] };
  if (!fs.existsSync(directory)) return contents;

  const names = fs.readdirSync(directory)
    .filter((name) => name.endsWith('.md') && !name.startsWith('.'))
    .sort((a, b) => a.localeCompare(b));
  for (const name of names) {
    const absolute = path.join(directory, name);
    const relative = path.relative(root, absolute).split(path.sep).join('/');
    readFile(absolute, { path: relative, kind }, contents);
  }
  return contents;
}

function readFile(absolute: string, target: { path: string; kind: FileKind }, contents: DirectoryContents): void {
  try {
    const stat = fs.statSync(absolute);
    if (!stat.isFile()) return;
    if (stat.size > MAX_FILE_BYTES) {
      contents.unreadable.push({ ...target, reason: `file is larger than ${MAX_FILE_BYTES} bytes` });
      return;
    }
    contents.files.push({ ...target, text: fs.readFileSync(absolute, 'utf8'), mtimeMs: stat.mtimeMs });
  } catch (error) {
    contents.unreadable.push({ ...target, reason: (error as Error).message });
  }
}
