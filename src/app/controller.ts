import { ConfigError, QueueStore } from '../core/index.js';
import type { Timers, WorkspaceSource } from './ports.js';
import { buildViewState, type ViewState } from './view-state.js';

export interface ControllerOptions {
  source: WorkspaceSource;
  clock: () => number;
  /** Called when reading the workspace fails unexpectedly. The controller keeps working. */
  onError: (error: unknown) => void;
  timers?: Timers;
  debounceMs?: number;
  /** How often the view is recomputed so that ages and staleness stay current. */
  tickMs?: number;
}

type Listener = (state: ViewState) => void;

const DEFAULT_TIMERS: Timers = {
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: (handle) => { globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>); },
  setInterval: (callback, ms) => globalThis.setInterval(callback, ms),
  clearInterval: (handle) => { globalThis.clearInterval(handle as ReturnType<typeof setInterval>); },
};

/**
 * Keeps the parsed queue up to date and publishes a view state whenever it
 * changes. Free of any editor API: files come from a `WorkspaceSource`.
 */
export class QueueController {
  private readonly store = new QueueStore();
  private readonly listeners = new Set<Listener>();
  private readonly dirtyPaths = new Set<string>();
  private readonly options: ControllerOptions;
  private readonly timers: Timers;
  private configDirty = false;
  private flushTimer: unknown;
  private tickTimer: unknown;
  private pending: Promise<void> = Promise.resolve();
  private disposed = false;
  private current: ViewState | undefined;

  constructor(options: ControllerOptions) {
    this.options = options;
    this.timers = options.timers ?? DEFAULT_TIMERS;
  }

  get state(): ViewState | undefined {
    return this.current;
  }

  onDidUpdate(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  async start(): Promise<void> {
    await this.loadEverything();
    this.tickTimer = this.timers.setInterval(() => { this.refresh(); }, this.options.tickMs ?? 60_000);
  }

  /** Reads the whole workspace again, for changes that were not announced. */
  reloadAll(): Promise<void> {
    return this.enqueue(() => this.loadEverything());
  }

  notifyFileChanged(path: string): void {
    this.dirtyPaths.add(path);
    this.scheduleFlush();
  }

  notifyConfigChanged(): void {
    this.configDirty = true;
    this.scheduleFlush();
  }

  /** Recomputes and publishes the view from what has been read so far. */
  refresh(): void {
    if (this.disposed) return;
    try {
      const analysis = this.store.analyze(this.options.clock());
      this.publish(buildViewState(analysis, (path) => this.store.textOf(path)));
    } catch (error) {
      if (!(error instanceof ConfigError)) throw error;
      this.publish({ kind: 'config-error', message: error.message });
    }
  }

  dispose(): void {
    this.disposed = true;
    if (this.flushTimer !== undefined) this.timers.clearTimeout(this.flushTimer);
    if (this.tickTimer !== undefined) this.timers.clearInterval(this.tickTimer);
    this.flushTimer = undefined;
    this.tickTimer = undefined;
    this.listeners.clear();
  }

  private publish(state: ViewState): void {
    this.current = state;
    for (const listener of this.listeners) listener(state);
  }

  private scheduleFlush(): void {
    if (this.disposed || this.flushTimer !== undefined) return;
    this.flushTimer = this.timers.setTimeout(() => {
      this.flushTimer = undefined;
      void this.enqueue(() => this.applyChanges());
    }, this.options.debounceMs ?? 150);
  }

  /** Runs tasks one at a time; a failing task is reported and does not stop the ones after it. */
  private enqueue(task: () => Promise<void>): Promise<void> {
    this.pending = this.pending.then(task).catch((error: unknown) => { this.options.onError(error); });
    return this.pending;
  }

  private async loadEverything(): Promise<void> {
    const snapshot = await this.options.source.readAll();
    this.store.clear();
    for (const file of snapshot.files) this.store.setFile(file);
    for (const file of snapshot.unreadable) this.store.setUnreadable(file);
    this.store.setConfigText(snapshot.configText);
    this.refresh();
  }

  /** Runs one at a time, so a change that arrives during a read is handled by the next run. */
  private async applyChanges(): Promise<void> {
    if (this.disposed) return;
    const paths = [...this.dirtyPaths];
    this.dirtyPaths.clear();
    const reloadConfig = this.configDirty;
    this.configDirty = false;

    await Promise.all(paths.map((path) => this.reload(path)));
    if (reloadConfig) this.store.setConfigText(await this.options.source.readConfig());
    this.refresh();
  }

  private async reload(path: string): Promise<void> {
    const result = await this.options.source.readFile(path);
    if (result === null) this.store.removeFile(path);
    else if (result.kind === 'ok') this.store.setFile(result.file);
    else this.store.setUnreadable(result.file);
  }
}
