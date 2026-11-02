// Bundles the extension into a single CommonJS file, the format the extension host loads.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/extension/extension.ts'],
  outfile: 'dist/extension.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['vscode'],
  sourcemap: true,
  logLevel: 'info',
});
