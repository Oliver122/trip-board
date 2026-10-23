# Step 40 — UI review from screenshots

**Goal:** a repeatable `pnpm ui:review` run takes screenshots of every main screen at 1280, 768 and 390 px, runs layout checks on each, and its results feed one ranked report, `docs/UI_REVIEW.md`, whose findings (phone first) become the later steps that improve the UI.
**Depends on:** 15, 27, 37, 38
**Result:** With `pnpm dev:e2e` and a seeded database, run `pnpm ui:review`: `test-results/ui-review/` holds 101 screenshots, `findings.json` and `summary.md` grouping the automated findings. Open `docs/UI_REVIEW.md`: a *Findings* table sorted high → low where every row shows a screenshot from `docs/ui-review/`, a *Mobile* section with one line per phone topic, and every automated finding either mapped to a finding or accepted with a reason. Delete one cited screenshot and `pnpm test` fails naming it
**Core:** C-OPS-49, C-OPS-50
**Status:** integrated 2026-10-23

## Scope
- In: a Playwright project `ui-review` and its spec `e2e/ui-review/capture.spec.ts` with the screen list `e2e/ui-review/screens.ts`; the in-page layout checks `e2e/ui-review/checks.ts`; `scripts/ui-review/summarize.mjs` and the root script `ui:review`; the report `docs/UI_REVIEW.md` with the screenshots it cites in `docs/ui-review/`; the check `scripts/ui-review.test.mjs`; links from `README.md` and `docs/DESIGN.md`.
- Out: fixing any finding (each becomes its own step via `/req-new`, phone findings first); pixel-diff baselines (the existing `map-board.spec.ts` snapshot stays as it is); running the review in CI or uploading it as a CI artifact (a later ops step if wanted); Firefox and WebKit captures; widths other than 1280, 768 and 390 px (360 px phones and landscape tablets are a later step); an HTML gallery; new axe checks (C-APP-26 and T-38-14 already cover them).

## Current behavior
| Topic | Today |
| --- | --- |
| Screenshots | Specs take one-off screenshots for G-6 (e.g. `e2e/phone.spec.ts:350` writes `test-results/step-38/board-<width>.png`), each for its own step's screens. Nothing captures every screen at every width in both themes, and nobody reads them after the pull request |
| Layout checks | C-APP-31 checks that panel, plan dialog and comment buttons fit their content. axe checks contrast and names (C-APP-26). Nothing checks horizontal overflow, touch target size, clipped text or overlapping controls across all screens |
| Known UI problems | Not written down anywhere. `docs/SYSTEM_OVERVIEW.md` *Issues* (step 37) covers security, ops and spec gaps, not how the UI looks or works on a phone |

## Decisions
| Topic | Decision |
| --- | --- |
| Checks plus review | The automated checks find what a machine can measure; a review pass over the screenshots adds what it cannot (hierarchy, spacing, confusing flows). Both end up in the same *Findings* table |
| Report only | Like step 37: this step writes the tooling and the report. No app code changes; each finding is fixed by its own later step |
| Not in CI | The run takes minutes and its findings must not fail a build. It runs locally against `pnpm dev:e2e`; only the committed report and its check run in `pnpm test` |
| Read-only data | The run signs in as the seeded users and never writes (C-OPS-31). Theme is set through `localStorage`, German through `showLocale` |
| JPEG, few committed | Screenshots are JPEG quality 80 to keep them small. Only the ones the report cites are copied into `docs/ui-review/`; the full set stays in the git-ignored `test-results/` |
| Phone first | Severity is ranked the same for every width, but the *Mobile* section must walk every phone topic so nothing on 390 px is skipped |

## Requirements

### Capture
| ID | Requirement |
| --- | --- |
| R-40-01 | `pnpm ui:review` sets `UI_REVIEW=1`, runs `playwright test --project ui-review` and then `node scripts/ui-review/summarize.mjs`. The `ui-review` project (Chromium, `locale: 'en-US'`, `testMatch` `e2e/ui-review/*.spec.ts`) exists in `playwright.config.ts` only when `UI_REVIEW=1`, and every other project has `e2e/ui-review/` in `testIgnore`, so a plain `playwright test`, `pnpm e2e` and the CI matrix never run it. A failed Playwright run stops the script before the summary with Playwright's exit code |
| R-40-02 | `e2e/ui-review/screens.ts` lists the screens as `{id, path, user, widths, prepare(page)}`: `login` (signed out), `trips`, `board-map`, `board-list` (390 only, `?view=list`), `spot-panel` (the seeded *Fushimi Inari* open), `add-spot` (add panel open, nothing saved), `schedule`, `trip-settings`, `members` (dialog open), `export` (dialog open; 1280 and 768 only), `more-sheet` (390 only), `account`, `join-invalid` (`/join/unknown`), `not-found` (`/does-not-exist`), `admin-dashboard`, `admin-users`. Trip screens use the seeded *Japan 2026* as `sven`. `capture.spec.ts` has one test per screen and width, titled `<id> @ <width>` (43 tests) |
| R-40-03 | Each test sets the viewport (1280×900, 768×1024, 390×844), runs `prepare`, waits until no element has `aria-busy="true"`, the map (where shown) has loaded its tiles, and `settle` reports no running animation, then saves full-page JPEGs (quality 80) as `test-results/ui-review/<id>-<width>-<light\|dark>.jpg`, and at 390 px also `<id>-390-light-de.jpg` in German (101 files). A `prepare` that throws or a wait that times out fails the test with the screen id in its message. No request other than `GET`, `HEAD` and the sign-in call reaches the API |

### Automated checks
| ID | Requirement |
| --- | --- |
| R-40-04 | After each screenshot, `e2e/ui-review/checks.ts` runs in the page and appends its results to `test-results/ui-review/raw/<id>-<width>-<theme>[-de].json`. A check never fails the test. Checks, on visible elements only: `overflow-x` (document `scrollWidth` > viewport width); `target-size` (an enabled `a[href]`, `button`, `input`, `select`, `textarea` or element with role `button`, `tab`, `menuitem`, `option`, `checkbox` or `switch` smaller than 44×44 px at 390 px or 24×24 px at the other widths; links inside running text are exempt); `offscreen` (an interactive element more than 1 px past the left or right viewport edge, unless inside a horizontally scrolling container); `clipped-text` (an element whose own text overflows its box without `text-overflow: ellipsis`); `truncated-no-full-text` (ellipsis but no `title` or `aria-label` with the full text); `overlap` (two interactive elements, neither containing the other, whose boxes intersect by more than 2 px in both directions); `small-text` (text with a computed font size below 12 px) |
| R-40-05 | Each result is `{check, screen, width, theme, locale, name, selector, box}`: `name` is the accessible name or text cut to 60 characters, `selector` the nearest `data-testid` plus tag, else a short CSS path of at most 4 parts, `box` the rounded bounding box |

### Summary
| ID | Requirement |
| --- | --- |
| R-40-06 | `scripts/ui-review/summarize.mjs` (no new dependency) reads the raw files and writes `test-results/ui-review/findings.json` `{commit, date, screenshots, groups}`, where results with the same `check`, `screen` and `selector` form one group with the key `<check>/<screen>/<selector>`, its `name`, and the list of `width-theme[-locale]` it occurs in; groups are sorted by number of occurrences, then key. It also writes `summary.md` with totals per check and per width and one line per group. With `--docs` it copies `findings.json` to `docs/ui-review/findings.json` |

### Report
| ID | Requirement |
| --- | --- |
| R-40-07 | `docs/UI_REVIEW.md` starts with a summary (date, the commit of `docs/ui-review/findings.json`, number of screens, screenshots and automated groups) followed by these `##` sections in order: *Screens*, *Automated findings*, *Findings*, *Mobile*, *How to repeat* |
| R-40-08 | *Screens* is a table with one row per screen of R-40-02 and one column per width, each cell the number of automated groups for that screen and width, or `—` where the screen is not shown at that width |
| R-40-09 | *Automated findings* has one row per group key in `docs/ui-review/findings.json` with the columns `Key`, `Where`, `Element` and `Finding`, where `Finding` is a `U-` ID from *Findings* or `accepted: <reason>` (e.g. a map attribution link below 44 px that MapLibre draws) |
| R-40-10 | *Findings* is one table with the columns `ID`, `Severity`, `Category`, `Screen`, `Widths`, `Issue`, `Evidence`, `Suggested fix`, `Step`. IDs are `U-01`, `U-02`, … Severity is `high` (a task cannot be finished or content is unreachable or unreadable at that width), `medium` (it works but is hard: tiny target, clipped label, overlapping or hidden controls) or `low` (cosmetic or inconsistent). Category is `mobile`, `layout`, `touch`, `text`, `i18n`, `visual`, `state` or `consistency`. Rows are sorted by severity, then ID. `Step` is `—` until a step takes the row, then `step NN`, and `fixed in step NN` once it is fixed; fixed rows are never deleted |
| R-40-11 | Every `Evidence` cell cites at least one screenshot `docs/ui-review/<file>.jpg` that exists, and may add automated keys, `path:line` references or core IDs that exist. Every file in `docs/ui-review/` other than `findings.json` is cited by some row, and each is at most 300 kB |
| R-40-12 | *Mobile* has one line per topic, each with the `U-` IDs it found or `fine: <why>`: bottom bar and safe area, header and trip name truncation, spot panel sections, dialogs and sheets at 390×844, German labels at 390 px, touch targets, horizontal scroll, loading, empty and error states, dark theme beyond axe, the admin and export notices. Every screen shown at 390 px appears in at least one *Findings* row or `fine` line |
| R-40-13 | *How to repeat* says how to run `pnpm ui:review`, how to copy findings and cited screenshots (`summarize.mjs --docs`, then copy the JPEGs), and how to mark a row when a step takes it or fixes it |

### Check and links
| ID | Requirement |
| --- | --- |
| R-40-14 | `scripts/ui-review.test.mjs` (run by `pnpm test` through `test:req`, no new dependency) fails with one message per problem when: a section of R-40-07 is missing or out of order; *Findings* has another column set, a duplicate or non-sequential ID, an unknown severity or category, or rows out of order; a cited screenshot does not exist or a file in `docs/ui-review/` is not cited or is over 300 kB; a group key of `docs/ui-review/findings.json` has no *Automated findings* row; a `Finding` cell names a missing `U-` ID or says `accepted:` with no reason; a *Mobile* topic of R-40-12 is missing |
| R-40-15 | `README.md` lists `pnpm ui:review` with its prerequisites (`pnpm dev:e2e`, seeded database) and `docs/DESIGN.md` §3.7 links to `docs/UI_REVIEW.md` as the list of known UI problems (no core change) |

## Core changes
| Core ID | Change | From |
| --- | --- | --- |
| C-OPS-49 | add | R-40-01, R-40-02, R-40-03, R-40-04, R-40-05, R-40-06 |
| C-OPS-50 | add | R-40-07, R-40-09, R-40-10, R-40-11, R-40-12, R-40-14 |

## Definition of Done
| ID | Type | Covers | Test |
| --- | --- | --- | --- |
| T-40-01 | unit | R-40-01, R-40-02 | `scripts/ui-review.test.mjs`: `playwright test --list` without `UI_REVIEW` lists no file under `e2e/ui-review/`; with `UI_REVIEW=1 --project ui-review` it lists exactly the 43 tests `<id> @ <width>` of R-40-02 (`board-list` and `more-sheet` only at 390, `export` not at 390); the root `ui:review` script runs Playwright before `summarize.mjs` and stops on its failure |
| T-40-02 | e2e | R-40-04, R-40-05 | `e2e/ui-review-checks.spec.ts` (`@chromium`, runs in the normal suite) loads fixture HTML with `setContent` and, per check, asserts one flagged and one clean case: a 30 px button at 390 px flagged and at 1280 px clean, a link in running text exempt, an ellipsis with `title` clean and without it flagged, nested controls not reported as overlap, a control inside a horizontal scroller not `offscreen`; each result has the R-40-05 fields and a selector of at most 4 parts |
| T-40-03 | unit | R-40-06 | `summarize.mjs` on fixture raw files: identical `check`/`screen`/`selector` across two widths and both themes become one group with four occurrences; sort order by count then key; totals in `summary.md`; `--docs` writes `docs/ui-review/findings.json` into a temp target |
| T-40-04 | manual | R-40-01, R-40-03 | On a seeded stack, `pnpm ui:review` exits `0` and writes 101 JPEGs, `findings.json` and `summary.md`; five sampled screenshots show no spinner or skeleton and loaded map tiles; the German ones show German labels; the API log shows no write request and `docs/database/checks.sql` still passes |
| T-40-05 | unit | R-40-07, R-40-08, R-40-09, R-40-10, R-40-11, R-40-12, R-40-14 | `scripts/ui-review.test.mjs` passes on the committed report and fails with the expected message on fixture copies with: a missing *Mobile* section, rows out of severity order, a missing cited screenshot, an uncited file, a 301 kB file, a group key without a row, `accepted:` without a reason, an unknown `U-` ID, a missing *Mobile* topic |
| T-40-06 | manual | R-40-10, R-40-12 | Review walk: five random `high` and `medium` rows show the problem in their cited screenshot; every screen at 390 px is named in a row or a `fine` line; three `accepted:` reasons hold when checked against the screenshot |
| T-40-07 | unit | R-40-13, R-40-15 | Same check: *How to repeat* mentions `pnpm ui:review` and `--docs`; `README.md` contains `pnpm ui:review`; `docs/DESIGN.md` links `UI_REVIEW.md` |
