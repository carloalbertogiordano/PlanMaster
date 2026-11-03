// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assessSetup, buildQueueViewModel, errorViewModel, setupViewModel, withSetup, type QueueViewModel } from '../../src/app/index.js';
import { laneKey, render, restoreViewState, type Handlers, type ViewState } from '../../src/webview/render.js';
import { T, laneFile, run } from '../helpers.js';
import { analyzeDemo } from '../support/demo.js';

const LAST_SEEN = T('2026-11-02T09:15');

let root: HTMLElement;
let handlers: { [K in keyof Handlers]: ReturnType<typeof vi.fn> };
const demo = (folder = 'demo'): QueueViewModel => buildQueueViewModel(analyzeDemo(), { folder, lastSeen: LAST_SEEN });
const initial = (tab: ViewState['tab'] = 'stack', expanded: string[] = []): ViewState => ({ tab, expanded });

function draw(folders: QueueViewModel[], state: ViewState = initial()): void {
  render(root, folders, state, handlers);
}

const texts = (selector: string): string[] => [...root.querySelectorAll(selector)].map((e) => e.textContent);

function q(selector: string): HTMLElement {
  const node = root.querySelector<HTMLElement>(selector);
  if (!node) throw new Error(`Nothing matches ${selector}`);
  return node;
}

beforeEach(() => {
  root = document.createElement('div');
  document.body.replaceChildren(root);
  handlers = { reveal: vi.fn(), markSeen: vi.fn(), selectTab: vi.fn(), toggleLane: vi.fn(), setup: vi.fn() };
});

describe('tabs', () => {
  it('shows the three tabs with counts, and marks the selected one', () => {
    draw([demo()]);
    const tabs = [...root.querySelectorAll('[role="tab"]')];
    expect(tabs.map((t) => t.getAttribute('data-tab'))).toEqual(['stack', 'blocked', 'news']);
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
    expect(tabs[1]?.textContent).toContain('5');
    expect(tabs[2]?.textContent).toContain('14');
    expect(root.querySelector('[role="tabpanel"]')).not.toBeNull();
  });

  it('asks to switch tab on click', () => {
    draw([demo()]);
    q('[data-tab="blocked"]').click();
    expect(handlers.selectTab).toHaveBeenCalledWith('blocked');
  });

  it('moves between tabs with the arrow keys', () => {
    draw([demo()], initial('blocked'));
    const tab = q('[data-tab="blocked"]');
    tab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    tab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(handlers.selectTab.mock.calls).toEqual([['news'], ['stack']]);
  });

  it('wraps around at the ends', () => {
    draw([demo()], initial('news'));
    q('[data-tab="news"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(handlers.selectTab).toHaveBeenCalledWith('stack');
  });
});

describe('stack tab', () => {
  it('shows one block per lane with its title and progress', () => {
    draw([demo()]);
    expect(texts('.lane-title')[0]).toBe('Requirements matrix, counts and citations');
    expect(texts('.lane-count')[0]).toBe('2/7');
    expect(root.querySelectorAll('.lane')).toHaveLength(5);
    expect(q('.bar .closed').style.width).toBe('29%');
  });

  it('shows what is in progress and what is next, collapsed by default', () => {
    draw([demo()]);
    const lane = root.querySelectorAll('.lane')[0] as HTMLElement;
    expect([...lane.querySelectorAll('.row')].map((r) => r.getAttribute('data-id'))).toEqual(['A-07', 'A-07a', 'A-07b', 'A-07c', 'A-08']);
    expect(lane.textContent).toContain('In progress');
    expect(lane.textContent).toContain('Up next');
  });

  it('says so when a lane has nothing in progress', () => {
    draw([buildQueueViewModel(run([laneFile('A', '- [ ] A-1 Todo')]), { folder: 'f', lastSeen: 0 })]);
    expect(root.textContent).toContain('Nothing in progress.');
  });

  it('shows the whole tree when the lane is expanded, and the footer toggle says so', () => {
    draw([demo()], initial('stack', [laneKey('demo', 'C')]));
    const lane = root.querySelectorAll('.lane')[2] as HTMLElement;
    expect([...lane.querySelectorAll('.row')].map((r) => r.getAttribute('data-id'))).toEqual(['C-05', 'C-05a', 'C-05b', 'C-04', 'C-06', 'C-03', 'C-02']);
    expect(lane.querySelector('.toggle')?.textContent).toBe('Collapse');
  });

  it('notes closed items that are hidden because they are old', () => {
    const body = '- [~] A-1 Active since:2026-11-02T10:00\n- [x] A-2 Old done:2026-10-01T10:00';
    draw([buildQueueViewModel(run([laneFile('A', body)]), { folder: 'f', lastSeen: 0 })], initial('stack', [laneKey('f', 'A')]));
    expect(root.textContent).toContain('1 older closed item hidden');
  });

  it('asks to toggle a lane', () => {
    draw([demo()]);
    (root.querySelectorAll('.toggle')[1] as HTMLElement).click();
    expect(handlers.toggleLane).toHaveBeenCalledWith('demo/B');
  });

  it('shows chips for ages, problems and references', () => {
    draw([demo()]);
    const lane = root.querySelectorAll('.lane')[4] as HTMLElement;
    expect([...lane.querySelectorAll('.row')][0]?.querySelectorAll('.chip.stale')).toHaveLength(1);
    expect(lane.textContent).toContain('for 3 h 43 min');
  });

  it('shows blocked and closed counts in the footer', () => {
    draw([demo()]);
    const footer = texts('.lane-footer')[0] ?? '';
    expect(footer).toContain('1 blocked');
    expect(footer).toContain('2 closed');
  });
});

describe('rows', () => {
  it('asks to reveal the item on click', () => {
    draw([demo()]);
    q('.row[data-id="D-04"]').click();
    expect(handlers.reveal).toHaveBeenCalledWith('demo', '.planmaster/lanes/D.md', 7);
  });

  it('is a button with a full description for assistive technology', () => {
    draw([demo()]);
    const row = q('.row[data-id="D-04"]');
    expect(row.tagName).toBe('BUTTON');
    expect(row.getAttribute('aria-label')).toBe('D-04, in progress, Neutral translation text and release request');
  });

  it('gives each state its own icon shape, not only a color', () => {
    draw([demo()], initial('stack', ['demo/A', 'demo/B', 'demo/C'].map((k) => k)));
    const shapes = (state: string) => q(`.row.st-${state} svg`).innerHTML;
    const all = ['todo', 'doing', 'blocked', 'done', 'dropped'].map(shapes);
    expect(new Set(all).size).toBe(5);
  });

  it('indents children by their depth', () => {
    draw([demo()]);
    expect(q('.row[data-id="A-07a"]').style.getPropertyValue('--depth')).toBe('1');
  });
});

describe('text from the files is never interpreted', () => {
  const hostile = '<img src=x onerror="alert(1)"> <script>alert(2)</script> **bold** [x](javascript:alert(3))';
  const files = [laneFile('A', `- [~] A-1 ${hostile} since:2026-11-02T10:00 ref:<b>x</b>`)];
  const model = buildQueueViewModel(run(files), { folder: '<i>folder</i>', lastSeen: 0 });

  it.each(['stack', 'blocked', 'news'] as const)('creates no elements from a hostile title on the %s tab', (tab) => {
    draw([model], initial(tab, [laneKey('<i>folder</i>', 'A')]));
    for (const tag of ['img', 'script', 'b', 'i', 'a', 'iframe']) expect(root.querySelector(tag)).toBeNull();
  });

  it('shows the hostile title as plain text', () => {
    draw([model]);
    expect(texts('.row .title')[0]).toBe(hostile);
    expect(root.querySelector('.chip.plain')?.textContent).toBe('<b>x</b>');
  });

  it('puts it in the accessible label as text only', () => {
    draw([model]);
    expect(root.querySelector('.row')?.getAttribute('aria-label')).toBe(`A-1, in progress, ${hostile}`);
  });

  it('does not use the folder name as markup when there are several folders', () => {
    draw([model, demo()]);
    expect(texts('.folder-name')[0]).toBe('<i>folder</i>');
    expect(root.querySelector('i')).toBeNull();
  });
});

describe('blocked tab', () => {
  it('shows groups with their rows and the state of dependencies', () => {
    draw([demo()], initial('blocked'));
    expect(texts('.group-title')).toEqual(['Waiting on alice', 'Waiting on bob', 'Dependencies between items', 'No reason given, needs fixing']);
    expect(texts('.group-count')).toEqual(['1', '2', '1', '1']);
    expect(root.querySelector('.row[data-id="D-08"]')?.textContent).toContain('D-04 in progress');
    expect(root.querySelector('.row[data-id="A-09"] .lane-tag')?.textContent).toBe('A');
  });

  it('marks the group with no reason as an error', () => {
    draw([demo()], initial('blocked'));
    expect(root.querySelectorAll('.group.error')).toHaveLength(1);
  });

  it('says so when nothing is blocked', () => {
    draw([buildQueueViewModel(run([laneFile('A', '- [ ] A-1 x')]), { folder: 'f', lastSeen: 0 })], initial('blocked'));
    expect(root.textContent).toContain('No blocked items.');
  });
});

describe("what's new tab", () => {
  it('lists events with time, lane, id, verb and detail', () => {
    draw([demo()], initial('news'));
    expect(root.textContent).toContain('Since 09:15');
    const first = q('.event');
    expect(first.querySelector('time')?.textContent).toBe('11:40');
    expect(first.textContent).toContain('A-07b');
    expect(first.querySelector('.verb')?.textContent).toBe('started');
    expect(root.querySelector('.event[data-id="C-04"]')?.textContent).toContain(', waiting on alice');
  });

  it('reveals the item when an event is clicked', () => {
    draw([demo()], initial('news'));
    q('.event[data-id="D-03"]').click();
    expect(handlers.reveal).toHaveBeenCalledWith('demo', '.planmaster/lanes/D.md', 12);
  });

  it('marks the feed of a folder as seen', () => {
    draw([demo()], initial('news'));
    q('.mark-seen').click();
    expect(handlers.markSeen).toHaveBeenCalledWith('demo');
  });

  it('says so when there is nothing new', () => {
    draw([buildQueueViewModel(analyzeDemo(), { folder: 'demo', lastSeen: T('2026-11-02T11:48') })], initial('news'));
    expect(root.textContent).toContain('Nothing new since 11:48.');
  });
});

describe('several folders and empty workspaces', () => {
  it('shows a heading per folder only when there is more than one', () => {
    draw([demo('one')]);
    expect(root.querySelector('.folder-name')).toBeNull();
    draw([demo('one'), demo('two')]);
    expect(texts('.folder-name')).toEqual(['one', 'two']);
  });

  it('asks to open a folder when there is none', () => {
    draw([]);
    expect(root.textContent).toContain('Open a folder');
  });
});

describe('a folder with an invalid configuration', () => {
  it('shows the message instead of the queue, as text', () => {
    draw([errorViewModel('demo', 'config.json: <b>bad</b>')]);
    expect(texts('.error-banner')).toEqual(['config.json: <b>bad</b>']);
    expect(root.querySelector('b')).toBeNull();
    expect(root.querySelector('.lane')).toBeNull();
  });

  it('does not say it twice when the get-started card already shows the same problem', () => {
    const message = 'config.json is not valid JSON: boom';
    const unreadable = assessSetup({ hasWorkspaceDir: true, analysis: undefined, claudeMd: undefined, configError: message });
    draw([withSetup(errorViewModel('demo', message), unreadable)]);
    expect(texts('.setup-problems li')).toEqual([message]);
    expect(root.querySelector('.error-banner')).toBeNull();
  });

  it('still shows the other folders normally', () => {
    draw([errorViewModel('one', 'broken'), demo('two')]);
    expect(root.querySelectorAll('.error-banner')).toHaveLength(1);
    expect(root.querySelectorAll('.lane')).toHaveLength(5);
  });
});

describe('the setup guide', () => {
  const missing = assessSetup({ hasWorkspaceDir: false, analysis: undefined, claudeMd: undefined });
  const needing = (folder: string): QueueViewModel => setupViewModel(folder, missing);

  it('shows a get-started card with plain words and one big button when the project needs setup', () => {
    draw([needing('plain')]);
    const card = q('.setup-card');
    expect(card.querySelector('.setup-headline')?.textContent).toBe('PlanMaster is not set up in this project yet.');
    expect(card.querySelector('.setup-detail')?.textContent).toContain('Nothing is changed without showing you first.');
    expect(card.querySelector('button.setup-start')?.textContent).toBe('Set up with Claude');
  });

  it('starts the setup for that folder when the button is pressed', () => {
    draw([needing('plain')]);
    q('button.setup-start').click();
    expect(handlers.setup).toHaveBeenCalledWith('plain');
  });

  it('shows what cannot be read, as text', () => {
    const hostile = '.planmaster/lanes/B.md:3 <img src=x onerror=alert(1)> bad';
    const model: QueueViewModel = { ...needing('f'), setup: { reason: 'unparsable', headline: 'Some queue files cannot be read.', detail: 'd', problems: [hostile] } };
    draw([model]);
    expect(texts('.setup-problems li')).toEqual([hostile]);
    expect(root.querySelector('img')).toBeNull();
  });

  it('shows the card above the content when a queue exists but the project still needs setup', () => {
    const model: QueueViewModel = { ...demo(), setup: { reason: 'instructions', headline: 'Claude does not know about the queue yet.', detail: 'One step adds the instructions.', problems: [] } };
    draw([model]);
    expect(root.querySelector('.setup-card')).not.toBeNull();
    expect(root.querySelectorAll('.lane')).toHaveLength(5);
  });

  it('keeps a setup button in the tab bar at all times, to run the guided setup again', () => {
    draw([demo('demo')]);
    expect(root.querySelector('.setup-card')).toBeNull();
    const button = q('.tabs .setup-link');
    expect(button.textContent).toBe('Setup');
    expect(button.getAttribute('aria-label')).toBe('Run the guided setup');
    button.click();
    expect(handlers.setup).toHaveBeenCalledWith('demo');
  });

  it('gives each folder its own setup button when there are several', () => {
    draw([demo('one'), needing('two')]);
    expect(root.querySelector('.tabs .setup-link')).toBeNull();
    const links = [...root.querySelectorAll<HTMLElement>('.folder-name-row .setup-link')];
    expect(links).toHaveLength(2);
    links[1]?.click();
    expect(handlers.setup).toHaveBeenCalledWith('two');
  });

  it('keeps the card on the other tabs', () => {
    for (const tab of ['blocked', 'news'] as const) {
      draw([needing('plain')], initial(tab));
      expect(root.querySelector('.setup-card'), tab).not.toBeNull();
    }
  });
});

describe('redrawing', () => {
  it('replaces the previous content instead of adding to it', () => {
    draw([demo()]);
    draw([demo()]);
    expect(root.querySelectorAll('.lane')).toHaveLength(5);
    expect(root.querySelectorAll('[role="tablist"]')).toHaveLength(1);
  });

  it('keeps keyboard focus on the same control', () => {
    draw([demo()]);
    q('.row[data-id="A-07b"]').focus();
    draw([demo()]);
    expect((document.activeElement as HTMLElement).getAttribute('data-id')).toBe('A-07b');
  });
});

describe('restoreViewState', () => {
  it('uses the defaults for anything unusable', () => {
    expect(restoreViewState(undefined)).toEqual({ tab: 'stack', expanded: [] });
    expect(restoreViewState('x')).toEqual({ tab: 'stack', expanded: [] });
    expect(restoreViewState({ tab: 'settings', expanded: 'all' })).toEqual({ tab: 'stack', expanded: [] });
  });

  it('keeps a valid tab and only the string keys', () => {
    expect(restoreViewState({ tab: 'news', expanded: ['a/A', 3, 'b/B'] })).toEqual({ tab: 'news', expanded: ['a/A', 'b/B'] });
  });
});
