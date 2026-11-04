// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { QueueViewModel } from '../../src/app/index.js';
import { render, type Handlers, type ViewState } from '../../src/webview/render.js';
import { read } from '../support/docs.js';
import { previewScenarios } from '../support/preview-models.js';

const css = read('media/queue-view.css').replace(/\/\*[\s\S]*?\*\//g, '');

/** The declarations of every rule whose selector list names `selector` exactly (pseudo-classes aside). */
function declarationsFor(selector: string): string {
  return css
    .split('}')
    .map((block) => block.split('{'))
    .filter(([selectors]) => (selectors ?? '').split(',').some((s) => s.trim() === selector))
    .map(([, body]) => body ?? '')
    .join(';');
}

const handlers: Handlers = { reveal: vi.fn(), markSeen: vi.fn(), selectTab: vi.fn(), toggleLane: vi.fn(), setup: vi.fn(), filter: vi.fn() };
let root: HTMLElement;

beforeEach(() => {
  root = document.createElement('div');
  document.body.replaceChildren(root);
});

function classesOf(element: Element): string[] {
  return (element.getAttribute('class') ?? '').split(/\s+/).filter((name) => name !== '');
}

function drawAndCollect(folders: QueueViewModel[], tab: ViewState['tab']): string[] {
  const expanded = tab === 'stack' ? folders.flatMap((f) => f.lanes.map((l) => `${f.folder}/${l.lane}`)) : [];
  render(root, folders, { tab, expanded }, handlers);
  return [...root.querySelectorAll('[class]')].flatMap(classesOf);
}

/** Every class that ends up on an element, in every situation and on every tab. */
function classesDrawn(): Set<string> {
  const tabs = ['stack', 'blocked', 'news'] as const;
  const names = Object.values(previewScenarios()).flatMap((folders) => tabs.flatMap((tab) => drawAndCollect(folders, tab)));
  return new Set(names);
}

describe('the stylesheet of the queue view', () => {
  // Classes that only give an element a name, and need no look of their own.
  const STRUCTURAL = new Set(['panel', 'folder', 'detail', 'since', 'plain']);

  it('styles every class that the view draws, so that nothing is added to the view without a look', () => {
    const styled = new Set([...css.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((m) => m[1]));
    const missing = [...classesDrawn()].filter((name) => !styled.has(name) && !STRUCTURAL.has(name)).sort((a, b) => a.localeCompare(b));
    expect(missing).toEqual([]);
  });

  it.each(['setup-start', 'setup-link', 'mark-seen', 'toggle', 'tag-toggle', 'tag-clear'])('gives the %s button a visible edge or fill, so that it looks like a button', (name) => {
    expect(declarationsFor(`.${name}`), name).toMatch(/\b(border|background)\b/);
  });

  it.each(['setup-link', 'mark-seen', 'toggle', 'tag-toggle', 'tag-clear'])('gives the secondary %s button an edge that does not depend on its fill, so it shows in every theme', (name) => {
    expect(declarationsFor(`.${name}`)).toMatch(/border:\s*1px solid var\(--vscode-button-border, var\(--line\)\)/);
  });

  it('shows the pointer on every button', () => {
    expect(declarationsFor('button')).toContain('cursor: pointer');
  });

  it.each(['setup-start', 'setup-link', 'mark-seen', 'toggle'])('changes the look of the %s button under the pointer', (name) => {
    expect(css).toMatch(new RegExp(`\\.${name}:hover`));
  });

  it('lets the tab bar and the tabs wrap instead of spilling out or stacking, when the side bar is narrow', () => {
    expect(declarationsFor('.tabs')).toContain('flex-wrap: wrap');
    expect(declarationsFor('.tablist')).toContain('display: flex');
    expect(declarationsFor('.tablist')).toContain('flex-wrap: wrap');
    expect(declarationsFor('.tab')).toContain('white-space: nowrap');
  });

  it('keeps the setup button at the end of the tab bar', () => {
    expect(declarationsFor('.setup-link')).toContain('margin-left: auto');
  });

  it('does not clip text in a narrow view', () => {
    expect(declarationsFor('.setup-detail')).toContain('overflow-wrap');
    expect(declarationsFor('.event time')).toMatch(/overflow-wrap|white-space: normal/);
    expect(declarationsFor('.news-bar')).toContain('flex-wrap: wrap');
  });

  it('draws the get-started card as a card with a primary button that fills its width', () => {
    expect(declarationsFor('.setup-card')).toMatch(/\bborder\b/);
    expect(declarationsFor('.setup-card')).toMatch(/\bpadding\b/);
    expect(declarationsFor('.setup-start')).toContain('width: 100%');
    expect(declarationsFor('.setup-start')).toContain('--vscode-button-background');
  });

  it('never breaks an item ID, which would split A-07 into A- and 07', () => {
    expect(declarationsFor('.id')).toContain('white-space: nowrap');
  });

  it('gives the title of a lane a line of its own, over the full width, when the view is very narrow', () => {
    const narrow = /@container \(max-width: 200px\) \{[\s\S]*?\n\}/.exec(css)?.[0] ?? '';
    expect(narrow).toMatch(/\.lane-title\s*\{[^}]*grid-column: 1 \/ -1/);
    expect(narrow).toMatch(/\.lane-count\s*\{[^}]*grid-column: 2/);
  });

  it('adapts the indentation of nested items to the width of the view', () => {
    expect(css).toMatch(/@container[^{]*max-width/);
  });
});
