# Instructing Claude

Status: draft. Defines how the extension teaches Claude Code to keep the queue accurate, and how it detects when that fails. The format is in [queue-format.md](queue-format.md); the extension in [extension.md](extension.md); the prompt texts in [../prompts/](../prompts/).

## 1. Problem

The queue is only useful if it is true, and the only writer is Claude. An instruction is not an obligation: Claude can forget to mark an item in progress, close one without recording it, guess a time, or rewrite a whole file to change a character. The design therefore has two halves: **make the correct behavior cheap to request**, and **make deviations visible quickly**.

## 2. Layers

| Layer | Mechanism | Strength | Cost |
|---|---|---|---|
| 1 | Managed block in the project's `CLAUDE.md` | Always loaded, applies to every session in the project | Tokens in every session, so it must stay short |
| 2 | `FORMAT.md` in `.planmaster/` | Full grammar available on demand | Read only when needed |
| 3 | Lane start prompt | Tells a new chat which lane it is and where to resume | Pasted by the user once per chat |
| 4 | Task prompts (migrate, plan to queue, reconcile, archive) | Precise instructions for occasional jobs | Pasted by the user when needed |
| 5 | Lint feedback in the editor | Makes violations visible within seconds | None for Claude, attention for the user |
| 6 | Hooks running the lint CLI (milestone 0.5) | Feeds errors back to Claude automatically | Configuration in the project |

Layers 1 to 5 ship first. Layer 6 is added only if layers 1 to 5 prove insufficient in practice.

## 3. The managed block

The extension owns a block delimited by two comment markers in the project's `CLAUDE.md`:

```
<!-- planmaster:begin v1 -->
...
<!-- planmaster:end -->
```

The block's text is in [../prompts/claude-md-block.md](../prompts/claude-md-block.md).

Install behavior (`PlanMaster: Install Instructions in CLAUDE.md`):

1. If `CLAUDE.md` does not exist, propose creating it with the block as its content.
2. If the markers exist, replace everything between them (inclusive) with the block of the extension's version. If the text is identical, report "already up to date" and write nothing.
3. If the markers do not exist, propose appending the block at the end, separated by a blank line.
4. In every case show a diff and ask for confirmation before writing. The same confirmation covers `.planmaster/FORMAT.md`, which is written from the current format reference because the block points to it.
5. Never touch any text outside the markers. If only one marker is present, refuse and explain, since the block's extent is unknown.

The marker carries a version (`v1`). When a newer extension carries a newer block, the extension shows a notification offering the update. It never updates silently.

The block must stay under roughly 350 words, because it is loaded into every session.

## 4. Telling a chat which lane it is

`CLAUDE.md` is shared by every chat in the project, so it cannot say "you are lane B". The identity of a chat comes from the **lane start prompt**, pasted as the first message of the chat. It states the lane ID and title, the file to write, where to resume, and the rules that matter most.

An optional later improvement (milestone 0.5) is a session-start hook that injects the lane from an environment variable, so the first message is no longer needed. It does not change the format.

## 5. Writing discipline

These rules are in the managed block and repeated in the start prompt, in the order of how often they are broken:

1. **Edit one line at a time**, with a targeted replacement anchored on the item ID. Never rewrite, reformat or reorder the file. This keeps diffs readable, keeps concurrent human edits safe and makes mistakes small.
2. **Never guess a time.** Run `date +%Y-%m-%dT%H:%M`. The linter flags timestamps later than the file's modification time (PM015) precisely because guessed times tend to be wrong in that direction.
3. **Update the queue when the state changes, not later.** Starting an item sets `[~]` before the work begins. Finishing it sets `[x]` before saying "done".
4. **Read back the edited line.** A one-line check catches a wrong marker or a missing token.
5. **One writer per file.** A lane writes only its own file. Cross-lane needs are expressed as a blocked item in the requesting lane with `wait:` pointing to the other lane's item ID, or to the person who decides, and are passed on by the user.
6. **Granularity.** An item is hours or days of work. The queue is not a step log. Micro-steps stay in the session's own todo list.
7. **Long text does not go in the queue.** Anything beyond a one-line title goes in a document linked with `ref:`.

## 6. Relation to the session's own todo list

Claude Code sessions keep an internal todo list for short steps. The two serve different purposes and are kept separate on purpose:

| | Session todo list | Queue |
|---|---|---|
| Lifetime | One session | Days or weeks, across sessions |
| Granularity | Steps of minutes | Work of hours or days |
| Visible in | The terminal of that session | The extension, for all lanes |
| Survives a restart | No | Yes, it is a file in the repository |

Version 1 of the extension does not read the session todo list. That would add a second source of truth, a dependency on an internal transcript format, and a need to reconcile the two. If a live view of micro-steps proves valuable, it will be added as a separate, clearly labeled overlay, not merged into the queue.

## 7. Verification

The extension cannot prevent a violation, so it detects them:

| Failure | How it shows |
|---|---|
| Claude forgets to update an item | Stale warning (PM012) once the item and the file are both idle past the threshold; the "updated N min ago" text in the status bar grows. |
| Wrong or incomplete state edit | Errors PM004, PM005, PM006, PM010 on the exact line. |
| Two items "in progress" | PM008, PM009. |
| Guessed or future timestamp | PM015. |
| Dependency on something already finished | PM018. |
| ID collisions between chats | PM002, PM003. |
| Stray prose or reformatted file | PM016, PM001. |
| A whole-file rewrite | Not detectable from the file; visible in `git diff` of `.planmaster/`. Because the directory is committed, history is the audit trail. |

### Hooks (milestone 0.5)

If the passive checks are not enough, the lint CLI can run in a hook:

- A hook that runs after tool calls which modify a file under `.planmaster/lanes/` runs the linter on that file and, on errors, returns the findings to Claude so it corrects them in the same turn.
- A hook that runs when Claude finishes a turn checks the lane's file and reports a stale `[~]` item.

Hooks are opt-in and configured by the user. They are specified here only so that the CLI's interface is designed for them from the start:

- Findings go to stderr, one per line, in the stable form `file:line severity code message`, for example `.planmaster/lanes/B.md:12 error PM004 B-14 is blocked but has no wait: naming a person or an item ID`. Paths are relative to the workspace root.
- A one-line summary goes to stdout.
- Exit code `0` when there are no errors (warnings allowed), `1` when there is at least one error, `2` for usage or configuration errors.
- `--json` prints the findings as a JSON array on stdout instead.

## 8. Migration of an existing document

Existing work lives in documents that were not written for this format. The migration prompt turns them into lane files without touching the source:

- Two phases: first a dry run that reports what would be created and which items are ambiguous, then writing after the user confirms.
- Original IDs are preserved in `ref:`, new queue IDs are assigned.
- Prose, tables of facts and lessons are not migrated. They stay in the source document, which keeps its role as a notebook, and may link queue IDs.
- Closed items are migrated only when recent, according to a window given in the prompt.

See [../prompts/migrate-todo.md](../prompts/migrate-todo.md).

## 9. Risks and mitigations

| Risk | Mitigation |
|---|---|
| The managed block is ignored when the context is large. | Keep it short; repeat the critical rules in the start prompt; detect violations through the linter. |
| Chats write to the wrong lane. | The start prompt names the file; PM003 flags IDs with another lane's prefix. |
| Claude edits the block between the markers. | The extension overwrites it on the next install and shows a diff first. |
| The user stops pasting start prompts. | The hook-based identity injection (milestone 0.5) removes the step. |
| Format drift as the prompts evolve. | The prompts and the format are versioned together; a test extracts every queue line shown in the docs and parses it. |
