import type { BlockedGroupModel, LaneBlockModel, QueueViewModel, SetupNotice, TagOption } from '../app/index.js';
import { chipElement, el } from './dom.js';
import { renderEvent, renderRow, type Reveal } from './rows.js';

type TabId = 'stack' | 'blocked' | 'news';

export interface ViewState {
  tab: TabId;
  /** Keys (`folder/lane`) of the lanes that show their whole tree. */
  expanded: string[];
}

export interface Handlers {
  reveal: Reveal;
  markSeen(folder: string): void;
  selectTab(tab: TabId): void;
  toggleLane(key: string): void;
  /** The user asked for the guided setup of a folder. */
  setup(folder: string): void;
  /** The user chose which tags to show in a folder; an empty list shows everything. */
  filter(folder: string, tags: string[]): void;
}

const TABS: readonly { id: TabId; label: string }[] = [
  { id: 'stack', label: 'Stack' },
  { id: 'blocked', label: 'Blocked' },
  { id: 'news', label: 'What’s new' },
];

export const laneKey = (folder: string, lane: string): string => `${folder}/${lane}`;
/** The key under which a lane remembers that its done section is open. */
const doneKey = (folder: string, lane: string): string => `${laneKey(folder, lane)}#done`;

export function restoreViewState(raw: unknown): ViewState {
  const fallback: ViewState = { tab: 'stack', expanded: [] };
  if (typeof raw !== 'object' || raw === null) return fallback;
  const { tab, expanded } = raw as { tab?: unknown; expanded?: unknown };
  return {
    tab: TABS.find((t) => t.id === tab)?.id ?? fallback.tab,
    expanded: Array.isArray(expanded) ? expanded.filter((key): key is string => typeof key === 'string') : [],
  };
}

/** Draws the whole view into `root`, replacing what was there and keeping keyboard focus where it was. */
export function render(root: HTMLElement, folders: QueueViewModel[], state: ViewState, handlers: Handlers): void {
  const focused = root.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.key : undefined;

  if (folders.length === 0) {
    root.replaceChildren(el('p', 'empty', 'Open a folder to use PlanMaster: it works on the files of a project.'));
    return;
  }
  root.replaceChildren(renderTabs(folders, state, handlers), renderPanel(folders, state, handlers));

  if (focused !== undefined) {
    const same = [...root.querySelectorAll<HTMLElement>('[data-key]')].find((node) => node.dataset.key === focused);
    same?.focus();
  }
}

function emptyMessage(filtered: boolean): HTMLElement {
  return el('p', 'empty', filtered ? 'Nothing carries the selected tags.' : 'No lanes yet. Create .planmaster/lanes/<ID>.md in this workspace to start.');
}

/* ---------- tabs ---------- */

function renderTabs(folders: QueueViewModel[], state: ViewState, handlers: Handlers): HTMLElement {
  const counts: Record<TabId, number> = {
    stack: 0,
    blocked: folders.reduce((sum, f) => sum + f.blockedCount, 0),
    news: folders.reduce((sum, f) => sum + f.news.events.length, 0),
  };
  const list = el('div', 'tablist');
  list.setAttribute('role', 'tablist');
  list.append(...TABS.map((tab, index) => {
    const button = el('button', 'tab', tab.label);
    button.type = 'button';
    button.dataset.tab = tab.id;
    button.dataset.key = `tab:${tab.id}`;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', String(state.tab === tab.id));
    button.tabIndex = state.tab === tab.id ? 0 : -1;
    if (counts[tab.id] > 0) button.append(el('span', `count ${tab.id}`, String(counts[tab.id])));
    button.addEventListener('click', () => { handlers.selectTab(tab.id); });
    button.addEventListener('keydown', (event) => { moveBetweenTabs(event, index, handlers); });
    return button;
  }));

  const bar = el('div', 'tabs');
  bar.append(list);
  const only = folders[0];
  if (folders.length === 1 && only) bar.append(setupLink(only.folder, handlers));
  return bar;
}

/** The button that starts the guided setup, shown whether or not it is needed, so it is always easy to find. */
function setupLink(folder: string, handlers: Handlers): HTMLButtonElement {
  const button = el('button', 'setup-link', 'Setup');
  button.type = 'button';
  button.dataset.key = `setup-link:${folder}`;
  button.setAttribute('aria-label', 'Run the guided setup');
  button.title = 'Run the guided setup';
  button.addEventListener('click', () => { handlers.setup(folder); });
  return button;
}

const ARROW_STEPS: Readonly<Record<string, number>> = { ArrowRight: 1, ArrowLeft: -1 };

function moveBetweenTabs(event: KeyboardEvent, index: number, handlers: Handlers): void {
  const step = ARROW_STEPS[event.key];
  if (step === undefined) return;
  event.preventDefault();
  const next = TABS[(index + step + TABS.length) % TABS.length];
  if (next) handlers.selectTab(next.id);
}

/* ---------- panels ---------- */

function renderPanel(folders: QueueViewModel[], state: ViewState, handlers: Handlers): HTMLElement {
  const panel = el('div', 'panel');
  panel.setAttribute('role', 'tabpanel');
  const many = folders.length > 1;
  for (const folder of folders) {
    const section = el('section', 'folder');
    if (many) {
      const row = el('div', 'folder-name-row');
      row.append(el('h2', 'folder-name', folder.folder), setupLink(folder.folder, handlers));
      section.append(row);
    }
    if (folder.setup) section.append(renderSetupCard(folder.folder, folder.setup, handlers));
    if (folder.tags.length > 0) section.append(renderTagBar(folder, handlers));
    section.append(renderTab(folder, state, handlers));
    panel.append(section);
  }
  return panel;
}

function renderSetupCard(folder: string, notice: SetupNotice, handlers: Handlers): HTMLElement {
  const card = el('section', 'setup-card');
  card.append(el('p', 'setup-headline', notice.headline), el('p', 'setup-detail', notice.detail));
  if (notice.problems.length > 0) {
    const list = el('ul', 'setup-problems');
    list.append(...notice.problems.map((problem) => el('li', '', problem)));
    card.append(list);
  }
  const start = el('button', 'setup-start', 'Set up with Claude');
  start.type = 'button';
  start.dataset.key = `setup-start:${folder}`;
  start.addEventListener('click', () => { handlers.setup(folder); });
  card.append(start);
  return card;
}

/** The tags to filter by, as toggle buttons. It is shown on every tab, because the filter applies to all of them. */
function renderTagBar(folder: QueueViewModel, handlers: Handlers): HTMLElement {
  const bar = el('div', 'tag-bar');
  bar.setAttribute('role', 'group');
  bar.setAttribute('aria-label', 'Filter by tag');
  bar.append(el('span', 'tag-bar-title', 'Tags'), ...folder.tags.map((tag) => tagToggle(folder, tag, handlers)));
  if (folder.filter.length > 0) {
    const clear = el('button', 'tag-clear', 'Clear');
    clear.type = 'button';
    clear.dataset.key = `tag-clear:${folder.folder}`;
    clear.title = 'Show everything again';
    clear.addEventListener('click', () => { handlers.filter(folder.folder, []); });
    bar.append(clear);
  }
  return bar;
}

function tagToggle(folder: QueueViewModel, tag: TagOption, handlers: Handlers): HTMLButtonElement {
  const selected = folder.filter.includes(tag.key);
  const button = el('button', 'tag-toggle', tag.key);
  button.type = 'button';
  button.dataset.key = `tag:${folder.folder}/${tag.key}`;
  button.setAttribute('aria-pressed', String(selected));
  button.title = tag.label;
  const label = tag.label === tag.key ? '' : `, ${tag.label}`;
  button.setAttribute('aria-label', `${tag.key}${label}, ${tag.count} item${tag.count === 1 ? '' : 's'}`);
  button.addEventListener('click', () => {
    handlers.filter(folder.folder, selected ? folder.filter.filter((key) => key !== tag.key) : [...folder.filter, tag.key]);
  });
  return button;
}

function renderTab(folder: QueueViewModel, state: ViewState, handlers: Handlers): HTMLElement {
  // The get-started card already says what is wrong with the files, so the banner would only repeat it.
  if (folder.error !== undefined && !folder.setup) {
    const banner = el('p', 'error-banner', folder.error);
    banner.setAttribute('role', 'alert');
    return banner;
  }
  switch (state.tab) {
    case 'stack':
      return renderStack(folder, state, handlers);
    case 'blocked':
      return renderBlocked(folder, handlers);
    case 'news':
      return renderNews(folder, handlers);
  }
}

/* ---------- stack ---------- */

function renderStack(folder: QueueViewModel, state: ViewState, handlers: Handlers): HTMLElement {
  const wrapper = el('div', 'stack');
  if (folder.lanes.length === 0 && !folder.setup) wrapper.append(emptyMessage(folder.filter.length > 0));
  for (const lane of folder.lanes) {
    const open = { all: state.expanded.includes(laneKey(folder.folder, lane.lane)), done: state.expanded.includes(doneKey(folder.folder, lane.lane)) };
    wrapper.append(renderLane(folder.folder, lane, open, handlers));
  }
  return wrapper;
}

function renderLane(folder: string, lane: LaneBlockModel, open: { all: boolean; done: boolean }, handlers: Handlers): HTMLElement {
  const expanded = open.all;
  const section = el('section', 'lane');
  const header = el('div', 'lane-header');
  header.append(el('span', 'lane-badge', lane.lane), el('span', 'lane-title', lane.title), el('span', 'lane-count', `${lane.closed}/${lane.total}`));

  const bar = el('div', 'bar');
  const closed = el('span', 'closed');
  closed.style.width = `${lane.closedPercent}%`;
  const doing = el('span', 'doing');
  doing.style.width = `${lane.doingPercent}%`;
  bar.append(closed, doing);

  const body = el('div', 'lane-body');
  const doneOpen = open.done;
  body.append(...(expanded ? expandedRows(folder, lane, handlers) : collapsedRows(folder, lane, handlers)));
  body.append(...doneRows(folder, lane, doneOpen, handlers));
  if ((expanded || doneOpen) && lane.hiddenClosed > 0) {
    body.append(el('div', 'empty', `${lane.hiddenClosed} older closed item${lane.hiddenClosed === 1 ? '' : 's'} hidden`));
  }
  section.append(header, bar, body, renderLaneFooter(folder, lane, expanded, handlers));
  return section;
}

function collapsedRows(folder: string, lane: LaneBlockModel, handlers: Handlers): HTMLElement[] {
  const focus: HTMLElement[] = lane.focus.map((row) => renderRow(row, { folder }, handlers.reveal));
  const rows: HTMLElement[] = [el('div', 'sub', 'In progress')];
  rows.push(...(focus.length > 0 ? focus : [el('div', 'empty', 'Nothing in progress.')]));
  if (lane.next.length > 0) {
    rows.push(el('div', 'sub', 'Up next'), ...lane.next.map((row) => renderRow(row, { folder }, handlers.reveal)));
  }
  return rows;
}

function expandedRows(folder: string, lane: LaneBlockModel, handlers: Handlers): HTMLElement[] {
  return lane.all.map((row) => renderRow(row, { folder }, handlers.reveal));
}

/** The finished items, last in the block and out of sight until asked for. */
function doneRows(folder: string, lane: LaneBlockModel, open: boolean, handlers: Handlers): HTMLElement[] {
  if (lane.done.length === 0) return [];
  const key = doneKey(folder, lane.lane);
  const head = el('div', 'sub done-head', 'Done');
  const toggle = el('button', 'done-toggle', open ? 'Hide done' : `Show ${lane.done.length} done`);
  toggle.type = 'button';
  toggle.dataset.key = `done:${key}`;
  toggle.setAttribute('aria-expanded', String(open));
  toggle.addEventListener('click', () => { handlers.toggleLane(key); });
  head.append(toggle);
  return [head, ...(open ? lane.done.map((row) => renderRow(row, { folder }, handlers.reveal)) : [])];
}

function renderLaneFooter(folder: string, lane: LaneBlockModel, expanded: boolean, handlers: Handlers): HTMLElement {
  const footer = el('div', 'lane-footer');
  if (lane.blockedCount > 0) footer.append(chipElement({ kind: 'block', text: `${lane.blockedCount} blocked` }));
  if (lane.closedCount > 0) footer.append(chipElement({ kind: 'done', text: `${lane.closedCount} closed` }));

  const key = laneKey(folder, lane.lane);
  const toggle = el('button', 'toggle', expanded ? 'Collapse' : 'Show all');
  toggle.type = 'button';
  toggle.dataset.key = `toggle:${key}`;
  toggle.setAttribute('aria-expanded', String(expanded));
  toggle.addEventListener('click', () => { handlers.toggleLane(key); });
  footer.append(toggle);
  return footer;
}

/* ---------- blocked ---------- */

function renderBlocked(folder: QueueViewModel, handlers: Handlers): HTMLElement {
  const wrapper = el('div', 'blocked');
  if (folder.blocked.length === 0) wrapper.append(el('div', 'empty', 'No blocked items.'));
  for (const group of folder.blocked) wrapper.append(renderGroup(folder.folder, group, handlers));
  return wrapper;
}

function renderGroup(folder: string, group: BlockedGroupModel, handlers: Handlers): HTMLElement {
  const section = el('section', group.kind === 'missing' ? 'group error' : 'group');
  const header = el('div', 'group-header');
  header.append(el('span', 'group-title', group.title), el('span', 'group-count', String(group.rows.length)));
  section.append(header, ...group.rows.map((row) => renderRow(row, { folder, laneTag: row.lane }, handlers.reveal)));
  return section;
}

/* ---------- what's new ---------- */

function renderNews(folder: QueueViewModel, handlers: Handlers): HTMLElement {
  const wrapper = el('div', 'news');
  const { sinceLabel, events } = folder.news;
  if (events.length === 0) {
    wrapper.append(el('div', 'empty', `Nothing new since ${sinceLabel}.`));
    return wrapper;
  }

  const bar = el('div', 'news-bar');
  const seen = el('button', 'mark-seen', 'Mark as seen');
  seen.type = 'button';
  seen.dataset.key = `seen:${folder.folder}`;
  seen.addEventListener('click', () => { handlers.markSeen(folder.folder); });
  bar.append(el('span', 'since', `Since ${sinceLabel}, the last time you looked`), seen);
  wrapper.append(bar, ...events.map((event) => renderEvent(event, folder.folder, handlers.reveal)));
  return wrapper;
}
