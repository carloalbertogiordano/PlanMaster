import { describe, expect, it } from 'vitest';
import { buildWebviewHtml, type WebviewHtmlInput } from '../../src/app/webview-html.js';

const input: WebviewHtmlInput = {
  cspSource: 'https://file+.vscode-resource.vscode-cdn.net',
  scriptUri: 'https://file+.vscode-resource.vscode-cdn.net/ext/dist/webview.js',
  styleUri: 'https://file+.vscode-resource.vscode-cdn.net/ext/media/queue-view.css',
  nonce: 'abcDEF123+/=',
};

describe('buildWebviewHtml', () => {
  const html = buildWebviewHtml(input);

  it('is a complete document with a root element for the view', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<div id="root"></div>');
    expect(html).toContain('<meta charset="utf-8">');
  });

  it('forbids everything except the one script and the one stylesheet it needs', () => {
    const policy = /Content-Security-Policy" content="([^"]*)"/.exec(html)?.[1] ?? '';
    expect(policy).toContain("default-src 'none'");
    expect(policy).toContain(`style-src ${input.cspSource}`);
    expect(policy).toContain(`script-src 'nonce-${input.nonce}'`);
    expect(policy).not.toContain('unsafe-inline');
    expect(policy).not.toContain('unsafe-eval');
    expect(policy).not.toContain('*');
  });

  it('loads exactly one script, with the nonce, and no inline script', () => {
    const scripts = html.match(/<script[^>]*>/g) ?? [];
    expect(scripts).toEqual([`<script nonce="${input.nonce}" src="${input.scriptUri}"></script>`.replace('</script>', '')]);
    expect(html).not.toMatch(/<script[^>]*>[^<]+<\/script>/);
    expect(html).not.toMatch(/\son[a-z]+=/);
  });

  it('loads the stylesheet from the given address', () => {
    expect(html).toContain(`<link rel="stylesheet" href="${input.styleUri}">`);
  });

  it('escapes addresses so they cannot break out of their attribute', () => {
    const hostile = buildWebviewHtml({ ...input, scriptUri: 'x" onload="alert(1)', styleUri: 'y"><script>alert(2)</script>' });
    expect(hostile).not.toContain('onload="alert');
    expect(hostile.match(/<script/g)).toHaveLength(1);
    expect(hostile).toContain('x&quot; onload=&quot;alert(1)');
  });

  it.each(['', 'has space', "quo'te", 'semi;colon', '<tag>', 'a"b'])('refuses the nonce %j', (nonce) => {
    expect(() => buildWebviewHtml({ ...input, nonce })).toThrow(/nonce/);
  });

  it.each([
    "'self' https://*.vscode-cdn.net",
    'https://file+.vscode-resource.vscode-cdn.net',
    'vscode-webview-resource: https://*.vscode-cdn.net',
    'vscode-webview://0a1b2c3d-4e5f',
  ])('accepts the editor source %j', (cspSource) => {
    expect(buildWebviewHtml({ ...input, cspSource })).toContain(`style-src ${cspSource};`);
  });

  it.each([
    "x; script-src 'unsafe-inline'",
    "'self' 'unsafe-inline'",
    "'self', https://a.example",
    '*',
    'https://*',
    'https:',
    'data:',
    'http://example.com',
    'https://example.com/a b',
    '',
  ])('refuses the policy source %j', (cspSource) => {
    expect(() => buildWebviewHtml({ ...input, cspSource })).toThrow(/cspSource/);
  });
});
