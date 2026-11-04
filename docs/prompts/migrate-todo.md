# Migration prompt

Copied by `PlanMaster: Copy Migration Prompt`. Converts the open work in an existing to-do document into lane files, without changing the source document.

The job is done in two phases so that nothing is written before the user has seen the plan. The source document is read-only throughout: it keeps its role as a notebook (facts, context, lessons) and may later link queue IDs.

Placeholders: `{{SOURCE_FILE}}`, `{{LANES}}`, `{{PEOPLE}}`, `{{DONE_WINDOW_DAYS}}`.

```text
Migrate the open work in {{SOURCE_FILE}} into the PlanMaster queue. Do not modify {{SOURCE_FILE}}.

Read .planmaster/FORMAT.md and the PlanMaster block in CLAUDE.md first. Existing lanes:
{{LANES}}
Valid people for wait: {{PEOPLE}}

PHASE 1, dry run. Write nothing yet.
1. Read the whole source file.
2. List the items of work it contains. An item of work is something that has an owner or an outcome and takes hours or days: a plan, a request, a fix, a pending decision, a release. Facts about the current state, lessons, reference tables and background are not items; leave them out.
3. For each item decide:
   - the state: a checkbox or a status marker in the source tells you; if nothing does, say it is unclear;
   - the lane it belongs to (choose among the existing lanes; if none fits, propose a new lane with an ID and a precise title);
   - for blocked items, what they wait for, as a person from the list above or another item;
   - any identifier the source uses for it (plan number, request number, ticket); it goes in ref: unchanged;
   - its tags: when the source groups work by codes or categories (a prefix, a heading, a label), each code becomes a tag. Use a tag already declared under "tags" in .planmaster/config.json when one fits, otherwise propose a new key (a letter, then letters, digits, - or _, at most 20 characters) with a short label;
   - a title of one line, at most 120 characters, in the words of the source.
4. Include closed items only if they were closed in the last {{DONE_WINDOW_DAYS}} days according to the source, and skip the rest.
5. Show me the result as a table: source location, proposed ID, lane, marker, title, tag, ref, wait. Add a second table of the new tags with their labels. Below it, list every item where you had to guess, and every part of the source you skipped with the reason.
6. Stop and wait for my answer.

PHASE 2, after I confirm or correct the table.
1. Create or extend only the lane files I approved. Assign IDs per FORMAT.md: top-level numbers continue after the highest number already used in the lane and its archive.
2. Declare every new tag you used in .planmaster/config.json under "tags", as "KEY": "short label". Only add keys; keep everything else in that file as it is.
3. For [~] and [!] items, since: is the time of the migration, taken from `date +%Y-%m-%dT%H:%M`. For closed items use done: from the source if it gives a time, otherwise the migration time.
4. Keep the order of the source within each lane; it is the priority order.
5. Do not edit any other file.
6. Read every created file back and check it against the grammar. Report counts: items created per lane, per state, and anything left out.
```
