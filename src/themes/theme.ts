import { blend } from './color.js';

interface Pair {
  bg: string;
  fg: string;
}

/** Everything a color theme is made from. The builder derives the hundred or so editor colors from it. */
export interface Palette {
  name: string;
  type: 'dark' | 'light';
  /** The editor. */
  bg: string;
  /** Side bar, panel, widgets: the surface the queue view sits on. */
  bgSide: string;
  /** Title bar, activity bar, inactive tabs. */
  bgDeep: string;
  fg: string;
  muted: string;
  border: string;
  accent: string;
  /** Text on top of the accent color. */
  accentFg: string;
  hover: string;
  selection: string;
  comment: string;
  /** The four state colors of the queue (doing, done, blocked, problems) and the rest of the syntax colors. */
  blue: string;
  green: string;
  orange: string;
  red: string;
  purple: string;
  cyan: string;
  yellow: string;
  status: Pair;
  statusError: Pair;
  statusWarning: Pair;
}

interface TokenRule {
  name?: string;
  scope: string | string[];
  settings: { foreground?: string; fontStyle?: string };
}

export interface ThemeJson {
  $schema: string;
  name: string;
  type: 'dark' | 'light';
  semanticHighlighting: boolean;
  colors: Record<string, string>;
  tokenColors: TokenRule[];
}

/** The scopes of the PlanMaster lane grammar (syntaxes/planmaster-lane.tmLanguage.json). */
export const PLANMASTER_SCOPES = [
  'comment.block.planmaster',
  'punctuation.definition.tag.planmaster',
  'keyword.other.planmaster',
  'punctuation.separator.planmaster',
  'string.unquoted.planmaster',
  'punctuation.definition.bracket.planmaster',
  'punctuation.definition.list.begin.markdown',
  'entity.name.function.planmaster.id',
  'variable.parameter.planmaster.key',
  'string.unquoted.planmaster.value',
  'constant.character.planmaster.state.todo',
  'constant.character.planmaster.state.doing',
  'constant.character.planmaster.state.blocked',
  'constant.character.planmaster.state.done',
  'constant.character.planmaster.state.dropped',
] as const;

/** Colors that the editor and the queue view rely on; every theme must define all of them. */
export const REQUIRED_COLORS = [
  'foreground', 'descriptionForeground', 'errorForeground', 'focusBorder', 'textLink.foreground', 'textLink.activeForeground',
  'editor.background', 'editor.foreground', 'editor.selectionBackground', 'editor.lineHighlightBackground', 'editor.rangeHighlightBackground',
  'editorCursor.foreground', 'editorLineNumber.foreground', 'editorLineNumber.activeForeground',
  'editorWidget.background', 'editorWidget.border', 'editorError.foreground', 'editorWarning.foreground', 'editorInfo.foreground',
  'editorGroupHeader.tabsBackground', 'tab.activeBackground', 'tab.inactiveBackground', 'tab.activeForeground', 'tab.inactiveForeground', 'tab.border', 'tab.activeBorderTop',
  'sideBar.background', 'sideBar.foreground', 'sideBar.border', 'sideBarTitle.foreground', 'sideBarSectionHeader.background',
  'activityBar.background', 'activityBar.foreground', 'activityBar.inactiveForeground', 'activityBar.activeBorder', 'activityBarBadge.background', 'activityBarBadge.foreground',
  'statusBar.background', 'statusBar.foreground', 'statusBar.border', 'statusBarItem.hoverBackground',
  'statusBarItem.errorBackground', 'statusBarItem.errorForeground', 'statusBarItem.warningBackground', 'statusBarItem.warningForeground',
  'titleBar.activeBackground', 'titleBar.activeForeground', 'titleBar.inactiveBackground', 'titleBar.inactiveForeground',
  'button.hoverBackground', 'button.secondaryBackground', 'button.secondaryForeground', 'button.secondaryHoverBackground',
  'list.hoverBackground', 'list.activeSelectionBackground', 'list.activeSelectionForeground', 'list.inactiveSelectionBackground', 'list.inactiveSelectionForeground',
  'panel.background', 'panel.border', 'input.background', 'input.foreground', 'input.border', 'button.background', 'button.foreground', 'badge.background', 'badge.foreground',
  'charts.blue', 'charts.green', 'charts.orange', 'charts.red', 'charts.purple', 'charts.yellow',
  'scrollbarSlider.background', 'scrollbarSlider.hoverBackground', 'scrollbarSlider.activeBackground',
] as const;

/** `file-name-color-theme.json` for a theme called "PlanMaster Some Name". */
export function themeFileName(name: string): string {
  return `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-color-theme.json`;
}

export function buildTheme(p: Palette): ThemeJson {
  return {
    $schema: 'vscode://schemas/color-theme',
    name: p.name,
    type: p.type,
    semanticHighlighting: true,
    colors: buildColors(p),
    tokenColors: buildTokenColors(p),
  };
}

function buildColors(p: Palette): Record<string, string> {
  return {
    ...baseColors(p),
    ...editorColors(p),
    ...chromeColors(p),
    ...statusColors(p),
    ...widgetColors(p),
  };
}

function baseColors(p: Palette): Record<string, string> {
  return {
    foreground: p.fg,
    descriptionForeground: p.muted,
    errorForeground: p.red,
    focusBorder: p.accent,
    'textLink.foreground': p.accent,
    'textLink.activeForeground': p.fg,
    'charts.blue': p.blue,
    'charts.green': p.green,
    'charts.orange': p.orange,
    'charts.red': p.red,
    'charts.purple': p.purple,
    'charts.yellow': p.yellow,
  };
}

function editorColors(p: Palette): Record<string, string> {
  return {
    'editor.background': p.bg,
    'editor.foreground': p.fg,
    'editor.selectionBackground': p.selection,
    'editor.lineHighlightBackground': p.hover,
    // The tint on a lane's focus line: the accent, translucent, so the text stays readable on top of it.
    'editor.rangeHighlightBackground': `${p.accent}26`,
    'editorCursor.foreground': p.accent,
    'editorLineNumber.foreground': p.muted,
    'editorLineNumber.activeForeground': p.fg,
    'editorWidget.background': p.bgSide,
    'editorWidget.border': p.border,
    'editorError.foreground': p.red,
    'editorWarning.foreground': p.orange,
    'editorInfo.foreground': p.blue,
    'editorGroupHeader.tabsBackground': p.bgDeep,
    'tab.activeBackground': p.bg,
    'tab.inactiveBackground': p.bgDeep,
    'tab.activeForeground': p.fg,
    'tab.inactiveForeground': p.muted,
    'tab.border': p.border,
    'tab.activeBorderTop': p.accent,
    'scrollbarSlider.background': `${p.muted}33`,
    'scrollbarSlider.hoverBackground': `${p.muted}55`,
    'scrollbarSlider.activeBackground': `${p.muted}77`,
  };
}

function chromeColors(p: Palette): Record<string, string> {
  return {
    'sideBar.background': p.bgSide,
    'sideBar.foreground': p.fg,
    'sideBar.border': p.border,
    'sideBarTitle.foreground': p.fg,
    'sideBarSectionHeader.background': p.bgDeep,
    'activityBar.background': p.bgDeep,
    'activityBar.foreground': p.fg,
    'activityBar.inactiveForeground': p.muted,
    'activityBar.activeBorder': p.accent,
    'activityBarBadge.background': p.accent,
    'activityBarBadge.foreground': p.accentFg,
    'titleBar.activeBackground': p.bgDeep,
    'titleBar.activeForeground': p.fg,
    'titleBar.inactiveBackground': p.bgDeep,
    'titleBar.inactiveForeground': p.muted,
    'panel.background': p.bgSide,
    'panel.border': p.border,
  };
}

function statusColors(p: Palette): Record<string, string> {
  return {
    'statusBar.background': p.status.bg,
    'statusBar.foreground': p.status.fg,
    'statusBar.border': p.border,
    'statusBarItem.hoverBackground': `${p.status.fg}22`,
    'statusBarItem.errorBackground': p.statusError.bg,
    'statusBarItem.errorForeground': p.statusError.fg,
    'statusBarItem.warningBackground': p.statusWarning.bg,
    'statusBarItem.warningForeground': p.statusWarning.fg,
  };
}

function widgetColors(p: Palette): Record<string, string> {
  return {
    'list.hoverBackground': p.hover,
    'list.activeSelectionBackground': p.selection,
    'list.activeSelectionForeground': p.fg,
    'list.inactiveSelectionBackground': p.selection,
    'list.inactiveSelectionForeground': p.fg,
    'input.background': p.bg,
    'input.foreground': p.fg,
    'input.border': p.border,
    // Primary buttons are the accent; the hovered one moves a little towards the text color.
    'button.background': p.accent,
    'button.foreground': p.accentFg,
    'button.hoverBackground': blend(`${p.accent}d9`, p.fg),
    // Secondary buttons use the selection color, which stands out from the side bar they sit on.
    'button.secondaryBackground': p.selection,
    'button.secondaryForeground': p.fg,
    'button.secondaryHoverBackground': blend(`${p.accent}2e`, p.selection),
    'badge.background': p.accent,
    'badge.foreground': p.accentFg,
  };
}

function rule(scope: string | string[], foreground: string, fontStyle?: string, name?: string): TokenRule {
  const settings = fontStyle === undefined ? { foreground } : { foreground, fontStyle };
  return name === undefined ? { scope, settings } : { name, scope, settings };
}

function buildTokenColors(p: Palette): TokenRule[] {
  return [
    ...generalRules(p),
    ...planmasterRules(p),
  ];
}

function generalRules(p: Palette): TokenRule[] {
  return [
    rule(['comment', 'punctuation.definition.comment'], p.comment, 'italic', 'Comments'),
    rule('string', p.green, undefined, 'Strings'),
    rule(['constant.numeric', 'constant.language', 'constant.character'], p.orange, undefined, 'Constants'),
    rule(['keyword', 'storage', 'storage.type'], p.purple, undefined, 'Keywords'),
    rule(['entity.name.function', 'support.function', 'meta.function-call'], p.blue, undefined, 'Functions'),
    rule(['entity.name.type', 'entity.name.class', 'support.type', 'support.class'], p.yellow, undefined, 'Types'),
    rule(['variable', 'variable.other'], p.fg, undefined, 'Variables'),
    rule('punctuation', p.muted, undefined, 'Punctuation'),
    rule('markup.heading', p.blue, 'bold', 'Headings'),
    rule('markup.bold', p.orange, 'bold', 'Bold'),
    rule('markup.italic', p.purple, 'italic', 'Italic'),
    rule(['markup.inline.raw', 'markup.underline.link'], p.cyan, undefined, 'Code and links'),
    rule('invalid', p.red, undefined, 'Invalid'),
  ];
}

function planmasterRules(p: Palette): TokenRule[] {
  return [
    rule('comment.block.planmaster', p.comment, 'italic', 'PlanMaster comment'),
    rule(['punctuation.definition.tag.planmaster', 'punctuation.separator.planmaster', 'punctuation.definition.bracket.planmaster', 'punctuation.definition.list.begin.markdown'], p.muted, undefined, 'PlanMaster punctuation'),
    rule('keyword.other.planmaster', p.purple, undefined, 'PlanMaster front matter key'),
    rule('string.unquoted.planmaster', p.fg, undefined, 'PlanMaster front matter value'),
    rule('entity.name.function.planmaster.id', p.accent, 'bold', 'PlanMaster item ID'),
    rule('variable.parameter.planmaster.key', p.purple, undefined, 'PlanMaster token key'),
    rule('string.unquoted.planmaster.value', p.cyan, undefined, 'PlanMaster token value'),
    rule('constant.character.planmaster.state.todo', p.muted, 'bold', 'PlanMaster state: to do'),
    rule('constant.character.planmaster.state.doing', p.blue, 'bold', 'PlanMaster state: in progress'),
    rule('constant.character.planmaster.state.blocked', p.orange, 'bold', 'PlanMaster state: blocked'),
    rule('constant.character.planmaster.state.done', p.green, 'bold', 'PlanMaster state: done'),
    rule('constant.character.planmaster.state.dropped', p.muted, 'bold', 'PlanMaster state: dropped'),
  ];
}
