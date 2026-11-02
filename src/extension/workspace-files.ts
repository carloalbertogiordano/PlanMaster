import * as vscode from 'vscode';
import type { WorkspaceFiles } from '../app/index.js';
import { uriOf } from './uris.js';

/** Reads and writes files of one workspace folder through the editor's file system. */
export class VsCodeWorkspaceFiles implements WorkspaceFiles {
  private readonly root: vscode.Uri;

  constructor(root: vscode.Uri) {
    this.root = root;
  }

  async read(path: string): Promise<string | undefined> {
    try {
      return new TextDecoder().decode(await vscode.workspace.fs.readFile(uriOf(this.root, path)));
    } catch (error) {
      if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') return undefined;
      throw error;
    }
  }

  async write(path: string, text: string): Promise<void> {
    const uri = uriOf(this.root, path);
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(uri, '..'));
    await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(text));
  }
}
