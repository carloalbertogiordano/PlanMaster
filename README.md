# PlanMaster

A VS Code extension that shows the work of several long-running Claude Code chats as one visual queue: what each chat is doing now, what is next, what is blocked and on whom, what was closed, and what changed since you last looked.

**Status: design phase.** This repository currently holds the specification, the prompts, a demo workspace and a visual mockup. There is no extension code yet.

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

## Roadmap

1. Core library: parser, model, linter, events, command-line checker, with tests on the demo workspace.
2. Extension shell: watcher, Problems panel, status bar, editor decorations.
3. The queue view.
4. Commands that install the instructions and copy the prompts.
5. Hook support for automatic feedback to Claude.

See [docs/spec/extension.md](docs/spec/extension.md#14-milestones) for the details.

## Working on this repository

Read [CLAUDE.md](CLAUDE.md) first: it holds the conventions, including the commit rules.
