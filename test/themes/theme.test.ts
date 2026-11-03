import { describe, expect, it } from 'vitest';
import { isHexColor } from '../../src/themes/color.js';
import { PLANMASTER_SCOPES, REQUIRED_COLORS, buildTheme, themeFileName, type Palette } from '../../src/themes/theme.js';

const sample: Palette = {
  name: 'PlanMaster Sample',
  type: 'dark',
  bg: '#101010', bgSide: '#181818', bgDeep: '#080808', fg: '#eeeeee', muted: '#aaaaaa', border: '#303030',
  accent: '#66aaff', accentFg: '#000000', hover: '#202020', selection: '#304060', comment: '#888888',
  blue: '#6699ff', green: '#66cc88', orange: '#ffaa44', red: '#ff6677', purple: '#bb99ff', cyan: '#55ccdd', yellow: '#ffdd66',
  status: { bg: '#224488', fg: '#ffffff' },
  statusError: { bg: '#aa2222', fg: '#ffffff' },
  statusWarning: { bg: '#886600', fg: '#ffffff' },
};

describe('buildTheme', () => {
  const theme = buildTheme(sample);

  it('carries the name and the kind of theme', () => {
    expect(theme.name).toBe('PlanMaster Sample');
    expect(theme.type).toBe('dark');
    expect(buildTheme({ ...sample, type: 'light' }).type).toBe('light');
  });

  it('defines every color the editor and the queue view rely on', () => {
    for (const key of REQUIRED_COLORS) expect(theme.colors[key], key).toBeDefined();
  });

  it('writes only valid colors', () => {
    for (const [key, value] of Object.entries(theme.colors)) expect(isHexColor(value), `${key}: ${value}`).toBe(true);
  });

  it('takes the main colors from the palette', () => {
    expect(theme.colors['editor.background']).toBe('#101010');
    expect(theme.colors['sideBar.background']).toBe('#181818');
    expect(theme.colors['activityBar.background']).toBe('#080808');
    expect(theme.colors.focusBorder).toBe('#66aaff');
    expect(theme.colors.errorForeground).toBe('#ff6677');
  });

  it('gives the queue view the four state colors through the chart colors', () => {
    expect(theme.colors['charts.blue']).toBe('#6699ff');
    expect(theme.colors['charts.green']).toBe('#66cc88');
    expect(theme.colors['charts.orange']).toBe('#ffaa44');
    expect(theme.colors['charts.red']).toBe('#ff6677');
  });

  it('colors the status bar item for problems with its own pair', () => {
    expect(theme.colors['statusBar.background']).toBe('#224488');
    expect(theme.colors['statusBarItem.errorBackground']).toBe('#aa2222');
    expect(theme.colors['statusBarItem.errorForeground']).toBe('#ffffff');
    expect(theme.colors['statusBarItem.warningBackground']).toBe('#886600');
    expect(theme.colors['statusBarItem.warningForeground']).toBe('#ffffff');
  });

  it('gives the buttons of the queue view their own colors: primary on the accent, secondary on the selection', () => {
    expect(theme.colors['button.background']).toBe('#66aaff');
    expect(theme.colors['button.foreground']).toBe('#000000');
    expect(theme.colors['button.secondaryBackground']).toBe('#304060');
    expect(theme.colors['button.secondaryForeground']).toBe('#eeeeee');
    expect(isHexColor(theme.colors['button.hoverBackground'] ?? '')).toBe(true);
    expect(isHexColor(theme.colors['button.secondaryHoverBackground'] ?? '')).toBe(true);
    expect(theme.colors['button.hoverBackground']).not.toBe(theme.colors['button.background']);
  });

  it('tints the focus line of a lane with the accent, translucent', () => {
    expect(theme.colors['editor.rangeHighlightBackground']).toBe('#66aaff26');
  });

  it('colors every part of a lane file', () => {
    const scopes = new Set(theme.tokenColors.flatMap((rule) => (Array.isArray(rule.scope) ? rule.scope : [rule.scope])));
    for (const scope of PLANMASTER_SCOPES) expect(scopes.has(scope), scope).toBe(true);
  });

  it('colors each state of an item like the queue view does', () => {
    const color = (scope: string) => theme.tokenColors.find((rule) => [rule.scope].flat().includes(scope))?.settings.foreground;
    expect(color('constant.character.planmaster.state.doing')).toBe('#6699ff');
    expect(color('constant.character.planmaster.state.blocked')).toBe('#ffaa44');
    expect(color('constant.character.planmaster.state.done')).toBe('#66cc88');
    expect(color('constant.character.planmaster.state.todo')).toBe('#aaaaaa');
    expect(color('constant.character.planmaster.state.dropped')).toBe('#aaaaaa');
  });

  it('gives every syntax rule a valid color', () => {
    for (const rule of theme.tokenColors) {
      if (rule.settings.foreground !== undefined) expect(isHexColor(rule.settings.foreground)).toBe(true);
    }
  });

  it('is plain data that survives a round trip through JSON', () => {
    expect(JSON.parse(JSON.stringify(theme))).toEqual(theme);
  });
});

describe('themeFileName', () => {
  it('turns the name into the file name VS Code themes use', () => {
    expect(themeFileName('PlanMaster Midnight')).toBe('planmaster-midnight-color-theme.json');
    expect(themeFileName('PlanMaster Banana Panic')).toBe('planmaster-banana-panic-color-theme.json');
  });
});
