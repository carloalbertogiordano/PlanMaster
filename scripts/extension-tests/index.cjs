// Tests that run inside the extension host. They share one workspace and run in order, because they
// change files on disk and observe how the extension reacts; unit tests cover the logic in isolation.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const vscode = require('vscode');
const fsSync = require('node:fs');

const workspace = process.env.PLANMASTER_TEST_WORKSPACE;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fileUri = (relative) => vscode.Uri.file(path.join(workspace, ...relative.split('/')));
const diagnosticCodes = (relative) => vscode.languages.getDiagnostics(fileUri(relative)).map((d) => String(d.code)).sort();
const laneB = '.planmaster/lanes/B.md';
const laneD = '.planmaster/lanes/D.md';
const config = '.planmaster/config.json';

async function until(description, check, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${description}`);
    await sleep(100);
  }
}

async function lineAndColumn(relative, lineMarker, tokenMarker) {
  const document = await vscode.workspace.openTextDocument(fileUri(relative));
  const line = document.getText().split('\n').findIndex((l) => l.includes(lineMarker));
  assert.ok(line >= 0, `${lineMarker} not found in ${relative}`);
  return { document, position: new vscode.Position(line, document.lineAt(line).text.indexOf(tokenMarker)) };
}

const tests = [
  ['recognises lane files as PlanMaster lanes', async () => {
    const document = await vscode.workspace.openTextDocument(fileUri(laneB));
    assert.equal(document.languageId, 'planmaster-lane');
  }],

  ['publishes the findings of the demo workspace as diagnostics', async () => {
    await until('PM004 and PM006 on B.md', () => ['PM004', 'PM006'].every((c) => diagnosticCodes(laneB).includes(c)));
  }],

  ['underlines the item from its ID', async () => {
    const [first] = vscode.languages.getDiagnostics(fileUri(laneB)).filter((d) => d.code === 'PM004');
    assert.equal(first.range.start.character, 6);
    assert.equal(first.severity, vscode.DiagnosticSeverity.Error);
    assert.equal(first.source, 'PlanMaster');
  }],

  ['exposes a summary of the queue', async (api) => {
    const [state] = api.states();
    assert.equal(api.states().length, 1);
    assert.equal(state.kind, 'ok');
    assert.match(state.statusText, /lanes active · \d+ open · \d+ blocked/);
  }],

  ['shows the item named by a wait: token on hover', async () => {
    const { document, position } = await lineAndColumn(laneD, 'D-08', 'D-04');
    const hovers = await vscode.commands.executeCommand('vscode.executeHoverProvider', document.uri, position);
    const text = hovers.flatMap((h) => h.contents).map((c) => c.value ?? String(c)).join('\n');
    assert.match(text, /D-04/);
    assert.match(text, /in progress/);
  }],

  ['jumps to the item named by a wait: token', async () => {
    const { document, position } = await lineAndColumn(laneD, 'D-08', 'D-04');
    const locations = await vscode.commands.executeCommand('vscode.executeDefinitionProvider', document.uri, position);
    assert.equal(locations.length, 1);
    assert.equal(locations[0].uri.fsPath, fileUri(laneD).fsPath);
    assert.equal(locations[0].range.start.line, 6);
  }],

  ['does not offer a hover on the title of an item', async () => {
    const { document, position } = await lineAndColumn(laneD, 'D-08', 'Session');
    const hovers = await vscode.commands.executeCommand('vscode.executeHoverProvider', document.uri, position);
    const text = hovers.flatMap((h) => h.contents).map((c) => c.value ?? String(c)).join('\n');
    assert.doesNotMatch(text, /Neutral translation/);
  }],

  ['picks up an edit made on disk', async () => {
    const file = fileUri(laneB).fsPath;
    const original = await fs.readFile(file, 'utf8');
    const fixed = original.replace('once permissions land', 'once permissions land wait:alice since:2026-11-02T10:00');
    assert.notEqual(fixed, original);
    await fs.writeFile(file, fixed);
    await until('B.md diagnostics to clear', () => {
      const codes = diagnosticCodes(laneB);
      return !codes.includes('PM004') && !codes.includes('PM006');
    });
  }],

  ['follows a lane file that is created and deleted', async () => {
    const file = fileUri('.planmaster/lanes/F.md').fsPath;
    await fs.writeFile(file, '---\nformat: 1\nlane: F\ntitle: Temporary lane\n---\n\n- [ ] G-1 Wrong prefix\n');
    await until('PM003 on F.md', () => diagnosticCodes('.planmaster/lanes/F.md').includes('PM003'));
    await fs.rm(file);
    await until('F.md diagnostics to clear', () => diagnosticCodes('.planmaster/lanes/F.md').length === 0);
  }],

  ['reports a broken config.json and recovers', async (api) => {
    const file = fileUri(config).fsPath;
    const original = await fs.readFile(file, 'utf8');
    await fs.writeFile(file, '{ nope');
    await until('a configuration error', () => api.states()[0].kind === 'config-error');
    await until('a diagnostic on config.json', () => diagnosticCodes(config).length === 1 || vscode.languages.getDiagnostics(fileUri(config)).length === 1);
    await fs.writeFile(file, original);
    await until('the queue to recover', () => api.states()[0].kind === 'ok');
  }],

  ['runs the re-check command', async () => {
    await vscode.commands.executeCommand('planmaster.runLint');
  }],
];

// The extension host's console is not reliably forwarded, so results go to a file that the launcher prints.
function report(line) {
  if (process.env.PLANMASTER_TEST_REPORT) fsSync.appendFileSync(process.env.PLANMASTER_TEST_REPORT, `${line}\n`);
}

exports.run = async function run() {
  const extension = vscode.extensions.getExtension('planmaster.planmaster');
  assert.ok(extension, 'the extension is not installed');
  const api = await extension.activate();

  let failed = 0;
  for (const [name, test] of tests) {
    try {
      await test(api);
      report(`  ok    ${name}`);
    } catch (error) {
      failed++;
      report(`  FAIL  ${name}\n        ${error.message}`);
    }
  }
  if (failed > 0) throw new Error(`${failed} extension test(s) failed`);
};
