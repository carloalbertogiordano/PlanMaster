import * as vscode from 'vscode';
import type { Analysis } from '../core/index.js';
import { hoverMarkdown, waitReferenceAt } from '../core/index.js';
import { uriOf } from './uris.js';

/** The latest analysis and workspace root for a document, if the document belongs to a queue. */
export type AnalysisLookup = (uri: vscode.Uri) => { analysis: Analysis; root: vscode.Uri } | undefined;

function referenceAt(document: vscode.TextDocument, position: vscode.Position) {
  return waitReferenceAt(document.lineAt(position.line).text, position.character);
}

/** Hover over an item ID in a `wait:` token shows that item. */
export class QueueHoverProvider implements vscode.HoverProvider {
  private readonly lookup: AnalysisLookup;

  constructor(lookup: AnalysisLookup) {
    this.lookup = lookup;
  }

  provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | null {
    const reference = referenceAt(document, position);
    const known = this.lookup(document.uri);
    const text = reference && known ? hoverMarkdown(known.analysis, reference.id) : null;
    if (!reference || text === null) return null;

    const markdown = new vscode.MarkdownString(text);
    markdown.isTrusted = false;
    markdown.supportHtml = false;
    return new vscode.Hover(markdown, new vscode.Range(position.line, reference.start, position.line, reference.end));
  }
}

/** Go to definition on an item ID in a `wait:` token jumps to that item, in any lane or archive file. */
export class QueueDefinitionProvider implements vscode.DefinitionProvider {
  private readonly lookup: AnalysisLookup;

  constructor(lookup: AnalysisLookup) {
    this.lookup = lookup;
  }

  provideDefinition(document: vscode.TextDocument, position: vscode.Position): vscode.Location | null {
    const reference = referenceAt(document, position);
    const known = this.lookup(document.uri);
    const target = reference && known ? known.analysis.index.get(reference.id) : undefined;
    if (!target || !known) return null;
    return new vscode.Location(uriOf(known.root, target.file.path), new vscode.Position(target.item.line - 1, 0));
  }
}
