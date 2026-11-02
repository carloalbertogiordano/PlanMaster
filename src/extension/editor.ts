import * as vscode from 'vscode';
import { uriOf } from './uris.js';

/** Opens a workspace file with the cursor at a 1-based line. */
export async function openAtLine(root: vscode.Uri, path: string, line: number): Promise<void> {
  const position = new vscode.Position(line - 1, 0);
  await vscode.window.showTextDocument(uriOf(root, path), { selection: new vscode.Range(position, position), preview: false });
}
