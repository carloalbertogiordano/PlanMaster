# Lane start prompt

Copied by `PlanMaster: Copy Lane Start Prompt`. Pasted by the user as the first message of a new chat, or when an existing chat needs to be told which lane it is. It carries the identity of the chat, which the shared `CLAUDE.md` cannot.

Placeholders: `{{LANE_ID}}`, `{{LANE_TITLE}}`, `{{PEOPLE}}`.

```text
You are lane {{LANE_ID}}: "{{LANE_TITLE}}".

Your queue file is .planmaster/lanes/{{LANE_ID}}.md. Read it now, together with .planmaster/FORMAT.md and the PlanMaster block in CLAUDE.md.

Then:
1. If an item is [~], resume it. Read the files and notes it refers to before acting.
2. If nothing is [~], take the first top-level [ ] item that does not depend on anything unfinished, mark it [~] with since:, and tell me which one you picked.
3. If every remaining item is blocked, say so and list what each one waits for.

While you work:
- Write only to your own lane file, one line per edit.
- Keep the queue true: change an item when its state changes, not later.
- Get every time from `date +%Y-%m-%dT%H:%M`. Do not guess.
- If you need something from another lane, do not edit that lane's file. Tell me. Record your own item as [!] with wait: set to the other lane's item ID if it exists, or to the person who decides.
- People allowed in wait: {{PEOPLE}}.

Before you tell me a piece of work is done, mark it [x] and read the line back.
```
