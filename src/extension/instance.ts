import * as vscode from 'vscode';
import { CONFIG_PATH, QueueController, classifyPath, trimTrailingSlashes, type ViewState } from '../app/index.js';
import { DEFAULT_CONFIG, type Analysis } from '../core/index.js';
import { relativePath } from './uris.js';
import { DecorationsView, DiagnosticsView, StatusView, type View } from './views.js';
import { VsCodeWorkspaceSource } from './workspace-source.js';

/** One workspace folder that contains a `.planmaster` directory: its controller, views and file watchers. */
export class WorkspaceInstance implements vscode.Disposable {
  readonly folder: vscode.WorkspaceFolder;
  private readonly controller: QueueController;
  private readonly views: View[];
  private readonly watchers: vscode.Disposable[] = [];
  private lanesDir = DEFAULT_CONFIG.lanesDir;
  private lanesWatcher: vscode.Disposable | undefined;

  constructor(folder: vscode.WorkspaceFolder, extensionUri: vscode.Uri, output: vscode.OutputChannel, multiRoot: boolean) {
    this.folder = folder;
    this.views = [
      new DiagnosticsView(folder.uri, folder.name),
      new StatusView(multiRoot ? `${folder.name}: ` : ''),
      new DecorationsView(folder.uri, extensionUri),
    ];
    this.controller = new QueueController({
      source: new VsCodeWorkspaceSource(folder.uri),
      clock: () => Date.now(),
      onError: (error) => { output.appendLine(`PlanMaster: ${error instanceof Error ? error.message : String(error)}`); },
    });
    this.controller.onDidUpdate((state) => { this.onUpdate(state); });
    this.watchers.push(this.watch(new vscode.RelativePattern(folder, '.planmaster/**')));
  }

  async start(): Promise<void> {
    await this.controller.start();
  }

  reloadAll(): Promise<void> {
    return this.controller.reloadAll();
  }

  /** Publishes the current state again, for example after a setting changed. */
  refresh(): void {
    this.controller.refresh();
  }

  get state(): ViewState | undefined {
    return this.controller.state;
  }

  get analysis(): Analysis | undefined {
    const state = this.controller.state;
    return state?.kind === 'ok' ? state.analysis : undefined;
  }

  dispose(): void {
    this.controller.dispose();
    for (const view of this.views) view.dispose();
    for (const watcher of this.watchers) watcher.dispose();
    this.lanesWatcher?.dispose();
  }

  private onUpdate(state: ViewState): void {
    for (const view of this.views) view.apply(state);
    if (state.kind === 'ok' && state.analysis.config.lanesDir !== this.lanesDir) {
      this.lanesDir = state.analysis.config.lanesDir;
      this.watchLanesDirectory();
      void this.controller.reloadAll();
    }
  }

  /** The lanes directory can be moved in config.json; outside `.planmaster/` it needs its own watcher. */
  private watchLanesDirectory(): void {
    this.lanesWatcher?.dispose();
    this.lanesWatcher = undefined;
    if (this.lanesDir.startsWith('.planmaster/')) return;
    this.lanesWatcher = this.watch(new vscode.RelativePattern(this.folder, `${trimTrailingSlashes(this.lanesDir)}/*.md`));
  }

  private watch(pattern: vscode.RelativePattern): vscode.Disposable {
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    const handle = (uri: vscode.Uri): void => { this.onFileEvent(uri); };
    return vscode.Disposable.from(watcher, watcher.onDidCreate(handle), watcher.onDidChange(handle), watcher.onDidDelete(handle));
  }

  private onFileEvent(uri: vscode.Uri): void {
    const path = relativePath(this.folder.uri, uri);
    if (path === null) return;
    if (path === CONFIG_PATH) this.controller.notifyConfigChanged();
    else if (classifyPath(path, this.lanesDir) !== null) this.controller.notifyFileChanged(path);
  }
}
