# Test report — Step 32 (2026-10-12)
**Verdict:** PASS (all T-32-xx pass; `pnpm test` is red only through an unrelated uncommitted edit, see Failures)

| Check | Result |
| --- | --- |
| lint (eslint + prettier) | pass |
| typecheck | pass |
| unit+api | web 180/180, api 227/227 pass; `test:req` 2 fail (unrelated, below) |
| e2e (chromium, this run: kinds-settings, kind-selection, a11y + dev-login) | 18 passed |
| e2e (head agent, chromium+mobile) | 107 passed over kinds-settings, kind-selection, a11y, kinds-admin, kind-catalog, admin-kinds, kinds, chips, shell, polish, quality, cleanup, settings, scroll, responsive |
| e2e (head agent, WebKit+Firefox in Docker) | 20 passed, 0 failed, 4 skipped (dev-login teardown) |
| db checks | not run (no schema change) |

## Definition of Done
| ID | Type | Result | Note |
| --- | --- | --- | --- |
| T-32-01 | e2e | pass | e2e/kinds-settings.spec.ts |
| T-32-02 | e2e | pass | e2e/kinds-settings.spec.ts |
| T-32-03 | e2e | pass | e2e/kinds-settings.spec.ts |
| T-32-04 | e2e | pass | e2e/kinds-settings.spec.ts |
| T-32-05 | unit | pass | menu.test.tsx; head agent added a test for the late-scroll fix |
| T-32-06 | unit | pass | SymbolPicker.test.tsx, ColorSwatches.test.tsx |
| T-32-07 | e2e | pass | e2e/kind-selection.spec.ts; PR screenshot still to attach (G-6) |
| T-32-08 | e2e | pass | e2e/kinds-settings.spec.ts |
| T-32-09 | e2e | pass | e2e/kinds-settings.spec.ts |
| T-32-10 | a11y | pass | e2e/a11y.spec.ts |
| T-32-11 | unit | pass | locales.test.ts |

## Failures
- `pnpm test` → `test:req` T-30-04 / T-30-05: `req:check failed: 1 problem`. Cause: uncommitted, unrelated edit to `requirements/21-ci-cd.md` (T-21-17 renamed). Not a step 32 failure.
- Head agent fix during verification: Menu closed right after opening when the opening click scrolled the trigger (late scroll event). It now closes only when a scroll actually moved the trigger.
- Load-sensitive, seen once each under parallel load, passed on rerun: T-15-09, T-20-16, T-28-15.
- Shared e2e server 127.0.0.1:5180 used; Playwright run with `--project=chromium` only (WebKit cannot launch on this host).

## Global DoD (G-1..G-10)
- G-1: ok (step tests pass; CI not run here)
- G-2: gap — lint and typecheck ok, `pnpm test` red from the unrelated 21-ci-cd.md edit
- G-3: ok (no new routes)
- G-4: ok (T-32-11 covers en/de)
- G-5: ok (T-32-10)
- G-6: gap — T-32-07 screenshot not yet attached to the PR
- G-7: ok (section keeps the loading/error states, R-32-01)
- G-8: ok (requirements/core updated)
- G-9: ok (no schema change)
- G-10: ok (no new writes)
