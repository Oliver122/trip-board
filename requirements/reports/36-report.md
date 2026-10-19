# Test report — Step 36 (2026-10-16, re-run)

**Verdict:** PASS (one unrelated flaky API test, see Failures)

| Check | Result |
| --- | --- |
| lint | pass |
| typecheck | pass |
| unit+api | web 205/205; api 260/261 in the full run (T-08-02 failed once, 12/12 when its file was re-run alone); scripts 56/56 via `pnpm test:req`, because the failing API step stopped the chained run; `pnpm req:check` OK (INDEX.md up to date, so the earlier T-30-05 failure is gone) |
| e2e | n/a, the step has no e2e specs (T-36-04 to T-36-06 are CI-only) |

## Definition of Done

| ID | Type | Result | Note |
| --- | --- | --- | --- |
| T-36-01 | unit | pass | `scripts/ci-pr-verified.test.mjs`, all eight cases including "the API throws" and "the API answers 500" |
| T-36-02 | unit | pass | `scripts/ci-workflow.test.mjs` (5 tests plus an R-35-11 guard) |
| T-36-03 | unit | pass | `scripts/ci-passed.test.mjs` (7 tests) |
| T-36-04 | ci | manual/ci | needs a real merge on GitHub |
| T-36-05 | ci | manual/ci | needs a push without a PR, or a `workflow_dispatch` |
| T-36-06 | ci | manual/ci | needs three PR runs |
| T-36-07 | manual | manual/ci | README CI section read against the workflow |

## Failures

- `T-08-02` (not a step 36 test), `pnpm test`, `apps/api/src/images/images.test.ts:183`: the API assertion failed once in the full run. Re-run alone: 12/12 pass. This is the same flaky test seen in the step 35 and 37 reports.

## Global DoD (G-1..G-10)

- G-1: ok for the automated tests; T-36-04 to T-36-06 can only be proven in CI.
- G-2: ok (lint and typecheck clean; `pnpm test` had the one flake above, which passed on re-run).
- G-3: n/a, no new routes.
- G-4: n/a, no UI.
- G-5: n/a, no UI.
- G-6: n/a, no UI.
- G-7: n/a, no data views.
- G-8: ok, R-36-09 (README CI section) is manual under T-36-07 and was not checked here.
- G-9: n/a, no schema change.
- G-10: n/a, no user writes.
