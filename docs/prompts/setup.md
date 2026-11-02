# Guided setup prompt

Copied by `PlanMaster: Set Up with Claude` at the end of the guided setup. It is the one prompt the user gives to Claude: it finds the old to-do lists, merges them into lanes, migrates them and checks the result, in four phases with a stop after each, so that nothing is written before the user has seen the plan.

The deterministic parts of the setup (the configuration, the format reference, the instructions in `CLAUDE.md`, the hooks) are done by the extension with a diff and a confirmation, so the prompt tells Claude not to touch them.

Placeholders: `{{SITUATION}}`, `{{LANES}}`, `{{PEOPLE}}`, `{{DONE_WINDOW_DAYS}}`.

```text
You are helping to set up PlanMaster in this project. PlanMaster keeps one queue file per Claude chat (a "lane") in .planmaster/lanes/ and shows them to the user in VS Code. Your job is to turn the project's existing to-do lists into that queue, with the user's approval at every step.

Current situation: {{SITUATION}}
Existing lanes:
{{LANES}}
Valid people for wait: {{PEOPLE}}

Read .planmaster/FORMAT.md first: it is the exact format. Do not edit CLAUDE.md, anything in .claude/, .planmaster/FORMAT.md or .planmaster/hooks/: PlanMaster manages those. Do not delete or change the original to-do documents.

Work in four phases. Finish a phase, show the result in plain language, and wait for the user's answer before starting the next. Never write a file before phase 3.

PHASE 1, look around. Nothing is written.
1. Find the documents that hold work to do: Markdown or text files with checkboxes (- [ ] and - [x]), or named like TODO, backlog, roadmap, handoff, plan or notes, or with sections of tasks. Search the whole project. Skip node_modules, .git, build output, .planmaster and files that are only reference material. If the user named files, start with those.
2. For each candidate say in one line what it contains and about how many open items it has.
3. If the situation above lists files that cannot be read, read each of them and explain what is wrong.
4. Ask which candidates to include. Wait.

PHASE 2, plan the lanes.
1. Propose how to split the work into lanes. A lane is one area of work that one chat owns, for example one area of the code, one workstream, or one of the chats the user already runs. Give each lane an ID (1 to 4 uppercase letters or digits, starting with a letter) and a precise title of 3 to 80 characters.
2. Several documents may describe the same work. Merge them: one item per piece of work, keep the original identifiers in ref:, and say which items you merged and why.
3. Propose the people who can be waited on (wait:), for example colleagues or teams that the documents mention, in lowercase without spaces. Say whether the settings in .planmaster/config.json should change; closed items stay visible {{DONE_WINDOW_DAYS}} days now.
4. Show a table: source file and line, proposed ID, lane, state, title, ref, wait. List everything you were unsure about and everything you chose to leave out, with the reason. Ask the user to confirm or correct. Wait.

PHASE 3, write.
1. Create or extend only the lane files and, if the user agreed, .planmaster/config.json. Follow .planmaster/FORMAT.md exactly: one item per line, two spaces per level, tokens at the end in the order ref, wait, since, done.
2. Take every time from `date +%Y-%m-%dT%H:%M`. Items in progress or blocked get since: with the time of this migration. Include closed items only if they were closed in the last {{DONE_WINDOW_DAYS}} days, with done: from the source when it gives a time.
3. If a lane file could not be read, repair it with the smallest possible edits and keep every item.
4. Keep the order of the sources within each lane; it is the priority order.

PHASE 4, check.
1. Run `node .planmaster/hooks/planmaster-hook.cjs check` if that file exists and fix every error it reports. If it does not exist, read each file again against .planmaster/FORMAT.md.
2. Report in plain language how many lanes and items you created, what you left out, and what the user should look at first. Tell them that each chat can be bound to its lane by starting it with PLANMASTER_LANE set, for example PLANMASTER_LANE=B claude, or by using the PlanMaster command Copy Lane Start Prompt.
```
