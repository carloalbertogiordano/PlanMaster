import { describe, expect, it } from 'vitest';
import { escapeMarkdown, hoverMarkdown, statusBarModel } from '../src/core/presentation.js';
import { NOW, laneFile, run } from './helpers.js';
import { analyzeDemo } from './support/demo.js';

describe('statusBarModel', () => {
  it('describes a workspace without lanes', () => {
    expect(statusBarModel(run([]))).toEqual({ text: 'PlanMaster: no lanes', level: 'normal', tooltip: [] });
  });

  it('summarizes the demo workspace', () => {
    const model = statusBarModel(analyzeDemo());
    expect(model.text).toBe('▶ 5 lanes active · 21 open · 5 blocked · updated 4 min ago');
    expect(model.level).toBe('error');
  });

  it('lists each lane with its current step, or idle, and the problem count', () => {
    const { tooltip } = statusBarModel(analyzeDemo());
    expect(tooltip[0]).toBe('A · Requirements matrix, counts and citations — A-07b Re-read 8.2.2 and 8.3.1 after the recount');
    expect(tooltip).toHaveLength(6);
    expect(tooltip[5]).toBe('3 problems');
  });

  it('uses the singular for one lane and omits the age when no file time is known', () => {
    const model = statusBarModel(run([laneFile('A', '- [~] A-1 Item since:2026-11-02T11:00')]));
    expect(model.text).toBe('▶ 1 lane active · 1 open · 0 blocked');
    expect(model.level).toBe('normal');
  });

  it('says a lane is idle when nothing is in progress', () => {
    const model = statusBarModel(run([laneFile('A', '- [ ] A-1 Item')]));
    expect(model.text).toBe('▶ 0 lanes active · 1 open · 0 blocked');
    expect(model.tooltip).toEqual(['A · Test lane title — idle']);
  });

  it('is a warning when a lane is stale and no finding is an error', () => {
    const model = statusBarModel(run([laneFile('A', '- [~] A-1 Item since:2026-11-02T08:05', '2026-11-02T08:07')]));
    expect(model.level).toBe('warning');
  });

  it('is an error when any finding is an error, even if another is a warning', () => {
    const files = [laneFile('A', '- [~] A-1 Item since:2026-11-02T08:05', '2026-11-02T08:07'), laneFile('B', '- [!] B-1 Item')];
    expect(statusBarModel(run(files)).level).toBe('error');
  });

  it('uses the singular for a single problem', () => {
    expect(statusBarModel(run([laneFile('A', '- [ ] B-1 Wrong prefix')])).tooltip.at(-1)).toBe('1 problem');
  });
});

describe('hoverMarkdown', () => {
  const demo = analyzeDemo();

  it('describes an item in progress with its lane and how long it has run', () => {
    expect(hoverMarkdown(demo, 'D-04')).toBe(
      '**D-04** · in progress for 1 h 28 min\n\nNeutral translation text and release request\n\n_Lane D · Implementation of approved plans_',
    );
  });

  it('describes blocked, done, dropped and to-do items', () => {
    expect(hoverMarkdown(demo, 'D-07')).toContain('blocked, waiting on bob, for 58 min');
    expect(hoverMarkdown(demo, 'D-03')).toContain('done 33 min ago');
    expect(hoverMarkdown(demo, 'C-02')).toContain('dropped 2 d ago');
    expect(hoverMarkdown(demo, 'D-05')).toContain('**D-05** · to do');
  });

  it('describes an item that waits on another item', () => {
    expect(hoverMarkdown(demo, 'D-08')).toContain('blocked, after D-04, for 1 h 28 min');
  });

  it('returns null for an unknown ID', () => {
    expect(hoverMarkdown(demo, 'Z-9')).toBeNull();
  });

  it('escapes markdown and HTML coming from the file', () => {
    const hostile = '[click](command:workbench.action.reloadWindow) <img src=x onerror=alert(1)> `code` *bold*';
    const text = hoverMarkdown(run([laneFile('A', `- [ ] A-1 ${hostile}`)]), 'A-1') ?? '';
    expect(text).not.toMatch(/(?<!\\)\[/);
    expect(text).not.toMatch(/(?<!\\)</);
    expect(text).not.toMatch(/(?<!\\)`/);
    expect(text).not.toMatch(/(?<!\\)\*bold/);
  });

  it('escapes a hostile person key in a wait token', () => {
    const files = [laneFile('A', '- [!] A-1 Item wait:**[x](y)** since:2026-11-02T10:20')];
    const text = hoverMarkdown(run(files), 'A-1') ?? '';
    expect(text).toContain('waiting on \\*\\*\\[x\\]\\(y\\)\\*\\*');
  });

  it('measures durations against the time of the analysis', () => {
    const files = [laneFile('A', '- [~] A-1 Item since:2026-11-02T10:20')];
    expect(hoverMarkdown(run(files, NOW), 'A-1')).toContain('for 1 h 28 min');
    expect(hoverMarkdown(run(files, NOW + 60 * 60_000), 'A-1')).toContain('for 2 h 28 min');
  });
});

describe('escapeMarkdown', () => {
  it.each([
    ['plain words', 'plain words'],
    ['a_b', 'a\\_b'],
    ['[link](url)', '\\[link\\]\\(url\\)'],
    ['<b>', '\\<b\\>'],
    ['back\\slash', 'back\\\\slash'],
    ['`tick`', '\\`tick\\`'],
    ['# heading', '\\# heading'],
    ['a & b', 'a \\& b'],
  ])('escapes %j', (input, expected) => {
    expect(escapeMarkdown(input)).toBe(expected);
  });

  it('flattens line breaks so a title cannot start a new block', () => {
    expect(escapeMarkdown('one\ntwo\r\nthree')).toBe('one two three');
  });
});
