import { describe, expect, it } from 'vitest';
import { summaryLine } from '../../src/cli/report.js';
import { laneFile, run } from '../helpers.js';

describe('summaryLine', () => {
  it('counts errors, warnings, lanes and items', () => {
    const analysis = run([laneFile('A', '- [!] A-1 x\n- [ ] A-2 y'), laneFile('B', 'stray\n- [ ] B-1 z')]);
    expect(summaryLine(analysis)).toBe('2 errors, 1 warning in 2 lanes, 3 items');
  });

  it('uses the singular', () => {
    expect(summaryLine(run([laneFile('A', '- [ ] A-1 x')]))).toBe('0 errors, 0 warnings in 1 lane, 1 item');
  });
});
