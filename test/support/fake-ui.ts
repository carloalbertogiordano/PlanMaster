import type { InputOptions, PickItem, UserInterface, WorkspaceFiles } from '../../src/app/commands/ports.js';

/** Scripted answers for each kind of question, in the order they are asked. */
export interface Script {
  inputs?: (string | undefined)[];
  /** Index of the item to choose, or undefined to cancel. */
  picks?: (number | undefined)[];
  confirm?: boolean;
  /** Answers to successive confirmations; once used up, `confirm` applies. */
  confirms?: boolean[];
  /** The button to press for successive offers, or undefined to dismiss. */
  offers?: (string | undefined)[];
  file?: string | undefined;
}

/** A user interface that answers from a script and records everything shown to the user. */
export class FakeUi implements UserInterface {
  readonly informed: string[] = [];
  readonly warned: string[] = [];
  readonly copied: string[] = [];
  readonly shown: { path: string; line: number }[] = [];
  readonly previews: { path: string; before: string; after: string }[] = [];
  readonly confirmations: { message: string; detail: string; action: string }[] = [];
  readonly pickLists: { placeholder: string; items: PickItem<unknown>[] }[] = [];
  readonly inputs: { prompt: string; validation: string | undefined }[] = [];
  readonly offered: { message: string; actions: readonly string[] }[] = [];
  readonly texts: string[] = [];
  private readonly script: Script;
  private inputIndex = 0;
  private pickIndex = 0;
  private confirmIndex = 0;
  private offerIndex = 0;

  constructor(script: Script = {}) {
    this.script = script;
  }

  pick<T>(items: readonly PickItem<T>[], placeholder: string): Promise<T | undefined> {
    this.pickLists.push({ placeholder, items: [...items] });
    const choice = (this.script.picks ?? [])[this.pickIndex++];
    return Promise.resolve(choice === undefined ? undefined : items[choice]?.value);
  }

  input(options: InputOptions): Promise<string | undefined> {
    const answer = (this.script.inputs ?? [])[this.inputIndex++];
    this.inputs.push({ prompt: options.prompt, validation: answer === undefined ? undefined : options.validate?.(answer) });
    return Promise.resolve(answer);
  }

  confirm(message: string, detail: string, action: string): Promise<boolean> {
    this.confirmations.push({ message, detail, action });
    return Promise.resolve((this.script.confirms ?? [])[this.confirmIndex++] ?? this.script.confirm ?? true);
  }

  previewChange(path: string, before: string, after: string): Promise<void> {
    this.previews.push({ path, before, after });
    return Promise.resolve();
  }

  chooseFile(): Promise<string | undefined> {
    return Promise.resolve(this.script.file);
  }

  copy(text: string): Promise<void> {
    this.copied.push(text);
    return Promise.resolve();
  }

  offer(message: string, actions: readonly string[]): Promise<string | undefined> {
    this.offered.push({ message, actions });
    return Promise.resolve((this.script.offers ?? [])[this.offerIndex++]);
  }

  showText(text: string): Promise<void> {
    this.texts.push(text);
    return Promise.resolve();
  }

  inform(message: string): void {
    this.informed.push(message);
  }

  warn(message: string): void {
    this.warned.push(message);
  }

  show(path: string, line: number): Promise<void> {
    this.shown.push({ path, line });
    return Promise.resolve();
  }
}

export class MemoryFiles implements WorkspaceFiles {
  readonly files = new Map<string, string>();
  readonly writes: string[] = [];

  constructor(initial: Record<string, string> = {}) {
    for (const [path, text] of Object.entries(initial)) this.files.set(path, text);
  }

  read(path: string): Promise<string | undefined> {
    return Promise.resolve(this.files.get(path));
  }

  write(path: string, text: string): Promise<void> {
    this.files.set(path, text);
    this.writes.push(path);
    return Promise.resolve();
  }
}
