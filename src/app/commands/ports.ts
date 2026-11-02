import type { Analysis } from '../../core/index.js';
import type { Templates } from '../prompts.js';

export interface PickItem<T> {
  label: string;
  description?: string;
  detail?: string;
  value: T;
}

export interface InputOptions {
  prompt: string;
  /** Returns an error message to refuse the text, or undefined to accept it. */
  validate?: (value: string) => string | undefined;
}

/** Everything the commands need from the editor's user interface. Each method returns undefined or false when the user cancels. */
export interface UserInterface {
  pick<T>(items: readonly PickItem<T>[], placeholder: string): Promise<T | undefined>;
  input(options: InputOptions): Promise<string | undefined>;
  confirm(message: string, detail: string, action: string): Promise<boolean>;
  /** Shows the change to a file side by side, before the user decides. */
  previewChange(path: string, before: string, after: string): Promise<void>;
  /** Lets the user choose a file; returns a workspace-relative path when it is inside the workspace. */
  chooseFile(prompt: string): Promise<string | undefined>;
  copy(text: string): Promise<void>;
  inform(message: string): void;
  warn(message: string): void;
  /** Opens a file at a 1-based line. */
  show(path: string, line: number): Promise<void>;
}

/** Reads and writes workspace files by workspace-relative path. */
export interface WorkspaceFiles {
  /** The text of the file, or undefined when it does not exist. */
  read(path: string): Promise<string | undefined>;
  /** Writes the file, creating missing directories. */
  write(path: string, text: string): Promise<void>;
}

export interface CommandContext {
  ui: UserInterface;
  files: WorkspaceFiles;
  templates: Templates;
  /** The text of the hook script that the hooks run; it is copied into the project. */
  hookScript: string;
  /** The current analysis of the folder, if it could be made. */
  analysis: Analysis | undefined;
}

export type CommandStatus = 'done' | 'cancelled' | 'nothing' | 'refused';
