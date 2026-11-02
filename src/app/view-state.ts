import { findingRange, laneFocus, statusBarModel, type Analysis, type Finding, type Severity, type StatusBarModel } from '../core/index.js';

export interface DiagnosticEntry {
  /** 1-based. */
  line: number;
  /** Columns to underline; `end` is exclusive. */
  start: number;
  end: number;
  severity: Severity;
  code: string;
  message: string;
}

export interface FileDiagnostics {
  path: string;
  entries: DiagnosticEntry[];
}

/** Lines to decorate in one lane file. */
export interface FocusMarks {
  path: string;
  /** Every item in progress, at any level. */
  doingLines: number[];
  /** The lane's top-level item in progress. */
  focusLine: number | null;
}

export interface OkViewState {
  kind: 'ok';
  analysis: Analysis;
  status: StatusBarModel;
  diagnostics: FileDiagnostics[];
  marks: FocusMarks[];
}

export interface ConfigErrorViewState {
  kind: 'config-error';
  message: string;
}

export type ViewState = OkViewState | ConfigErrorViewState;

export function buildViewState(analysis: Analysis, textOf: (path: string) => string | undefined): OkViewState {
  return {
    kind: 'ok',
    analysis,
    status: statusBarModel(analysis),
    diagnostics: diagnosticsOf(analysis.findings, textOf),
    marks: analysis.lanes.map((lane) => ({
      path: lane.path,
      doingLines: lane.items.filter((item) => item.marker === '~').map((item) => item.line),
      focusLine: laneFocus(lane)?.line ?? null,
    })),
  };
}

function diagnosticsOf(findings: Finding[], textOf: (path: string) => string | undefined): FileDiagnostics[] {
  const lines = new Map<string, string[]>();
  const lineOf = (finding: Finding): string | undefined => {
    if (!lines.has(finding.file)) lines.set(finding.file, textOf(finding.file)?.split(/\r?\n/) ?? []);
    return lines.get(finding.file)?.[finding.line - 1];
  };

  const byPath = new Map<string, DiagnosticEntry[]>();
  for (const finding of findings) {
    const { start, end } = findingRange(lineOf(finding), finding.itemId);
    const entry: DiagnosticEntry = { line: finding.line, start, end, severity: finding.severity, code: finding.code, message: finding.message };
    byPath.set(finding.file, [...(byPath.get(finding.file) ?? []), entry]);
  }
  return [...byPath].map(([path, entries]) => ({ path, entries }));
}
