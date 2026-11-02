# PlanMaster

A VS Code extension that shows the work of several long-running Claude Code chats as one visual queue: what each chat is doing now, what is next, what is blocked and on whom, what was closed, and what changed since you last looked.

**Status: milestone 0.5, complete.** The repository holds the specification, the prompts, a demo workspace, a visual mockup, the core library (parser, linter, model, events), a command-line checker, and a working VS Code extension shell: diagnostics, status bar, focus decorations, syntax highlighting, hover and go to definition for `wait:` references, and the queue view in the sidebar (Stack, Blocked and What's new tabs). Commands initialize a workspace, install the instructions into `CLAUDE.md` (with a diff and a confirmation), copy the prompts that tell Claude how to use the queue, and reveal any item. Hooks for Claude Code send queue errors back to the session that caused them and tell a chat which lane it is, and the extension can be packed into a `.vsix`.

## The idea

- Each chat owns a **lane**: a short ID and a precise title.
- Each lane has one plain-text queue file in `.planmaster/lanes/`, written by the chat that owns it.
- The extension **only reads** those files. It validates them, draws them, and tells Claude how to write them.
- The files are committed with the project, so the history of the work is in version control.

## Documents

| Document | Contents |
|---|---|
| [docs/spec/queue-format.md](docs/spec/queue-format.md) | The file format: markers, tokens, hierarchy, IDs, archive, lint rules. Normative. |
| [docs/spec/extension.md](docs/spec/extension.md) | What the extension does: views, editor integration, commands, security, milestones. |
| [docs/spec/claude-integration.md](docs/spec/claude-integration.md) | How Claude is instructed and how deviations are detected. |
| [docs/prompts/](docs/prompts/) | The exact prompts and the block installed in `CLAUDE.md`. |
| [docs/examples/demo-workspace/](docs/examples/demo-workspace/) | A five-lane queue used as fixture and as the mockup's data. |
| [docs/mockup/queue-view.html](docs/mockup/queue-view.html) | Interactive mockup of the queue view. Open it in a browser. |

## A queue file at a glance

```markdown
---
format: 1
lane: B
title: Automated checks, gates and ratchets
---

- [~] B-12 Survey existing checks (gate or ratchet, cost, frozen debt) ref:ROUND-4 since:2026-11-02T10:55
  - [x] B-12a List ratchets with frozen debt done:2026-11-02T11:02
  - [~] B-12b Measure the cost of each check since:2026-11-02T11:05
- [!] B-14 Make the rules fingerprint a ratchet wait:alice since:2026-11-01T17:30
```

`[ ]` todo, `[~]` in progress, `[!]` blocked, `[x]` done, `[-]` dropped.

## Getting started

1. Build and install the extension: `npm install`, `npm run package`, then `code --install-extension dist-vsix/planmaster.vsix`.
2. Open your project and click the PlanMaster icon in the activity bar. If there is nothing to show yet, the view says so in plain words and offers one button, **Set up with Claude**. PlanMaster also mentions it with a small message when it sees a project that has an empty or unreadable queue (and, for a project that already has a `CLAUDE.md` or `.claude/` folder, one that has no queue yet). You can answer "Not now" or "Don't ask again".
3. Answer the few questions. PlanMaster prepares its files, adds a short note to `CLAUDE.md` (you see the change first), and asks whether it should check Claude's work automatically (recommended).
4. PlanMaster copies one message. Open a Claude chat in the project and paste it. Claude finds your old to-do lists, proposes how to organise them into lanes, and asks you before writing anything.
5. Start each chat bound to its lane, for example `PLANMASTER_LANE=B claude`, so that it knows which queue file is its own.

To go through it again at any time, press **Setup** in the PlanMaster view, or run **PlanMaster: Set Up with Claude (Guided)** from the command palette. The other commands (initialize, install the instructions, install the hooks, copy a single prompt) are still there for doing one step by hand.

## Color themes

Seven themes come with the extension (Preferences: Color Theme). They style the editor, the queue view and the status bar, and give each state of a lane file its own color.

| Theme | Kind | What it is |
|---|---|---|
| PlanMaster Midnight | dark | Deep blue and calm. The sensible one. |
| PlanMaster Solar | light | Warm paper with dark teal text. |
| PlanMaster Cyberpunk | dark | Neon pink and cyan on night purple. |
| PlanMaster Goth | dark | Near black, blood red, a candle's worth of light. |
| PlanMaster Claude | dark | Warm charcoal with a terracotta accent. Unofficial. |
| PlanMaster Banana Panic | light | Everything is yellow. You were warned. The text is dark brown, so it is still readable. |
| PlanMaster Radioactive Pickle | dark | Lime on dark green, with more glow than any editor needs. |

Even the silly ones keep to the rules: a test checks the contrast of every pair of colors that matters (editor text, the queue view, the focus line, the status bar in all three states and every syntax rule) against WCAG limits, and that the four queue states stay distinguishable by color. The theme files in `themes/` are generated from the palettes in `src/themes/palettes.ts` with `npm run themes`.

## Command-line checker

```sh
npm install
npm run build
node out/cli/main.js <workspace-or-.planmaster-dir>
```

Findings are printed to stderr as `file:line severity code message`, a summary to stdout. Exit code 0 when there are no errors, 1 when there is at least one, 2 for usage or configuration errors. `--json` prints the findings as JSON. Run `npm run lint:demo` to check the demo workspace at its reference time.

## Roadmap

1. **Done:** core library (`src/core`), disk loader (`src/node`) and command-line checker (`src/cli`), with tests on the demo workspace.
2. **Done:** extension shell (`src/app`, `src/extension`): watcher, Problems panel, status bar, editor decorations, hover, go to definition.
3. **Done:** the queue view: stack, blocked and what's-new tabs, with reveal and mark as seen.
4. **Done:** commands that initialize a workspace, install the instructions and copy the prompts.
5. **Done:** hooks for automatic feedback to the sessions, and the packaged extension.

See [docs/spec/extension.md](docs/spec/extension.md#14-milestones) for the details.

## Working on this repository

Read [CLAUDE.md](CLAUDE.md) first: it holds the conventions, including the commit rules.
