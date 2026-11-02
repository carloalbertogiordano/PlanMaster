import { HOOK_SCRIPT_PATH, SETTINGS_PATH, mergeHookSettings } from '../hook-settings.js';
import type { CommandContext, CommandStatus, WorkspaceFiles } from './ports.js';

/** The new text of each file, or null when the file stays as it is. */
interface Plan {
  script: string | null;
  settings: string | null;
}

/**
 * Installs the Claude Code hooks: copies the hook script into the project and
 * adds the hooks to the project's settings. The settings change is shown and
 * confirmed first, because the script runs on the machine of everyone who
 * uses the project.
 */
export async function installHooks({ ui, files, hookScript }: CommandContext): Promise<CommandStatus> {
  const before = await files.read(SETTINGS_PATH);
  const merge = mergeHookSettings(before);
  if (merge.kind === 'refuse') {
    ui.warn(`${SETTINGS_PATH} was not changed. ${merge.reason}`);
    return 'refused';
  }

  const plan: Plan = {
    script: (await files.read(HOOK_SCRIPT_PATH)) === hookScript ? null : hookScript,
    settings: merge.kind === 'unchanged' ? null : merge.text,
  };
  if (plan.script === null && plan.settings === null) {
    ui.inform('The Claude Code hooks are already installed and up to date.');
    return 'nothing';
  }

  if (plan.settings !== null) await ui.previewChange(SETTINGS_PATH, before ?? '', plan.settings);
  if (!(await ui.confirm('Install the Claude Code hooks?', describe(plan), 'Install hooks'))) return 'cancelled';

  await apply(files, plan);
  ui.inform('Hooks installed. Start each chat with PLANMASTER_LANE set to its lane, for example PLANMASTER_LANE=B claude, so that it knows which queue file is its own.');
  return 'done';
}

function describe(plan: Plan): string {
  return [
    ...(plan.script === null ? [] : [`Write ${HOOK_SCRIPT_PATH} (the script the hooks run)`]),
    ...(plan.settings === null ? [] : [`Update ${SETTINGS_PATH} (add the PostToolUse, Stop and SessionStart hooks)`]),
    'Claude Code will run this script on your machine, and on the machine of everyone who uses this project. Review both files first.',
  ].join('\n');
}

async function apply(files: WorkspaceFiles, plan: Plan): Promise<void> {
  if (plan.script !== null) await files.write(HOOK_SCRIPT_PATH, plan.script);
  if (plan.settings !== null) await files.write(SETTINGS_PATH, plan.settings);
}
