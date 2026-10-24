# Step 42 — Phone fixes from review 41 and a change panel

**Goal:** fix the 29 findings that `docs/MOBILE_SKETCH.md` gives to the sets S-01..S-08, as the sketch draws them, and generate an HTML change panel that shows every fix with before and after screenshots so the owner can accept it or send it back.
**Depends on:** 41
**Result:** Run `pnpm ui:changes` and open `test-results/ui-changes/index.html` (no server needed): one card per fixed `U-` row, grouped by set, with the issue, what was done, the changed files and the before and after screenshots side by side. Mark cards *Accepted* or *Needs work* with a note, reload and the marks are still there, *Export verdicts* saves them as JSON. On a phone-sized window (390 px) the board map opens on the spots, pins are easy to tap, the header outside a trip is one row, schedule rows end in one ⋯ menu and the *More* sheet shows *Theme* and *Low data* as rows. In `docs/UI_REVIEW.md` the 29 rows say `fixed in step 42`
**Core:** —
**Status:** planned

## Scope
- In: the 29 `U-` rows of S-01..S-08 in `docs/MOBILE_SKETCH.md` *Implementation set* (U-01, U-02, U-03, U-04, U-05, U-06, U-09, U-11, U-12, U-13, U-14, U-15, U-16, U-17, U-18, U-22, U-24, U-25, U-26, U-27, U-28, U-33, U-34, U-36, U-37, U-38, U-39, U-42, U-44), fixed at every width in their *Widths* cell; the core rules the sets name; a before capture and an after capture with `pnpm ui:review` on a fresh seed; the manifest `docs/ui-review/changes-42.json`; `scripts/ui-review/changes.mjs` and `pnpm ui:changes`; the generated panel `test-results/ui-changes/`; the refresh of `docs/UI_REVIEW.md`.
- Out: the 15 rows that are in no set: the desktop-only rows U-07, U-08, U-10, U-19, U-20, U-21, U-29, U-30, U-31, U-32, U-35, U-40, U-41, U-43, U-45 (a later step via `/req-new`) and U-23 (`later:` in the sketch); clustering changes beyond C-MAP-11; new findings that the after capture shows (they become new `U-` rows with `Step` `—`, not fixes here); committing the panel or the after JPEGs; a hosted panel, comments on it or verdicts shared between people (the panel is local and per browser); changes to the capture, the screen list or the checks of steps 40 and 41.

## Current behavior
| Topic | Today |
| --- | --- |
| Findings | `docs/UI_REVIEW.md` has U-01..U-45, all with `Step` `—`. `docs/MOBILE_SKETCH.md` draws the phone target for each screen and puts 29 rows into the sets S-01..S-08, planned as one step each |
| Phone map | The first view fits the trip region (all of Japan in the seed), pins are 28 px buttons, and *Add new* covers the map credit at 390 px (U-02, U-03, U-24) |
| Header outside a trip | Wraps to two rows below 1024 px because of the theme switch and the user name (U-01) |
| Reviewing a fix | A finding is checked by opening the app; there is no view that shows a screenshot before and after a change next to the finding it fixes |

## Decisions
| Topic | Decision |
| --- | --- |
| One step, eight parts | The user chose to build all eight sets in this step. Each set is one part of the run with its own branch and pull request (README *Flow of a change* 6), in the order S-01, S-02, S-03, S-04, S-05, then S-06, S-07, S-08 on top of S-02 as the sketch's *Depends on* says. The panel and the before capture are a ninth part that comes first, so every later part can be checked with it |
| Sketch is the target | Each fix follows the wireframe and `Changes:` bullets of its screen and shared part in `docs/MOBILE_SKETCH.md`. Where a requirement here and the sketch differ, the requirement wins |
| Before from a capture, not from git | The before images are a fresh-seed `pnpm ui:review` run on the base commit, saved once as `test-results/ui-review-before/` before the first app change. The panel never builds old commits itself |
| Panel is generated and local | `test-results/` is git-ignored, so the panel and its image copies are never committed (like the JPEGs of step 40). Only the generator, its test and the manifest are committed. Verdicts live in the browser's `localStorage` and leave it only through *Export verdicts* |
| Manifest says what was done | The finding, severity and suggested fix come from `docs/UI_REVIEW.md`; what was actually done, which files changed and which screenshots show it are written by the worker of each part into `docs/ui-review/changes-42.json`, so the panel never guesses from a diff |
| Panel text | The panel is a developer tool, not part of the app: English only, not covered by G-4 |

## Requirements

### Change panel
| ID | Requirement |
| --- | --- |
| R-42-01 | Before the first app change of this step, `pnpm ui:review` runs against a database migrated and seeded from empty (as in R-41-01) and its output is copied to `test-results/ui-review-before/` (101 JPEGs and `findings.json`, whose `commit` is the base commit). After the last part the same run is repeated into `test-results/ui-review/` |
| R-42-02 | `docs/ui-review/changes-42.json` is `{step: 42, base, changes}`: `base` is the commit of the before capture, `changes` has exactly one entry `{id, set, done, files, images}` per `U-` ID of S-01..S-08, ordered by set then ID. `set` is the row's set in the sketch, `done` one to three sentences on what changed, `files` the repo paths changed for it (each must exist), `images` 1–6 capture names `<screen>-<width>-<variant>` whose screen is in the row's *Screen* cell, at least one at 390 when *Widths* contains 390 |
| R-42-03 | `pnpm ui:changes` runs `node scripts/ui-review/changes.mjs` with the options `--before` (default `test-results/ui-review-before`), `--after` (default `test-results/ui-review`), `--manifest` (default `docs/ui-review/changes-42.json`) and `--out` (default `test-results/ui-changes`). It reads `docs/UI_REVIEW.md` and the sketch, and exits 1 with one message per problem, writing nothing, when: an entry names a `U-` ID that is not in *Findings* or not in its `set`; a `U-` ID of S-01..S-08 has no entry or two; a `files` path does not exist; an image is missing in the before or the after directory (naming the directory); a field of R-42-02 is missing or out of range. Otherwise it writes `index.html` and copies only the cited images to `img/before/` and `img/after/`, and prints the path. The HTML is built by a pure exported function (no new dependency), and every value taken from the files is HTML-escaped |
| R-42-04 | The panel has the title “UI changes — step 42”, a summary (base and after commit from the two `findings.json`, the date, the count of changes per set, the counts *Accepted*, *Needs work* and *Open*), then one section per set (`<h2>` “S-01 — <title>”) with one `<article id="U-xx">` per change: ID, severity, category, widths, issue and suggested fix from *Findings*, `done`, the `files` as a list, and per image a `<figure>` with the before and after image side by side (stacked below 700 px), each with `alt` “before: <image>” or “after: <image>”, `loading="lazy"`, and a link that opens the full image in a new tab |
| R-42-05 | Each card has a radio group *Accepted* / *Needs work* and a note field. Changes are kept in `localStorage` key `ui-changes-42` as `{<U-ID>: {verdict, note}}` (read and written inside `try/catch`; without storage the page still works for the session) and restored on load. A filter shows all, open, accepted, needs work or one set and updates the summary counts. *Export verdicts* downloads `ui-changes-42-verdicts.json` `{step: 42, after, verdicts: [{id, verdict, note}]}` with every card (`verdict` `open` when unmarked). The page works from `file://` with no network request (inline CSS and script, no external file), follows light and dark through `prefers-color-scheme`, can be used by keyboard only, and axe finds no serious or critical issue |
| R-42-06 | After the after capture, `docs/UI_REVIEW.md` is refreshed as in its *How to repeat* (summary, *Screens*, *Automated findings*, *Mobile*): the 29 rows have `Step` `fixed in step 42`, an automated group whose `U-` row is fixed is gone from `findings.json` or its row says `accepted: <reason>`, and *How to repeat* gets a step that names `pnpm ui:changes`. `node scripts/ui-review/check.mjs`, `notes.mjs` and `sketch.mjs` still pass |

### S-01 Phone map
| ID | Requirement |
| --- | --- |
| R-42-07 | U-24: when a trip has at least one spot, the board's first view fits all spots with 48 px padding (at most zoom 15, so one spot is not shown at street level), and the schedule's side map fits the spots of the first entry, else all spots; with no spots both fit the trip region as today. The region plus its 50 % margin stays the pan limit, and a view in the URL hash (C-MAP-15) still wins over fitting |
| R-42-08 | U-02: below 640 px every pin button has a hit area of at least 44 × 44 px centred on the pin while the drawing keeps 28 px (36 px selected); where hit areas overlap, the pin drawn on top gets the tap. The `target-size` check of `pnpm ui:review` no longer reports `pin-` buttons |
| R-42-09 | U-03: at every width *Add new* sits above the attribution line, which no control overlaps; the `overlap` group for the attribution link at 390 px is gone |

### S-02 Page header and way-back links
| ID | Requirement |
| --- | --- |
| R-42-10 | U-01: below 1024 px the page header outside a trip is one row of at most 56 px (logo, “Dev login” badge when on, avatar menu showing the avatar only), and the theme switch is not in any header below 1024 px but in the avatar menu as *Theme* with Light, Dark and System (inside a trip the *More* sheet keeps it too). At 1024 px and up the header is unchanged. No header wraps or scrolls sideways at 360 px |
| R-42-11 | U-04: a trip card's *Trip settings* text link becomes a 44 × 44 px ⋯ menu button (`aria-label` “Actions for <trip name>” / “Aktionen für <Reisename>”) with the item *Trip settings*; the *My trips* link above the trip settings title (640 px and up) has a hit area of at least 44 px height and a leading chevron; *Back home* on the not-found page is a primary button |
| R-42-12 | U-42: below 640 px trip settings show no visible page heading and no *My trips* link under the trip header (the heading stays as a visually hidden `h1`) |

### S-03 Phone list cards
| ID | Requirement |
| --- | --- |
| R-42-13 | U-26: a list card whose first visit has a date but no time shows only the date (“14 Apr 2026” / “14.04.2026”), with the same formatter as the schedule |
| R-42-14 | U-27: a list card's second line starts with the kind's name in words (“Planned” / “Geplant” and “Home” / “Unterkunft” for those), followed by ` · ` and the short address or date; the mark at the right uses one icon style for kinds, planned and home |
| R-42-15 | U-28: the “Not scheduled yet” divider is a 12 px section label in the muted foreground token with a rule across the column and a contrast of at least 4.5 : 1 in both themes |
| R-42-16 | U-25: *Only visible on map* and *List follows map* use one shared `Switch` (`components/ui/switch.tsx`: `role="switch"`, `aria-checked`, the whole row is the label, at least 44 px high, styled in both themes); below 640 px the *Only visible on map* row sits at the top of the list beside *Filters* |

### S-04 Spot panel on the phone
| ID | Requirement |
| --- | --- |
| R-42-17 | U-13: the category block shows the choice only once (no read-only badge above the chips), the *Planned (n)* badge sits in the title row, the *Info* placeholder is not clipped, and *Link* has the placeholder “https://…” |
| R-42-18 | U-14: below 640 px the address wraps to as many lines as it needs, and *Copy address* is a 44 × 44 px icon button beside it whose `aria-label` and `title` are “Copy address” / “Adresse kopieren” |
| R-42-19 | U-34: below 640 px *Delete spot* is a labelled danger button (trash icon and “Delete spot”) at the end of the sheet, no longer in the footer beside *Cancel* and *Save*; the confirm of C-APP-16 stays. In the members dialog, removing a member is the item *Remove from trip* / *Aus Reise entfernen* (neutral, not red) in a 44 px ⋯ menu per row instead of a red trash button beside the role select; the final confirm stays a danger button |
| R-42-20 | U-09: below 640 px the add panel has no “click the map” hint but a *Pick on map* button that hides the sheet and shows the full map with a centre cross, *Use this point* and *Cancel*: *Use this point* puts the draft pin at the map centre, fills the address by reverse geocoding as a right-click does (C-MAP-13) and shows the sheet again with the rest of the draft unchanged; *Cancel* shows the sheet unchanged. At 640–1023 px the edit and add panel leaves at least 480 px of map width at 768 px, and the map eases the edited pin into the visible part |

### S-05 Schedule rows
| ID | Requirement |
| --- | --- |
| R-42-21 | U-39: entry titles, their spot rows and *Add spot* share one 16 px indent, and *Add spot* sits in the same place for buckets and singles |
| R-42-22 | U-05: each spot row of a bucket ends in one 44 × 44 px ⋯ menu (`aria-label` “Actions for <spot>”) with *Move up*, *Move down* and *Remove from bucket* (neutral, not red); a move that is not possible on the first or last row is not shown. Drag and drop (640 px and up) is unchanged; after a move from the menu focus returns to the ⋯ button of the moved row and the live region announces the position as before. Each row shows the kind's colour strip and symbol like a list card |

### S-06 Notice, error and sign-in pages
| ID | Requirement |
| --- | --- |
| R-42-23 | U-06: below 640 px `/admin/*` renders “The admin area needs a larger screen.” inside the normal page shell (the one-row page header with the avatar menu) as the shared empty-and-error block of R-42-24, with *My trips* as its primary button |
| R-42-24 | U-15, U-38: one shared `EmptyState` (`components/ui/empty-state.tsx`: heading, one line of what to do, one primary button of at least 44 px height, on the page column with the 16 px edge below 640 px and centred in a column of at most 480 px above) is used by not-found (*Back home*), the invalid invite (“This invite link is not valid.”, “Ask the person who invited you for a new link.” / “Bitte die Person, die dich eingeladen hat, um einen neuen Link.”, button *My trips*, which goes through login when signed out) and the admin notice, so all three are aligned the same way |
| R-42-25 | U-11, U-12: the language and theme segmented controls hug their buttons (`inline-flex`, no stretched empty border) and every button is at least 44 × 44 px; the login card is the full width minus 16 px edges up to 400 px, and *Continue with Discord* is as wide as the card |

### S-07 Sheets and dialogs
| ID | Requirement |
| --- | --- |
| R-42-26 | U-18: the members dialog has one title row with ×; the extra *Close* row is gone, and × and Escape close it |
| R-42-27 | U-33: the owner's transfer block in the members dialog is its own section with the heading *Owner* / *Besitzer*, a select labelled *New owner* / *Neuer Besitzer* and the line “The owner can't leave the trip. Transfer ownership first.” (en + de) |
| R-42-28 | U-22, U-36, U-37: the *More* sheet's rows sit on the 16 px edge, each with its value and a chevron; *Theme* (Light, Dark, System) and *Low data* (Auto, On, Off) are rows that open their options, *Low data* with one line of explanation; the sheet ends above the bottom bar, which stays visible and usable. One shared `SettingRow` shows theme and language on the account page the same way |

### S-08 Account, trip cards and settings
| ID | Requirement |
| --- | --- |
| R-42-29 | U-16: the storage meter has a light track and an accent fill, so 0 / 200 MB shows an empty track; it keeps its accessible value |
| R-42-30 | U-17: the date fields of trip settings show their value in the app language (in English no `12.04.2026`), with `lang` set to the app locale |
| R-42-31 | U-44: the role badge on a trip card is 12 px with the border token, readable in dark mode, and centred on the title line |

## Core changes
| Core ID | Change | From |
| --- | --- | --- |
| C-OPS-53 | add | R-42-01, R-42-02, R-42-03, R-42-04, R-42-05 |
| C-OPS-50 | modify | R-42-06 |
| C-MAP-03 | modify | R-42-07 |
| C-MAP-08 | modify | R-42-08 |
| C-MAP-04 | modify | R-42-09 |
| C-APP-03 | modify | R-42-10 |
| C-APP-05 | modify | R-42-10 |
| C-APP-06 | modify | R-42-10 |
| C-TRIP-10 | modify | R-42-11, R-42-31 |
| C-APP-35 | modify | R-42-12 |
| C-LIST-13 | modify | R-42-13, R-42-14 |
| C-LIST-14 | modify | R-42-15 |
| C-LIST-12 | modify | R-42-16 |
| C-SPOT-18 | modify | R-42-17 |
| C-SPOT-28 | modify | R-42-17, R-42-18, R-42-19, R-42-20 |
| C-APP-24 | modify | R-42-20 |
| C-APP-16 | modify | R-42-19 |
| C-MEMB-19 | modify | R-42-19, R-42-26, R-42-27 |
| C-PLAN-10 | modify | R-42-21, R-42-22 |
| C-PLAN-14 | modify | R-42-22 |
| C-PLAN-15 | modify | R-42-22 |
| C-APP-36 | modify | R-42-23 |
| C-APP-39 | add | R-42-11, R-42-24, R-42-25 |
| C-APP-25 | modify | R-42-28 |
| C-APP-37 | modify | R-42-28 |
| C-APP-40 | add | R-42-16, R-42-28, R-42-29, R-42-30 |

## Definition of Done
| ID | Type | Covers | Test |
| --- | --- | --- | --- |
| T-42-01 | unit | R-42-02, R-42-03 | `scripts/ui-review.test.mjs`: `changes.mjs` passes on the committed `docs/ui-review/changes-42.json` with fixture before and after dirs, and fails, writing nothing, on fixture copies with: U-99, U-07 (in no set), U-02 under `S-03`, U-03 missing, U-24 twice, a `files` path that does not exist, an image missing in `--after` (message names the dir), 7 images, no 390 image for U-02 |
| T-42-02 | unit | R-42-03, R-42-04 | Same file: the exported builder on a fixture manifest gives the title, one `<h2>` per set in order, one `article#U-xx` per change, before and after `img` with the R-42-04 `alt`, `loading="lazy"` and links; a `done` of `<script>alert(1)</script>` comes out escaped; only cited images are copied; the HTML has no `http(s)://` `src` or `href` other than the image links |
| T-42-03 | e2e | R-42-04, R-42-05 | `e2e/ui-review/changes.spec.ts` (`ui-review` project only, C-OPS-49): opens a panel generated from fixtures over `file://`, marks U-02 *Accepted* and U-03 *Needs work* with a note, reloads and finds both, filters *Needs work* and sees one card and the counts 1/1/n, exports and reads `ui-changes-42-verdicts.json` with every card; blocks all network and sees no request; with `localStorage` throwing the page still marks cards |
| T-42-04 | a11y | R-42-05 | Same spec: axe on the panel in light and dark has no serious or critical issue, and Tab reaches every radio, note and *Export verdicts* |
| T-42-05 | e2e | R-42-07 | `e2e/phone-map.spec.ts`: on *Japan 2026* the board's first view contains every seeded spot and is not the trip region (zoom above the region fit); with a `#zoom/lat/lng` hash that view wins; a trip with no spots fits its region; the schedule map's first view contains the spots of the first entry |
| T-42-06 | e2e | R-42-08, R-42-09 | Same file at 390 × 844: every `pin-` button's box is at least 44 × 44 while its drawing is 28 px; the attribution link's box does not intersect *Add new* or any map control at 390, 768 and 1280 px |
| T-42-07 | e2e | R-42-10, R-42-11, R-42-12 | `e2e/page-header.spec.ts`: at 390, 768 and 360 px the header on `/trips`, `/account` and not-found is one row of at most 56 px with no theme switch and no horizontal overflow, and the avatar menu offers *Theme* and switches to dark; at 1280 px the header switch is there; the trip card's ⋯ button is at least 44 × 44 and opens *Trip settings*; at 390 trip settings show no visible heading and no *My trips* link, at 768 the link is at least 44 px high |
| T-42-08 | unit | R-42-13, R-42-14 | `apps/web/src/list/SpotCard.test.tsx`: a visit with date and no time renders “14 Apr 2026” (en) and “14.04.2026” (de) with no `00:00`; the second line starts with the kind name, “Planned” and “Home” for those |
| T-42-09 | unit | R-42-16 | `apps/web/src/components/ui/switch.test.tsx`: `role="switch"`, `aria-checked` follows the value, clicking the label text and Space toggle it, disabled does nothing |
| T-42-10 | e2e | R-42-15, R-42-16 | `e2e/phone-list.spec.ts` at 390: the divider's computed font size is 12 px and its contrast at least 4.5 : 1 in light and dark; *Only visible on map* is a `switch` at least 44 px high in the first row beside *Filters* and filters the list; *List follows map* on the account page is the same `switch` |
| T-42-11 | e2e | R-42-17, R-42-18, R-42-19 | `e2e/phone-spot-panel.spec.ts` at 390: the panel of a planned spot has no category badge above the chips and *Planned (1)* in the title row; *Link* has the placeholder; the long seeded address is fully visible (no ellipsis, `scrollWidth` ≤ `clientWidth`) and *Copy address* is a 44 × 44 icon button with its label; *Delete spot* with label is at the end of the sheet and not in the footer, and its confirm still deletes |
| T-42-12 | e2e | R-42-20 | Same file: at 390 the add panel has no “click the map” text; *Pick on map*, a pan and *Use this point* reopen the sheet with the typed title kept, a pin at the new centre and an address from the recorded reverse-geocoding fixture; *Cancel* changes nothing. At 768 the edit panel leaves at least 480 px of visible map and the edited pin is inside it |
| T-42-13 | e2e | R-42-21, R-42-22 | `e2e/schedule-rows.spec.ts` at 390 and 1280: entry titles, rows and every *Add spot* share one left edge (±1 px); a row's ⋯ menu offers *Move down* but not *Move up* on the first row; *Move down* moves it, focus is on the moved row's ⋯ button and the live region announces it; *Remove from bucket* is not red and removes the row; each row shows the kind strip. Drag and drop at 1280 still works (T-11-03 stays green) |
| T-42-14 | e2e | R-42-23, R-42-24 | `e2e/empty-state.spec.ts`: at 390 `/admin` shows the notice under the one-row header with the avatar menu and a *My trips* button at least 44 px high; not-found and an invalid `/join/<code>` use the same block with the same left edge at 390 (16 px) and the same centre at 1280, the invite text in en and de, and *My trips* while signed out leads to `/login` |
| T-42-15 | e2e | R-42-25 | Same file: on `/login` and `/account` at 390 every language and theme button is at least 44 × 44, the control's width equals its buttons' width (±2 px), the login card is 358 px wide and *Continue with Discord* matches it |
| T-42-16 | e2e | R-42-26, R-42-27, R-42-19 | `e2e/members-dialog.spec.ts`: no *Close* text button, × and Escape close; as owner the *Owner* heading, the labelled *New owner* select and the line are there; removing a member goes through the row's ⋯ menu item *Remove from trip* (not red) and the danger confirm (T-20-14 stays green) |
| T-42-17 | e2e | R-42-28 | `e2e/phone-more-sheet.spec.ts` at 390: rows start at x = 16, each shows its value; *Theme* opens three options and switches to dark; *Low data* shows Auto, opens Auto/On/Off with the explanation and switches to On (header badge of C-APP-37 appears); while the sheet is open the bottom bar is visible and *List* switches the tab; the account page shows theme and language as the same rows |
| T-42-18 | e2e | R-42-29, R-42-30, R-42-31 | `e2e/account-and-cards.spec.ts`: at 0 MB the meter's fill is 0 px wide and its track has a colour different from the page and the fill; in English the trip settings date fields have `lang="en"` and do not show `12.04.2026`, in German `lang="de"`; the role badge is 12 px and its vertical centre is within 2 px of the title's |
| T-42-19 | a11y | R-42-10, R-42-11, R-42-16, R-42-19, R-42-22, R-42-24, R-42-28 | `e2e/a11y.spec.ts` gains the 390 px pages `/trips`, the board list, the spot panel, the schedule, the members dialog, the *More* sheet, the account page, not-found and the invalid invite in both themes: no serious or critical issue |
| T-42-20 | unit | R-42-06 | `scripts/ui-review.test.mjs`: `check.mjs`, `notes.mjs` and `sketch.mjs` pass on the committed files; every `U-` ID of S-01..S-08 has `Step` `fixed in step 42` and no other row does; *How to repeat* names `pnpm ui:changes` |
| T-42-21 | manual | R-42-01, R-42-06 | Run log check: `test-results/ui-review-before/findings.json` names the base commit and the after one a later commit, both from a fresh seed; the summary of `docs/UI_REVIEW.md` names the after run; the automated groups of U-02 and U-03 are gone |
| T-42-22 | manual | R-42-04, R-42-07, R-42-08, R-42-09, R-42-10, R-42-11, R-42-12, R-42-13, R-42-14, R-42-15, R-42-16, R-42-17, R-42-18, R-42-19, R-42-20, R-42-21, R-42-22, R-42-23, R-42-24, R-42-25, R-42-26, R-42-27, R-42-28, R-42-29, R-42-30, R-42-31 | Owner review in the panel: every card's after image shows its finding fixed as the sketch draws it; every card is marked, and the exported verdicts file is attached to the last pull request. A card marked *Needs work* reopens its part |
