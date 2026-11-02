import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueueController } from '../../src/app/controller.js';
import type { ViewState } from '../../src/app/view-state.js';
import { T, laneFile } from '../helpers.js';
import { FakeSource } from '../support/fake-source.js';

const A = '.planmaster/lanes/A.md';
const B = '.planmaster/lanes/B.md';
const lane = (id: string, body: string): string => laneFile(id, body).text;

let source: FakeSource;
let now: number;
let controller: QueueController;
let states: ViewState[];
let errors: unknown[];

function okState(): Extract<ViewState, { kind: 'ok' }> {
  const state = states.at(-1);
  if (state?.kind !== 'ok') throw new Error(`Expected an ok state, got ${state?.kind ?? 'nothing'}`);
  return state;
}

beforeEach(() => {
  vi.useFakeTimers();
  source = new FakeSource();
  now = T('2026-11-02T11:00');
  states = [];
  errors = [];
  controller = new QueueController({ source, clock: () => now, onError: (error) => errors.push(error) });
  controller.onDidUpdate((state) => states.push(state));
});

afterEach(() => {
  controller.dispose();
  vi.useRealTimers();
});

describe('start', () => {
  it('reads the whole workspace and publishes one state', async () => {
    source.put(A, lane('A', '- [~] A-1 Work since:2026-11-02T10:30'), T('2026-11-02T10:40'));
    await controller.start();
    expect(states).toHaveLength(1);
    expect(okState().status.text).toBe('▶ 1 lane active · 1 open · 0 blocked · updated 20 min ago');
    expect(controller.state).toBe(states[0]);
  });

  it('publishes diagnostics for a file with a problem', async () => {
    source.put(A, lane('A', '- [!] A-1 Broken'));
    await controller.start();
    expect(okState().diagnostics[0]?.entries.map((e) => e.code)).toEqual(['PM004', 'PM006']);
  });

  it('publishes an empty workspace', async () => {
    await controller.start();
    expect(okState().status.text).toBe('PlanMaster: no lanes');
  });
});

describe('file changes', () => {
  beforeEach(async () => {
    source.put(A, lane('A', '- [ ] A-1 One'));
    source.put(B, lane('B', '- [ ] B-1 Two'));
    await controller.start();
    states.length = 0;
  });

  it('waits for the debounce window before publishing', async () => {
    source.put(A, lane('A', '- [!] A-1 One'));
    controller.notifyFileChanged(A);
    await vi.advanceTimersByTimeAsync(149);
    expect(states).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(states).toHaveLength(1);
    expect(okState().diagnostics[0]?.path).toBe(A);
  });

  it('merges a burst of notifications into one read per file and one state', async () => {
    controller.notifyFileChanged(A);
    controller.notifyFileChanged(A);
    controller.notifyFileChanged(B);
    controller.notifyFileChanged(A);
    await vi.advanceTimersByTimeAsync(150);
    expect(states).toHaveLength(1);
    expect([...source.readFileCalls].sort((a, b) => a.localeCompare(b))).toEqual([A, B]);
  });

  it('forgets a file that was deleted', async () => {
    source.files.delete(A);
    controller.notifyFileChanged(A);
    await vi.advanceTimersByTimeAsync(150);
    expect(okState().analysis.lanes.map((l) => l.lane)).toEqual(['B']);
  });

  it('reports a file that cannot be read', async () => {
    source.unreadable.set(A, 'permission denied');
    controller.notifyFileChanged(A);
    await vi.advanceTimersByTimeAsync(150);
    expect(okState().diagnostics.find((d) => d.path === A)?.entries[0]?.code).toBe('PM021');
  });

  it('does not lose a change that arrives while a read is in flight', async () => {
    let release = (): void => undefined;
    source.gate = new Promise<void>((resolve) => { release = resolve; });
    controller.notifyFileChanged(A);
    await vi.advanceTimersByTimeAsync(150);

    source.put(B, lane('B', '- [!] B-1 Two'));
    controller.notifyFileChanged(B);
    release();
    source.gate = undefined;
    await vi.advanceTimersByTimeAsync(400);

    expect(source.readFileCalls).toContain(B);
    expect(okState().diagnostics.map((d) => d.path)).toEqual([B]);
  });
});

describe('reloadAll', () => {
  it('picks up changes that were never announced and drops files that disappeared', async () => {
    source.put(A, lane('A', '- [ ] A-1 One'));
    source.put(B, lane('B', '- [ ] B-1 Two'));
    await controller.start();
    states.length = 0;

    source.put(A, lane('A', '- [!] A-1 One'));
    source.files.delete(B);
    source.configText = '{"people":["alice"]}';
    await controller.reloadAll();

    expect(states).toHaveLength(1);
    const state = okState();
    expect(state.analysis.lanes.map((l) => l.lane)).toEqual(['A']);
    expect(state.analysis.config.people).toEqual(['alice']);
    expect(state.diagnostics[0]?.path).toBe(A);
  });
});

describe('failures', () => {
  it('reports a failing read and keeps processing later changes', async () => {
    source.put(A, lane('A', '- [ ] A-1 One'));
    await controller.start();
    states.length = 0;

    vi.spyOn(source, 'readFile').mockRejectedValueOnce(new Error('disk gone'));
    controller.notifyFileChanged(A);
    await vi.advanceTimersByTimeAsync(150);
    expect(errors).toHaveLength(1);
    expect(String(errors[0])).toContain('disk gone');

    source.put(A, lane('A', '- [!] A-1 One'));
    controller.notifyFileChanged(A);
    await vi.advanceTimersByTimeAsync(150);
    expect(okState().diagnostics[0]?.path).toBe(A);
  });
});

describe('configuration changes', () => {
  beforeEach(async () => {
    source.put(A, lane('A', '- [!] A-1 One wait:carol since:2026-11-02T10:00'));
    source.configText = '{"people":["carol"]}';
    await controller.start();
    states.length = 0;
  });

  it('applies new people from config.json', async () => {
    expect(controller.state).toMatchObject({ kind: 'ok', diagnostics: [] });
    source.configText = '{"people":["alice"]}';
    controller.notifyConfigChanged();
    await vi.advanceTimersByTimeAsync(150);
    expect(okState().diagnostics[0]?.entries[0]?.code).toBe('PM007');
  });

  it('publishes a configuration error instead of using defaults, and recovers', async () => {
    source.configText = '{ nope';
    controller.notifyConfigChanged();
    await vi.advanceTimersByTimeAsync(150);
    const broken = states.at(-1);
    expect(broken).toMatchObject({ kind: 'config-error' });
    expect(broken?.kind === 'config-error' && broken.message).toContain('not valid JSON');

    source.configText = '{"people":["carol"]}';
    controller.notifyConfigChanged();
    await vi.advanceTimersByTimeAsync(150);
    expect(states.at(-1)?.kind).toBe('ok');
  });
});

describe('time passing', () => {
  it('republishes every minute so ages and staleness stay current', async () => {
    source.put(A, lane('A', '- [~] A-1 Work since:2026-11-02T10:00'), T('2026-11-02T10:05'));
    await controller.start();
    expect(okState().diagnostics).toEqual([]);
    states.length = 0;

    now = T('2026-11-02T12:30');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(states).toHaveLength(1);
    expect(okState().diagnostics[0]?.entries[0]?.code).toBe('PM012');
  });
});

describe('listeners and disposal', () => {
  it('stops notifying a listener that unsubscribed', async () => {
    const seen: ViewState[] = [];
    const unsubscribe = controller.onDidUpdate((s) => seen.push(s));
    await controller.start();
    unsubscribe();
    controller.refresh();
    expect(seen).toHaveLength(1);
  });

  it('publishes on demand', async () => {
    await controller.start();
    controller.refresh();
    expect(states).toHaveLength(2);
  });

  it('leaves no timers behind and publishes nothing after disposal', async () => {
    source.put(A, lane('A', '- [ ] A-1 One'));
    await controller.start();
    controller.notifyFileChanged(A);
    controller.dispose();
    expect(vi.getTimerCount()).toBe(0);
    states.length = 0;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(states).toHaveLength(0);
  });
});
