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
   - a title of one line, at most 120 characters, in the words of the source.
4. Include closed items only if they were closed in the last {{DONE_WINDOW_DAYS}} days according to the source, and skip the rest.
5. Show me the result as a table: source location, proposed ID, lane, marker, title, ref, wait. Below it, list every item where you had to guess, and every part of the source you skipped with the reason.
6. Stop and wait for my answer.

PHASE 2, after I confirm or correct the table.
1. Create or extend only the lane files I approved. Assign IDs per FORMAT.md: top-level numbers continue after the highest number already used in the lane and its archive.
2. For [~] and [!] items, since: is the time of the migration, taken from `date +%Y-%m-%dT%H:%M`. For closed items use done: from the source if it gives a time, otherwise the migration time.
3. Keep the order of the source within each lane; it is the priority order.
4. Do not edit any other file.
5. Read every created file back and check it against the grammar. Report counts: items created per lane, per state, and anything left out.
```
