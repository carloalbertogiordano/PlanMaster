import * as vscode from 'vscode';
import type { DiagnosticEntry, FocusMarks, ViewState } from '../app/index.js';
import { CONFIG_PATH } from '../app/index.js';
import { uriOf } from './uris.js';

/** Something that shows a view state in the editor. */
export interface View extends vscode.Disposable {
  apply(state: ViewState): void;
}

const setting = (name: string): boolean => vscode.workspace.getConfiguration('planmaster').get<boolean>(name, true);

const SEVERITY = {
  error: vscode.DiagnosticSeverity.Error,
  warning: vscode.DiagnosticSeverity.Warning,
} as const;

function toDiagnostic(entry: DiagnosticEntry): vscode.Diagnostic {
  const line = entry.line - 1;
  const diagnostic = new vscode.Diagnostic(new vscode.Range(line, entry.start, line, entry.end), entry.message, SEVERITY[entry.severity]);
  diagnostic.code = entry.code;
  diagnostic.source = 'PlanMaster';
  return diagnostic;
}

/** Findings in the Problems panel and as squiggles. */
export class DiagnosticsView implements View {
  private readonly collection: vscode.DiagnosticCollection;
  private readonly root: vscode.Uri;

  constructor(root: vscode.Uri, name: string) {
    this.root = root;
    this.collection = vscode.languages.createDiagnosticCollection(`planmaster:${name}`);
  }

  apply(state: ViewState): void {
    this.collection.clear();
    if (!setting('diagnostics.enabled')) return;
    if (state.kind === 'config-error') {
      const range = new vscode.Range(0, 0, 0, 1);
      this.collection.set(uriOf(this.root, CONFIG_PATH), [new vscode.Diagnostic(range, state.message, vscode.DiagnosticSeverity.Error)]);
      return;
    }
    for (const file of state.diagnostics) {
      this.collection.set(uriOf(this.root, file.path), file.entries.map(toDiagnostic));
    }
  }

  dispose(): void {
    this.collection.dispose();
  }
}

/** The summary item in the status bar. */
export class StatusView implements View {
  private readonly item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  private readonly prefix: string;

  /** `prefix` tells folders apart in a multi-root workspace. */
  constructor(prefix: string) {
    this.prefix = prefix;
    this.item.command = 'workbench.actions.view.problems';
  }

  apply(state: ViewState): void {
    if (!setting('statusBar.enabled')) {
      this.item.hide();
      return;
    }
    if (state.kind === 'config-error') {
      this.show('$(error) PlanMaster: config.json is invalid', state.message, 'error');
    } else {
      const { text, tooltip, level } = state.status;
      this.show(text, tooltip.join('\n'), level);
    }
  }

  private show(text: string, tooltip: string, level: 'normal' | 'warning' | 'error'): void {
    this.item.text = `${this.prefix}${text}`;
    this.item.tooltip = tooltip;
    this.item.backgroundColor = backgroundFor(level);
    this.item.show();
  }

  dispose(): void {
    this.item.dispose();
  }
}

function backgroundFor(level: 'normal' | 'warning' | 'error'): vscode.ThemeColor | undefined {
  if (level === 'error') return new vscode.ThemeColor('statusBarItem.errorBackground');
  return level === 'warning' ? new vscode.ThemeColor('statusBarItem.warningBackground') : undefined;
}

/** A gutter arrow on every item in progress and a tint on each lane's focus line. */
export class DecorationsView implements View {
  private readonly doing: vscode.TextEditorDecorationType;
  private readonly focus = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: new vscode.ThemeColor('editor.rangeHighlightBackground'),
  });
  private readonly root: vscode.Uri;
  private readonly subscription: vscode.Disposable;
  private marks = new Map<string, FocusMarks>();

  constructor(root: vscode.Uri, extensionUri: vscode.Uri) {
    this.root = root;
    this.doing = vscode.window.createTextEditorDecorationType({
      gutterIconPath: vscode.Uri.joinPath(extensionUri, 'media', 'doing.svg'),
      gutterIconSize: 'contain',
    });
    this.subscription = vscode.window.onDidChangeVisibleTextEditors(() => { this.paintAll(); });
  }

  apply(state: ViewState): void {
    const marks = state.kind === 'ok' ? state.marks : [];
    this.marks = new Map(marks.map((m) => [uriOf(this.root, m.path).toString(), m]));
    this.paintAll();
  }

  private paintAll(): void {
    for (const editor of vscode.window.visibleTextEditors) this.paint(editor);
  }

  private paint(editor: vscode.TextEditor): void {
    const marks = this.marks.get(editor.document.uri.toString());
    const lineRange = (line: number): vscode.Range => new vscode.Range(line - 1, 0, line - 1, 0);
    editor.setDecorations(this.doing, (marks?.doingLines ?? []).map(lineRange));
    editor.setDecorations(this.focus, marks?.focusLine ? [lineRange(marks.focusLine)] : []);
  }

  dispose(): void {
    this.subscription.dispose();
    this.doing.dispose();
    this.focus.dispose();
  }
}
