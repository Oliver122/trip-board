# Step 11 — Schedule UI

**Goal:** plan the trip visually — buckets and single dates — and connect plans to the board.
**Depends on:** 07, 10

## Scope
- In: Schedule tab (`/trips/:id/schedule`), create/edit bucket & single dialogs, add spots to entries (from the schedule and from the spot panel), drag to reorder, per-visit date/time/info, map zoom to entry, “In plans” section in the spot panel, plan-entry filter in the toolbar.
- Out: calendar grid view (later), home spots per bucket (12).

## Requirements
| ID | Requirement |
| --- | --- |
| R-11-01 | Schedule view: chronological list; buckets are collapsible groups showing date range, info and their spots; singles show date + time |
| R-11-02 | “+ Bucket” / “+ Single” dialogs with date (range) picker, optional times, info text |
| R-11-03 | Inside a bucket, “Add spot” opens a searchable spot picker; each added visit can get a date (limited to the bucket range), time and info |
| R-11-04 | Drag and drop reorders spots within a bucket (keyboard alternative: move up/down) |
| R-11-05 | Selecting an entry zooms the side map to its spots; the map highlights them |
| R-11-06 | Spot panel “In plans” lists the spot's entries with remove buttons and “+ Add to plan” (choose entry, optional date/time) |
| R-11-07 | Toolbar filter gains “Plan entry” (any / a specific entry) |
| R-11-08 | Category badge switches to *Planned* immediately after adding; the dropdown keeps the base category editable |
| R-11-09 | Visitors see the schedule read-only |
| R-11-10 | Empty schedule state: “Nothing planned yet — create a bucket like ‘Tokyo, 12–16 Apr’” |
| R-11-11 | Shrinking a bucket range warns how many visit dates will be cleared before saving |

## Definition of Done
| ID | Type | Covers | Test |
| --- | --- | --- | --- |
| T-11-01 | e2e | R-11-02, R-11-03 | Planner creates bucket “Tokyo 12–16 Apr”, adds Shibuya Sky on 13 Apr 18:00 → shows under Tokyo with date and time |
| T-11-02 | e2e | R-11-06, R-11-08 | From the spot panel, “Add to plan → Kyoto” → badge shows *Planned (1)*, and the board card shows the date |
| T-11-03 | e2e | R-11-04 | Reordering spots by drag persists after reload; keyboard reorder works too |
| T-11-04 | e2e | R-11-05 | Clicking the Tokyo bucket fits the map to its spots |
| T-11-05 | e2e | R-11-07 | Filter “Plan entry: Tokyo” on the board shows only Tokyo spots |
| T-11-06 | e2e | R-11-11 | Shrinking Tokyo to 12–14 Apr shows “1 visit date will be cleared” before saving |
| T-11-07 | e2e | R-11-09 | Visitor sees no “+ Bucket”, “+ Single”, drag handles or remove buttons |
| T-11-08 | unit | R-11-03 | Date picker in a bucket disables dates outside the bucket range |
| T-11-09 | a11y | R-11-01, R-11-04 | Schedule page passes axe; reorder is operable by keyboard only |
