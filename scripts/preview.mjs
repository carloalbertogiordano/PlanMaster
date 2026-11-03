// Draws the real queue view (its stylesheet and script) in headless Chrome at several widths and in several themes,
// so that layout problems can be looked at without opening an editor.
// Needs Google Chrome and ImageMagick (`magick`) on the machine. Usage: node scripts/preview.mjs [out-dir] [--themes midnight,banana-panic] [--widths 220,300,420] [--scenarios queue,fresh]
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? (args[at + 1] ?? fallback).split(',') : fallback.split(',');
};
const out = path.resolve(args.find((a) => !a.startsWith('--') && !args[args.indexOf(a) - 1]?.startsWith('--')) ?? path.join(root, 'dist-preview'));
const themes = option('themes', 'midnight,banana-panic');
const widths = option('widths', '220,300,420').map(Number);

await build({ entryPoints: [path.join(root, 'test/support/preview-models.ts')], outfile: path.join(root, 'dist/preview-models.mjs'), bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' });
const { previewScenarios } = await import(pathToFileURL(path.join(root, 'dist/preview-models.mjs')).href);
const scenarios = previewScenarios();
const wanted = option('scenarios', Object.keys(scenarios).join(','));

// The editor gives a webview its colors as --vscode-* variables, named after the theme's color keys.
function variables(themeFile) {
  const theme = JSON.parse(readFileSync(path.join(root, 'themes', `planmaster-${themeFile}-color-theme.json`), 'utf8'));
  return Object.entries(theme.colors).map(([key, value]) => `--vscode-${key.replace(/\./g, '-')}: ${value};`).join('\n');
}

function page(themeFile, folders) {
  return `<!doctype html><html><head><meta charset="utf-8">
<style>
:root { ${variables(themeFile)}
  --vscode-font-family: "Segoe UI", system-ui, sans-serif; --vscode-font-size: 13px; --vscode-editor-font-family: "JetBrains Mono", monospace; }
html { background: var(--vscode-sideBar-background); }
/* what the editor adds to every webview */
body { background-color: transparent; color: var(--vscode-editor-foreground); font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); margin: 0; padding: 0 20px; }
</style>
<link rel="stylesheet" href="${pathToFileURL(path.join(root, 'media/queue-view.css')).href}">
</head><body><div id="root"></div>
<script>window.acquireVsCodeApi = () => ({ postMessage() {}, getState() { return undefined; }, setState() {} });</script>
<script src="${pathToFileURL(path.join(root, 'dist/webview.js')).href}"></script>
<script>window.postMessage({ type: 'state', folders: ${JSON.stringify(folders)} }, '*');</script>
</body></html>`;
}

mkdirSync(out, { recursive: true });
const written = [];
for (const theme of themes) {
  for (const name of wanted) {
    for (const width of widths) {
      const base = path.join(out, `${name}-${theme}-${width}`);
      writeFileSync(`${base}.html`, page(theme, scenarios[name]));
      // Chrome will not make a window narrower than about 500 pixels, and a webview is as narrow as the side bar,
      // so the view is drawn inside a frame of the wanted width and the picture is cropped to it.
      const frame = `${base}-frame.html`;
      writeFileSync(frame, `<!doctype html><body style="margin:0;background:#888"><iframe src="${pathToFileURL(`${base}.html`).href}" style="border:0;width:${width}px;height:900px;display:block"></iframe></body>`);
      execFileSync('google-chrome', ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', '--window-size=800,900', `--screenshot=${base}.png`, pathToFileURL(frame).href], { stdio: 'ignore' });
      execFileSync('magick', [`${base}.png`, '-crop', `${width}x900+0+0`, '+repage', `${base}.png`]);
      written.push(`${base}.png`);
    }
  }
}
console.log(written.join('\n'));
