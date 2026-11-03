import { describe, expect, it } from 'vitest';
import { blend, contrastRatio, distance, parseHex } from '../../src/themes/color.js';
import { PALETTES } from '../../src/themes/palettes.js';
import { buildTheme } from '../../src/themes/theme.js';

const AA = 4.5;
const luminanceOf = (color: string): number => {
  const { r, g, b } = parseHex(color);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
};

describe('the set of palettes', () => {
  it('has the seven themes, each named PlanMaster something, with distinct names', () => {
    const names = PALETTES.map((p) => p.name);
    expect(names).toEqual([
      'PlanMaster Midnight',
      'PlanMaster Solar',
      'PlanMaster Cyberpunk',
      'PlanMaster Goth',
      'PlanMaster Claude',
      'PlanMaster Banana Panic',
      'PlanMaster Radioactive Pickle',
    ]);
    expect(new Set(names).size).toBe(names.length);
  });

  it('has both dark and light themes', () => {
    expect(PALETTES.filter((p) => p.type === 'light').map((p) => p.name)).toEqual(['PlanMaster Solar', 'PlanMaster Banana Panic']);
  });

  it('gives each theme its own look', () => {
    const backgrounds = PALETTES.map((p) => p.bg);
    expect(new Set(backgrounds).size).toBe(PALETTES.length);
    for (const [i, a] of PALETTES.entries()) {
      for (const b of PALETTES.slice(i + 1)) expect(distance(a.accent, b.accent), `${a.name} and ${b.name}`).toBeGreaterThan(20);
    }
  });
});

describe.each(PALETTES)('$name', (p) => {
  const check = (label: string, foreground: string, background: string, minimum = AA): void => {
    expect(contrastRatio(foreground, background), `${label}: ${foreground} on ${background}`).toBeGreaterThanOrEqual(minimum);
  };

  it('is as dark or as light as it says', () => {
    const light = luminanceOf(p.bg) > 0.5;
    expect(p.type === 'light').toBe(light);
  });

  it('keeps the text of the editor easy to read', () => {
    check('text', p.fg, p.bg, 7);
    check('line numbers', p.muted, p.bg);
    check('comments', p.comment, p.bg, 3);
    check('selected text', p.fg, p.selection);
    check('highlighted line', p.fg, p.hover);
  });

  it('keeps the syntax colors readable on the editor', () => {
    for (const color of ['blue', 'green', 'orange', 'red', 'purple', 'cyan', 'yellow', 'accent'] as const) check(color, p[color], p.bg);
  });

  it('keeps the queue view readable on the side bar', () => {
    check('text', p.fg, p.bgSide, 7);
    check('muted text', p.muted, p.bgSide);
    check('links and accent', p.accent, p.bgSide);
    for (const color of ['blue', 'green', 'orange', 'red'] as const) check(`state ${color}`, p[color], p.bgSide);
    check('text on hover', p.fg, p.hover);
    check('text on the selected tab', p.fg, p.selection);
    check('inactive tab', p.muted, p.bgDeep);
  });

  it('keeps text on the accent color readable (badges, buttons)', () => {
    check('accent text', p.accentFg, p.accent);
  });

  it('keeps the labels of the buttons readable at rest and under the pointer', () => {
    const { colors } = buildTheme(p);
    const get = (key: string): string => colors[key] ?? '#ff00ff';
    check('primary', get('button.foreground'), get('button.background'));
    check('primary hovered', get('button.foreground'), get('button.hoverBackground'));
    check('secondary', get('button.secondaryForeground'), get('button.secondaryBackground'));
    check('secondary hovered', get('button.secondaryForeground'), get('button.secondaryHoverBackground'));
  });

  it('lets a secondary button stand out from the side bar it sits on', () => {
    const { colors } = buildTheme(p);
    expect(distance(colors['button.secondaryBackground'] ?? '#000', p.bgSide)).toBeGreaterThan(20);
  });

  it('keeps the status bar readable in all three states', () => {
    check('normal', p.status.fg, p.status.bg);
    check('warning', p.statusWarning.fg, p.statusWarning.bg);
    check('error', p.statusError.fg, p.statusError.bg);
  });

  it('lets the four states of the queue be told apart by color as well as by shape', () => {
    const states = [p.blue, p.green, p.orange, p.red];
    for (const [i, a] of states.entries()) {
      for (const b of states.slice(i + 1)) expect(distance(a, b), `${a} and ${b}`).toBeGreaterThanOrEqual(70);
    }
  });

  it('keeps text readable on the tinted focus line of a lane', () => {
    const tinted = blend(`${p.accent}26`, p.bg);
    check('text on the focus line', p.fg, tinted, 7);
    check('muted text on the focus line', p.muted, tinted);
  });

  it('keeps every syntax rule readable', () => {
    const theme = buildTheme(p);
    for (const rule of theme.tokenColors) {
      const color = rule.settings.foreground;
      if (color === undefined) continue;
      const comment = [rule.scope].flat().some((scope) => scope.startsWith('comment'));
      check(rule.name ?? String(rule.scope), color, p.bg, comment ? 3 : AA);
    }
  });
});
