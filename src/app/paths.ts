import type { FileKind } from '../core/index.js';

export const CONFIG_PATH = '.planmaster/config.json';
const ARCHIVE_DIR = '.planmaster/archive';

/**
 * Tells whether a workspace-relative path is a lane file, an archive file or
 * neither. Only direct children of the lanes and archive directories count.
 */
export function classifyPath(path: string, lanesDir: string): FileKind | null {
  const normalized = path.replace(/\\/g, '/');
  const slash = normalized.lastIndexOf('/');
  if (slash < 0 || normalized.split('/').includes('..')) return null;

  const name = normalized.slice(slash + 1);
  if (!name.endsWith('.md') || name.startsWith('.')) return null;

  const directory = normalized.slice(0, slash);
  if (directory === withoutTrailingSlashes(lanesDir)) return 'lane';
  return directory === ARCHIVE_DIR ? 'archive' : null;
}

function withoutTrailingSlashes(directory: string): string {
  let end = directory.length;
  while (end > 0 && directory.charAt(end - 1) === '/') end--;
  return directory.slice(0, end);
}
