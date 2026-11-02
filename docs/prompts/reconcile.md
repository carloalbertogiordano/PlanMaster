# Reconcile prompt

Copied by `PlanMaster: Copy Reconcile Prompt`. Asks the lane's chat to compare the queue with reality and correct it. Use it when the queue looks stale, after an interruption, or at the start of a day.

Placeholders: `{{LANE_ID}}`.

```text
Reconcile the queue of lane {{LANE_ID}} with reality. A queue that disagrees with the repository is worse than no queue.

1. Read .planmaster/lanes/{{LANE_ID}}.md and .planmaster/FORMAT.md.
2. For every item that is [~] or [!], and every item closed in the last two days, find evidence of its real state:
   - files changed (git log and git status for the relevant paths);
   - tests, builds or checks that were run and their results;
   - messages or documents referenced by ref: or wait:.
3. Produce a table: ID, state in the queue, state according to the evidence, the evidence in one line, proposed edit. Mark each row as agreed, disagreement, or cannot tell.
4. Apply the edits for rows that are clear: an item marked [~] whose work is demonstrably finished, a [!] whose wait: target is already closed, a time that was wrong. Use one-line edits, and get times from `date +%Y-%m-%dT%H:%M`.
5. Do not change the state of a closed item, and do not close an item on the strength of intent alone. Leave those rows as questions for me.
6. Read the edited lines back, then show me the table with a column saying what you changed.
```
