# Test report — Step 38 (2026-10-16)

**Verdict:** PASS

| Check | Result |
| --- | --- |
| lint | pass |
| typecheck | pass |
| unit+api | pass: web 205/205 (includes `data-saver.test.ts`, `maps-link.test.ts` and `docs.test.ts`), api 261/261, scripts 56/56 |
| e2e | chromium: 24/24 (`phone`, `a11y-phone`, `low-data`, `a11y-low-data`); mobile project: 7/7 (`phone`, `responsive`). WebKit and Firefox were not run. |

## Definition of Done

| ID | Type | Result | Note |
| --- | --- | --- | --- |
| T-38-01 | e2e | pass | `phone.spec.ts`, chromium and mobile |
| T-38-02 | e2e | pass | `phone.spec.ts`, chromium and mobile |
| T-38-03 | e2e | pass | `phone.spec.ts`, chromium and mobile |
| T-38-04 | e2e | pass | `phone.spec.ts`, chromium and mobile |
| T-38-05 | unit | pass | `apps/web/src/lib/data-saver.test.ts`, tagged by a comment |
| T-38-06 | e2e | pass | `low-data.spec.ts` (3 tests) |
| T-38-07 | e2e | pass | `low-data.spec.ts` (1280 px, 390 px, pin symbols) |
| T-38-08 | e2e | pass | `low-data.spec.ts` (2 tests) |
| T-38-09 | e2e | pass | `low-data.spec.ts` (1280 px, 390 px) |
| T-38-10 | e2e | pass | `low-data.spec.ts` (2 tests) |
| T-38-11 | unit | pass | `apps/web/src/spots/maps-link.test.ts` (3 tests) |
| T-38-12 | e2e | pass | `phone.spec.ts` (planner at 390 px, visitor at 1280 px) |
| T-38-13 | e2e | pass | `phone.spec.ts`, chromium and mobile |
| T-38-14 | a11y | pass | `a11y-phone.spec.ts` and `a11y-low-data.spec.ts`, light and dark |
| T-38-15 | unit | pass | `apps/web/src/docs.test.ts` |
| T-38-16 | manual | manual/ci | real Android and iPhone check |

## Failures

None.

## Global DoD (G-1..G-10)

- G-1: ok, all automated T-38 tests pass locally; the CI run is not checked here.
- G-2: ok.
- G-3: n/a, no new routes.
- G-4: ok, the missing-key test is part of the green web tests.
- G-5: ok, T-38-14 passes.
- G-6: ok, the `phone.spec.ts` screenshot test passed and `board-{1280,768,390}.png` and `panel-{1280,768,390}.png` exist in `step-38-screens/` (scratchpad); not attached to a PR from here.
- G-7: ok, the low-data placeholders and *Load map* confirm are covered by T-38-08 and T-38-09.
- G-8: ok, T-38-15 guards DESIGN and PROJECT_SCOPE.
- G-9: n/a, no schema change.
- G-10: n/a, no user writes.
