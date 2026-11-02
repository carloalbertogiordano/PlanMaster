import { describe, expect, it } from 'vitest';
import { assessSetup, shouldOfferSetup, type SetupAssessment } from '../../src/app/setup.js';
import { archiveFile, laneFile, run } from '../helpers.js';

const BLOCK = '<!-- planmaster:begin v1 -->\nrules\n<!-- planmaster:end -->\n';
const healthy = run([laneFile('A', '- [~] A-1 Work since:2026-11-02T11:40'), laneFile('B', '- [ ] B-1 Next')]);

const assess = (overrides: Partial<Parameters<typeof assessSetup>[0]> = {}): SetupAssessment =>
  assessSetup({ hasWorkspaceDir: true, analysis: healthy, claudeMd: BLOCK, ...overrides });

describe('assessSetup', () => {
  it('finds nothing to do in a healthy project', () => {
    expect(assess()).toMatchObject({ needsSetup: false, reason: null });
  });

  it('says setup is missing when the project has no .planmaster directory', () => {
    const result = assess({ hasWorkspaceDir: false, analysis: undefined });
    expect(result).toMatchObject({ needsSetup: true, reason: 'missing' });
    expect(result.headline).toBe('PlanMaster is not set up in this project yet.');
  });

  it('says the queue is empty when there are no lanes', () => {
    expect(assess({ analysis: run([]) })).toMatchObject({ needsSetup: true, reason: 'empty', headline: 'Your queue is empty.' });
  });

  it('says the queue is empty when the lanes have no items', () => {
    const result = assess({ analysis: run([laneFile('A', '<!-- nothing yet -->')]) });
    expect(result.reason).toBe('empty');
  });

  it('does not count items that are only in an archive', () => {
    expect(assess({ analysis: run([archiveFile('A', '- [x] A-1 Old done:2026-10-01T10:00')]) }).reason).toBe('empty');
  });

  it('says files cannot be read when the front matter or a line is malformed, and names where', () => {
    const broken = run([laneFile('A', '- [ ] A-1 Fine'), { path: '.planmaster/lanes/B.md', kind: 'lane', text: 'no front matter\n- [ ] B-1 x\n  - [ ] B-1a   bad\n- [?] B-2 y\n' }]);
    const result = assess({ analysis: broken });
    expect(result).toMatchObject({ needsSetup: true, reason: 'unparsable', headline: 'Some queue files cannot be read.' });
    expect(result.problems.length).toBeGreaterThan(0);
    expect(result.problems[0]).toMatch(/^\.planmaster\/lanes\/B\.md:\d+ /);
  });

  it('lists at most five problems', () => {
    const lines = Array.from({ length: 12 }, (_, i) => `- [?] A-${i + 1} bad`).join('\n');
    expect(assess({ analysis: run([laneFile('A', lines)]) }).problems).toHaveLength(5);
  });

  it('does not treat mistakes of state as unreadable files, since the hooks and the problems panel handle those', () => {
    const stateErrors = run([laneFile('A', '- [!] A-1 Blocked without a reason')]);
    expect(assess({ analysis: stateErrors })).toMatchObject({ needsSetup: false, reason: null });
  });

  it('treats an invalid config.json as unreadable', () => {
    const result = assess({ analysis: undefined, configError: 'config.json is not valid JSON: boom' });
    expect(result).toMatchObject({ needsSetup: true, reason: 'unparsable' });
    expect(result.problems).toEqual(['config.json is not valid JSON: boom']);
  });

  it('says the instructions are missing when CLAUDE.md has no PlanMaster block', () => {
    for (const claudeMd of [undefined, '# My project\n', '<!-- planmaster:begin v1 -->\nno end\n']) {
      expect(assess({ claudeMd })).toMatchObject({ needsSetup: true, reason: 'instructions', headline: 'Claude does not know about the queue yet.' });
    }
  });

  it('puts the problems in order of importance: missing, unreadable, empty, instructions', () => {
    expect(assess({ hasWorkspaceDir: false, analysis: undefined, claudeMd: undefined }).reason).toBe('missing');
    expect(assess({ analysis: run([]), claudeMd: undefined }).reason).toBe('empty');
  });

  it('always has a plain explanation to show', () => {
    for (const result of [assess({ hasWorkspaceDir: false, analysis: undefined }), assess({ analysis: run([]) }), assess({ claudeMd: undefined })]) {
      expect(result.detail.length).toBeGreaterThan(20);
    }
  });
});

describe('shouldOfferSetup', () => {
  const needs = (reason: SetupAssessment['reason']): SetupAssessment => ({ needsSetup: true, reason, headline: 'h', detail: 'd', problems: [] });
  const quiet = { dismissedForever: false, offeredThisSession: false, looksLikeClaudeProject: false };

  it('offers when a project that already has a PlanMaster directory needs setup', () => {
    for (const reason of ['empty', 'unparsable', 'instructions'] as const) expect(shouldOfferSetup(needs(reason), quiet), reason).toBe(true);
  });

  it('offers for a project without PlanMaster only if it already looks like a Claude project', () => {
    expect(shouldOfferSetup(needs('missing'), quiet)).toBe(false);
    expect(shouldOfferSetup(needs('missing'), { ...quiet, looksLikeClaudeProject: true })).toBe(true);
  });

  it('never offers when nothing is needed', () => {
    expect(shouldOfferSetup({ needsSetup: false, reason: null, headline: '', detail: '', problems: [] }, { ...quiet, looksLikeClaudeProject: true })).toBe(false);
  });

  it('respects "not now" and "do not ask again"', () => {
    expect(shouldOfferSetup(needs('empty'), { ...quiet, offeredThisSession: true })).toBe(false);
    expect(shouldOfferSetup(needs('empty'), { ...quiet, dismissedForever: true })).toBe(false);
  });
});
