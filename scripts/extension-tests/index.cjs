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


// A user interface that answers from a script. Copy, show and the diff use the editor's real implementations,
// so those parts are exercised for real; only the dialogs that need a person are scripted.
function scriptedUi(api, script) {
  const real = api.testing.createUserInterface(api.states()[0].folder);
  let inputIndex = 0;
  let pickIndex = 0;
  const ui = {
    informed: [], warned: [], copied: [], previews: [], confirmations: [],
    pick: async (items) => {
      const choice = (script.picks ?? [])[pickIndex++];
      const index = typeof choice === 'function' ? choice(items) : choice;
      return index === undefined ? undefined : items[index].value;
    },
    input: async () => (script.inputs ?? [])[inputIndex++],
    confirm: async (message, detail, action) => { ui.confirmations.push({ message, detail, action }); return script.confirm ?? true; },
    previewChange: async (path, before, after) => { ui.previews.push({ path, before, after }); await real.previewChange(path, before, after); },
    chooseFile: async () => script.file,
    copy: async (text) => { ui.copied.push(text); await real.copy(text); },
    inform: (message) => { ui.informed.push(message); },
    warn: (message) => { ui.warned.push(message); },
    show: (path, line) => real.show(path, line),
  };
  api.testing.useUserInterface(() => ui);
  return ui;
}

const claudeFile = () => fileUri('CLAUDE.md').fsPath;
const formatFile = () => fileUri('.planmaster/FORMAT.md').fsPath;
const exists = (file) => fs.access(file).then(() => true, () => false);
const labelIs = (label) => (items) => items.findIndex((item) => item.label === label);

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

  ['opens the queue view and the page really draws the lanes', async (api) => {
    await vscode.commands.executeCommand('planmaster.queue.focus');
    await until('the page to draw five lanes', () => api.queueView().drawnLanes === 5, 30000);
    const view = api.queueView();
    assert.equal(view.resolved, true);
    assert.equal(view.folders.length, 1);
    assert.deepEqual(view.folders[0].lanes.map((l) => l.lane), ['A', 'B', 'C', 'D', 'E']);
  }],

  ['opens an item in the editor when the view asks for it', async (api) => {
    const folder = api.states()[0].folder;
    assert.equal(await api.handleQueueMessage({ type: 'reveal', folder, path: laneD, line: 7 }), true);
    const editor = vscode.window.activeTextEditor;
    assert.equal(editor.document.uri.fsPath, fileUri(laneD).fsPath);
    assert.equal(editor.selection.active.line, 6);
  }],

  ['refuses to open files that were not read as lanes', async (api) => {
    const folder = api.states()[0].folder;
    const before = vscode.window.activeTextEditor.document.uri.toString();
    for (const bad of ['../outside.txt', '.planmaster/lanes/Z.md', config, '/etc/passwd']) {
      assert.equal(await api.handleQueueMessage({ type: 'reveal', folder, path: bad, line: 1 }), false, bad);
    }
    assert.equal(await api.handleQueueMessage({ type: 'reveal', folder: 'nope', path: laneD, line: 1 }), false);
    assert.equal(await api.handleQueueMessage({ type: 'open', url: 'file:///etc/passwd' }), false);
    assert.equal(vscode.window.activeTextEditor.document.uri.toString(), before);
  }],

  ['marks the what\u2019s-new feed as seen', async (api) => {
    const folder = api.states()[0].folder;
    const before = api.queueView().folders[0].news;
    assert.equal(before.sinceLabel, 'the beginning');
    assert.ok(before.events.length > 0);
    assert.equal(await api.handleQueueMessage({ type: 'markSeen', folder }), true);
    await until('the feed to move on', () => api.queueView().folders[0].news.sinceLabel !== 'the beginning');
    assert.ok(api.queueView().folders[0].news.events.length < before.events.length);
  }],

  ['shows a broken config.json in the queue view and recovers', async (api) => {
    const file = fileUri(config).fsPath;
    const original = await fs.readFile(file, 'utf8');
    await fs.writeFile(file, '{ nope');
    await until('the view to carry the error', () => typeof api.queueView().folders[0]?.error === 'string');
    await fs.writeFile(file, original);
    await until('the view to recover', () => api.queueView().folders[0]?.error === undefined && api.queueView().folders[0]?.lanes.length === 5);
  }],

  ['registers every PlanMaster command', async () => {
    const commands = await vscode.commands.getCommands(true);
    for (const id of ['initWorkspace', 'installInstructions', 'copyLanePrompt', 'copyMigratePrompt', 'copyPlanToQueuePrompt', 'copyReconcilePrompt', 'copyArchivePrompt', 'revealItem', 'markSeen', 'runLint']) {
      assert.ok(commands.includes(`planmaster.${id}`), `planmaster.${id} is not registered`);
    }
  }],

  ['initialize adds what is missing and never overwrites', async (api) => {
    const configBefore = await fs.readFile(fileUri(config).fsPath, 'utf8');
    assert.equal(await exists(formatFile()), false);
    const ui = scriptedUi(api, { inputs: ['', ''], confirm: true });
    assert.equal(await vscode.commands.executeCommand('planmaster.initWorkspace'), 'done');
    assert.match(await fs.readFile(formatFile(), 'utf8'), /^# Queue format reference/);
    assert.equal(await fs.readFile(fileUri(config).fsPath, 'utf8'), configBefore);
    assert.match(ui.confirmations[0].detail, /FORMAT\.md/);

    scriptedUi(api, { inputs: ['', ''] });
    assert.equal(await vscode.commands.executeCommand('planmaster.initWorkspace'), 'nothing');
  }],

  ['installs the instructions into CLAUDE.md, showing a real diff first', async (api) => {
    const ui = scriptedUi(api, { confirm: true });
    assert.equal(await vscode.commands.executeCommand('planmaster.installInstructions'), 'done');
    const written = await fs.readFile(claudeFile(), 'utf8');
    assert.match(written, /^<!-- planmaster:begin v1 -->/);
    assert.match(written, /<!-- planmaster:end -->\n$/);
    assert.equal(ui.previews.length, 1);

    const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
    assert.ok(tab.input instanceof vscode.TabInputTextDiff, 'a diff editor is open');
    assert.equal(tab.input.original.scheme, 'planmaster-before');
    assert.equal(tab.input.modified.scheme, 'planmaster-after');

    scriptedUi(api, {});
    assert.equal(await vscode.commands.executeCommand('planmaster.installInstructions'), 'nothing');
  }],

  ['refuses to touch a CLAUDE.md with damaged markers', async (api) => {
    const damaged = '# Mine\n<!-- planmaster:begin v1 -->\nno end marker\n';
    await fs.writeFile(claudeFile(), damaged);
    const ui = scriptedUi(api, { confirm: true });
    assert.equal(await vscode.commands.executeCommand('planmaster.installInstructions'), 'refused');
    assert.equal(await fs.readFile(claudeFile(), 'utf8'), damaged);
    assert.match(ui.warned[0], /end marker/);
  }],

  ['copies the lane start prompt to the clipboard', async (api) => {
    const ui = scriptedUi(api, { picks: [labelIs('A · Requirements matrix, counts and citations')] });
    assert.equal(await vscode.commands.executeCommand('planmaster.copyLanePrompt'), 'done');
    assert.match(ui.copied[0], /You are lane A: "Requirements matrix, counts and citations"\./);
    assert.match(ui.copied[0], /People allowed in wait: alice, bob, carol\./);
    assert.match(await vscode.env.clipboard.readText(), /You are lane A/);
  }],

  ['copies the migration prompt for a chosen document', async (api) => {
    const ui = scriptedUi(api, { file: 'README.md' });
    assert.equal(await vscode.commands.executeCommand('planmaster.copyMigratePrompt'), 'done');
    assert.match(ui.copied[0], /Migrate the open work in README\.md/);
    assert.match(ui.copied[0], /A: Requirements matrix, counts and citations/);
  }],

  ['copies the plan-to-queue, reconcile and archive prompts', async (api) => {
    let ui = scriptedUi(api, {});
    assert.equal(await vscode.commands.executeCommand('planmaster.copyPlanToQueuePrompt'), 'done');
    assert.match(ui.copied[0], /The plan we just approved/);
    ui = scriptedUi(api, { picks: [labelIs('B · Automated checks, gates and ratchets')] });
    assert.equal(await vscode.commands.executeCommand('planmaster.copyReconcilePrompt'), 'done');
    assert.match(ui.copied[0], /Reconcile the queue of lane B/);
    ui = scriptedUi(api, { picks: [labelIs('C · Work plans, drafting and review')] });
    assert.equal(await vscode.commands.executeCommand('planmaster.copyArchivePrompt'), 'done');
    assert.match(ui.copied[0], /more than 14 days before now/);
  }],

  ['reveals any item by ID', async (api) => {
    scriptedUi(api, { picks: [labelIs('D-04')] });
    assert.equal(await vscode.commands.executeCommand('planmaster.revealItem'), 'done');
    const editor = vscode.window.activeTextEditor;
    assert.equal(editor.document.uri.fsPath, fileUri(laneD).fsPath);
    assert.equal(editor.selection.active.line, 6);
  }],

  ['does nothing when a question is cancelled', async (api) => {
    const ui = scriptedUi(api, { picks: [undefined] });
    assert.equal(await vscode.commands.executeCommand('planmaster.copyLanePrompt'), 'cancelled');
    assert.deepEqual(ui.copied, []);
    api.testing.useUserInterface(undefined);
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
