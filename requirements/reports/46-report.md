# Test report — Step 46 (2026-11-23)
**Verdict:** FAIL (environment only: webkit cannot launch; no chromium failure, no missing test)

| Check | Result |
| --- | --- |
| lint (eslint + prettier) | pass |
| typecheck | pass |
| unit + api + req scripts | pass — web 235/235, api 327/327, scripts 127/127 |
| e2e (schedule-days, schedule, schedule-rows, live, quality, search) | 84 passed, 4 skipped, 41 failed — all 41 are `[webkit]` / `[dev-login-webkit]` projects |
| checks.sql | not run (step 46 changes no schema, "no new table") |

## Definition of Done
| ID | Type | Result | Note |
| --- | --- | --- | --- |
| T-46-01 | unit | pass | `plan-days.test.ts` (3 tests) |
| T-46-02 | unit | pass | `ScheduleList.test.tsx` |
| T-46-03 | api | pass | `plan.test.ts:707` (covers move, 400, 404, 403 per title/body) |
| T-46-04 | e2e | pass (chromium) / fail (webkit) | `schedule-days.spec.ts:24`; unit part in `MoveDialog.test.tsx` |
| T-46-05 | e2e | pass (chromium) / fail (webkit) | `schedule-days.spec.ts:110`; unit `plan-geojson.test.ts` |
| T-46-06 | e2e | pass (chromium) / fail (webkit) | `schedule-days.spec.ts:171`; unit `day-cards.test.ts` |
| T-46-07 | unit | pass | `day-colors.test.ts` |
| T-46-08 | e2e | pass (chromium) / fail (webkit) | `schedule-days.spec.ts:250` |
| T-46-09 | a11y | pass (chromium) / fail (webkit) | `schedule-days.spec.ts:320`, light and dark |

## Failures
All 41 are webkit launch errors, e.g. `e2e/schedule-days.spec.ts` T-46-04..09, plus older T-11/T-09/T-18/T-19/T-22/T-42 specs in webkit:
`Host system is missing dependencies to run browsers ... sudo pnpm exec playwright install-deps` (libicu74, libxml2, libflite1).
Command: `pnpm test:e2e e2e/schedule-days.spec.ts e2e/schedule.spec.ts e2e/schedule-rows.spec.ts e2e/live.spec.ts e2e/quality.spec.ts e2e/search.spec.ts`.
Not step-46 defects; re-run after installing the webkit deps (or via `pnpm test:e2e:docker`).

## Global DoD (G-1..G-10)
- G-1: gap — webkit e2e not runnable on this host; chromium passes
- G-2: ok
- G-3: ok — move route tested (T-46-03); 401 not individually confirmed
- G-4: ok — lint and web tests pass (missing-key test included)
- G-5: ok on chromium (T-46-09); webkit not run
- G-6: not verified — no screenshots checked
- G-7: not verified — map hint (R-46-09) covered by T-46-08
- G-8: ok — docs modified (PROJECT_SCOPE, SYSTEM_OVERVIEW, DATABASE)
- G-9: ok — no schema change
- G-10: ok — `plan.spot_move` asserted in T-46-03
