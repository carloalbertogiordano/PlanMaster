#!/usr/bin/env node
import { ConfigError } from '../core/config.js';
import { analyze } from '../core/model.js';
import { parseTimestamp } from '../core/time.js';
import type { Finding } from '../core/types.js';
import { loadWorkspace } from '../node/load.js';

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

function parseArguments(argv: string[]): Options | null {
  let dir: string | undefined;
  let json = false;
  let now = Date.now();
  const mtimes = new Map<string, number>();

  const timeArgument = (flag: string, value: string | undefined): number => {
    const parsed = value === undefined ? null : parseTimestamp(value);
    if (parsed === null) throw new UsageError(`${flag} needs a time in the form YYYY-MM-DDTHH:MM`);
    return parsed;
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (arg === '-h' || arg === '--help') return null;
    if (arg === '--json') json = true;
    else if (arg === '--now') now = timeArgument(arg, argv[++i]);
    else if (arg === '--mtime') {
      const value = argv[++i] ?? '';
      const [lane, time] = value.split('=');
      if (!lane || time === undefined) throw new UsageError('--mtime needs LANE=YYYY-MM-DDTHH:MM');
      mtimes.set(lane, timeArgument(arg, time));
    } else if (arg.startsWith('-')) throw new UsageError(`Unknown option ${arg}`);
    else if (dir === undefined) dir = arg;
    else throw new UsageError('Only one directory can be given');
  }
  if (dir === undefined) throw new UsageError('Missing directory');
  return { dir, json, now, mtimes };
}

function formatFinding(f: Finding): string {
  return `${f.file}:${f.line} ${f.severity} ${f.code} ${f.message}`;
}

function main(argv: string[]): number {
  let options: Options | null;
  try {
    options = parseArguments(argv);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    process.stderr.write(`${error.message}\n\n${USAGE}`);
    return 2;
  }
  if (options === null) {
    process.stdout.write(USAGE);
    return 0;
  }

  try {
    const { input } = loadWorkspace(options.dir);
    for (const file of input.files) {
      const override = file.kind === 'lane' ? options.mtimes.get(file.path.split('/').pop()?.replace(/\.md$/, '') ?? '') : undefined;
      if (override !== undefined) file.mtimeMs = override;
    }
    const analysis = analyze(input, options.now);
    const errors = analysis.findings.filter((f) => f.severity === 'error').length;
    const warnings = analysis.findings.length - errors;

    if (options.json) {
      process.stdout.write(`${JSON.stringify(analysis.findings, null, 2)}\n`);
    } else {
      for (const f of analysis.findings) process.stderr.write(`${formatFinding(f)}\n`);
      const items = analysis.lanes.reduce((n, lane) => n + lane.items.length, 0);
      process.stdout.write(`${plural(errors, 'error')}, ${plural(warnings, 'warning')} in ${plural(analysis.lanes.length, 'lane')}, ${plural(items, 'item')}\n`);
    }
    return errors > 0 ? 1 : 0;
  } catch (error) {
    if (error instanceof ConfigError) {
      process.stderr.write(`${error.message}\n`);
      return 2;
    }
    throw error;
  }
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

process.exitCode = main(process.argv.slice(2));
