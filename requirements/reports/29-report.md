# Test report — Step 29 (2026-10-11)
**Verdict:** PASS (Chromium full suite, Firefox and WebKit via `pnpm test:e2e:docker`; T-29-17 manual and T-29-19 CI have no local proof)

| Check | Result |
| --- | --- |
| lint (eslint + prettier) | pass |
| typecheck | pass |
| unit + api | pass: api 227/227, web 159/159 (shared ran, no failures) |
| e2e (kind-catalog, chips, textures, admin-kinds) | Firefox: pass on rerun. WebKit on host: cannot launch (missing system libs). Head run: Chromium full suite 169/169; Firefox + WebKit in the Docker image (step-29 specs + kinds/kinds-admin) 29 passed, 3 WebKit texture tests flaky once (cold map start), 6/6 on a rerun with `--retries=0` |
| checks.sql | `pnpm db:check` (head run): 74 schema checks passed |

## Definition of Done
| ID | Type | Result | Note |
| --- | --- | --- | --- |
| T-29-01 | unit | pass | symbols.test.tsx |
| T-29-02 | api | pass | kind-catalog.test.ts |
| T-29-03 | api | pass | kind-limits.test.ts |
| T-29-04 | db | pass | kind-catalog.test.ts |
| T-29-05 | api | pass | kind-limits.test.ts |
| T-29-06 | api | pass | kind-limits.test.ts |
| T-29-07 | api | pass | kind-limits.test.ts |
| T-29-08 | api | pass | kind-limits.test.ts |
| T-29-09 | e2e | pass | kind-catalog.spec.ts (Firefox) |
| T-29-10 | e2e | pass | kind-catalog.spec.ts (Firefox) |
| T-29-11 | e2e | pass | kind-catalog.spec.ts (Firefox) |
| T-29-12 | unit | pass | chip-group.test.tsx |
| T-29-13 | e2e | pass | Firefox, passed on rerun (failed once in the parallel run) |
| T-29-14 | e2e | pass | Firefox |
| T-29-15 | unit | pass | structure-lint.test.ts |
| T-29-16 | unit | pass | textures.test.ts |
| T-29-17 | manual | manual/ci | not automated |
| T-29-18 | unit | pass | textures.test.ts |
| T-29-19 | ci | manual/ci | CI step `git diff --exit-code` on the manifest exists (ci.yml:83); not run locally |
| T-29-20 | unit | pass | textures.test.tsx, Pin.test.tsx |
| T-29-21 | e2e | pass | Firefox, both cases (fixture case failed once in the parallel run, passed on rerun) |
| T-29-22 | e2e | pass | Firefox |
| T-29-23 | a11y | pass | Firefox; chips.spec axe failed once with "Timed out waiting for the map" (flaky), passed on rerun |
| T-29-24 | unit | pass | locales.test.ts |

## Failures
- WebKit project (all four spec files): browser fails to launch, "Host system is missing dependencies" (libicu74, libxml2, libflite1). Environmental, not a code failure.
- Flaky on Firefox under parallel load: `chips.spec.ts:59` T-29-13, `textures.spec.ts:100` T-29-21, `chips.spec.ts:226` T-29-23 ("Timed out waiting for the map"). Each passed when rerun.

## Global DoD (G-1..G-10)
- G-1: ok locally (Chromium full suite; Firefox/WebKit in Docker); confirm on the PR's CI run
- G-2: ok
- G-3: ok (kind-limits.test.ts covers the new routes; not audited line by line)
- G-4: ok (T-29-24 and lint pass)
- G-5: ok (Firefox)
- G-6: not checked (screenshots are a PR artifact)
- G-7: ok (head review: request status load error, request form errors, admin Requests empty/error states, symbol picker and chip search empty states)
- G-8: ok (README scripts, docs/database/DATABASE.md, docs/DESIGN.md chip group, docs/textures/README.md artist brief)
- G-9: ok (migration 0005_kind_catalog.sql; `pnpm db:check` 74 checks pass)
- G-10: ok (`kind.limit_request` covered by T-29-07 / activity-text tests)

## Head agent notes
- Fixed during verification: Escape inside the Add kind menu closed the whole Spot kinds dialog (modal capture listener). `components/ui/modal.tsx` now leaves Escape to an open `role="menu"`; covered by `modal.test.tsx` and `kind-catalog.spec.ts` (T-29-09).
- `e2e/admin.spec.ts` T-16-14 updated: the sidebar count now includes pending kind limit requests (R-29-10), so the test matches `Requests <n>` and filters the Requests page to storage before approving.
- `adminTripDetailSchema` / `adminUserDetailSchema` accept the board admin role (step 28 gap that broke the admin trip detail for trips with a board admin).
