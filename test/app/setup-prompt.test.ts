import { describe, expect, it } from 'vitest';
import { assessSetup } from '../../src/app/setup.js';
import { buildSetupPrompt } from '../../src/app/setup-prompt.js';
import { laneFile, run } from '../helpers.js';
import { TEMPLATES } from '../support/templates.js';

const BLOCK = '<!-- planmaster:begin v1 -->\nx\n<!-- planmaster:end -->\n';
const prompt = (analysis = run([]), overrides = {}): string => {
  const assessment = assessSetup({ hasWorkspaceDir: true, analysis, claudeMd: BLOCK, ...overrides });
  return buildSetupPrompt(TEMPLATES.setup, assessment, analysis);
};

describe('buildSetupPrompt', () => {
  it('leaves no placeholder unfilled', () => {
    expect(prompt()).not.toMatch(/\{\{[A-Z_]+\}\}/);
  });

  it('describes the situation in the same plain words the user was shown', () => {
    expect(prompt()).toContain('Current situation: Your queue is empty.');
    expect(prompt(undefined, { hasWorkspaceDir: false, analysis: undefined })).toContain('PlanMaster is not set up in this project yet.');
  });

  it('names exactly what cannot be read, so that Claude can repair it', () => {
    const broken = run([{ path: '.planmaster/lanes/B.md', kind: 'lane', text: 'no front matter\n- [?] B-1 x\n' }]);
    const text = prompt(broken);
    expect(text).toContain('Some queue files cannot be read.');
    expect(text).toMatch(/- \.planmaster\/lanes\/B\.md:1 /);
  });

  it('lists the lanes that exist, the people and the configured age', () => {
    const analysis = run([laneFile('A', '- [ ] A-1 x'), laneFile('B', '- [ ] B-1 y')]);
    const text = prompt(analysis);
    expect(text).toContain('A: Test lane title\nB: Test lane title');
    expect(text).toContain('Valid people for wait: alice, bob');
    expect(text).toContain('stay visible 3 days');
  });

  it('works when the project has no analysis yet', () => {
    const text = buildSetupPrompt(TEMPLATES.setup, assessSetup({ hasWorkspaceDir: false, analysis: undefined, claudeMd: undefined }), undefined);
    expect(text).toContain('(no lanes yet)');
    expect(text).toContain('(none configured)');
    expect(text).toContain('stay visible 3 days');
  });

  it('does not expand placeholders that appear in a lane title', () => {
    const text = prompt(run([{ ...laneFile('A', '- [ ] A-1 x'), text: '---\nformat: 1\nlane: A\ntitle: Uses {{PEOPLE}} here\n---\n- [ ] A-1 x\n' }]));
    expect(text).toContain('A: Uses {{PEOPLE}} here');
  });

  it('works in four phases and never writes before the third', () => {
    const text = prompt();
    for (const phase of ['PHASE 1', 'PHASE 2', 'PHASE 3', 'PHASE 4']) expect(text).toContain(phase);
    expect(text).toContain('Never write a file before phase 3');
    expect(text.match(/Wait\./g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('asks Claude to find the old to-do lists, merge them and keep the original identifiers', () => {
    const text = prompt();
    expect(text).toMatch(/Find the documents that hold work to do/);
    expect(text).toMatch(/Merge them/);
    expect(text).toMatch(/keep the original identifiers in ref:/);
  });

  it('keeps Claude away from the files PlanMaster manages and from the originals', () => {
    const text = prompt();
    expect(text).toContain('Do not edit CLAUDE.md');
    expect(text).toContain('.planmaster/hooks/');
    expect(text).toContain('Do not delete or change the original to-do documents');
  });

  it('ends with a check that Claude can run from the project', () => {
    expect(prompt()).toContain('node .planmaster/hooks/planmaster-hook.cjs check');
  });
});
