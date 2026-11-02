import type { Analysis } from '../core/index.js';

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** "2 errors, 1 warning in 5 lanes, 30 items": the last line of a check. */
export function summaryLine(analysis: Analysis): string {
  const errors = analysis.findings.filter((f) => f.severity === 'error').length;
  const warnings = analysis.findings.length - errors;
  const items = analysis.lanes.reduce((count, lane) => count + lane.items.length, 0);
  return `${plural(errors, 'error')}, ${plural(warnings, 'warning')} in ${plural(analysis.lanes.length, 'lane')}, ${plural(items, 'item')}`;
}
