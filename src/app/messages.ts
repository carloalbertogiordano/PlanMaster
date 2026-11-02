import type { Analysis } from '../core/index.js';
import type { QueueViewModel } from './queue-view-model.js';

/** What the queue view can ask the extension to do. */
export type WebviewMessage =
  | { type: 'ready' }
  | { type: 'reveal'; path: string; line: number }
  | { type: 'markSeen'; folder: string };

/** What the extension sends to the queue view. */
export interface HostMessage {
  type: 'state';
  folders: QueueViewModel[];
}

const MAX_PATH_LENGTH = 500;
const MAX_FOLDER_LENGTH = 200;
const MAX_LINE = 1_000_000;

type Fields = Record<string, unknown>;

/**
 * Checks a message received from the webview, which is treated as untrusted:
 * anything that is not exactly one of the known shapes is dropped, and only
 * the known fields are kept.
 */
export function parseWebviewMessage(raw: unknown): WebviewMessage | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const fields = raw as Fields;
  switch (fields.type) {
    case 'ready':
      return { type: 'ready' };
    case 'reveal':
      return parseReveal(fields);
    case 'markSeen':
      return parseMarkSeen(fields);
    default:
      return null;
  }
}

function parseReveal({ path, line }: Fields): WebviewMessage | null {
  if (!isBoundedString(path, MAX_PATH_LENGTH)) return null;
  if (typeof line !== 'number' || !Number.isInteger(line) || line < 1 || line > MAX_LINE) return null;
  return { type: 'reveal', path, line };
}

function parseMarkSeen({ folder }: Fields): WebviewMessage | null {
  return isBoundedString(folder, MAX_FOLDER_LENGTH) ? { type: 'markSeen', folder } : null;
}

function isBoundedString(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}

/** Only files the extension has read may be opened on behalf of the webview. */
export function isKnownPath(analysis: Analysis, path: string): boolean {
  return [...analysis.lanes, ...analysis.archives].some((file) => file.path === path);
}
