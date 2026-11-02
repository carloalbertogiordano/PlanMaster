#!/usr/bin/env node
// The program that Claude Code hooks run: `planmaster-hook post-edit|stop|session-start`.
// It reads the hook payload on standard input and answers with its exit code, stdout and stderr.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TEMPLATES } from '../bundled/templates.js';
import { loadWorkspace } from '../node/load.js';
import { fileGuard, stateDirectory } from './guard.js';
import { runHook } from './hook-runner.js';

function findRoot(start: string): string | null {
  for (let directory = path.resolve(start); ; directory = path.dirname(directory)) {
    if (fs.existsSync(path.join(directory, '.planmaster'))) return directory;
    if (path.dirname(directory) === directory) return null;
  }
}

const result = runHook({
  event: process.argv[2] ?? '',
  stdin: fs.readFileSync(0, 'utf8'),
  env: process.env,
  now: Date.now(),
  laneStartTemplate: TEMPLATES.laneStart,
  findRoot,
  load: (root) => loadWorkspace(root).input,
  guard: fileGuard(stateDirectory(process.env, os.homedir(), process.platform)),
});
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exitCode = result.exitCode;
