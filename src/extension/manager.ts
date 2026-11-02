import * as vscode from 'vscode';
import { setupViewModel, type QueueViewModel } from '../app/index.js';
import type { Analysis } from '../core/index.js';
import type { CommandHost, CommandRegistry } from './commands.js';
import { WorkspaceInstance } from './instance.js';
import type { AnalysisLookup } from './providers.js';
import type { QueueViewHost } from './queue-view-provider.js';
import { SetupCoordinator } from './setup-coordinator.js';
import { relativePath, uriOf } from './uris.js';

/** Looks after the workspace folders: a running queue for each folder that has one, and a setup assessment for every folder. */
export class InstanceManager implements vscode.Disposable, CommandHost, QueueViewHost {
  private readonly instanceMap = new Map<string, WorkspaceInstance>();
  private readonly watchers = new Map<string, vscode.Disposable>();
  private readonly context: vscode.ExtensionContext;
  private readonly output: vscode.OutputChannel;
  private readonly coordinator: SetupCoordinator;
  private commands: CommandRegistry | undefined;
  private onChange: () => void = () => undefined;

  constructor(context: vscode.ExtensionContext, output: vscode.OutputChannel) {
    this.context = context;
    this.output = output;
    this.coordinator = new SetupCoordinator({
      storage: context.workspaceState,
      instanceFor: (folder) => this.instanceMap.get(folder.uri.toString()),
      createUi: (folder) => this.registry().createUserInterface(folder),
      runSetup: (folder) => this.registry().runSetup(folder),
      onChange: () => { this.onChange(); },
      log: (message) => { output.appendLine(message); },
    });
  }

  /** The commands need the manager and the manager needs the commands, so they are joined after both exist. */
  attach(commands: CommandRegistry): void {
    this.commands = commands;
  }

  /** Called whenever what the queue view shows may have changed. */
  setChangeListener(listener: () => void): void {
    this.onChange = listener;
  }

  instances(): readonly WorkspaceInstance[] {
    return [...this.instanceMap.values()];
  }

  analysisFor(folder: vscode.WorkspaceFolder): Analysis | undefined {
    return this.instanceMap.get(folder.uri.toString())?.analysis;
  }

  configErrorFor(folder: vscode.WorkspaceFolder): string | undefined {
    return this.instanceMap.get(folder.uri.toString())?.configError;
  }

  /** What the queue view shows: the queue of each folder that has one, the invitation to set up for the others. */
  models(): QueueViewModel[] {
    return (vscode.workspace.workspaceFolders ?? []).flatMap((folder) => {
      const setup = this.coordinator.assessmentFor(folder);
      const instance = this.instanceMap.get(folder.uri.toString());
      const model = instance ? instance.viewModelFor(setup) : setup && setupViewModel(folder.name, setup);
      return model ? [model] : [];
    });
  }

  async runSetup(folderName: string): Promise<boolean> {
    const folder = vscode.workspace.workspaceFolders?.find((candidate) => candidate.name === folderName);
    if (!folder) return false;
    await this.registry().runSetup(folder);
    return true;
  }

  /** What the setup assessment says for each folder, for tests. */
  setupReasons(): { folder: string; reason: string | null }[] {
    return (vscode.workspace.workspaceFolders ?? []).map((folder) => ({ folder: folder.name, reason: this.coordinator.assessmentFor(folder)?.reason ?? null }));
  }

  resetOffers(): void {
    this.coordinator.resetOffers();
  }

  async evaluateAll(): Promise<void> {
    await Promise.all((vscode.workspace.workspaceFolders ?? []).map((folder) => this.coordinator.evaluate(folder)));
  }

  async markSeen(): Promise<void> {
    await Promise.all(this.instances().map((instance) => instance.markSeen()));
  }

  /** Starts a queue for every folder that has a `.planmaster` directory, stops the ones for removed folders, and looks at every folder. */
  async syncFolders(): Promise<void> {
    const folders = vscode.workspace.workspaceFolders ?? [];
    this.dropRemoved(folders);
    for (const folder of folders) {
      this.watchFolder(folder);
      await this.startInstance(folder, folders.length > 1);
    }
    await this.evaluateAll();
    this.onChange();
  }

  async reloadAll(): Promise<void> {
    await Promise.all(this.instances().map((instance) => instance.reloadAll()));
  }

  refreshViews(): void {
    for (const instance of this.instanceMap.values()) instance.refresh();
  }

  readonly lookup: AnalysisLookup = (uri) => {
    for (const instance of this.instanceMap.values()) {
      const analysis = instance.analysis;
      if (analysis && relativePath(instance.folder.uri, uri) !== null) return { analysis, root: instance.folder.uri };
    }
    return undefined;
  };

  dispose(): void {
    for (const instance of this.instanceMap.values()) instance.dispose();
    for (const watcher of this.watchers.values()) watcher.dispose();
    this.instanceMap.clear();
    this.watchers.clear();
  }

  private registry(): CommandRegistry {
    if (!this.commands) throw new Error('The commands were not attached');
    return this.commands;
  }

  private dropRemoved(folders: readonly vscode.WorkspaceFolder[]): void {
    const wanted = new Set(folders.map((folder) => folder.uri.toString()));
    for (const [key, instance] of this.instanceMap) {
      if (wanted.has(key)) continue;
      instance.dispose();
      this.instanceMap.delete(key);
    }
    for (const [key, watcher] of this.watchers) {
      if (wanted.has(key)) continue;
      watcher.dispose();
      this.watchers.delete(key);
    }
  }

  private async startInstance(folder: vscode.WorkspaceFolder, multiRoot: boolean): Promise<void> {
    const key = folder.uri.toString();
    if (this.instanceMap.has(key) || !(await hasPlanMaster(folder))) return;
    const instance = new WorkspaceInstance(folder, { extensionUri: this.context.extensionUri, output: this.output, storage: this.context.workspaceState, multiRoot });
    instance.onModelChange(() => {
      this.onChange();
      void this.coordinator.evaluate(folder);
    });
    this.instanceMap.set(key, instance);
    await instance.start();
  }

  /** Watches what decides whether setup is needed: the project's CLAUDE.md, and a PlanMaster directory appearing. */
  private watchFolder(folder: vscode.WorkspaceFolder): void {
    const key = folder.uri.toString();
    if (this.watchers.has(key)) return;
    const claude = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, 'CLAUDE.md'));
    const planmaster = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, '.planmaster/**'));
    const evaluate = (): void => { void this.coordinator.evaluate(folder); };
    const appeared = (): void => { if (!this.instanceMap.has(key)) void this.syncFolders(); };
    this.watchers.set(key, vscode.Disposable.from(
      claude, planmaster,
      claude.onDidCreate(evaluate), claude.onDidChange(evaluate), claude.onDidDelete(evaluate),
      planmaster.onDidCreate(appeared),
    ));
  }
}

async function hasPlanMaster(folder: vscode.WorkspaceFolder): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uriOf(folder.uri, '.planmaster'));
    return true;
  } catch {
    return false;
  }
}
