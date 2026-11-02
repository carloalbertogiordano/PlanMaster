import * as vscode from 'vscode';
import {
  copyArchivePrompt,
  copyLaneStartPrompt,
  copyMigrationPrompt,
  copyPlanToQueuePrompt,
  copyReconcilePrompt,
  initWorkspace,
  installHooks,
  installInstructions,
  revealItem,
  type CommandContext,
  type CommandStatus,
  type UserInterface,
} from '../app/index.js';
import type { Analysis } from '../core/index.js';
import { TEMPLATES } from '../bundled/templates.js';
import { PROPOSED_SCHEMES, ProposedContent, VsCodeUserInterface } from './user-interface.js';
import { VsCodeWorkspaceFiles } from './workspace-files.js';

type Flow = (context: CommandContext) => Promise<CommandStatus>;

/** What the commands need to know about the running extension. */
export interface CommandHost {
  analysisFor(folder: vscode.WorkspaceFolder): Analysis | undefined;
  /** Starts watching folders that have just got a `.planmaster` directory. */
  syncFolders(): Promise<void>;
}

const COMMANDS: readonly { id: string; flow: Flow }[] = [
  { id: 'planmaster.initWorkspace', flow: initWorkspace },
  { id: 'planmaster.installInstructions', flow: installInstructions },
  { id: 'planmaster.installHooks', flow: installHooks },
  { id: 'planmaster.copyLanePrompt', flow: copyLaneStartPrompt },
  { id: 'planmaster.copyMigratePrompt', flow: copyMigrationPrompt },
  { id: 'planmaster.copyPlanToQueuePrompt', flow: copyPlanToQueuePrompt },
  { id: 'planmaster.copyReconcilePrompt', flow: copyReconcilePrompt },
  { id: 'planmaster.copyArchivePrompt', flow: copyArchivePrompt },
  { id: 'planmaster.revealItem', flow: revealItem },
];

export type UserInterfaceFactory = (folder: vscode.WorkspaceFolder) => UserInterface;

/** Registers the commands of the extension. None of them edits a lane file. */
export class CommandRegistry {
  private readonly host: CommandHost;
  private readonly extensionUri: vscode.Uri;
  private readonly content = new ProposedContent();
  private override: UserInterfaceFactory | undefined;

  constructor(host: CommandHost, extensionUri: vscode.Uri) {
    this.host = host;
    this.extensionUri = extensionUri;
  }

  /** Replaces the user interface, so tests can answer the questions. Pass undefined to restore the editor's. */
  useUserInterface(factory: UserInterfaceFactory | undefined): void {
    this.override = factory;
  }

  createUserInterface(folder: vscode.WorkspaceFolder): UserInterface {
    return this.override?.(folder) ?? new VsCodeUserInterface(folder, this.content);
  }

  register(context: vscode.ExtensionContext): void {
    for (const scheme of PROPOSED_SCHEMES) {
      context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(scheme, this.content));
    }
    for (const { id, flow } of COMMANDS) {
      context.subscriptions.push(vscode.commands.registerCommand(id, () => this.run(id, flow)));
    }
  }

  private readHookScript(): Promise<string> {
    return hookScriptOf(this.extensionUri);
  }

  private async run(id: string, flow: Flow): Promise<CommandStatus> {
    const folder = await pickFolder();
    if (!folder) return 'cancelled';
    const status = await flow({
      ui: this.createUserInterface(folder),
      files: new VsCodeWorkspaceFiles(folder.uri),
      templates: TEMPLATES,
      readHookScript: () => this.readHookScript(),
      analysis: this.host.analysisFor(folder),
    });
    if (id === 'planmaster.initWorkspace' && status === 'done') await this.host.syncFolders();
    return status;
  }
}

/** The hook program, bundled with the extension, as text to be copied into a project. */
function hookScriptOf(extensionUri: vscode.Uri): Promise<string> {
  return Promise.resolve(vscode.workspace.fs.readFile(vscode.Uri.joinPath(extensionUri, 'dist', 'planmaster-hook.cjs'))).then((bytes) => new TextDecoder().decode(bytes));
}

async function pickFolder(): Promise<vscode.WorkspaceFolder | undefined> {
  const folders = vscode.workspace.workspaceFolders ?? [];
  if (folders.length === 0) {
    void vscode.window.showWarningMessage('Open a folder first: PlanMaster works on the files of a workspace.');
    return undefined;
  }
  const [only] = folders;
  if (folders.length === 1) return only;
  const chosen = await vscode.window.showQuickPick(folders.map((folder) => ({ label: folder.name, folder })), { placeHolder: 'Choose a workspace folder' });
  return chosen?.folder;
}
