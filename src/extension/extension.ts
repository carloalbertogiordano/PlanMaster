import * as vscode from 'vscode';
import { QueueDefinitionProvider, QueueHoverProvider, type AnalysisLookup } from './providers.js';
import { WorkspaceInstance } from './instance.js';
import { relativePath, uriOf } from './uris.js';

const LANGUAGE = 'planmaster-lane';

/** A read-only summary of what the extension currently shows, for tests and other extensions. */
export interface PlanMasterApi {
  states(): { folder: string; kind: string; statusText?: string }[];
}

class InstanceManager implements vscode.Disposable {
  private readonly instances = new Map<string, WorkspaceInstance>();
  private readonly extensionUri: vscode.Uri;
  private readonly output: vscode.OutputChannel;

  constructor(extensionUri: vscode.Uri, output: vscode.OutputChannel) {
    this.extensionUri = extensionUri;
    this.output = output;
  }

  /** Starts an instance for every folder that has a `.planmaster` directory and stops the ones for removed folders. */
  async syncFolders(): Promise<void> {
    const folders = vscode.workspace.workspaceFolders ?? [];
    const wanted = new Set(folders.map((f) => f.uri.toString()));
    for (const [key, instance] of this.instances) {
      if (wanted.has(key)) continue;
      instance.dispose();
      this.instances.delete(key);
    }
    for (const folder of folders) {
      const key = folder.uri.toString();
      if (this.instances.has(key) || !(await hasPlanMaster(folder))) continue;
      const instance = new WorkspaceInstance(folder, this.extensionUri, this.output, folders.length > 1);
      this.instances.set(key, instance);
      await instance.start();
    }
  }

  async reloadAll(): Promise<void> {
    await Promise.all([...this.instances.values()].map((instance) => instance.reloadAll()));
  }

  refreshViews(): void {
    for (const instance of this.instances.values()) instance.refresh();
  }

  readonly lookup: AnalysisLookup = (uri) => {
    for (const instance of this.instances.values()) {
      const analysis = instance.analysis;
      if (analysis && relativePath(instance.folder.uri, uri) !== null) return { analysis, root: instance.folder.uri };
    }
    return undefined;
  };

  api(): PlanMasterApi {
    return {
      states: () => [...this.instances.values()].map((instance) => {
        const state = instance.state;
        const statusText = state?.kind === 'ok' ? state.status.text : undefined;
        return { folder: instance.folder.name, kind: state?.kind ?? 'none', ...(statusText === undefined ? {} : { statusText }) };
      }),
    };
  }

  dispose(): void {
    for (const instance of this.instances.values()) instance.dispose();
    this.instances.clear();
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

export async function activate(context: vscode.ExtensionContext): Promise<PlanMasterApi> {
  const output = vscode.window.createOutputChannel('PlanMaster');
  const manager = new InstanceManager(context.extensionUri, output);
  const selector: vscode.DocumentSelector = { language: LANGUAGE };

  context.subscriptions.push(
    output,
    manager,
    vscode.languages.registerHoverProvider(selector, new QueueHoverProvider(manager.lookup)),
    vscode.languages.registerDefinitionProvider(selector, new QueueDefinitionProvider(manager.lookup)),
    vscode.commands.registerCommand('planmaster.runLint', () => manager.reloadAll()),
    vscode.workspace.onDidChangeWorkspaceFolders(() => { void manager.syncFolders(); }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('planmaster')) manager.refreshViews();
    }),
  );
  await manager.syncFolders();
  return manager.api();
}

export function deactivate(): void {
  // Everything is released through context.subscriptions.
}
