import archive from '../../docs/prompts/archive.md';
import managedBlock from '../../docs/prompts/claude-md-block.md';
import formatReference from '../../docs/prompts/format-reference.md';
import laneStart from '../../docs/prompts/lane-start.md';
import migrate from '../../docs/prompts/migrate-todo.md';
import planToQueue from '../../docs/prompts/plan-to-queue.md';
import reconcile from '../../docs/prompts/reconcile.md';
import { loadTemplates } from '../app/index.js';

/** The prompt texts, taken from docs/prompts at build time so the documents stay the single source. */
export const TEMPLATES = loadTemplates({ managedBlock, formatReference, laneStart, migrate, planToQueue, reconcile, archive });
