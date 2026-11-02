// Runs the extension inside a real VS Code (headless through xvfb) in two situations:
//  1. a copy of the demo workspace, which has a queue;
//  2. a project that has nothing of PlanMaster yet, which is where a new user starts.
// Set VSCODE_EXECUTABLE to use a specific VS Code binary; by default `code` from PATH is used.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTests } from '@vscode/test-electron';

// On a Wayland desktop Electron would ignore the virtual display and open real windows on the user's screen.
delete process.env.WAYLAND_DISPLAY;

const root = fileURLToPath(new URL('..', import.meta.url));
const scratch = mkdtempSync(path.join(tmpdir(), 'planmaster-extension-'));
const reportFile = path.join(scratch, 'report.txt');

// `code` on PATH is usually a start script (<install>/bin/code); the Electron binary is <install>/code.
function findVsCode() {
  if (process.env.VSCODE_EXECUTABLE) return process.env.VSCODE_EXECUTABLE;
  const script = realpathSync(execFileSync('which', ['code'], { encoding: 'utf8' }).trim());
  const electron = path.join(path.dirname(path.dirname(script)), 'code');
  return existsSync(electron) ? electron : script;
}

async function suite(name, tests, workspace, env) {
  try {
    await runTests({
      vscodeExecutablePath: findVsCode(),
      // Normally the source tree; the package test points this at the unpacked .vsix.
      extensionDevelopmentPath: process.env.PLANMASTER_EXTENSION_PATH ? path.resolve(root, process.env.PLANMASTER_EXTENSION_PATH) : root,
      extensionTestsPath: path.join(root, 'scripts', 'extension-tests', tests),
      extensionTestsEnv: { PLANMASTER_TEST_REPORT: reportFile, ...env },
      launchArgs: [
        workspace,
        '--disable-extensions',
        '--disable-gpu',
        '--ozone-platform=x11',
        '--no-sandbox',
        '--user-data-dir', path.join(scratch, `user-data-${name}`),
        '--extensions-dir', path.join(scratch, `extensions-${name}`),
      ],
    });
  } catch (error) {
    console.error(`${name}: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  }
}

try {
  const demo = path.join(scratch, 'demo');
  cpSync(path.join(root, 'docs', 'examples', 'demo-workspace'), demo, { recursive: true });
  await suite('demo', 'index.cjs', demo, { PLANMASTER_TEST_WORKSPACE: demo });

  // A project of someone who already uses Claude, but has nothing of PlanMaster.
  const fresh = path.join(scratch, 'fresh');
  mkdirSync(fresh);
  writeFileSync(path.join(fresh, 'CLAUDE.md'), '# My project\n\nSome notes of my own.\n');
  await suite('fresh', 'fresh.cjs', fresh, { PLANMASTER_FRESH_WORKSPACE: fresh });
} finally {
  const report = existsSync(reportFile) ? readFileSync(reportFile, 'utf8') : '';
  console.log(report || 'No test results were reported: the tests did not run.');
  if (report === '') process.exitCode = 1;
  rmSync(scratch, { recursive: true, force: true });
}
