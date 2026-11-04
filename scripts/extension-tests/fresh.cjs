// A project that has nothing of PlanMaster yet, and a CLAUDE.md of its own: the whole guided setup, from nothing.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const vscode = require('vscode');

const workspace = process.env.PLANMASTER_FRESH_WORKSPACE;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fileUri = (relative) => vscode.Uri.file(path.join(workspace, ...relative.split('/')));

async function until(description, check, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${description}`);
    await sleep(100);
  }
}

function report(line) {
  if (process.env.PLANMASTER_TEST_REPORT) fsSync.appendFileSync(process.env.PLANMASTER_TEST_REPORT, `${line}\n`);
}

function scriptedUi(api, script) {
  const real = api.testing.createUserInterface(path.basename(workspace));
  let offerIndex = 0;
  let pickIndex = 0;
  let confirmIndex = 0;
  const ui = {
    offered: [], copied: [], confirmations: [], previews: [], warned: [],
    pick: async (items) => { const i = (script.picks ?? [])[pickIndex++]; return i === undefined ? undefined : items[i].value; },
    input: async () => undefined,
    confirm: async (message, detail, action) => { ui.confirmations.push({ message, detail, action }); return (script.confirms ?? [])[confirmIndex++] ?? true; },
    previewChange: async (p, before, after) => { ui.previews.push({ path: p, before, after }); await real.previewChange(p, before, after); },
    chooseFile: async () => undefined,
    copy: async (text) => { ui.copied.push(text); await real.copy(text); },
    offer: async (message, actions) => { ui.offered.push({ message, actions }); return (script.offers ?? [])[offerIndex++]; },
    showText: (text) => real.showText(text),
    inform: () => undefined,
    warn: (message) => { ui.warned.push(message); },
    show: (p, line) => real.show(p, line),
  };
  api.testing.useUserInterface(() => ui);
  return ui;
}

const tests = [
  ['sees a project with nothing of PlanMaster and invites the user to set it up', async (api) => {
    await until('the assessment', () => api.setupReasons()[0].reason === 'missing');
    assert.deepEqual(api.states(), [], 'no queue is running yet');
    await vscode.commands.executeCommand('planmaster.queue.focus');
    await until('the card in the view', () => api.queueView().folders[0]?.setup?.reason === 'missing');
    const [model] = api.queueView().folders;
    assert.equal(model.setup.headline, 'PlanMaster is not set up in this project yet.');
    assert.deepEqual(model.lanes, []);
    await until('the page to draw the invitation', () => api.queueView().drawnLanes === 0);
  }],

  ['the guided setup prepares the project from nothing and hands over one message', async (api) => {
    const original = await fs.readFile(fileUri('CLAUDE.md').fsPath, 'utf8');
    const ui = scriptedUi(api, { picks: [0], offers: ['Show the message', undefined] });
    assert.equal(await vscode.commands.executeCommand('planmaster.setup'), 'done');

    assert.match(await fs.readFile(fileUri('.planmaster/config.json').fsPath, 'utf8'), /"staleAfterMinutes": 120/);
    assert.match(await fs.readFile(fileUri('.planmaster/FORMAT.md').fsPath, 'utf8'), /^# Queue format reference/);
    const claude = await fs.readFile(fileUri('CLAUDE.md').fsPath, 'utf8');
    assert.ok(claude.startsWith(original), 'the user’s own text is untouched, at the top');
    assert.match(claude, /<!-- planmaster:begin v2 -->[\s\S]*<!-- planmaster:end -->\n$/);
    assert.ok(fsSync.existsSync(fileUri('.planmaster/hooks/planmaster-hook.cjs').fsPath), 'the hook program is in the project');
    assert.deepEqual(Object.keys(JSON.parse(await fs.readFile(fileUri('.claude/settings.json').fsPath, 'utf8')).hooks).sort(), ['PostToolUse', 'SessionStart', 'Stop']);

    assert.equal(ui.copied.length, 1);
    assert.match(ui.copied[0], /Current situation: PlanMaster is not set up in this project yet\./);
    assert.match(await vscode.env.clipboard.readText(), /PHASE 4/);
    assert.match(ui.offered[0].message, /open a Claude chat in this project and paste it/);
    assert.equal(vscode.window.activeTextEditor?.document.languageId, 'markdown', 'the message was shown on request');
  }],

  ['the queue starts by itself, and still asks for Claude to fill it', async (api) => {
    await until('a queue for the project', () => api.states().length === 1 && api.states()[0].kind === 'ok');
    await until('the empty queue to be noticed', () => api.setupReasons()[0].reason === 'empty');
    await until('the card to change', () => api.queueView().folders[0]?.setup?.reason === 'empty');
  }],

  ['once Claude has written lanes the invitation goes away', async (api) => {
    await fs.mkdir(fileUri('.planmaster/lanes').fsPath, { recursive: true });
    await fs.writeFile(fileUri('.planmaster/lanes/A.md').fsPath, '---\nformat: 1\nlane: A\ntitle: First lane written by Claude\n---\n\n- [~] A-1 Start the work since:2026-11-02T10:00\n');
    await until('the assessment to clear', () => api.setupReasons()[0].reason === null);
    await until('the view to show the lane', () => api.queueView().folders[0]?.lanes.length === 1 && api.queueView().folders[0].setup === undefined);
    api.testing.useUserInterface(undefined);
  }],
];

exports.run = async function run() {
  const api = await vscode.extensions.getExtension('planmaster.planmaster').activate();
  let failed = 0;
  for (const [name, test] of tests) {
    try {
      await test(api);
      report(`  ok    [fresh project] ${name}`);
    } catch (error) {
      failed++;
      report(`  FAIL  [fresh project] ${name}\n        ${error.message}`);
    }
  }
  if (failed > 0) throw new Error(`${failed} fresh-project test(s) failed`);
};
