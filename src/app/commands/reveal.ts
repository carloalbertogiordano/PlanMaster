import { stateLabelOf } from '../rows.js';
import type { CommandContext, CommandStatus } from './ports.js';

/** Lets the user pick any item of any lane by ID or title and opens it. */
export async function revealItem({ ui, analysis }: CommandContext): Promise<CommandStatus> {
  const items = (analysis?.lanes ?? []).flatMap((lane) => lane.items).map((item) => ({
    label: item.id,
    description: `lane ${item.lane} · ${stateLabelOf(item.marker)}`,
    detail: item.title,
    value: { path: item.file, line: item.line },
  }));
  if (items.length === 0) {
    ui.warn('No items in the queue yet.');
    return 'nothing';
  }
  const target = await ui.pick(items, 'Search an item by ID or title');
  if (target === undefined) return 'cancelled';
  await ui.show(target.path, target.line);
  return 'done';
}
