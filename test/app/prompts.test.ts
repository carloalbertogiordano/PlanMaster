import { describe, expect, it } from 'vitest';
import { extractTemplate, fillTemplate, lanesText, loadTemplates, peopleText, templatePlaceholders, type PromptSources } from '../../src/app/prompts.js';
import { laneFile, run } from '../helpers.js';
import { markdownFiles, read } from '../support/docs.js';

const fence = (body: string, info = 'text'): string => `\`\`\`${info}\n${body}\n\`\`\``;

describe('extractTemplate', () => {
  it('returns the text of the one text block of a document', () => {
    expect(extractTemplate(`# Title\n\nSome words.\n\n${fence('line one\nline two')}\n\nMore words.\n`)).toBe('line one\nline two');
  });

  it('ignores blocks of other kinds', () => {
    expect(extractTemplate(`${fence('const x = 1;', 'ts')}\n${fence('the prompt')}\n`)).toBe('the prompt');
  });

  it('keeps indentation and blank lines inside the block', () => {
    expect(extractTemplate(fence('a\n\n    indented\nb'))).toBe('a\n\n    indented\nb');
  });

  it('refuses a document with no text block or with several', () => {
    expect(() => extractTemplate('nothing here')).toThrow(/exactly one/);
    expect(() => extractTemplate(`${fence('one')}\n${fence('two')}`)).toThrow(/exactly one/);
  });
});

describe('fillTemplate', () => {
  it('replaces every occurrence of a placeholder', () => {
    expect(fillTemplate('{{A}} and {{A}} and {{B}}', { A: 'x', B: 'y' })).toBe('x and x and y');
  });

  it('ignores values that the template does not use', () => {
    expect(fillTemplate('{{A}}', { A: 'x', Z: 'unused' })).toBe('x');
  });

  it('fails clearly when a value is missing', () => {
    expect(() => fillTemplate('{{A}} {{B}}', { A: 'x' })).toThrow(/B/);
  });

  it('does not expand placeholders that appear inside a value', () => {
    expect(fillTemplate('Title: {{T}}; people: {{P}}', { T: 'uses {{P}} inside', P: 'alice' })).toBe('Title: uses {{P}} inside; people: alice');
  });

  it('keeps dollar signs and backslashes in values literally', () => {
    expect(fillTemplate('{{A}}', { A: "$& $1 $' \\n" })).toBe("$& $1 $' \\n");
  });
});

describe('templatePlaceholders', () => {
  it('lists each placeholder once, in order of appearance', () => {
    expect(templatePlaceholders('{{B}} {{A}} {{B}} {{lower}} {{ A }}')).toEqual(['B', 'A']);
  });
});

describe('values for prompts', () => {
  const analysis = run([laneFile('A', '- [ ] A-1 x'), laneFile('B', '- [ ] B-1 y')]);

  it('lists the lanes as "ID: title", one per line', () => {
    expect(lanesText(analysis)).toBe('A: Test lane title\nB: Test lane title');
  });

  it('says so when there are no lanes', () => {
    expect(lanesText(run([]))).toBe('(no lanes yet)');
  });

  it('lists the configured people, or says there are none', () => {
    expect(peopleText(['alice', 'bob'])).toBe('alice, bob');
    expect(peopleText([])).toBe('(none configured)');
  });
});

describe('the templates in docs/prompts', () => {
  const file = (name: string): string => read(`docs/prompts/${name}.md`);
  const sources: PromptSources = {
    managedBlock: file('claude-md-block'),
    formatReference: file('format-reference'),
    laneStart: file('lane-start'),
    migrate: file('migrate-todo'),
    planToQueue: file('plan-to-queue'),
    reconcile: file('reconcile'),
    archive: file('archive'),
    setup: file('setup'),
  };

  it('every prompt document has exactly one template', () => {
    const documents = markdownFiles('docs/prompts').filter((f) => !f.endsWith('README.md'));
    expect(documents).toHaveLength(8);
    for (const document of documents) expect(() => extractTemplate(read(document)), document).not.toThrow();
  });

  it('loads all of them', () => {
    const templates = loadTemplates(sources);
    expect(templates.managedBlock.startsWith('<!-- planmaster:begin v1 -->')).toBe(true);
    expect(templates.formatReference.startsWith('# Queue format reference')).toBe(true);
    expect(templates.laneStart).toContain('{{LANE_ID}}');
  });

  it('uses exactly the placeholders each command fills', () => {
    const templates = loadTemplates(sources);
    expect(templatePlaceholders(templates.managedBlock)).toEqual([]);
    expect(templatePlaceholders(templates.formatReference)).toEqual([]);
    expect(templatePlaceholders(templates.laneStart)).toEqual(['LANE_ID', 'LANE_TITLE', 'PEOPLE']);
    expect(templatePlaceholders(templates.migrate)).toEqual(['SOURCE_FILE', 'LANES', 'PEOPLE', 'DONE_WINDOW_DAYS']);
    expect(templatePlaceholders(templates.planToQueue)).toEqual([]);
    expect(templatePlaceholders(templates.reconcile)).toEqual(['LANE_ID']);
    expect(templatePlaceholders(templates.archive)).toEqual(['LANE_ID', 'ARCHIVE_AFTER_DAYS']);
    expect(templatePlaceholders(templates.setup)).toEqual(['SITUATION', 'LANES', 'PEOPLE', 'DONE_WINDOW_DAYS']);
  });
});
