import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import { buildWebviewHtml, parseWebviewMessage, type HostMessage, type QueueViewModel } from '../app/index.js';
import type { WorkspaceInstance } from './instance.js';

/** The sidebar view that shows the queue. It only draws what it is given and asks the extension to open files. */
export class QueueViewProvider implements vscode.WebviewViewProvider {
  static readonly viewType = 'planmaster.queue';

  private readonly extensionUri: vscode.Uri;
  private readonly instances: () => readonly WorkspaceInstance[];
  private view: vscode.WebviewView | undefined;
  private posted: QueueViewModel[] = [];
  private drawnLanes: number | undefined;

  constructor(extensionUri: vscode.Uri, instances: () => readonly WorkspaceInstance[]) {
    this.extensionUri = extensionUri;
    this.instances = instances;
  }

  /** What was last sent to the view, for tests. */
  get lastPosted(): { resolved: boolean; folders: QueueViewModel[]; drawnLanes: number | undefined } {
    return { resolved: this.view !== undefined, folders: this.posted, drawnLanes: this.drawnLanes };
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    const roots = ['dist', 'media'].map((name) => vscode.Uri.joinPath(this.extensionUri, name));
    view.webview.options = { enableScripts: true, localResourceRoots: roots };
    view.webview.html = buildWebviewHtml({
      cspSource: view.webview.cspSource,
      scriptUri: view.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview.js')).toString(),
      styleUri: view.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'queue-view.css')).toString(),
      nonce: randomBytes(16).toString('base64'),
    });
    view.webview.onDidReceiveMessage((raw: unknown) => this.handleMessage(raw));
    view.onDidDispose(() => {
      this.view = undefined;
      this.posted = [];
      this.drawnLanes = undefined;
    });
  }

  /** Sends the current queue to the view, if it is open. */
  push(): void {
    if (!this.view) return;
    const folders = this.instances().flatMap((instance) => instance.viewModel ?? []);
    this.posted = folders;
    const message: HostMessage = { type: 'state', folders };
    void this.view.webview.postMessage(message);
  }

  /** Handles a message from the view. Returns whether it was understood and allowed. */
  async handleMessage(raw: unknown): Promise<boolean> {
    const message = parseWebviewMessage(raw);
    if (message === null) return false;
    if (message.type === 'ready') {
      this.push();
      return true;
    }
    if (message.type === 'drawn') {
      this.drawnLanes = message.lanes;
      return true;
    }
    const instance = this.instances().find((candidate) => candidate.folder.name === message.folder);
    if (!instance) return false;
    if (message.type === 'markSeen') {
      await instance.markSeen();
      return true;
    }
    if (!instance.knows(message.path)) return false;
    await instance.reveal(message.path, message.line);
    return true;
  }
}
