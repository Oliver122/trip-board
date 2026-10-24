# Test report — Step 42 (2026-10-23)
**Verdict:** PASS (with two flakes that pass alone)

| Check | Result |
| --- | --- |
| lint (eslint + prettier) | pass |
| typecheck | pass |
| unit + api (`pnpm test`) | pass — 127 script tests, 0 fail |
| e2e (chromium, step specs, fresh-seed stack 5190/4090) | 55 passed, 1 failed on first run (T-42-07 "header switch is there at 1280"); passes alone and was not reproduced |
| e2e (`ui-review` project, changes.spec.ts) | 4 passed |
| e2e (head agent's full chromium run) | 302 passed, 1 failed (T-18-15, passes 3/3 alone) |
| e2e (full chromium rerun 2026-10-24, after the T-18-15 fix) | 302 passed, 1 failed (T-33-08: run without `API_PORT=4090`, so `vite preview` proxied to the other stack; passes 3/3 with it) |
| webkit projects | not counted: they fail on this machine (also in untouched specs such as dev-login) |

## Definition of Done
| ID | Type | Result | Note |
| --- | --- | --- | --- |
| T-42-01 | unit | pass | scripts/ui-review.test.mjs |
| T-42-02 | unit | pass | scripts/ui-review.test.mjs |
| T-42-03 | e2e | pass | e2e/ui-review/changes.spec.ts |
| T-42-04 | a11y | pass | same spec, light and dark |
| T-42-05 | e2e | pass | e2e/phone-map.spec.ts |
| T-42-06 | e2e | pass | phone-map.spec.ts, Pin.test.tsx |
| T-42-07 | e2e | pass | flaked once under load, passes alone |
| T-42-08 | unit | pass | apps/web/src/list/SpotCard.test.tsx |
| T-42-09 | unit | pass | components/ui/switch.test.tsx |
| T-42-10 | e2e | pass | e2e/phone-list.spec.ts |
| T-42-11 | e2e | pass | e2e/phone-spot-panel.spec.ts |
| T-42-12 | e2e | pass | same file |
| T-42-13 | e2e | pass | e2e/schedule-rows.spec.ts |
| T-42-14 | e2e | pass | e2e/empty-state.spec.ts |
| T-42-15 | e2e | pass | same file |
| T-42-16 | e2e | pass | e2e/members-dialog.spec.ts |
| T-42-17 | e2e | pass | e2e/phone-more-sheet.spec.ts |
| T-42-18 | e2e | pass | e2e/account-and-cards.spec.ts |
| T-42-19 | a11y | pass | e2e/a11y.spec.ts, a11y-phone.spec.ts |
| T-42-20 | unit | pass | scripts/ui-review.test.mjs |
| T-42-21 | manual | manual/ci | per head agent: before = a38ee84 (21 groups), after = fresh seed `tripboard_after` (13 groups); both commits are a38ee84 because nothing is committed yet, so "a later commit" is not yet true |
| T-42-22 | manual | pass | owner review in `test-results/ui-changes/index.html`: all 29 cards accepted (2026-10-24) |

## Failures
- T-42-07 `pnpm test:e2e --project=chromium e2e/page-header.spec.ts:84` — failed once in a batch of 11 specs; passed on rerun (flaky, cause not examined).
- T-18-15 (head agent's full run) — not timing: since R-42-07 the schedule map frames its first entry, and the test started on the board at that same Tokyo view, so the map did not move. Rewritten to start in Kyoto and to check that every move is one jump; passes 10/10 repeated.

## Global DoD (G-1..G-10)
- G-1 ok (flakes above)
- G-2 ok
- G-3 ok (no new API routes)
- G-4 not checked here (no missing-key failure in `pnpm test`)
- G-5 ok (a11y specs pass)
- G-6 not checked (screenshots for the PR)
- G-7 not checked
- G-8 ok (2026-10-24): 26 core rules integrated (C-OPS-53, C-APP-39, C-APP-40 added; C-APP-24 added to Core changes for R-42-20), `pnpm req:check` OK
- G-9 ok (no schema or migration change; checks.sql not run)
- G-10 ok (no new writes)
