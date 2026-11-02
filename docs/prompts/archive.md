# Archive prompt

Copied by `PlanMaster: Copy Archive Prompt`. Moves old closed work out of a lane's live file so the queue stays short. Done by the chat that owns the lane, never by the extension.

Placeholders: `{{LANE_ID}}`, `{{ARCHIVE_AFTER_DAYS}}`.

```text
Archive the old closed work of lane {{LANE_ID}}.

1. Read .planmaster/lanes/{{LANE_ID}}.md, .planmaster/archive/{{LANE_ID}}.md if it exists, and .planmaster/FORMAT.md.
2. Find subtrees where the top item and every descendant is closed ([x] or [-]) and the latest done: among them is more than {{ARCHIVE_AFTER_DAYS}} days before now. Get now from `date +%Y-%m-%dT%H:%M`.
3. Never archive a subtree with any open item, and never split a subtree.
4. List the subtrees you will move (ID and title of the top item) and wait for my confirmation.
5. After I confirm, append each subtree to .planmaster/archive/{{LANE_ID}}.md exactly as it is, in the same order, and then remove it from the live file. If the archive file does not exist, create it with the same front matter as the live file.
6. Do not renumber or reuse any ID.
7. Read both files back, check that every moved line appears exactly once, and report how many items moved.
```
