#!/usr/bin/env node
import { ConfigError } from '../core/config.js';
import { formatFinding } from '../core/findings.js';
import { analyze, type Analysis } from '../core/model.js';
import { parseTimestamp } from '../core/time.js';
import type { WorkspaceInput } from '../core/types.js';
import { loadWorkspace } from '../node/load.js';
import { summaryLine } from './report.js';

const USAGE = `Usage: planmaster-lint <workspace-or-.planmaster-dir> [options]

Checks the lane files of a PlanMaster workspace.

Options:
  --json               print findings as a JSON array on stdout
  --now <time>         use this time (YYYY-MM-DDTHH:MM) instead of the clock
  --mtime <LANE=time>  override the modification time of a lane file (repeatable)
  -h, --help           show this help

Findings go to stderr as "file:line severity code message".
Exit code: 0 no errors, 1 at least one error, 2 usage or configuration error.
`;

class UsageError extends Error {}

interface Options {
  dir: string;
  json: boolean;
  now: number;
  mtimes: Map<string, number>;
}

type Draft = Omit<Options, 'dir'> & { dir?: string };
type ValueFlag = (draft: Draft, value: string | undefined) => void;

function timeValue(flag: string, value: string | undefined): number {
  const parsed = value === undefined ? null : parseTimestamp(value);
  if (parsed === null) throw new UsageError(`${flag} needs a time in the form YYYY-MM-DDTHH:MM`);
  return parsed;
}

const VALUE_FLAGS: Readonly<Record<string, ValueFlag>> = {
  '--now': (draft, value) => {
    draft.now = timeValue('--now', value);
  },
  '--mtime': (draft, value) => {
    const [lane, time] = (value ?? '').split('=');
    if (!lane || time === undefined) throw new UsageError('--mtime needs LANE=YYYY-MM-DDTHH:MM');
    draft.mtimes.set(lane, timeValue('--mtime', time));
  },
};

/** Returns null when help was requested. */
function parseArguments(argv: string[]): Options | null {
  const draft: Draft = { json: false, now: Date.now(), mtimes: new Map() };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? '';
    if (arg === '-h' || arg === '--help') return null;
    const valueFlag = VALUE_FLAGS[arg];
    if (arg === '--json') draft.json = true;
    else if (valueFlag) valueFlag(draft, argv[++i]);
    else readPositional(draft, arg);
  }
  if (draft.dir === undefined) throw new UsageError('Missing directory');
  return { ...draft, dir: draft.dir };
}

function readPositional(draft: Draft, arg: string): void {
  if (arg.startsWith('-')) throw new UsageError(`Unknown option ${arg}`);
  if (draft.dir !== undefined) throw new UsageError('Only one directory can be given');
  draft.dir = arg;
}

function applyMtimeOverrides(input: WorkspaceInput, overrides: Map<string, number>): void {
  for (const file of input.files) {
    const lane = file.path.split('/').pop()?.replace(/\.md$/, '') ?? '';
    const override = file.kind === 'lane' ? overrides.get(lane) : undefined;
    if (override !== undefined) file.mtimeMs = override;
  }
}

function printReport(analysis: Analysis, json: boolean): void {
  if (json) {
    process.stdout.write(`${JSON.stringify(analysis.findings, null, 2)}\n`);
    return;
  }
  for (const f of analysis.findings) process.stderr.write(`${formatFinding(f)}\n`);
  process.stdout.write(`${summaryLine(analysis)}\n`);
}

function check(options: Options): number {
  const { input } = loadWorkspace(options.dir);
  applyMtimeOverrides(input, options.mtimes);
  const analysis = analyze(input, options.now);
  printReport(analysis, options.json);
  return analysis.findings.some((f) => f.severity === 'error') ? 1 : 0;
}

function main(argv: string[]): number {
  try {
    const options = parseArguments(argv);
    if (options === null) {
      process.stdout.write(USAGE);
      return 0;
    }
    return check(options);
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`${error.message}\n\n${USAGE}`);
      return 2;
    }
    if (error instanceof ConfigError) {
      process.stderr.write(`${error.message}\n`);
      return 2;
    }
    throw error;
  }
}

process.exitCode = main(process.argv.slice(2));
