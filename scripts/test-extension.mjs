// Runs the extension inside a real VS Code (headless through xvfb) against a copy of the demo workspace.
// Set VSCODE_EXECUTABLE to use a specific VS Code binary; by default `code` from PATH is used.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTests } from '@vscode/test-electron';

const root = fileURLToPath(new URL('..', import.meta.url));
const scratch = mkdtempSync(path.join(tmpdir(), 'planmaster-extension-'));
const workspace = path.join(scratch, 'workspace');
const reportFile = path.join(scratch, 'report.txt');

// `code` on PATH is usually a start script (<install>/bin/code); the Electron binary is <install>/code.
function findVsCode() {
  if (process.env.VSCODE_EXECUTABLE) return process.env.VSCODE_EXECUTABLE;
  const script = realpathSync(execFileSync('which', ['code'], { encoding: 'utf8' }).trim());
  const electron = path.join(path.dirname(path.dirname(script)), 'code');
  return existsSync(electron) ? electron : script;
}

try {
  cpSync(path.join(root, 'docs', 'examples', 'demo-workspace'), workspace, { recursive: true });
  await runTests({
    vscodeExecutablePath: findVsCode(),
    extensionDevelopmentPath: root,
    extensionTestsPath: path.join(root, 'scripts', 'extension-tests', 'index.cjs'),
    extensionTestsEnv: { PLANMASTER_TEST_WORKSPACE: workspace, PLANMASTER_TEST_REPORT: reportFile },
    launchArgs: [
      workspace,
      '--disable-extensions',
      '--disable-gpu',
      '--no-sandbox',
      '--user-data-dir', path.join(scratch, 'user-data'),
      '--extensions-dir', path.join(scratch, 'extensions'),
    ],
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  const report = existsSync(reportFile) ? readFileSync(reportFile, 'utf8') : '';
  console.log(report || 'No test results were reported: the tests did not run.');
  if (report === '') process.exitCode = 1;
  rmSync(scratch, { recursive: true, force: true });
}
