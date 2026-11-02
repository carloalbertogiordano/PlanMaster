import type { BlockedGroupModel, LaneBlockModel, QueueViewModel, SetupNotice } from '../app/index.js';
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
}

const TABS: readonly { id: TabId; label: string }[] = [
  { id: 'stack', label: 'Stack' },
  { id: 'blocked', label: 'Blocked' },
  { id: 'news', label: 'What’s new' },
];

export const laneKey = (folder: string, lane: string): string => `${folder}/${lane}`;

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

function emptyMessage(): HTMLElement {
  return el('p', 'empty', 'No lanes yet. Create .planmaster/lanes/<ID>.md in this workspace to start.');
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

function renderTab(folder: QueueViewModel, state: ViewState, handlers: Handlers): HTMLElement {
  if (folder.error !== undefined) {
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
  if (folder.lanes.length === 0 && !folder.setup) wrapper.append(emptyMessage());
  for (const lane of folder.lanes) {
    wrapper.append(renderLane(folder.folder, lane, state.expanded.includes(laneKey(folder.folder, lane.lane)), handlers));
  }
  return wrapper;
}

function renderLane(folder: string, lane: LaneBlockModel, expanded: boolean, handlers: Handlers): HTMLElement {
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
  body.append(...(expanded ? expandedRows(folder, lane, handlers) : collapsedRows(folder, lane, handlers)));
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
  const rows: HTMLElement[] = lane.all.map((row) => renderRow(row, { folder }, handlers.reveal));
  if (lane.hiddenClosed > 0) {
    rows.push(el('div', 'empty', `${lane.hiddenClosed} older closed item${lane.hiddenClosed === 1 ? '' : 's'} hidden`));
  }
  return rows;
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
