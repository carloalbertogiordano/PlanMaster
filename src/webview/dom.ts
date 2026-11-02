import type { Chip, RowState } from '../app/index.js';

/** Creates an element whose text is set with `textContent`, so nothing in it is ever parsed as markup. */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className !== '') node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function chipElement(chip: Chip): HTMLElement {
  return el('span', `chip ${chip.kind}`, chip.text);
}

const SVG_NS = 'http://www.w3.org/2000/svg';

type Shape = [tag: 'circle' | 'path', attributes: Record<string, string>];

const RING: Shape = ['circle', { cx: '8', cy: '8', r: '5.75', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5' }];
const DISC: Shape = ['circle', { cx: '8', cy: '8', r: '6.5', fill: 'currentColor' }];

/** Each state has its own shape, so state never depends on color alone. */
const SHAPES: Readonly<Record<RowState, Shape[]>> = {
  todo: [RING],
  doing: [DISC, ['path', { class: 'inv', d: 'M6.5 5.1l4.2 2.9-4.2 2.9z' }]],
  blocked: [RING, ['path', { d: 'M6.4 5.6v4.8M9.6 5.6v4.8', stroke: 'currentColor', 'stroke-width': '1.6', 'stroke-linecap': 'round' }]],
  done: [DISC, ['path', { class: 'inv-stroke', d: 'M5.2 8.2l2 2 3.7-4', fill: 'none', 'stroke-width': '1.7', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }]],
  dropped: [RING, ['path', { d: 'M5.4 8h5.2', stroke: 'currentColor', 'stroke-width': '1.6', 'stroke-linecap': 'round' }]],
};

export function icon(state: RowState): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  for (const [tag, attributes] of SHAPES[state]) {
    const shape = document.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attributes)) shape.setAttribute(name, value);
    svg.append(shape);
  }
  return svg;
}
