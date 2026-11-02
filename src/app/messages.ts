import type { Analysis } from '../core/index.js';
import type { QueueViewModel } from './queue-view-model.js';

/** What the queue view can ask the extension to do. */
export type WebviewMessage =
  | { type: 'ready' }
  | { type: 'reveal'; folder: string; path: string; line: number }
  | { type: 'markSeen'; folder: string }
  /** The user asked for the guided setup of this folder. */
  | { type: 'setup'; folder: string }
  /** Sent after each draw, so the extension can tell that the view really showed something. */
  | { type: 'drawn'; lanes: number };

/** What the extension sends to the queue view. */
export interface HostMessage {
  type: 'state';
  folders: QueueViewModel[];
}

const MAX_PATH_LENGTH = 500;
const MAX_FOLDER_LENGTH = 200;
const MAX_LINE = 1_000_000;
const MAX_LANES = 10_000;

type Fields = Record<string, unknown>;

/**
 * Checks a message received from the webview, which is treated as untrusted:
 * anything that is not exactly one of the known shapes is dropped, and only
 * the known fields are kept.
 */
export function parseWebviewMessage(raw: unknown): WebviewMessage | null {
  if (!isFields(raw)) return null;
  const fields = raw;
  switch (fields.type) {
    case 'ready':
      return { type: 'ready' };
    case 'reveal':
      return parseReveal(fields);
    case 'markSeen':
      return parseMarkSeen(fields);
    case 'setup':
      return parseSetup(fields);
    case 'drawn':
      return parseDrawn(fields);
    default:
      return null;
  }
}

function parseReveal({ folder, path, line }: Fields): WebviewMessage | null {
  if (!isBoundedString(folder, MAX_FOLDER_LENGTH) || !isBoundedString(path, MAX_PATH_LENGTH)) return null;
  if (typeof line !== 'number' || !Number.isInteger(line) || line < 1 || line > MAX_LINE) return null;
  return { type: 'reveal', folder, path, line };
}

function parseMarkSeen({ folder }: Fields): WebviewMessage | null {
  return isBoundedString(folder, MAX_FOLDER_LENGTH) ? { type: 'markSeen', folder } : null;
}

function parseSetup({ folder }: Fields): WebviewMessage | null {
  return isBoundedString(folder, MAX_FOLDER_LENGTH) ? { type: 'setup', folder } : null;
}

function parseDrawn({ lanes }: Fields): WebviewMessage | null {
  const valid = typeof lanes === 'number' && Number.isInteger(lanes) && lanes >= 0 && lanes <= MAX_LANES;
  return valid ? { type: 'drawn', lanes } : null;
}

function isBoundedString(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}

/**
 * Checks a message from the extension. It comes from our own code, so only
 * its overall shape is verified before the webview draws it.
 */
export function parseHostMessage(raw: unknown): HostMessage | null {
  if (!isFields(raw) || raw.type !== 'state') return null;
  const { folders } = raw;
  if (!Array.isArray(folders) || !folders.every(isFields)) return null;
  return { type: 'state', folders: folders as unknown as QueueViewModel[] };
}

function isFields(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Only files the extension has read may be opened on behalf of the webview. */
export function isKnownPath(analysis: Analysis, path: string): boolean {
  return [...analysis.lanes, ...analysis.archives].some((file) => file.path === path);
}
