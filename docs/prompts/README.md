# Prompts

The texts the extension gives to Claude Code. Each file has a short description and the prompt itself in a fenced `text` block. The extension bundles the contents of those blocks as templates; the commands fill in the placeholders and copy the result to the clipboard (or, for the managed block, write it to `CLAUDE.md` after confirmation).

| File | Used by | Purpose |
|---|---|---|
| [claude-md-block.md](claude-md-block.md) | `planmaster.installInstructions` | Permanent rules, installed in the project's `CLAUDE.md`. |
| [format-reference.md](format-reference.md) | `planmaster.initWorkspace` | Template of `.planmaster/FORMAT.md`, the grammar reference Claude reads on demand. |
| [lane-start.md](lane-start.md) | `planmaster.copyLanePrompt` | First message of a chat: which lane it is and where to resume. |
| [setup.md](setup.md) | `planmaster.setup` | The guided setup: find old to-do lists, merge them into lanes, migrate and check, in four phases. |
| [migrate-todo.md](migrate-todo.md) | `planmaster.copyMigratePrompt` | Convert an existing to-do document into lane files. |
| [plan-to-queue.md](plan-to-queue.md) | `planmaster.copyPlanToQueuePrompt` | Turn an approved plan into queue items. |
| [reconcile.md](reconcile.md) | `planmaster.copyReconcilePrompt` | Check a lane against reality and correct it. |
| [archive.md](archive.md) | `planmaster.copyArchivePrompt` | Move old closed subtrees to the archive. |

## Placeholders

| Placeholder | Filled with |
|---|---|
| `{{LANE_ID}}` | Lane ID, for example `B`. |
| `{{LANE_TITLE}}` | Lane title from the front matter. |
| `{{PEOPLE}}` | The `people` list from `config.json`, comma-separated. |
| `{{SITUATION}}` | What is wrong with the project, in the words shown to the user, and what cannot be read. |
| `{{SOURCE_FILE}}` | Workspace-relative path chosen in the file picker. |
| `{{LANES}}` | The existing lanes as `ID: title`, one per line. |
| `{{DONE_WINDOW_DAYS}}` | `doneVisibleDays` from `config.json`. |
| `{{ARCHIVE_AFTER_DAYS}}` | `archiveAfterDays` from `config.json`. |

## Writing rules for prompts

- Imperative, concrete, no pleading and no capital-letter emphasis. State the rule and, when it is not obvious, the reason.
- Never ask Claude to write more than the one line it changes, except in the migration prompt, which creates files.
- Every prompt that edits a lane ends with an instruction to read the edited lines back.
- Any queue line shown in a prompt must parse under [queue-format.md](../spec/queue-format.md). A test extracts and parses them.
