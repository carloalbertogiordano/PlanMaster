// Checks what ended up inside the .vsix and unpacks it, so the extension tests can run against the package
// itself instead of the source tree: a file missing from the package then shows up as a failing test.
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const vsix = path.join(root, 'dist-vsix', 'planmaster.vsix');
const unpacked = path.join(root, 'dist-vsix', 'unpacked');

if (!existsSync(vsix)) throw new Error('Run `npm run package` first.');
const entries = execFileSync('unzip', ['-Z1', vsix], { encoding: 'utf8' }).split('\n').filter(Boolean);

const required = [
  'extension/package.json',
  'extension/dist/extension.cjs',
  'extension/dist/webview.js',
  'extension/dist/planmaster-hook.cjs',
  'extension/media/queue-view.css',
  'extension/media/queue.svg',
  'extension/media/doing.svg',
  'extension/syntaxes/planmaster-lane.tmLanguage.json',
  'extension/language-configuration.json',
  'extension/themes/planmaster-midnight-color-theme.json',
  'extension/themes/planmaster-banana-panic-color-theme.json',
];
const forbidden = [/^extension\/src\//, /^extension\/test\//, /^extension\/docs\//, /^extension\/scripts\//, /node_modules/, /\.map$/, /^extension\/\.planmaster\//, /^extension\/out\//];

const missing = required.filter((entry) => !entries.includes(entry));
const unwanted = entries.filter((entry) => forbidden.some((pattern) => pattern.test(entry)));
if (missing.length > 0 || unwanted.length > 0) {
  console.error(`Package problems.\n  missing: ${missing.join(', ') || 'none'}\n  unwanted: ${unwanted.join(', ') || 'none'}`);
  process.exit(1);
}
console.log(`Package ok: ${entries.length} files.`);

rmSync(unpacked, { recursive: true, force: true });
execFileSync('unzip', ['-q', vsix, '-d', unpacked]);
