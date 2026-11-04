# Managed block for CLAUDE.md

Installed by `PlanMaster: Install Instructions in CLAUDE.md` between the two marker comments. Everything between the markers, markers included, belongs to the extension and is replaced on update. Keep it short: it is loaded into every session of the project.

```text
<!-- planmaster:begin v2 -->
## Work queue (managed by PlanMaster, do not edit this block by hand)

Long-running work is tracked in `.planmaster/lanes/<LANE>.md`, one file per chat (a "lane").
Write only to the lane you were assigned. If you were not told your lane, ask.
The full grammar is in `.planmaster/FORMAT.md`.

One item per line:

    - [ ] B-12 Title of the work ref:P-017

Markers: `[ ]` todo, `[~]` in progress, `[!]` blocked, `[x]` done, `[-]` dropped.
Children are indented two spaces. Tokens go at the end of the line: `tag:`, `ref:`, `wait:`, `since:`, `done:`.

Rules:
1. Starting an item: set `[~]` and add `since:`. Only one top-level item may be `[~]`.
2. Blocked: set `[!]`, add `wait:<person or item ID>`, set `since:`.
3. Finishing: before telling the user the work is done, set `[x]`, remove `since:`, add `done:`.
4. Never guess a time. Run `date +%Y-%m-%dT%H:%M` and use its output.
5. Edit one line at a time with a targeted replacement anchored on the item ID. Never rewrite or reformat the file.
6. A new item takes the next free number in your lane. Check `.planmaster/archive/` too. IDs are never reused.
7. An item is hours or days of work. Small steps belong in your own todo list, not in the queue.
8. Anything longer than a one-line title goes in a document, linked with `ref:`.
9. After editing a line, read it back to confirm.
10. Classify items with `tag:KEY` (`tag:KEY1,KEY2` for several). A child inherits its parent's tags. Declare a tag first in `.planmaster/config.json` under `"tags"` as `"KEY": "short label"`. Reuse a tag that fits; add a new one when none does.
<!-- planmaster:end -->
```

## Notes

- The version in the begin marker (`v1`) is the block's version, not the queue format version. The extension offers an update when it ships a newer block.
- The block contains no project-specific names. Project-specific people live in `config.json` and reach Claude through the lane start prompt.
- Word count is about 290. Do not let it grow past 350.
