import * as vscode from 'vscode';
import type { InputOptions, PickItem, UserInterface } from '../app/index.js';
import { openAtLine } from './editor.js';
import { relativePath } from './uris.js';

const BEFORE = 'planmaster-before';
const AFTER = 'planmaster-after';

/** Serves the two sides of a diff from memory, so previewing a change never touches the real file. */
export class ProposedContent implements vscode.TextDocumentContentProvider {
  private readonly texts = new Map<string, string>();

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.texts.get(uri.toString()) ?? '';
  }

  set(uri: vscode.Uri, text: string): void {
    this.texts.set(uri.toString(), text);
  }
}

/** The dialogs, diff, clipboard and editor of VS Code, for one workspace folder. */
export class VsCodeUserInterface implements UserInterface {
  private readonly folder: vscode.WorkspaceFolder;
  private readonly content: ProposedContent;

  constructor(folder: vscode.WorkspaceFolder, content: ProposedContent) {
    this.folder = folder;
    this.content = content;
  }

  async pick<T>(items: readonly PickItem<T>[], placeholder: string): Promise<T | undefined> {
    const choices = items.map((item) => ({ ...item, label: item.label }));
    const chosen = await vscode.window.showQuickPick(choices, { placeHolder: placeholder, matchOnDescription: true, matchOnDetail: true });
    return chosen?.value;
  }

  input(options: InputOptions): Promise<string | undefined> {
    const inputOptions: vscode.InputBoxOptions = { prompt: options.prompt, ignoreFocusOut: true };
    const validate = options.validate;
    if (validate) inputOptions.validateInput = (value) => validate(value);
    return Promise.resolve(vscode.window.showInputBox(inputOptions));
  }

  async confirm(message: string, detail: string, action: string): Promise<boolean> {
    return (await vscode.window.showInformationMessage(message, { modal: true, detail }, action)) === action;
  }

  async previewChange(path: string, before: string, after: string): Promise<void> {
    const left = vscode.Uri.from({ scheme: BEFORE, path: `/${path}` });
    const right = vscode.Uri.from({ scheme: AFTER, path: `/${path}` });
    this.content.set(left, before);
    this.content.set(right, after);
    await vscode.commands.executeCommand('vscode.diff', left, right, `${path}: current ↔ proposed`);
  }

  async chooseFile(prompt: string): Promise<string | undefined> {
    const [uri] = (await vscode.window.showOpenDialog({ canSelectMany: false, defaultUri: this.folder.uri, title: prompt })) ?? [];
    if (!uri) return undefined;
    return relativePath(this.folder.uri, uri) ?? uri.fsPath;
  }

  async copy(text: string): Promise<void> {
    await vscode.env.clipboard.writeText(text);
  }

  inform(message: string): void {
    void vscode.window.showInformationMessage(message);
  }

  warn(message: string): void {
    void vscode.window.showWarningMessage(message);
  }

  show(path: string, line: number): Promise<void> {
    return openAtLine(this.folder.uri, path, line);
  }
}

export const PROPOSED_SCHEMES = [BEFORE, AFTER] as const;
