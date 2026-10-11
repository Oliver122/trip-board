# Test report — Step 28 (2026-10-10)
**Verdict:** PASS (chromium; WebKit could not run locally, see Failures)

| Check | Result |
| --- | --- |
| lint (eslint + prettier) | pass |
| typecheck | pass (shared, api, web) |
| unit + api | pass: api 37 files / 217 tests, web 39 files / 122 tests |
| db:check (checks.sql) | pass, 42 checks |
| e2e (kinds, kinds-admin, members specs) | chromium all pass; 11 webkit failures from missing host libraries; T-28-16 chromium failed once under load, passed on rerun |

## Definition of Done
| ID | Type | Result | Note |
| --- | --- | --- | --- |
| T-28-01 | unit | pass | trips/roles.test.ts |
| T-28-02 | api | pass | members.test.ts |
| T-28-03 | db | pass | db/kinds.test.ts |
| T-28-04 | db | pass | db/kinds.test.ts |
| T-28-05 | api | pass | trips.test.ts |
| T-28-06 | api | pass | kinds/kinds.test.ts |
| T-28-07 | api | pass | kinds/kinds.test.ts |
| T-28-08 | unit | pass | kinds/color.test.ts |
| T-28-09 | api | pass | kinds/kinds.test.ts |
| T-28-10 | api | pass | kinds/kinds.test.ts |
| T-28-11 | api | pass | kinds/kinds.test.ts |
| T-28-12 | e2e | pass | chromium; webkit not runnable |
| T-28-13 | e2e | pass | chromium; webkit not runnable |
| T-28-14 | e2e | pass | chromium |
| T-28-15 | e2e | pass | chromium |
| T-28-16 | e2e | pass | flaky: failed once in the full run, passed on rerun |
| T-28-17 | api | pass | export.test.ts |
| T-28-18 | e2e | pass | chromium; webkit not runnable |
| T-28-19 | a11y | pass | kinds-admin.spec.ts |
| T-28-20 | unit | pass | locales.test.ts |
| T-28-21 | api | pass | members.test.ts |
| T-28-22 | api | pass | members.test.ts |
| T-28-23 | api | pass | members.test.ts |
| T-28-24 | db | pass | db/kinds.test.ts |
| T-28-25 | e2e | pass | chromium; webkit not runnable |
| T-28-26 | unit | pass | Pin.test.tsx, components.test.tsx |
| T-28-27 | e2e | pass | chromium; webkit not runnable |

## Failures
- webkit / dev-login-webkit (11 tests: T-28-12, -13, -16, -18, -25, -27, T-13-11, T-13-12, T-22-08, T-22-09): `browserType.launch: Host system is missing dependencies to run browsers` (libicu74, libxml2, libflite1). Environment problem, not a code failure. Use `pnpm test:e2e:docker` or CI.
- chromium T-28-16 (`pnpm test:e2e e2e/kinds.spec.ts`): failed once in the full parallel run, passed on isolated rerun (`-g T-28-16 --project=chromium`). Possible flake under load.

## Global DoD (G-1..G-10)
- G-1: gap. WebKit e2e not verified locally, so CI is the confirmation.
- G-2: ok
- G-3: ok (kinds/kinds.test.ts and members.test.ts cover the route matrix per T-28-06; not audited route by route)
- G-4: ok (lint and locales.test.ts pass)
- G-5: ok (T-28-19 passes in chromium)
- G-6: not checked (screenshots not inspected)
- G-7: not checked (states not inspected beyond KindsDialog.test.tsx)
- G-8: not checked (README is modified, docs not diffed)
- G-9: ok (db:check passes; T-28-04 and T-28-24 cover the migration)
- G-10: ok (T-28-10 covers kind events; member.role_update and member.join in members.test.ts)
