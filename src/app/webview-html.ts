export interface WebviewHtmlInput {
  /** The editor's source token for resources the view may load. */
  cspSource: string;
  scriptUri: string;
  styleUri: string;
  /** Random per page load; the only script allowed to run carries it. */
  nonce: string;
}

const NONCE = /^[A-Za-z0-9+/=_-]+$/;
/** The forms the editor uses for `cspSource`, for example `'self' https://*.vscode-cdn.net`. */
const POLICY_SOURCE_TOKEN = /^(?:'self'|vscode-webview-resource:|vscode-resource:|vscode-webview:\/\/[A-Za-z0-9-]+|https:\/\/(?:\*\.)?[A-Za-z0-9][A-Za-z0-9.+-]*(?::\d+)?)$/;

const ATTRIBUTE_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '"': '&quot;',
  "'": '&#39;',
  '<': '&lt;',
  '>': '&gt;',
};

function escapeAttribute(value: string): string {
  return value.replace(/[&"'<>]/g, (character) => ATTRIBUTE_ESCAPES[character] ?? character);
}

/**
 * The page the queue view runs in. Nothing is allowed except one stylesheet
 * and one script from the extension; no inline script, no remote resource.
 */
export function buildWebviewHtml(input: WebviewHtmlInput): string {
  if (!NONCE.test(input.nonce)) throw new Error('The nonce must be non-empty and made of URL-safe characters');
  const sources = input.cspSource.split(' ');
  if (!sources.every((source) => POLICY_SOURCE_TOKEN.test(source))) {
    throw new Error('The cspSource must list only the editor resource sources, separated by spaces');
  }

  const policy = `default-src 'none'; style-src ${input.cspSource}; script-src 'nonce-${input.nonce}';`;
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${policy}">`,
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<link rel="stylesheet" href="${escapeAttribute(input.styleUri)}">`,
    '<title>PlanMaster queue</title>',
    '</head>',
    '<body>',
    '<div id="root"></div>',
    `<script nonce="${input.nonce}" src="${escapeAttribute(input.scriptUri)}"></script>`,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}
