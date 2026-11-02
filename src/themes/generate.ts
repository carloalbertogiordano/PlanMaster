import fs from 'node:fs';
import path from 'node:path';
import { PALETTES } from './palettes.js';
import { buildTheme, themeFileName } from './theme.js';

const SUFFIX = '-color-theme.json';

/** Writes one theme file per palette into `directory` and removes theme files that no palette produces any more. */
export function writeThemes(directory: string): string[] {
  fs.mkdirSync(directory, { recursive: true });
  const written = PALETTES.map((palette) => {
    const name = themeFileName(palette.name);
    fs.writeFileSync(path.join(directory, name), `${JSON.stringify(buildTheme(palette), null, 2)}\n`);
    return name;
  });
  for (const existing of fs.readdirSync(directory)) {
    if (existing.endsWith(SUFFIX) && !written.includes(existing)) fs.rmSync(path.join(directory, existing));
  }
  return written;
}
