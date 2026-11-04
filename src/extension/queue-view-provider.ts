import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import { buildWebviewHtml, parseWebviewMessage, type HostMessage, type QueueViewModel } from '../app/index.js';
import type { WorkspaceInstance } from './instance.js';

/** What the queue view needs from the rest of the extension. */
export interface QueueViewHost {
  /** What to show, for every workspace folder. */
  models(): QueueViewModel[];
  instances(): readonly WorkspaceInstance[];
  /** Starts the guided setup for the folder with this name; returns false if there is no such folder. */
  runSetup(folderName: string): Promise<boolean>;
  /** Remembers which tags the view of the folder with this name shows; returns false if there is no such folder. */
  setTagFilter(folderName: string, tags: string[]): Promise<boolean>;
}

/** The sidebar view that shows the queue. It only draws what it is given and asks the extension to do things. */
export class QueueViewProvider implements vscode.WebviewViewProvider {
  static readonly viewType = 'planmaster.queue';

  private readonly extensionUri: vscode.Uri;
  private readonly host: QueueViewHost;
  private view: vscode.WebviewView | undefined;
  private posted: QueueViewModel[] = [];
  private drawnLanes: number | undefined;

  constructor(extensionUri: vscode.Uri, host: QueueViewHost) {
    this.extensionUri = extensionUri;
    this.host = host;
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
    const folders = this.host.models();
    this.posted = folders;
    const message: HostMessage = { type: 'state', folders };
    void this.view.webview.postMessage(message);
  }

  /** Handles a message from the view. Returns whether it was understood and allowed. */
  async handleMessage(raw: unknown): Promise<boolean> {
    const message = parseWebviewMessage(raw);
    if (message === null) return false;
    switch (message.type) {
      case 'ready':
        this.push();
        return true;
      case 'drawn':
        this.drawnLanes = message.lanes;
        return true;
      case 'setup':
        return this.host.runSetup(message.folder);
      case 'filter':
        return this.host.setTagFilter(message.folder, message.tags);
      default:
        return this.handleItemMessage(message);
    }
  }

  private async handleItemMessage(message: { type: 'reveal'; folder: string; path: string; line: number } | { type: 'markSeen'; folder: string }): Promise<boolean> {
    const instance = this.host.instances().find((candidate) => candidate.folder.name === message.folder);
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
