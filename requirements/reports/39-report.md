# Test report — Step 39 (2026-10-19)

**Verdict:** PASS

| Check | Result |
| --- | --- |
| lint | pass (eslint + prettier) |
| typecheck | pass |
| unit + api | pass: api 265/265, web 206/206 on re-run, `test:req` 57/57. See Failures for the flaky first run |
| e2e | not run: the step has no e2e spec (T-39-02 is a CI check, T-39-07 is manual) |
| overview check | `node scripts/overview/check.mjs`: ok |
| database checks | not run: no schema change |

## Definition of Done
| ID | Type | Result | Note |
| --- | --- | --- | --- |
| T-39-01 | unit | pass | `apps/web/src/locales.test.ts` (7 tests); `apps/web/public/locales` is gone |
| T-39-02 | ci | pass (static) / manual/ci | `scripts/ci-workflow.test.mjs` checks the build job step. The real `test ! -e apps/web/dist/locales` runs in CI only |
| T-39-03 | unit | pass | `apps/api/src/deploy-archive.test.ts` |
| T-39-04 | unit | pass | same file |
| T-39-05 | unit | pass | same file |
| T-39-06 | unit | pass | same file |
| T-39-07 | manual | manual/ci | needs a real server |
| T-39-08 | manual | partly checked | `check.mjs` passes; README line 248 has the clean-tree rule. The cited `deploy.sh` lines were not opened by hand |

## Failures
First full `pnpm test` run: 7 web tests in 4 files failed with "Test timed out in 5000ms". Examples: `TripSettingsPage.test.tsx` (kinds section), `modal.test.tsx` (T-26-01). Two of the files were not captured by name. The load came from api and web tests running in parallel.
Re-run: `pnpm vitest run` in `apps/web` passed 56/56 files, 206/206 tests. The files named above also passed on their own. No step-39 test failed. Treat this as load flakiness, not a regression.

## Global DoD (G-1..G-10)
- G-1: ok locally; the CI-only T-39-02 and the manual T-39-07 are open
- G-2: ok (lint, typecheck and tests pass; web tests needed a re-run after load timeouts)
- G-3: n/a (no routes)
- G-4: ok (locale test passes)
- G-5: n/a (no UI)
- G-6: n/a (no UI)
- G-7: n/a (no data views)
- G-8: ok (README, DESIGN, PROJECT_SCOPE, SYSTEM_OVERVIEW updated)
- G-9: n/a (no schema change)
- G-10: n/a (no user writes)
