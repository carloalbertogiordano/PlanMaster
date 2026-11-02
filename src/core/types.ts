export type Marker = ' ' | '~' | '!' | 'x' | '-';
export type Severity = 'error' | 'warning';
export type FileKind = 'lane' | 'archive';

export interface Tokens {
  ref?: string;
  wait?: string;
  since?: string;
  done?: string;
}

export interface Item {
  id: string;
  marker: Marker;
  title: string;
  tokens: Tokens;
  /** Effective nesting level, 0 for top-level items. */
  depth: number;
  /** 1-based line number in the file. */
  line: number;
  parent: Item | null;
  children: Item[];
  /** Lane ID taken from the file name. */
  lane: string;
  file: string;
}

export interface FrontMatter {
  format?: string;
  lane?: string;
  title?: string;
  unknownKeys: string[];
}

export interface LaneFile {
  path: string;
  kind: FileKind;
  /** Lane ID taken from the file name. */
  lane: string;
  frontMatter: FrontMatter;
  roots: Item[];
  /** All items in file order. */
  items: Item[];
  mtimeMs?: number | undefined;
}

export interface Finding {
  code: string;
  severity: Severity;
  file: string;
  line: number;
  message: string;
  itemId?: string;
}

export interface Config {
  format: number;
  people: string[];
  staleAfterMinutes: number;
  doneVisibleDays: number;
  archiveAfterDays: number;
  lanesDir: string;
}

export interface SourceFile {
  /** Workspace-relative path with forward slashes. */
  path: string;
  kind: FileKind;
  text: string;
  mtimeMs?: number | undefined;
}

export interface UnreadableFile {
  path: string;
  kind: FileKind;
  reason: string;
}

export interface WorkspaceInput {
  files: SourceFile[];
  unreadable?: UnreadableFile[];
  configText?: string | undefined;
}

export const CLOSED_MARKERS: readonly Marker[] = ['x', '-'];

export function isClosed(item: Pick<Item, 'marker'>): boolean {
  return item.marker === 'x' || item.marker === '-';
}
