import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PALETTES } from '../../src/themes/palettes.js';
import { PLANMASTER_SCOPES, buildTheme, themeFileName } from '../../src/themes/theme.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const readText = (relative: string): string => fs.readFileSync(path.join(ROOT, relative), 'utf8');

interface Manifest {
  contributes: { themes: { label: string; uiTheme: string; path: string }[] };
}
interface GrammarRule {
  begin?: string;
  beginCaptures?: Record<string, { name: string }>;
}

describe('theme files', () => {
  it.each(PALETTES)('$name is generated from its palette, so file and palette cannot drift apart', (palette) => {
    const file = `themes/${themeFileName(palette.name)}`;
    expect(fs.existsSync(path.join(ROOT, file)), `${file} is missing: run npm run themes`).toBe(true);
    expect(readText(file), `${file} is out of date: run npm run themes`).toBe(`${JSON.stringify(buildTheme(palette), null, 2)}\n`);
  });

  it('has no theme file without a palette', () => {
    const expected = new Set(PALETTES.map((p) => themeFileName(p.name)));
    expect(fs.readdirSync(path.join(ROOT, 'themes')).filter((name) => !expected.has(name))).toEqual([]);
  });
});

describe('the extension manifest', () => {
  const manifest = JSON.parse(readText('package.json')) as Manifest;

  it('offers every theme, dark ones as dark and light ones as light', () => {
    expect(manifest.contributes.themes).toEqual(PALETTES.map((p) => ({
      label: p.name,
      uiTheme: p.type === 'dark' ? 'vs-dark' : 'vs',
      path: `./themes/${themeFileName(p.name)}`,
    })));
  });

  it('puts the themes into the package', () => {
    expect(readText('.vscodeignore')).toContain('!themes/**');
  });
});

describe('the lane grammar', () => {
  const grammar = JSON.parse(readText('syntaxes/planmaster-lane.tmLanguage.json')) as { repository: Record<string, GrammarRule> };
  const text = JSON.stringify(grammar);
  const itemRules = Object.entries(grammar.repository).filter(([name]) => name.startsWith('item-'));

  it('has every scope that the themes color', () => {
    for (const scope of PLANMASTER_SCOPES) expect(text, scope).toContain(`"${scope}"`);
  });

  it('recognises each state of an item with its own scope', () => {
    const lines: [string, string][] = [
      [' ', 'todo'], ['~', 'doing'], ['!', 'blocked'], ['x', 'done'], ['-', 'dropped'],
    ];
    for (const [marker, state] of lines) {
      const line = `  - [${marker}] B-12a Some title since:2026-11-02T10:00`;
      const matching = itemRules.filter(([, rule]) => new RegExp(rule.begin ?? '(?!)').test(line));
      expect(matching, `marker "${marker}"`).toHaveLength(1);
      expect(matching[0]?.[1].beginCaptures?.['4']?.name).toBe(`constant.character.planmaster.state.${state}`);
    }
  });

  it('does not take other text for an item', () => {
    for (const line of ['- [?] B-1 Title', '- B-1 Title', '- [ ] b-1 Title', 'plain prose', '- [~]B-1 Title']) {
      expect(itemRules.some(([, rule]) => new RegExp(rule.begin ?? '(?!)').test(line)), line).toBe(false);
    }
  });
});
