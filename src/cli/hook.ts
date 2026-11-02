#!/usr/bin/env node
// The program that Claude Code hooks run: `planmaster-hook post-edit|stop|session-start`.
// It reads the hook payload on standard input and answers with its exit code, stdout and stderr.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TEMPLATES } from '../bundled/templates.js';
import { loadWorkspace } from '../node/load.js';
import { runHook, type AskedGuard } from './hook-runner.js';

function findRoot(start: string): string | null {
  for (let directory = path.resolve(start); ; directory = path.dirname(directory)) {
    if (fs.existsSync(path.join(directory, '.planmaster'))) return directory;
    if (path.dirname(directory) === directory) return null;
  }
}

/** Kept in the temporary directory, so nothing is added to the project. */
function fileGuard(): AskedGuard {
  const fileFor = (session: string): string => path.join(os.tmpdir(), `planmaster-hook-${session.replace(/[^A-Za-z0-9_-]/g, '_') || 'session'}.json`);
  const read = (session: string): Record<string, string> => {
    try {
      return JSON.parse(fs.readFileSync(fileFor(session), 'utf8')) as Record<string, string>;
    } catch {
      return {};
    }
  };
  return {
    get: (session, lane) => read(session)[lane],
    set: (session, lane, fingerprint) => { fs.writeFileSync(fileFor(session), JSON.stringify({ ...read(session), [lane]: fingerprint })); },
  };
}

const result = runHook({
  event: process.argv[2] ?? '',
  stdin: fs.readFileSync(0, 'utf8'),
  env: process.env,
  now: Date.now(),
  laneStartTemplate: TEMPLATES.laneStart,
  findRoot,
  load: (root) => loadWorkspace(root).input,
  guard: fileGuard(),
});
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exitCode = result.exitCode;
