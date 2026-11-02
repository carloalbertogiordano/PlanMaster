// Writes themes/*.json from the palettes in src/themes. The files are committed so they can be reviewed;
// a test fails when they are out of date, and bundling regenerates them.
import { build } from 'esbuild';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const generator = path.resolve('dist', 'generate-themes.mjs');
await build({ entryPoints: ['src/themes/generate.ts'], outfile: generator, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' });
const { writeThemes } = await import(pathToFileURL(generator).href);
const written = writeThemes('themes');
console.log(`Themes: ${written.length} files written to themes/`);
