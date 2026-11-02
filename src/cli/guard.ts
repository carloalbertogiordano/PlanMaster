import fs from 'node:fs';
import path from 'node:path';
import type { AskedGuard } from './hook-runner.js';

/**
 * A private place for the little state the hooks keep between runs: the
 * directory named by PLANMASTER_STATE_DIR, else the user's cache directory.
 * It is never a shared temporary directory, where another local user could
 * plant a link under a predictable name.
 */
export function stateDirectory(env: Readonly<Record<string, string | undefined>>, home: string, platform: string): string {
  const custom = env.PLANMASTER_STATE_DIR;
  if (custom !== undefined && custom !== '') return custom;
  if (platform === 'win32') return path.win32.join(env.LOCALAPPDATA ?? path.win32.join(home, 'AppData', 'Local'), 'planmaster');
  return path.posix.join(env.XDG_CACHE_HOME ?? path.posix.join(home, '.cache'), 'planmaster');
}

const MAX_SESSION_LENGTH = 100;

/** Remembers the last request per session and lane, one small file per session. */
export function fileGuard(directory: string): AskedGuard {
  const fileFor = (session: string): string => {
    const safe = session.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, MAX_SESSION_LENGTH);
    return path.join(directory, `hook-${safe === '' ? 'session' : safe}.json`);
  };

  const read = (session: string): Record<string, string> => {
    try {
      return JSON.parse(fs.readFileSync(fileFor(session), 'utf8')) as Record<string, string>;
    } catch {
      return {};
    }
  };

  return {
    get: (session, lane) => read(session)[lane],
    set: (session, lane, fingerprint) => {
      fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
      fs.writeFileSync(fileFor(session), JSON.stringify({ ...read(session), [lane]: fingerprint }), { mode: 0o600 });
    },
  };
}
