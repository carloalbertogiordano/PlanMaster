import * as vscode from 'vscode';
import type { QueueViewModel, UserInterface } from '../app/index.js';
import { CommandRegistry, type UserInterfaceFactory } from './commands.js';
import { QueueDefinitionProvider, QueueHoverProvider } from './providers.js';
import { InstanceManager } from './manager.js';
import { QueueViewProvider } from './queue-view-provider.js';

const LANGUAGE = 'planmaster-lane';

/** A read-only summary of what the extension currently shows, for tests and other extensions. */
export interface PlanMasterApi {
  states(): { folder: string; kind: string; statusText?: string }[];
  /** What the queue view was last sent. */
  queueView(): { resolved: boolean; folders: QueueViewModel[]; drawnLanes: number | undefined };
  /** Delivers a message as if the queue view had sent it. Returns whether it was accepted. */
  handleQueueMessage(raw: unknown): Promise<boolean>;
  /** Why each workspace folder needs the guided setup, or null when it does not. */
  setupReasons(): { folder: string; reason: string | null }[];
  /** Hooks for tests; the dialogs cannot be answered in a headless editor. */
  testing: {
    /** Answers the commands' questions from a script. Pass undefined to restore the editor's own dialogs. */
    useUserInterface(factory: UserInterfaceFactory | undefined): void;
    /** The editor's real user interface for a folder, for the parts that need no answers. */
    createUserInterface(folderName: string): UserInterface;
    /** Lets the offer to set up be made again in this session. */
    resetOffers(): void;
  };
}

function apiOf(manager: InstanceManager, provider: QueueViewProvider, commands: CommandRegistry): PlanMasterApi {
  return {
    testing: {
      useUserInterface: (factory) => { commands.useUserInterface(factory); },
      resetOffers: () => { manager.resetOffers(); },
      createUserInterface: (folderName) => {
        const folder = vscode.workspace.workspaceFolders?.find((candidate) => candidate.name === folderName);
        if (!folder) throw new Error(`No workspace folder named ${folderName}`);
        return commands.createUserInterface(folder);
      },
    },
    queueView: () => provider.lastPosted,
    handleQueueMessage: (raw) => provider.handleMessage(raw),
    setupReasons: () => manager.setupReasons(),
    states: () => manager.instances().map((instance) => {
      const state = instance.state;
      const statusText = state?.kind === 'ok' ? state.status.text : undefined;
      return { folder: instance.folder.name, kind: state?.kind ?? 'none', ...(statusText === undefined ? {} : { statusText }) };
    }),
  };
}

export async function activate(context: vscode.ExtensionContext): Promise<PlanMasterApi> {
  const output = vscode.window.createOutputChannel('PlanMaster');
  const manager = new InstanceManager(context, output);
  const provider = new QueueViewProvider(context.extensionUri, manager);
  manager.setChangeListener(() => { provider.push(); });
  const commands = new CommandRegistry(manager, context.extensionUri);
  manager.attach(commands);
  commands.register(context);
  const selector: vscode.DocumentSelector = { language: LANGUAGE };

  context.subscriptions.push(
    output,
    manager,
    vscode.languages.registerHoverProvider(selector, new QueueHoverProvider(manager.lookup)),
    vscode.languages.registerDefinitionProvider(selector, new QueueDefinitionProvider(manager.lookup)),
    vscode.window.registerWebviewViewProvider(QueueViewProvider.viewType, provider),
    vscode.commands.registerCommand('planmaster.runLint', () => manager.reloadAll()),
    vscode.commands.registerCommand('planmaster.markSeen', () => manager.markSeen()),
    vscode.workspace.onDidChangeWorkspaceFolders(() => { void manager.syncFolders(); }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('planmaster')) manager.refreshViews();
    }),
  );
  await manager.syncFolders();
  return apiOf(manager, provider, commands);
}

export function deactivate(): void {
  // Everything is released through context.subscriptions.
}
