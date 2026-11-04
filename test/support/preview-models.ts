import path from 'node:path';
import { assessSetup, buildQueueViewModel, errorViewModel, setupViewModel, withSetup, type QueueViewModel } from '../../src/app/index.js';
import { T } from '../helpers.js';
import { analyzeDemo } from './demo.js';

/** The preview tool runs from the repository root, and a bundled copy of this file cannot find the demo by its own location. */
const demoAnalysis = () => analyzeDemo(path.resolve('docs/examples/demo-workspace'));

const missing = assessSetup({ hasWorkspaceDir: false, analysis: undefined, claudeMd: undefined });

/** Situations worth looking at when the queue view changes: each is what the view is sent in that case. */
export function previewScenarios(): Record<string, QueueViewModel[]> {
  const demo = (folder: string, setup = undefined as ReturnType<typeof assessSetup> | undefined, tagFilter: string[] = []): QueueViewModel =>
    buildQueueViewModel(demoAnalysis(), { folder, lastSeen: T('2026-11-02T09:15'), tagFilter, ...(setup ? { setup } : {}) });
  const unreadable = assessSetup({ hasWorkspaceDir: true, analysis: undefined, claudeMd: undefined, configError: 'config.json is not valid JSON: Unexpected token } in JSON at position 41' });
  return {
    queue: [demo('demo')],
    'needs-instructions': [demo('demo', assessSetup({ hasWorkspaceDir: true, analysis: demoAnalysis(), claudeMd: undefined }))],
    fresh: [setupViewModel('my-project', missing)],
    'config-error': [withSetup(errorViewModel('demo', 'config.json is not valid JSON: Unexpected token } in JSON at position 41'), unreadable)],
    'tag-filter': [demo('demo', undefined, ['OPS'])],
    'two-folders': [demo('api'), setupViewModel('docs', missing)],
  };
}
