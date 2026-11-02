import { loadTemplates, type Templates } from '../../src/app/prompts.js';
import { read } from './docs.js';

/** The real templates, read from docs/prompts, so command tests exercise the text users will get. */
export const TEMPLATES: Templates = loadTemplates({
  managedBlock: read('docs/prompts/claude-md-block.md'),
  formatReference: read('docs/prompts/format-reference.md'),
  laneStart: read('docs/prompts/lane-start.md'),
  migrate: read('docs/prompts/migrate-todo.md'),
  planToQueue: read('docs/prompts/plan-to-queue.md'),
  reconcile: read('docs/prompts/reconcile.md'),
  archive: read('docs/prompts/archive.md'),
});
