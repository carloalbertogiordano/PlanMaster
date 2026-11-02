import type { QueueViewModel } from '../app/index.js';
import { parseHostMessage, type WebviewMessage } from '../app/messages.js';
import { render, restoreViewState, type Handlers, type ViewState } from './render.js';

interface VsCodeApi {
  postMessage(message: WebviewMessage): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const api = acquireVsCodeApi();
const root = document.getElementById('root');
if (!root) throw new Error('The page has no #root element');

let state: ViewState = restoreViewState(api.getState());
let folders: QueueViewModel[] = [];

function draw(): void {
  if (!root) return;
  render(root, folders, state, handlers);
  api.postMessage({ type: 'drawn', lanes: folders.reduce((sum, folder) => sum + folder.lanes.length, 0) });
}

function change(next: ViewState): void {
  state = next;
  api.setState(state);
  draw();
}

const handlers: Handlers = {
  reveal: (folder, path, line) => { api.postMessage({ type: 'reveal', folder, path, line }); },
  markSeen: (folder) => { api.postMessage({ type: 'markSeen', folder }); },
  setup: (folder) => { api.postMessage({ type: 'setup', folder }); },
  selectTab: (tab) => { change({ ...state, tab }); },
  toggleLane: (key) => {
    const open = state.expanded.includes(key);
    change({ ...state, expanded: open ? state.expanded.filter((k) => k !== key) : [...state.expanded, key] });
  },
};

window.addEventListener('message', (event: MessageEvent<unknown>) => {
  // Only the editor, which hosts this page, may send state; anything from another origin is ignored.
  if (event.origin !== window.origin) return;
  const message = parseHostMessage(event.data);
  if (message === null) return;
  folders = message.folders;
  draw();
});

api.postMessage({ type: 'ready' });
