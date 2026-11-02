import { installBlock, type InstallResult } from '../claude-md.js';
import type { CommandContext, CommandStatus, UserInterface } from './ports.js';

const CLAUDE_PATH = 'CLAUDE.md';
const FORMAT_PATH = '.planmaster/FORMAT.md';

interface Changes {
  /** The new text of CLAUDE.md, or null when it stays as it is. */
  claudeText: string | null;
  claudeKind: Exclude<InstallResult, { kind: 'refuse' }>['kind'];
  formatText: string | null;
}

/**
 * Puts the managed instruction block into CLAUDE.md and keeps the format
 * reference that the block points to up to date. The change is shown and
 * confirmed first, and nothing outside the markers is touched.
 */
export async function installInstructions({ ui, files, templates }: CommandContext): Promise<CommandStatus> {
  const before = await files.read(CLAUDE_PATH);
  const result = installBlock(before, templates.managedBlock);
  if (result.kind === 'refuse') {
    ui.warn(`CLAUDE.md was not changed. ${result.reason}`);
    return 'refused';
  }

  const wantedFormat = `${templates.formatReference}\n`;
  const changes: Changes = {
    claudeKind: result.kind,
    claudeText: result.kind === 'unchanged' ? null : result.text,
    formatText: (await files.read(FORMAT_PATH)) === wantedFormat ? null : wantedFormat,
  };
  if (changes.claudeText === null && changes.formatText === null) {
    ui.inform('The instructions are already up to date.');
    return 'nothing';
  }

  if (!(await askToInstall(ui, before ?? '', changes))) return 'cancelled';
  if (changes.claudeText !== null) await files.write(CLAUDE_PATH, changes.claudeText);
  if (changes.formatText !== null) await files.write(FORMAT_PATH, changes.formatText);
  ui.inform('PlanMaster instructions installed.');
  return 'done';
}

/** Shows the change to CLAUDE.md, then asks. */
async function askToInstall(ui: UserInterface, before: string, changes: Changes): Promise<boolean> {
  if (changes.claudeText !== null) await ui.previewChange(CLAUDE_PATH, before, changes.claudeText);
  const lines = [
    ...(changes.claudeText === null ? [] : [`${CLAUDE_PATH}: ${describe(changes.claudeKind)}`]),
    ...(changes.formatText === null ? [] : [`${FORMAT_PATH}: written from the current format reference`]),
  ];
  return ui.confirm('Install the PlanMaster instructions?', lines.join('\n'), 'Install');
}

function describe(kind: Changes['claudeKind']): string {
  switch (kind) {
    case 'create':
      return 'created with the PlanMaster block';
    case 'append':
      return 'the PlanMaster block is added at the end';
    case 'update':
      return 'the PlanMaster block is replaced in place';
    case 'unchanged':
      return 'no change';
  }
}
