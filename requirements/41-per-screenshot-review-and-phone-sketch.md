# Step 41 — Per-screenshot review and phone sketch

**Goal:** review every screenshot of a fresh `pnpm ui:review` run with one worker per image, each starting with a cleared context, record the mistakes and inconsistencies each image shows in a note of its own, merge them into `docs/UI_REVIEW.md`, and on that basis sketch the phone version in `docs/MOBILE_SKETCH.md` with the next implementation set.
**Depends on:** 40
**Result:** Open `docs/ui-review/notes/`: 101 notes, one per screenshot, each naming its image, what it shows and its problems, every problem mapped to a `U-` row or rejected with a reason. `docs/UI_REVIEW.md` has a *Review notes* section with the counts and new `U-` rows that cite the notes. Open `docs/MOBILE_SKETCH.md`: one 390 px wireframe per phone screen with the `U-` IDs it fixes, and an *Implementation set* table that gives every phone finding to exactly one proposed step. Change a note's `Known` cell to `new` and `pnpm test` fails naming the note
**Core:** C-OPS-51, C-OPS-52
**Status:** planned

## Scope
- In: a fresh capture with `pnpm ui:review` against a freshly seeded database; `scripts/ui-review/queue.mjs` (work list and note stubs); the one-image brief `docs/ui-review/notes/_BRIEF.md`; 101 notes `docs/ui-review/notes/<image>.md`; the merge into `docs/UI_REVIEW.md` (new `U-` rows, the *Review notes* section, refreshed *Screens* and *Automated findings*); `docs/MOBILE_SKETCH.md`; the checks `scripts/ui-review/notes.mjs`, `scripts/ui-review/sketch.mjs` and their tests; links from `docs/DESIGN.md` §3.7 and *How to repeat*.
- Out: fixing any finding or building the sketch (each set of *Implementation set* becomes its own step via `/req-new`, numbered from 42); app code changes; changes to the capture, the screen list or the automated checks of step 40 (scrolled or below-the-fold captures, 360 px, landscape are a later step); a graphical or clickable mock (SVG, HTML); running the review in CI; automating the worker orchestration (the head agent drives herdr by hand, `/req-implement` H.2).

## Current behavior
| Topic | Today |
| --- | --- |
| Review pass | Step 40 had two workers read all screenshots: one the 56 desktop JPEGs in one context, one the 45 phone JPEGs (`.claude/briefs/40/w4-desktop-review.md`). Late images were judged with dozens of earlier ones in context, nothing records which image a remark came from, and the briefs are git-ignored |
| Data | The step 40 run used the dev database: a real user in *Japan 2026*, open invites and many e2e trips (`docs/UI_REVIEW.md` summary), so screens did not show the seed of R-40-02 |
| Findings | `docs/UI_REVIEW.md` has U-01..U-23, none `high`, none taken by a step. Cross-screen inconsistencies (U-12, U-19) were found only where one reviewer happened to see both screens |
| Phone design | `docs/DESIGN.md` §3.7 has two phone wireframes (board map and list, spot panel). No other phone screen has a target design, so a step that fixes a phone finding has nothing to aim at |

## Decisions
| Topic | Decision |
| --- | --- |
| One image per context | A worker gets one image, its raw check results and the brief, writes one note, then the head agent sends `/clear` before the next image (or starts a new agent). This keeps each judgement free of earlier images and the context small. At most 4 workers run in parallel (`/req-implement` H.2) |
| Comparison happens at merge | A one-image worker cannot see other images, so it judges against `docs/DESIGN.md`, the core rules it is given and the existing `U-` list. Inconsistencies between screens, widths, themes and languages are found by the head agent when it merges the notes of one screen and of one component side by side |
| Notes are committed | Unlike the step 40 briefs, the notes live in `docs/ui-review/notes/` so every finding can be traced to the image and reviewer note it came from. The JPEGs themselves stay in the git-ignored `test-results/`; only those a `U-` row cites are copied (R-40-11) |
| Fresh seed | The capture runs against a database migrated and seeded from empty, so the shots show only the seed of R-40-02 and data noise is not mistaken for a UI problem |
| ASCII wireframes | Like `docs/DESIGN.md` §3: diffable, reviewable in a pull request and checkable in `pnpm test`. A frame of 36 columns stands for 390 px |
| Sketch is a proposal | `docs/MOBILE_SKETCH.md` is the target for the next phone steps, not a rule: core rules change only when the step that builds a set says so. A sketch that changes a phone rule (e.g. C-APP-36 hides something that should come back) names the rule in its set |

## Requirements

### Capture and work list
| ID | Requirement |
| --- | --- |
| R-41-01 | The capture of this step runs `pnpm ui:review` against a database migrated and seeded from empty (`pnpm db:migrate`, `pnpm db:seed`) and copies its `findings.json` with `summarize.mjs --docs`; `docs/UI_REVIEW.md` *Screens*, *Automated findings* and the summary are refreshed from it, and the summary says the run used a fresh seed |
| R-41-02 | `node scripts/ui-review/queue.mjs [dir]` (no new dependency) reads the JPEGs in `dir` (default `test-results/ui-review/`), prints their names one per line in the order of the screens of `scripts/ui-review/check.mjs`, then width 1280, 768, 390, then `light`, `dark`, `light-de`, and creates a stub `docs/ui-review/notes/<image>.md` (image name without `.jpg`) for each one that has none. It never overwrites a note. It exits 1 naming the file when a JPEG name does not match `<screen>-<width>-<light\|dark>[-de].jpg` for a known screen and width |
| R-41-03 | `docs/ui-review/notes/_BRIEF.md` is the brief a reviewer gets, with one placeholder `{{image}}`. It tells the reviewer to Read only `test-results/ui-review/{{image}}.jpg` and `test-results/ui-review/raw/{{image}}.json`, the `docs/DESIGN.md` section of that screen (a table in the brief maps each screen to its section and core rules), and the *Findings* table of `docs/UI_REVIEW.md`; to read no other screenshot; to fill only its own note in the format of R-41-04; and to judge only what the image shows |

### One worker per image
| ID | Requirement |
| --- | --- |
| R-41-04 | A note has these lines and sections in order: `# <image>`; `- Screen:`, `- Width:`, `- Theme:`, `- Locale:` (matching the name); `## Seen`, 3 to 8 bullets describing what is on screen (title, main controls, data shown), so a reader can tell the reviewer looked at this image; `## Problems`, either the line `None.` or a table with the columns `#`, `Severity`, `Category`, `Issue`, `Where`, `Known`, where Severity and Category use the values of R-40-10, `Where` names the place on screen (e.g. "bottom right, above the tab bar") and `Known` is a `U-` ID, `new`, or `rejected: <reason>`; `## Raw checks`, one line per result in the raw JSON with its `U-` ID or `accepted` (or `None.`) |
| R-41-05 | Each note is written by a reviewer whose context holds only the brief of R-41-03 for that image: the head agent sends one brief per worker, waits for the note, then sends `/clear` (or closes the agent) before the next brief. No worker reads two screenshots in one context. The head agent runs at most 4 workers at a time and records in *Review notes* (R-41-08) the number of images, workers and the model used |
| R-41-06 | When a worker finishes, the head agent checks its note against R-41-04 (`node scripts/ui-review/notes.mjs`) and, if it fails, sends the failure messages back to the same worker before clearing it, at most 2 times; a note that still fails is rewritten by a new worker with a cleared context |

### Merge
| ID | Requirement |
| --- | --- |
| R-41-07 | After all 101 notes exist, every `Known` cell of `new` is replaced by the `U-` ID it became or by `rejected: <reason>`. Problems that the notes of one screen show at several widths, themes or locales become one `U-` row. New rows continue the IDs from U-24, keep the columns and order rules of R-40-10, and cite in `Evidence` the note(s) (`docs/ui-review/notes/<image>.md`) and at least one screenshot in `docs/ui-review/` |
| R-41-08 | The head agent compares, for each screen, its notes across widths, themes and locales, and, across screens, the same parts (header, back links, primary buttons, dialogs and sheets, segmented controls, empty and error messages, spacing to the screen edge). Each inconsistency it finds is a `U-` row with category `consistency` that cites the notes of both sides |
| R-41-09 | `docs/UI_REVIEW.md` gets a `## Review notes` section between *Mobile* and *How to repeat* with: the number of notes, problems, problems per `Known` outcome (existing `U-`, new `U-`, rejected), the run of R-41-05 (images, workers, model) and one line per `U-` row that existed before this step, saying `confirmed in <note>` or `not seen: <reason>` (e.g. fixed, or the capture does not show it). *How to repeat* adds how to run `queue.mjs`, brief one worker per image and merge the notes |

### Phone sketch
| ID | Requirement |
| --- | --- |
| R-41-10 | `docs/MOBILE_SKETCH.md` has these `##` sections in order: *Principles*, *Shared parts*, *Screens*, *Implementation set*. *Principles* lists the phone rules the sketch keeps (C-APP-25, C-APP-35, C-APP-36, 44 px targets, 16 px edge, safe area) and those it proposes to change, each with its core ID |
| R-41-11 | *Shared parts* has one wireframe each for the phone header, the page header outside a trip, the bottom bar, a full-screen sheet, a dialog, a primary and a secondary button, a text link that is a 44 px target, and an empty and an error message. Each says which `U-` IDs it fixes |
| R-41-12 | *Screens* has one `###` per screen shown at 390 px (R-40-02: `login`, `trips`, `board-map`, `board-list`, `spot-panel`, `add-spot`, `schedule`, `trip-settings`, `members`, `more-sheet`, `account`, `join-invalid`, `not-found`, `admin-dashboard`, `admin-users`), in that order, each with: `Today:` a link to its `390-light` note; a fenced wireframe whose frame is 36 columns wide and at most 50 lines; `Fixes:` the `U-` IDs it addresses or `—`; `Changes:` bullets of what differs from today; `Longest German label:` the longest label it must fit, taken from `apps/web/src/locales/de/common.json` |
| R-41-13 | *Implementation set* is a table with the columns `Set`, `Title`, `U- IDs`, `Screens`, `Core rules`, `Depends on`. Sets are `S-01`, `S-02`, …, each small enough for one step (at most 6 `U-` IDs), ordered so phone findings with the highest severity come first. Every `U-` row whose *Widths* include 390 is in exactly one set or on a line `later: U-xx <reason>` below the table; a set changing a core rule names it in `Core rules`. `docs/DESIGN.md` §3.7 links to `docs/MOBILE_SKETCH.md` as the target for the phone steps (no core change) |

### Checks
| ID | Requirement |
| --- | --- |
| R-41-14 | `scripts/ui-review/notes.mjs` (pure, like `check.mjs`; run by `scripts/ui-review.test.mjs` in `pnpm test`, no new dependency) fails with one message per problem naming the note when: the notes are not exactly the 101 names that the screens and widths of `check.mjs` give (3 widths × light, dark, plus `light-de` at 390); a note breaks the format of R-41-04 (missing or misordered section, header lines that do not match the name, fewer than 3 or more than 8 *Seen* bullets, unknown severity or category); a `Known` cell says `new`, names a `U-` ID that is not in *Findings*, or says `rejected:` with no reason; a `U-` row cites a note that does not exist; a *Review notes* line is missing for a `U-` row that has no new note citing it |
| R-41-15 | `scripts/ui-review/sketch.mjs` (same style) fails with one message per problem when: a section of R-41-10 is missing or out of order; a part of R-41-11 or a screen of R-41-12 is missing, out of order or lacks a field; a wireframe frame is not 36 columns wide or is longer than 50 lines; a `Fixes:` or set names a `U-` ID that is not in *Findings*; a `U-` row with 390 in *Widths* is in no set and no `later:` line, or in two; a set has more than 6 `U-` IDs; a `Core rules` cell names an ID that is not in `requirements/core/` |

## Core changes
| Core ID | Change | From |
| --- | --- | --- |
| C-OPS-51 | add | R-41-01, R-41-02, R-41-03, R-41-04, R-41-05, R-41-06, R-41-07, R-41-08, R-41-09, R-41-14 |
| C-OPS-52 | add | R-41-10, R-41-11, R-41-12, R-41-13, R-41-15 |

## Definition of Done
| ID | Type | Covers | Test |
| --- | --- | --- | --- |
| T-41-01 | unit | R-41-02 | `scripts/ui-review.test.mjs`: `queue.mjs` on a fixture dir with six JPEGs prints them in the R-41-02 order, creates six stubs in a temp notes dir, leaves an existing note unchanged on a second run, and exits 1 naming `board-640-light.jpg` and `unknown-390-dark.jpg` |
| T-41-02 | unit | R-41-03, R-41-04, R-41-14 | Same file: `notes.mjs` passes on the committed notes and fails with the expected message on fixture copies with: a missing note, an extra note `export-390-light`, *Seen* with 2 bullets, sections out of order, `- Width: 768` in a `*-390-*` note, severity `urgent`, `Known` = `new`, `Known` = `U-99`, `rejected:` without a reason; `_BRIEF.md` contains `{{image}}` and a row for every screen of `check.mjs` |
| T-41-03 | unit | R-41-07, R-41-08, R-41-09, R-41-14 | Same file: `check.mjs` and `notes.mjs` pass on the committed `docs/UI_REVIEW.md`; fixture copies fail when *Review notes* is missing or after *How to repeat*, when U-05 has neither a line there nor a citing note, when a new `U-` row cites `notes/not-there.md`, and when its *Findings* rows are out of severity order |
| T-41-04 | unit | R-41-10, R-41-11, R-41-12, R-41-13, R-41-15 | Same file: `sketch.mjs` passes on the committed `docs/MOBILE_SKETCH.md` and fails on fixture copies with: *Screens* before *Shared parts*, no `### more-sheet`, a wireframe 40 columns wide, one 51 lines long, `Fixes: U-99`, U-02 in two sets and in none, a set with 7 `U-` IDs, `Core rules` = `C-APP-99`; `docs/DESIGN.md` links `MOBILE_SKETCH.md` |
| T-41-05 | manual | R-41-01, R-41-05, R-41-06 | Run log check: the summary of `docs/UI_REVIEW.md` names the fresh seed and the commit of `findings.json`; *Review notes* names 101 images, the workers and the model; the herdr session shows `/clear` (or a new agent) between two briefs of the same worker for three sampled workers, and each sampled brief names one image only |
| T-41-06 | manual | R-41-04, R-41-07, R-41-08 | Review walk: for five random notes, the *Seen* bullets and each problem match the image; three `rejected:` reasons hold against the image; two new `consistency` rows show the difference in the screenshots they cite |
| T-41-07 | manual | R-41-12, R-41-13 | Sketch walk: each phone wireframe can be read without the app (header, content, bottom bar where C-APP-25 applies), every `Fixes:` ID is visibly addressed in its wireframe, and `S-01` can be written as one step with `/req-new` without further design questions |
