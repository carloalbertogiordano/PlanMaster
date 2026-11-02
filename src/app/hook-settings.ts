export const HOOK_SCRIPT_PATH = '.planmaster/hooks/planmaster-hook.cjs';
export const SETTINGS_PATH = '.claude/settings.json';

export type MergeResult =
  | { kind: 'create' | 'update' | 'unchanged'; text: string }
  | { kind: 'refuse'; reason: string };

type Fields = Record<string, unknown>;
type Group = Fields & { hooks: unknown[] };

interface HookSpec {
  event: string;
  argument: string;
  matcher?: string;
}

const TIMEOUT_SECONDS = 30;

const HOOKS: readonly HookSpec[] = [
  { event: 'PostToolUse', argument: 'post-edit', matcher: 'Edit|Write|MultiEdit' },
  { event: 'Stop', argument: 'stop' },
  { event: 'SessionStart', argument: 'session-start' },
];

const isFields = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value);
const isGroup = (value: unknown): value is Group => isFields(value) && Array.isArray(value.hooks);
const isOurs = (handler: unknown): boolean => isFields(handler) && typeof handler.command === 'string' && handler.command.includes('planmaster-hook.cjs');

function groupFor({ argument, matcher }: HookSpec): Group {
  const handler = { type: 'command', command: `node "$CLAUDE_PROJECT_DIR/${HOOK_SCRIPT_PATH}" ${argument}`, timeout: TIMEOUT_SECONDS };
  return matcher === undefined ? { hooks: [handler] } : { matcher, hooks: [handler] };
}

/**
 * Adds the PlanMaster hooks to the text of a Claude Code settings file.
 * Everything else in the file is kept; PlanMaster's own earlier handlers are
 * replaced rather than duplicated. Text that cannot be merged safely is refused.
 */
export function mergeHookSettings(existing: string | undefined): MergeResult {
  if (existing === undefined || existing.trim() === '') return { kind: 'create', text: render({ hooks: addAll({}) }, '  ') };

  let root: unknown;
  try {
    root = JSON.parse(existing);
  } catch (error) {
    return { kind: 'refuse', reason: `The settings file is not valid JSON (${(error as Error).message}), so it was not changed.` };
  }
  if (!isFields(root)) return { kind: 'refuse', reason: 'The settings file must contain a JSON object, so it was not changed.' };
  if (root.hooks !== undefined && !isFields(root.hooks)) return { kind: 'refuse', reason: 'The "hooks" entry of the settings file must be an object, so the file was not changed.' };

  const hooks = isFields(root.hooks) ? root.hooks : {};
  const badEvent = HOOKS.find(({ event }) => hooks[event] !== undefined && !(Array.isArray(hooks[event]) && hooks[event].every(isGroup)));
  if (badEvent) return { kind: 'refuse', reason: `The ${badEvent.event} hooks must be a list of groups, each with a list of hooks, so the file was not changed.` };

  const merged = { ...root, hooks: addAll(hooks) };
  if (JSON.stringify(merged) === JSON.stringify(root)) return { kind: 'unchanged', text: existing };
  return { kind: 'update', text: render(merged, indentOf(existing)) };
}

/** `hooks` with PlanMaster's groups removed from every event and added back, one per event. */
function addAll(hooks: Fields): Fields {
  const result: Fields = { ...hooks };
  for (const spec of HOOKS) {
    const groups = Array.isArray(result[spec.event]) ? (result[spec.event] as Group[]) : [];
    result[spec.event] = [...withoutOurs(groups), groupFor(spec)];
  }
  return result;
}

function withoutOurs(groups: Group[]): Group[] {
  return groups.flatMap((group) => {
    const kept = group.hooks.filter((handler) => !isOurs(handler));
    if (kept.length === group.hooks.length) return [group];
    return kept.length === 0 ? [] : [{ ...group, hooks: kept }];
  });
}

function indentOf(text: string): string {
  return /^(\t+| +)\S/m.exec(text)?.[1] ?? '  ';
}

function render(value: unknown, indent: string): string {
  return `${JSON.stringify(value, null, indent)}\n`;
}
