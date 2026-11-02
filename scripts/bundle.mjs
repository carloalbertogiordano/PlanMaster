// Bundles the extension into a single CommonJS file, the format the extension host loads.
import { build } from 'esbuild';

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
