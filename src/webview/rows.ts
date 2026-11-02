import type { Chip, NewsEventModel, RowModel } from '../app/index.js';
import { chipElement, el, icon } from './dom.js';

export type Reveal = (path: string, line: number) => void;

interface RowOptions {
  /** Distinguishes the same ID in different workspace folders, for keeping keyboard focus. */
  folder: string;
  laneTag?: string;
}

/** One item as a button: icon, ID, title and chips. */
export function renderRow(row: RowModel & { dependency?: Chip }, options: RowOptions, reveal: Reveal): HTMLButtonElement {
  const button = el('button', `row st-${row.state}`);
  button.type = 'button';
  button.dataset.id = row.id;
  button.dataset.key = `row:${options.folder}/${row.id}`;
  button.setAttribute('aria-label', `${row.id}, ${row.stateLabel}, ${row.title}`);
  button.style.setProperty('--depth', String(row.depth));
  button.addEventListener('click', () => { reveal(row.path, row.line); });

  const main = el('span', 'main');
  const heading = el('span', 'heading');
  if (options.laneTag !== undefined) heading.append(el('span', 'lane-tag', options.laneTag));
  heading.append(el('span', 'id', row.id), el('span', 'title', row.title));
  main.append(heading);

  const chips = row.dependency ? [...row.chips, row.dependency] : row.chips;
  if (chips.length > 0) {
    const list = el('span', 'chips');
    list.append(...chips.map(chipElement));
    main.append(list);
  }

  button.append(icon(row.state), main);
  return button;
}

/** One entry of the what's-new feed. */
export function renderEvent(event: NewsEventModel, folder: string, reveal: Reveal): HTMLButtonElement {
  const button = el('button', 'event');
  button.type = 'button';
  button.dataset.id = event.row.id;
  button.dataset.key = `event:${folder}/${event.row.id}`;
  button.setAttribute('aria-label', `${event.time}, ${event.row.id} ${event.verb}${event.detail}, ${event.row.title}`);
  button.addEventListener('click', () => { reveal(event.row.path, event.row.line); });

  const time = el('time', '', event.time);
  const summary = el('span', 'summary');
  summary.append(
    el('span', 'lane-tag', event.row.lane),
    el('span', 'id', event.row.id),
    ' ',
    el('span', `verb ${event.verb}`, event.verb),
    el('span', 'detail', event.detail),
  );
  const description = el('span', 'main');
  description.append(summary, el('span', 'title', event.row.title));
  button.append(time, description);
  return button;
}
