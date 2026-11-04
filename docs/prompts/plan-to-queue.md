# Plan-to-queue prompt

Copied by `PlanMaster: Copy Plan-to-Queue Prompt`. Used after a plan has been approved (for example after plan mode) to record it in the lane's queue at the right granularity.

Placeholders: none. The lane is the one the chat was assigned by its start prompt.

```text
The plan we just approved needs to be recorded in the queue of your lane.

1. Read your lane file and .planmaster/FORMAT.md.
2. Add one top-level item for the plan as a whole, with ref: set to the plan's identifier or document if it has one. Place it where it belongs in priority order, normally after the item in progress.
3. If the plan belongs to a topic that has a tag declared in .planmaster/config.json, give the top-level item that tag with tag:; its children inherit it. Declare a new tag first if none fits.
4. Under it, add child items only for the parts that are real units of work (hours or days, can be blocked or finished independently). Do not add every step. Aim for three to seven children.
5. All new items start as [ ]. Do not mark anything [~] until you actually start it.
6. If a part depends on something that is not ours to decide or deliver, add it as [!] with wait: set to the person or the item ID.
7. Take new IDs from the next free numbers in your lane, archive included.
8. Edit with insertions at the right place, not by rewriting the file.
9. Read back the lines you added and show them to me.
```
