import { describe, expect, it } from 'vitest';
import { parsePeople, planInit, validateLaneId, validateLaneTitle, validatePeople } from '../../src/app/scaffold.js';
import { parseConfig, parseLaneFile } from '../../src/core/index.js';

const FORMAT_TEXT = '# Queue format reference (version 1)\n\nBody.';

describe('planInit', () => {
  it('plans the config, the format reference and the first lane in an empty workspace', () => {
    const plan = planInit(new Set(), { laneId: 'B', laneTitle: 'Automated checks', people: ['alice', 'bob'] }, FORMAT_TEXT);
    expect(plan.map((f) => f.path)).toEqual(['.planmaster/config.json', '.planmaster/FORMAT.md', '.planmaster/lanes/B.md']);
  });

  it('writes a config that the tools accept, with the given people', () => {
    const [config] = planInit(new Set(), { people: ['alice'] }, FORMAT_TEXT);
    expect(parseConfig(config?.content)).toMatchObject({ people: ['alice'], staleAfterMinutes: 120, doneVisibleDays: 3, archiveAfterDays: 14, format: 1 });
    expect(config?.content.endsWith('\n')).toBe(true);
  });

  it('writes the format reference as it is, with a final newline', () => {
    const plan = planInit(new Set(), {}, FORMAT_TEXT);
    expect(plan.find((f) => f.path === '.planmaster/FORMAT.md')?.content).toBe(`${FORMAT_TEXT}\n`);
  });

  it('writes a lane file that parses without findings', () => {
    const plan = planInit(new Set(), { laneId: 'API2', laneTitle: 'Public API, rollout and review' }, FORMAT_TEXT);
    const lane = plan.find((f) => f.path === '.planmaster/lanes/API2.md');
    expect(lane?.content).toBe('---\nformat: 1\nlane: API2\ntitle: Public API, rollout and review\n---\n\n');
    const parsed = parseLaneFile({ path: '.planmaster/lanes/API2.md', kind: 'lane', text: lane?.content ?? '' });
    expect(parsed.findings).toEqual([]);
  });

  it('creates no lane when none is asked for', () => {
    expect(planInit(new Set(), {}, FORMAT_TEXT).map((f) => f.path)).toEqual(['.planmaster/config.json', '.planmaster/FORMAT.md']);
  });

  it('never plans a file that already exists', () => {
    const existing = new Set(['.planmaster/config.json', '.planmaster/lanes/B.md']);
    const plan = planInit(existing, { laneId: 'B', laneTitle: 'Automated checks', people: ['alice'] }, FORMAT_TEXT);
    expect(plan.map((f) => f.path)).toEqual(['.planmaster/FORMAT.md']);
  });

  it('plans nothing when everything is in place', () => {
    const existing = new Set(['.planmaster/config.json', '.planmaster/FORMAT.md']);
    expect(planInit(existing, {}, FORMAT_TEXT)).toEqual([]);
  });

  it('refuses a person key that contains a space, since the config would then be unreadable', () => {
    expect(() => planInit(new Set(), { people: ['alice smith'] }, FORMAT_TEXT)).toThrow(/alice smith/);
  });

  it('refuses a lane id without a title, or an invalid one', () => {
    expect(() => planInit(new Set(), { laneId: 'B' }, FORMAT_TEXT)).toThrow(/title/);
    expect(() => planInit(new Set(), { laneId: 'b', laneTitle: 'Automated checks' }, FORMAT_TEXT)).toThrow(/lane ID/);
  });
});

describe('validateLaneId', () => {
  it.each(['A', 'B', 'API', 'A1', 'X9Z2'])('accepts %j', (value) => {
    expect(validateLaneId(value)).toBeUndefined();
  });

  it.each(['', 'a', '1A', 'ABCDE', 'A-1', 'A B', ' A', 'Å'])('rejects %j with an explanation', (value) => {
    expect(validateLaneId(value)).toMatch(/uppercase/);
  });

  it('rejects an id that is already a lane when told which exist', () => {
    expect(validateLaneId('A', new Set(['A']))).toMatch(/already exists/);
    expect(validateLaneId('B', new Set(['A']))).toBeUndefined();
  });
});

describe('validateLaneTitle', () => {
  it('accepts a title of 3 to 80 characters', () => {
    expect(validateLaneTitle('abc')).toBeUndefined();
    expect(validateLaneTitle('x'.repeat(80))).toBeUndefined();
  });

  it.each(['', 'ab', '  ab  ', 'x'.repeat(81)])('rejects %j', (value) => {
    expect(validateLaneTitle(value)).toMatch(/3 to 80/);
  });
});

describe('people', () => {
  it('parses a comma-separated list, trimming and dropping blanks and duplicates', () => {
    expect(parsePeople(' alice, bob ,, alice,carol ')).toEqual(['alice', 'bob', 'carol']);
    expect(parsePeople('')).toEqual([]);
  });

  it('accepts an empty list and plain names', () => {
    expect(validatePeople('')).toBeUndefined();
    expect(validatePeople('alice, bob')).toBeUndefined();
  });

  it('rejects names with spaces inside, naming the offender', () => {
    expect(validatePeople('alice, bob smith')).toMatch(/bob smith/);
  });
});
