# Step 27 — Stable cleanup e2e tests

**Goal:** `e2e/cleanup.spec.ts` passes 17 of 17 on every run, alone and with the full suite in parallel, and the cause of the flakiness is found and written down instead of hidden behind longer timeouts.
**Depends on:** 26
**Result:** `e2e/cleanup.spec.ts` passes every test in 10 repeats and next to the full suite; root causes written down; prettier and report gaps closed
**Core:** C-APP-08, C-OPS-31, C-OPS-32, C-OPS-35
**Status:** integrated 2026-10-11

## Scope
- In: find the root cause of the flaky step 26 browser tests (T-26-04, the three T-26-06 tests, the T-26-10 401 test); fix the tests, the shared test helpers or, if the cause is a real app bug, the app; any other spec that makes the full suite fail for the same reason (found during this step: `import`, `comments` and `map-board` stored German on seeded users, and `admin` assumed Aiko is on the first page of a user list that every run grows); close the step 26 report gaps (T-26-16 ID, prettier on `.claude/**/*.md`, Firefox and WebKit run, DESIGN.md check).
- Out: new features; changes to shared component behavior unless a flake proves a real bug (then the fix is in scope and gets a regression test); the open items from the step 26 report (phone Import entry, board skeleton with a remote search) which need their own step.

## Known evidence (from the step 26 report)
| Test | Failure | Passes alone? |
| --- | --- | --- |
| T-26-04 | `menuitem 'Log out'` expected focused, received inactive | yes |
| T-26-06 discard, delete comment, clear stay | `toBeVisible` failed; `selectOption` on `getByLabel('Category')` timed out at 30 s | yes |
| T-26-10 (401) | `click` on `Members` retried until timeout, "element was detached from the DOM" | yes |

Suspects to confirm or rule out, not assume: tests running in parallel share users (`aiko`, `sven`) and `setLocale` writes the stored language of that user, so another test can flip the language mid-test; live collaboration (step 19) refetches and re-renders the panel while the test types or clicks; the Vite dev server compiles routes on first request under load; focus assertions racing the menu's focus move; `clearCookies` racing in-flight requests.

## Requirements
| ID | Requirement |
| --- | --- |
| R-27-01 | The root cause of each failing test is reproduced on purpose (for example with `--repeat-each=10 --workers=4`, or by running the file next to the full suite) and written in `requirements/reports/27-report.md` as one line per test: cause, evidence (trace, error text), fix. "Timeout under load" is not accepted as a cause without evidence that the awaited element never appeared for a named reason |
| R-27-02 | No cleanup test depends on state another test can change. Every test that calls `setLocale` or otherwise writes user settings uses a fresh user (as T-26-04 already does with `freshDiscordId()`). Tests that share `sven` or `aiko` only read. Suite-wide, no spec stores a language other than English on a seeded user (`sven`, `aiko`, `tom`); a page that must show German uses `showLocale` from `e2e/locale.ts`, which rewrites that page's `GET /api/me` and writes nothing. A `finally` restore is not enough, because parallel specs read the account while it is German. Tests do not assume a seeded row is on the first page of a list that fresh users grow |
| R-27-03 | Assertions wait for the user-visible condition, not for time: no `waitForTimeout`, no fixed sleeps, no raised global timeout, no `test.slow()`, no `retries` added for these tests. Actions that follow a re-render (menu focus, `Members` click, `Category` select) wait for the element to be attached and stable first, using web-first assertions |
| R-27-04 | If the cause is in the app (for example a live refetch that remounts the open panel or a menu that moves focus after the next keypress), the app is fixed and the fix is covered by a `unit` test of the component or hook, in addition to the e2e |
| R-27-05 | The 401 test does not race in-flight requests: it waits until the page is idle, clears cookies, then triggers one request and asserts the redirect to `/login` |
| R-27-06 | `e2e/cleanup.spec.ts` has a test titled `T-26-16` that runs the locale missing-key check for exactly the shared keys added in step 26 (cancel, confirm, close, menu, confirm dialog titles/messages) in en and de, so the report no longer shows T-26-16 as missing |
| R-27-07 | `pnpm exec prettier --check .` passes: `.claude/**/*.md` is either formatted or listed in `.prettierignore`, with a one-line reason |
| R-27-08 | Stability is measured, not claimed: the file passes 10 times in a row on Chromium with the default worker count, and 3 times in a row next to the full e2e suite. The numbers are in the report |
| R-27-09 | The step 26 report gaps are closed: `cleanup.spec.ts` runs on Firefox and WebKit (tests that need Chromium only carry `@chromium` with a reason), and the DESIGN.md "Components" section is checked against the T-26-17 list |

## Definition of Done
| ID | Type | Covers | Test |
| --- | --- | --- | --- |
| T-27-01 | manual | R-27-01 | `requirements/reports/27-report.md` names a cause, evidence and fix for each of the five failing tests, and each cause was reproduced before the fix (command and failure count noted) |
| T-27-02 | ci | R-27-02 | `apps/web/src/structure-lint.test.ts` fails on fixtures that call `setLocale` with a seeded user in `cleanup.spec.ts`, or store a non-English language on a seeded user in any spec (in a test, a helper function, or via a seeded login in `beforeEach`), and passes on the repo. Run against the pre-step versions of `import`, `comments` and `map-board`, it flags all three |
| T-27-03 | ci | R-27-03 | A guard fails if `cleanup.spec.ts` contains `waitForTimeout`, `test.slow`, `test.setTimeout` above 30 s, or `retries`; `playwright.config.ts` default timeout and retries are unchanged from step 26 |
| T-27-04 | unit | R-27-04 | Only if an app bug was found: a Testing Library test fails before the fix and passes after (menu focus stays on the item after a refetch, or the open panel keeps its input after a live update). Otherwise the report states "no app bug" and this test is marked n/a with the evidence |
| T-27-05 | e2e | R-27-05 | `pnpm test:e2e e2e/cleanup.spec.ts -g "401" --repeat-each=20 --project=chromium` passes 20 of 20 |
| T-27-06 | e2e | R-27-06 | The `T-26-16` test exists in `cleanup.spec.ts` and passes in en and de; removing one de key makes it fail |
| T-27-07 | ci | R-27-07 | `pnpm exec prettier --check .` exits 0 |
| T-27-08 | e2e | R-27-02, R-27-03, R-27-08 | `pnpm test:e2e e2e/cleanup.spec.ts --project=chromium --repeat-each=10` passes every test in all 10 repeats (26 tests: 260 of 260, plus the dev-login teardown); then the full suite with `cleanup.spec.ts` included passes three times in a row |
| T-27-09 | e2e | R-27-09 | `pnpm test:e2e e2e/cleanup.spec.ts --project=firefox --project=webkit` passes (excluding documented `@chromium` tests) |
| T-27-10 | manual | R-27-09 | Each shared component in the T-26-17 list appears in `docs/DESIGN.md` "Components" with usage guidance and a file link; the checker ticks them off in the report |
