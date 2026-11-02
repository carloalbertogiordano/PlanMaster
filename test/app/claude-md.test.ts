import { describe, expect, it } from 'vitest';
import { installBlock } from '../../src/app/claude-md.js';

const block = ['<!-- planmaster:begin v1 -->', '## Work queue', 'Rules go here.', '<!-- planmaster:end -->'].join('\n');
const oldBlock = ['<!-- planmaster:begin v0 -->', 'Old rules.', '<!-- planmaster:end -->'].join('\n');

describe('installBlock', () => {
  it('creates the file with the block when there is none', () => {
    expect(installBlock(undefined, block)).toEqual({ kind: 'create', text: `${block}\n` });
  });

  it('appends after a blank line when the file has other content', () => {
    expect(installBlock('# My project\n', block)).toEqual({ kind: 'append', text: `# My project\n\n${block}\n` });
  });

  it('adds the missing final newline before appending', () => {
    expect(installBlock('# My project', block)).toEqual({ kind: 'append', text: `# My project\n\n${block}\n` });
  });

  it('does not add extra blank lines when the file already ends with one', () => {
    expect(installBlock('# My project\n\n', block)).toEqual({ kind: 'append', text: `# My project\n\n${block}\n` });
  });

  it('treats an empty or blank file like a new one', () => {
    expect(installBlock('', block)).toEqual({ kind: 'append', text: `${block}\n` });
    expect(installBlock('\n\n', block)).toEqual({ kind: 'append', text: `${block}\n` });
  });

  it('replaces an older block and leaves everything around it untouched', () => {
    const existing = `# Title\n\nBefore.\n\n${oldBlock}\n\nAfter, with  odd   spacing.\n`;
    expect(installBlock(existing, block)).toEqual({ kind: 'update', text: `# Title\n\nBefore.\n\n${block}\n\nAfter, with  odd   spacing.\n` });
  });

  it('reports no change when the block is already up to date', () => {
    const existing = `Intro\n\n${block}\n`;
    expect(installBlock(existing, block)).toEqual({ kind: 'unchanged', text: existing });
  });

  it('keeps the line endings of the file', () => {
    const result = installBlock('# Title\r\nText\r\n', block);
    expect(result.kind).toBe('append');
    expect(result.kind === 'append' && result.text.replace(/\r\n/g, '')).not.toContain('\n');
    expect(result.kind === 'append' && result.text.startsWith('# Title\r\nText\r\n\r\n<!-- planmaster:begin v1 -->\r\n')).toBe(true);
  });

  it('updates a CRLF file without introducing bare line feeds', () => {
    const existing = `A\r\n${oldBlock.replace(/\n/g, '\r\n')}\r\nB\r\n`;
    const result = installBlock(existing, block);
    expect(result.kind).toBe('update');
    expect(result.kind === 'update' && /(?<!\r)\n/.test(result.text)).toBe(false);
  });

  it.each([
    ['a begin marker without an end marker', '# T\n<!-- planmaster:begin v1 -->\nstuff\n', /end marker/i],
    ['an end marker without a begin marker', '# T\n<!-- planmaster:end -->\n', /begin marker/i],
    ['an end marker before the begin marker', '<!-- planmaster:end -->\nx\n<!-- planmaster:begin v1 -->\n', /order/i],
    ['two begin markers', `${block}\n${block}\n`, /more than one/i],
  ])('refuses %s, because the extent of the block is unknown', (_name, existing, reason) => {
    const result = installBlock(existing, block);
    expect(result.kind).toBe('refuse');
    expect(result.kind === 'refuse' && result.reason).toMatch(reason);
  });

  it('rejects a block that has no markers, since that is a programming error', () => {
    expect(() => installBlock('x', 'no markers here')).toThrow(/markers/);
  });
});
