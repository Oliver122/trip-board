---
description: Create a new requirements step file (requirements/NN-slug.md) in the project's house format
argument-hint: <short description of the feature>
---

Create a new requirements step for: $ARGUMENTS

## Procedure
1. Read `requirements/README.md` (conventions, test types, global DoD G-1..G-10) and `requirements/INDEX.md` (step graph). Read the **core files** the change touches (`requirements/core/<area>.md`, `requirements/core/_FORMAT.md`) to learn current behavior; do not reconstruct it from old steps. Read one or two existing steps for tone and depth, e.g. the highest-numbered file. Read the relevant parts of `docs/PROJECT_SCOPE.md`, `docs/DESIGN.md` and `docs/database/DATABASE.md`.
2. Pick the next free step number `NN` (`ls requirements`) and a kebab-case slug.
3. If the request is vague or touches product decisions, ask the user up to 3 short questions before writing. Otherwise proceed.
4. Write `requirements/NN-slug.md` in exactly this shape:

```
# Step NN — <Title>

**Goal:** one sentence.
**Depends on:** <step numbers or —>
**Result:** <one line a person can check by hand>
**Core:** —
**Status:** planned

## Scope
- In: ...
- Out: ... (name the step that owns it)

## Requirements
| ID | Requirement |
| --- | --- |
| R-NN-01 | ... |

## Core changes
| Core ID | Change | From |
| --- | --- | --- |
| C-KIND-12 | add | R-NN-01 |
| C-KIND-04 | modify | R-NN-02, R-NN-03 |

## Definition of Done
| ID | Type | Covers | Test |
| --- | --- | --- | --- |
| T-NN-01 | api | R-NN-01 | ... |
```

Rules:
- IDs are `R-NN-xx` / `T-NN-xx`, zero-padded, sequential.
- Every requirement is covered by at least one test; every test lists the requirement(s) it covers.
- Test `Type` is one of `unit`, `api`, `db`, `e2e`, `a11y`, `ci`, `manual` (see README). Prefer automated types; use `manual` only when automation is not worth it.
- Requirements are concrete and checkable (status codes, exact behavior, edge cases), not vague.
- Respect the global DoD: new routes need the G-3 test set, UI text needs en + de (G-4), new UI needs axe (G-5) and loading/empty/error states (G-7), writes record `activity_events` (G-10). Do not restate the global DoD, only add tests where a step-specific check is needed.
- Core changes: `Change` is `add`, `modify` or `remove`; `From` lists the R-IDs that cause it. Every R-row must appear in *From* of at least one core change row, or be marked `(no core change)` with a reason in its text (e.g. pure test hardening).
- `modify` and `remove` name a core ID that exists in `requirements/core/`. New core IDs (`add`) take the next free number in their area file (`C-<AREA>-NN`, area codes in `core/_FORMAT.md`); check the file, and reserve the ID by writing it in the step. If the area is new, say so to the user instead of inventing a file.
- `**Core:**` stays `—` and `**Status:**` stays `planned` until the step is integrated by `/req-implement`.
- Keep the step small enough to implement in one sitting.
5. Run `pnpm req:build` and `pnpm req:check`. The step shows up in `requirements/INDEX.md` (graph and steps table, from **Depends on** and **Result**). Fix every problem `req:check` reports for the new file; do not edit `INDEX.md` by hand and do not edit `README.md` for the graph.
6. Do not implement anything. Report the new file path and the R/T counts. Suggest `/req-implement NN` as the next step.
