import * as vscode from 'vscode';
import { CONFIG_PATH, classifyPath, trimTrailingSlashes, type FileReadResult, type WorkspaceSnapshot, type WorkspaceSource } from '../app/index.js';
import { DEFAULT_CONFIG, parseConfig, type FileKind, type SourceFile, type UnreadableFile } from '../core/index.js';
import { uriOf } from './uris.js';

const MAX_FILE_BYTES = 1024 * 1024;
const ARCHIVE_DIR = '.planmaster/archive';

/** Reads a workspace through the editor's file system, so remote and virtual workspaces work too. */
export class VsCodeWorkspaceSource implements WorkspaceSource {
  private readonly root: vscode.Uri;

  constructor(root: vscode.Uri) {
    this.root = root;
  }

  readConfig(): Promise<string | undefined> {
    return this.readText(CONFIG_PATH);
  }

  async readAll(): Promise<WorkspaceSnapshot> {
    const configText = await this.readConfig();
    const lanesDir = lanesDirOf(configText);
    const paths = [...(await this.listMarkdown(lanesDir)), ...(await this.listMarkdown(ARCHIVE_DIR))];
    const results = await Promise.all(paths.map((path) => this.read(path, lanesDir)));

    const files: SourceFile[] = [];
    const unreadable: UnreadableFile[] = [];
    for (const result of results) {
      if (result?.kind === 'ok') files.push(result.file);
      else if (result?.kind === 'unreadable') unreadable.push(result.file);
    }
    return { files, unreadable, configText };
  }

  async readFile(path: string): Promise<FileReadResult | null> {
    return this.read(path, lanesDirOf(await this.readConfig()));
  }

  private async read(path: string, lanesDir: string): Promise<FileReadResult | null> {
    const kind = classifyPath(path, lanesDir);
    if (kind === null) return null;

    const uri = uriOf(this.root, path);
    try {
      const stat = await vscode.workspace.fs.stat(uri);
      if (stat.type === vscode.FileType.Directory) return null;
      if (stat.size > MAX_FILE_BYTES) return unreadable(path, kind, `file is larger than ${MAX_FILE_BYTES} bytes`);
      const bytes = await vscode.workspace.fs.readFile(uri);
      return { kind: 'ok', file: { path, kind, text: new TextDecoder().decode(bytes), mtimeMs: stat.mtime } };
    } catch (error) {
      return isNotFound(error) ? null : unreadable(path, kind, errorMessage(error));
    }
  }

  private async readText(path: string): Promise<string | undefined> {
    try {
      return new TextDecoder().decode(await vscode.workspace.fs.readFile(uriOf(this.root, path)));
    } catch (error) {
      if (isNotFound(error)) return undefined;
      throw error;
    }
  }

  private async listMarkdown(directory: string): Promise<string[]> {
    const base = trimTrailingSlashes(directory);
    try {
      const entries = await vscode.workspace.fs.readDirectory(uriOf(this.root, base));
      return entries.filter(([name]) => name.endsWith('.md')).map(([name]) => `${base}/${name}`);
    } catch (error) {
      if (isNotFound(error)) return [];
      throw error;
    }
  }
}

/** An unreadable config.json is reported by the controller; reading lanes still uses the default directory. */
function lanesDirOf(configText: string | undefined): string {
  try {
    return parseConfig(configText).lanesDir;
  } catch {
    return DEFAULT_CONFIG.lanesDir;
  }
}

function unreadable(path: string, kind: FileKind, reason: string): FileReadResult {
  return { kind: 'unreadable', file: { path, kind, reason } };
}

function isNotFound(error: unknown): boolean {
  return error instanceof vscode.FileSystemError && error.code === 'FileNotFound';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
