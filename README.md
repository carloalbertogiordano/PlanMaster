# PlanMaster

A VS Code extension that shows the work of several long-running Claude Code chats as one visual queue: what each chat is doing now, what is next, what is blocked and on whom, what was closed, and what changed since you last looked.

**Status: milestone 0.2.** The repository holds the specification, the prompts, a demo workspace, a visual mockup, the core library (parser, linter, model, events), a command-line checker, and a working VS Code extension shell: diagnostics, status bar, focus decorations, syntax highlighting, hover and go to definition for `wait:` references. The queue view (milestone 0.3) is not written yet.

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
3. The queue view.
4. Commands that install the instructions and copy the prompts.
5. Hook support for automatic feedback to Claude.

See [docs/spec/extension.md](docs/spec/extension.md#14-milestones) for the details.

## Working on this repository

Read [CLAUDE.md](CLAUDE.md) first: it holds the conventions, including the commit rules.
