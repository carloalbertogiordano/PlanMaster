// Bundles the extension into a single CommonJS file, the format the extension host loads.
import { build } from 'esbuild';

// The color themes are generated from their palettes, so a package can never contain stale ones.
await import('./build-themes.mjs');

const common = { bundle: true, sourcemap: true, logLevel: 'info' };

await build({
  ...common,
  entryPoints: ['src/extension/extension.ts'],
  outfile: 'dist/extension.cjs',
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['vscode'],
  // The prompt documents are bundled as text so the extension carries the exact prompts the docs describe.
  loader: { '.md': 'text' },
});

// The queue view runs in a webview, a browser context without Node or the editor API.
await build({
  ...common,
  entryPoints: ['src/webview/main.ts'],
  outfile: 'dist/webview.js',
  platform: 'browser',
  format: 'iife',
  target: 'es2022',
});

// The program the Claude Code hooks run. It is a single file with no dependencies, because it is copied into
// the project (.planmaster/hooks/) and must work without the extension or node_modules.
await build({
  ...common,
  sourcemap: false,
  entryPoints: ['src/cli/hook.ts'],
  outfile: 'dist/planmaster-hook.cjs',
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  loader: { '.md': 'text' },
});
