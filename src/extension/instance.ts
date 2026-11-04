import * as vscode from 'vscode';
import { CONFIG_PATH, QueueController, SeenTracker, TagFilterStore, buildQueueViewModel, classifyPath, errorViewModel, isKnownPath, trimTrailingSlashes, withSetup, type QueueViewModel, type SetupAssessment, type ViewState } from '../app/index.js';
import { DEFAULT_CONFIG, type Analysis } from '../core/index.js';
import { openAtLine } from './editor.js';
import { relativePath } from './uris.js';
import { DecorationsView, DiagnosticsView, StatusView, type View } from './views.js';
import { VsCodeWorkspaceSource } from './workspace-source.js';

export interface InstanceServices {
  extensionUri: vscode.Uri;
  output: vscode.OutputChannel;
  /** Where the last "seen" time is kept. */
  storage: vscode.Memento;
  multiRoot: boolean;
}

/** One workspace folder that contains a `.planmaster` directory: its controller, views and file watchers. */
export class WorkspaceInstance implements vscode.Disposable {
  readonly folder: vscode.WorkspaceFolder;
  private readonly controller: QueueController;
  private readonly views: View[];
  private readonly watchers: vscode.Disposable[] = [];
  private readonly seen: SeenTracker;
  private readonly tagFilter: TagFilterStore;
  private readonly changeListeners: (() => void)[] = [];
  private lanesDir = DEFAULT_CONFIG.lanesDir;
  private lanesWatcher: vscode.Disposable | undefined;

  constructor(folder: vscode.WorkspaceFolder, services: InstanceServices) {
    const { extensionUri, output, storage, multiRoot } = services;
    this.folder = folder;
    this.seen = new SeenTracker(storage, `planmaster.lastSeen:${folder.uri.toString()}`);
    this.tagFilter = new TagFilterStore(storage, `planmaster.tagFilter:${folder.uri.toString()}`);
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

  /** Calls `listener` whenever what the queue view shows may have changed. */
  onModelChange(listener: () => void): void {
    this.changeListeners.push(listener);
  }

  /** What the queue view shows for this folder, or undefined before the first read. */
  viewModelFor(setup: SetupAssessment | undefined): QueueViewModel | undefined {
    const state = this.controller.state;
    if (state === undefined) return undefined;
    if (state.kind === 'config-error') return withSetup(errorViewModel(this.folder.name, state.message), setup);
    return buildQueueViewModel(state.analysis, { folder: this.folder.name, lastSeen: this.seen.value, tagFilter: this.tagFilter.value, ...(setup ? { setup } : {}) });
  }

  /** The message about config.json when it cannot be read. */
  get configError(): string | undefined {
    const state = this.controller.state;
    return state?.kind === 'config-error' ? state.message : undefined;
  }

  /** Remembers which tags the view of this folder shows; an empty list shows everything. */
  async setTagFilter(tags: string[]): Promise<void> {
    await this.tagFilter.set(tags);
    this.notifyModelChange();
  }

  async markSeen(): Promise<void> {
    await this.seen.markSeen(Date.now());
    this.notifyModelChange();
  }

  /** Whether `path` is a file this instance has read, so that it may be opened on request. */
  knows(path: string): boolean {
    const analysis = this.analysis;
    return analysis !== undefined && isKnownPath(analysis, path);
  }

  reveal(path: string, line: number): Promise<void> {
    return openAtLine(this.folder.uri, path, line);
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

  private notifyModelChange(): void {
    for (const listener of this.changeListeners) listener();
  }

  private onUpdate(state: ViewState): void {
    for (const view of this.views) view.apply(state);
    this.notifyModelChange();
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
