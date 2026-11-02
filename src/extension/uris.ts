import * as vscode from 'vscode';

export function uriOf(root: vscode.Uri, path: string): vscode.Uri {
  return vscode.Uri.joinPath(root, ...path.split('/'));
}

/** The workspace-relative path of `uri`, or null when it is outside `root`. */
export function relativePath(root: vscode.Uri, uri: vscode.Uri): string | null {
  const prefix = root.path.endsWith('/') ? root.path : `${root.path}/`;
  const inside = uri.scheme === root.scheme && uri.path.startsWith(prefix);
  return inside ? uri.path.slice(prefix.length) : null;
}
