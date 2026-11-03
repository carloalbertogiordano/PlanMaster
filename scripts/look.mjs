// Takes screenshots of the real editor showing the queue view, with the side bar narrowed step by step.
// Needs a display, so run it under a virtual one:
//   xvfb-run -a -s "-screen 0 1400x900x24" node scripts/look.mjs [out-dir] [--themes midnight,banana-panic] [--steps 0,8,16] [--fresh]
// With --fresh the project has nothing of PlanMaster yet; otherwise it is a copy of the demo project.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTests } from '@vscode/test-electron';

// On a Wayland desktop Electron would ignore the virtual display and open real windows on the user's screen.
delete process.env.WAYLAND_DISPLAY;

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return (at >= 0 ? (args[at + 1] ?? fallback) : fallback).split(',');
};
const fresh = args.includes('--fresh');
const out = path.resolve(args.find((a, i) => !a.startsWith('--') && !(args[i - 1] ?? '').startsWith('--')) ?? path.join(root, 'dist-preview'));
const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const wanted = option('themes', 'midnight,banana-panic');
const themes = manifest.contributes.themes
  .map((theme) => ({ label: theme.label, file: path.basename(theme.path, '-color-theme.json').replace(/^planmaster-/, '') }))
  .filter((theme) => wanted.includes(theme.file));
const sizes = option('steps', '0,8,16').map(Number);

const scratch = mkdtempSync(path.join(tmpdir(), 'planmaster-look-'));
const workspace = path.join(scratch, 'project');
const userData = path.join(scratch, 'user-data');

function findVsCode() {
  if (process.env.VSCODE_EXECUTABLE) return process.env.VSCODE_EXECUTABLE;
  const script = realpathSync(execFileSync('which', ['code'], { encoding: 'utf8' }).trim());
  const electron = path.join(path.dirname(path.dirname(script)), 'code');
  return existsSync(electron) ? electron : script;
}

try {
  mkdirSync(out, { recursive: true });
  if (fresh) {
    mkdirSync(workspace);
    writeFileSync(path.join(workspace, 'CLAUDE.md'), '# My project\n\nSome notes of my own.\n');
  } else {
    cpSync(path.join(root, 'docs', 'examples', 'demo-workspace'), workspace, { recursive: true });
  }
  mkdirSync(path.join(userData, 'User'), { recursive: true });
  writeFileSync(path.join(userData, 'User', 'settings.json'), JSON.stringify({
    'workbench.startupEditor': 'none',
    'workbench.tips.enabled': false,
    'workbench.colorTheme': themes[0]?.label,
    'telemetry.telemetryLevel': 'off',
    'update.mode': 'none',
    'security.workspace.trust.enabled': false,
    'window.commandCenter': false,
    'chat.disableAIFeatures': true,
    'workbench.secondarySideBar.defaultVisibility': 'hidden',
    'editor.minimap.enabled': false,
  }));
  await runTests({
    vscodeExecutablePath: findVsCode(),
    extensionDevelopmentPath: root,
    extensionTestsPath: path.join(root, 'scripts', 'extension-tests', 'look.cjs'),
    extensionTestsEnv: { PLANMASTER_LOOK_DIR: out, PLANMASTER_LOOK_PREFIX: fresh ? 'fresh' : 'queue', PLANMASTER_LOOK_THEMES: JSON.stringify(themes), PLANMASTER_LOOK_SIZES: JSON.stringify(sizes) },
    launchArgs: [workspace, '--disable-extensions', '--disable-gpu', '--ozone-platform=x11', '--no-sandbox', '--user-data-dir', userData, '--extensions-dir', path.join(scratch, 'extensions')],
  });
  console.log(`Screenshots written to ${out}`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
