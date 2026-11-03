import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze, type Analysis } from '../../src/core/index.js';
import { loadWorkspace } from '../../src/node/load.js';
import { NOW, T } from '../helpers.js';

// A string is passed to fileURLToPath because some test environments replace the global URL class.
export const DEMO_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../docs/examples/demo-workspace');

/** Modification times documented in the demo workspace README. */
export const DEMO_MTIMES: Record<string, string> = {
  A: '2026-11-02T11:44',
  B: '2026-11-02T11:12',
  C: '2026-11-02T11:35',
  D: '2026-11-02T11:30',
  E: '2026-11-02T08:07',
};

/** The demo workspace analysed at its reference time, with the documented file times. */
export function analyzeDemo(directory: string = DEMO_DIR): Analysis {
  const { input } = loadWorkspace(directory);
  for (const file of input.files) {
    const lane = file.path.split('/').pop()?.replace(/\.md$/, '') ?? '';
    file.mtimeMs = T(DEMO_MTIMES[lane] ?? '');
  }
  return analyze(input, NOW);
}
