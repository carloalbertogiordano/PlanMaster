// Runs inside VS Code: opens the queue view, narrows the side bar step by step and takes a screenshot of each size,
// in each of the themes asked for. Not a test; a way to look at what the editor really draws.
// Needs ImageMagick's `import` and an X display (xvfb).
const cp = require('node:child_process');
const path = require('node:path');
const vscode = require('vscode');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(description, check, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${description}`);
    await sleep(100);
  }
}

const shot = async (file) => {
  await vscode.commands.executeCommand('notifications.clearAll');
  await sleep(300);
  cp.execFileSync('import', ['-window', 'root', file]);
};

exports.run = async function run() {
  const out = process.env.PLANMASTER_LOOK_DIR;
  const prefix = process.env.PLANMASTER_LOOK_PREFIX;
  const themes = JSON.parse(process.env.PLANMASTER_LOOK_THEMES);
  const sizes = JSON.parse(process.env.PLANMASTER_LOOK_SIZES);
  const api = await vscode.extensions.getExtension('planmaster.planmaster').activate();

  const openFile = process.env.PLANMASTER_LOOK_OPEN;
  if (openFile) {
    const folder = vscode.workspace.workspaceFolders[0].uri;
    await vscode.window.showTextDocument(vscode.Uri.joinPath(folder, openFile), { preview: false });
  }
  await vscode.commands.executeCommand('planmaster.queue.focus');
  await until('the view to draw', () => api.queueView().drawnLanes !== undefined);

  const tags = (process.env.PLANMASTER_LOOK_TAGS ?? '').split(',').filter(Boolean);
  if (tags.length > 0) {
    await api.handleQueueMessage({ type: 'filter', folder: api.states()[0].folder, tags });
    await until('the view to be filtered', () => api.queueView().folders[0]?.filter.length === tags.length);
  }

  for (const theme of themes) {
    await vscode.workspace.getConfiguration('workbench').update('colorTheme', theme.label, vscode.ConfigurationTarget.Global);
    await sleep(2000);
    let narrowed = 0;
    for (const target of sizes) {
      while (narrowed < target) {
        await vscode.commands.executeCommand('planmaster.queue.focus');
        await vscode.commands.executeCommand('workbench.action.increaseViewWidth');
        narrowed += 1;
      }
      await sleep(1200);
      await shot(path.join(out, `${prefix}-${theme.file}-narrowed-${target}.png`));
    }
    for (let i = 0; i < narrowed; i++) await vscode.commands.executeCommand('workbench.action.decreaseViewWidth');
  }
};
