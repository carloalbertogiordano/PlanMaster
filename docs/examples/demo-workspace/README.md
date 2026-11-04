# Demo workspace

A small, realistic queue in format version 1: five lanes, a `config.json`, and enough variety to exercise every view in the mockup. It is the main fixture for the parser, linter and extension tests, and it is the data behind [../../mockup/queue-view.html](../../mockup/queue-view.html).

The content is invented and generic. Reference identifiers such as `P-017` or `R-198` stand for plans and requests in some external tracker.

## Reference time

Everything is written as if the current time were **2026-11-02T11:48**. Tests that depend on the clock must inject that time. The staleness check also depends on file modification times; tests set the modification time of `E.md` to 2026-11-02T08:07 and of the other lanes to the values below.

| Lane | Modified |
|---|---|
| A | 2026-11-02T11:44 |
| B | 2026-11-02T11:12 |
| C | 2026-11-02T11:35 |
| D | 2026-11-02T11:30 |
| E | 2026-11-02T08:07 |

## Expected findings

Three findings on two items, all intentional:

| File | Line | Code | Reason |
|---|---|---|---|
| `B.md` | 12 | PM004 | `B-14` is blocked but has no `wait:`. |
| `B.md` | 12 | PM006 | The same item has no `since:` either. |
| `E.md` | 7 | PM012 | `E-05` has been in progress since 08:05 and the file has not changed since 08:07, which is more than `staleAfterMinutes` (120). |

## Features covered

- Nested items with a mix of states (`A-07`, `B-12`, `C-05`).
- All five markers, including a dropped item (`C-02`).
- A person as `wait:` target (`A-09`, `C-04`, `D-07`) and an item as `wait:` target (`D-08` on `D-04`).
- `ref:` on open and closed items.
- Closed items older than `doneVisibleDays` (`B-09`, `C-02`, `E-04`).
- A lane with one item in progress and nothing else active (`D`, `E`).
- Tags: three are declared in `config.json` (`SEC`, `DOC`, `OPS`) and used on top-level items across the lanes (for example `A-07`, `B-12`, `D-05`). Their children inherit them, which the tag filter of the queue view uses.
