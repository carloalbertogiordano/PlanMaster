// Builds everything and packs the extension into dist-vsix/planmaster.vsix.
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

execFileSync(process.execPath, ['scripts/bundle.mjs'], { stdio: 'inherit' });
mkdirSync('dist-vsix', { recursive: true });
execFileSync(
  process.execPath,
  [
    'node_modules/@vscode/vsce/vsce',
    'package',
    '--no-dependencies',
    // There is no remote repository to link to, so relative links in the readme are left as they are.
    '--allow-missing-repository',
    '--no-rewrite-relative-links',
    '--out',
    'dist-vsix/planmaster.vsix',
  ],
  { stdio: 'inherit' },
);
