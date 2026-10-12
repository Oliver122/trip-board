# Core file format (contract for step 30)

This is the contract between the core files, step files and `scripts/req/`. The parser relies on exactly this shape.

## Core area file `requirements/core/<area>.md`

```
# Core — Spots

One paragraph: what this area covers and which areas it touches (link them, e.g. [kinds](./kinds.md)).

## Creating and editing            <- optional `##` group headings

| ID | Rule | Status | Since | Changed by | Tests |
| --- | --- | --- | --- | --- | --- |
| C-SPOT-01 | `POST /trips/:id/spots` (planner+) creates a spot with name, lat/lng, ... → 201. | active | 06 | 07, 28 | T-06-01, T-28-09 |
| C-SPOT-02 | Old behavior that is gone. | removed | 07 | 28 | — |

## Known gaps

- C-SPOT-07: no test proves the 500-char limit on `info` (R-07-04).
- C-SPOT-03: R-09-02 says X, but `apps/web/src/spots/SpotToolbar.tsx` does Y; the rule describes Y.
```

Rules:
- Areas and ID prefixes (fixed): app=APP, auth=AUTH, trips=TRIP, map=MAP, spots=SPOT, kinds=KIND, images=IMG, list=LIST, planning=PLAN, home=HOME, members=MEMB, export=EXP, discussions=DISC, import=IMP, live=LIVE, admin=ADMIN, ops=OPS.
- ID = `C-<PREFIX>-NN`, two digits zero-padded (three if an area passes 99), numbered from 01 in file order, never reused.
- Every table in a core file has exactly these 6 columns in this order.
- **Rule**: the current behavior, concrete like an R-row (routes, status codes, limits, UI behavior). Its first sentence must stand alone as a summary (the index shows it). No `|` inside cells except escaped as `\|`.
- **Status**: `active` or `removed`.
- **Since**: one two-digit step number (the step that first introduced the behavior).
- **Changed by**: comma-separated two-digit step numbers in ascending order, or `—`.
- **Tests**: comma-separated T-IDs that prove the *current* rule, or `—`. Every `active` rule with `—` must have a bullet in `## Known gaps`.
- `## Known gaps` is the last section, a bullet list, each bullet starts with the core ID and a colon.
- An R-row counts as mapped when its step appears in *Since* or *Changed by* of a rule **and** the R-ID appears in the rule's source list: put the R-IDs in an HTML comment at the end of the Rule cell: `<!-- R-06-01, R-07-02 -->`. The index strips these comments.

## `requirements/core/_unmapped.md`

```
# Unmapped requirements

| R-ID | Reason |
| --- | --- |
| R-01-07 | One-off migration, no lasting behavior |
```

## Step file additions

Under `**Depends on:**` in each step file:

```
**Result:** <text of the "Result you can check" column>
**Core:** C-SPOT-01, C-KIND-03
**Status:** integrated 2026-10-11
```

`**Status:**` is `planned` (default when missing) or `integrated YYYY-MM-DD`.

New steps (from 31) have, after `## Requirements`:

```
## Core changes
| Core ID | Change | From |
| --- | --- | --- |
| C-KIND-12 | add | R-31-01 |
| C-KIND-04 | modify | R-31-02, R-31-03 |
```

`Change` is `add`, `modify` or `remove`.
