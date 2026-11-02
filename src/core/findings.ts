import type { Finding, Location, Severity } from './types.js';

/** Default severity of each rule, as listed in docs/spec/queue-format.md section 12. */
export const RULE_SEVERITY: Readonly<Record<string, Severity>> = {
  PM001: 'error',
  PM002: 'error',
  PM003: 'error',
  PM004: 'error',
  PM005: 'error',
  PM006: 'error',
  PM007: 'error',
  PM008: 'error',
  PM009: 'error',
  PM010: 'error',
  PM011: 'warning',
  PM012: 'warning',
  PM013: 'warning',
  PM014: 'error',
  PM015: 'warning',
  PM016: 'warning',
  PM017: 'error',
  PM018: 'warning',
  PM019: 'error',
  PM020: 'warning',
  PM021: 'error',
};

export interface FindingOptions {
  itemId?: string;
  severity?: Severity;
}

export function finding(code: string, at: Location, message: string, options: FindingOptions = {}): Finding {
  const severity = options.severity ?? RULE_SEVERITY[code];
  if (!severity) throw new Error(`Unknown rule ${code}`);
  const result: Finding = { code, severity, file: at.file, line: at.line, message };
  if (options.itemId !== undefined) result.itemId = options.itemId;
  return result;
}

export function sortFindings(findings: Finding[]): Finding[] {
  return findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.code.localeCompare(b.code));
}
