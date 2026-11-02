import { describe, expect, it } from 'vitest';
import { finding, formatFinding } from '../src/core/index.js';

describe('formatFinding', () => {
  it('prints file:line, severity, code and message, the form the checker and the hooks share', () => {
    const f = finding('PM004', { file: '.planmaster/lanes/B.md', line: 12 }, 'B-14 is blocked but has no wait:');
    expect(formatFinding(f)).toBe('.planmaster/lanes/B.md:12 error PM004 B-14 is blocked but has no wait:');
  });

  it('prints warnings as warnings', () => {
    expect(formatFinding(finding('PM012', { file: 'a.md', line: 1 }, 'stale'))).toBe('a.md:1 warning PM012 stale');
  });
});
