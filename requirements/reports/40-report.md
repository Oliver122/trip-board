# Test report — Step 40 (2026-10-23)
**Verdict:** PASS (manual T-40-06 not run)

| Check | Result |
| --- | --- |
| lint (eslint + prettier) | pass |
| typecheck | pass |
| unit + api (`pnpm test`) | pass: web 206, api 265, req scripts 88 |
| e2e (`e2e/ui-review-checks.spec.ts`) | pass: 16/16 (12 T-40-02 plus 4 dev-login tests the project pulled in) |

## Definition of Done
| ID | Type | Result | Note |
| --- | --- | --- | --- |
| T-40-01 | unit | pass | `scripts/ui-review.test.mjs` (3 tests) |
| T-40-02 | e2e | pass | `e2e/ui-review-checks.spec.ts`, 12 tests |
| T-40-03 | unit | pass | `scripts/ui-review.test.mjs` (summarize) |
| T-40-04 | manual | pass (head agent) | `pnpm ui:review` on the local dev stack: exit 0, 43 passed in 1.5 min, 101 JPEGs, `findings.json` and `summary.md`; the 22 group keys equal the committed `docs/ui-review/findings.json`; no write request reached the API (the route guard would fail the test); sampled `spot-panel-390-light-de` (German labels) and `board-map-768-dark` (loaded tiles, no spinner); `pnpm db:check` 77 schema checks passed. The database was the dev one, not a fresh seed |
| T-40-05 | unit | pass | `scripts/ui-review.test.mjs`, committed report and fixture failures |
| T-40-06 | manual | manual/ci | review walk; not done |
| T-40-07 | unit | pass | `scripts/ui-review.test.mjs` |

## Failures
None.

## Global DoD (G-1..G-10)
- G-1: ok locally (CI not checked)
- G-2: ok
- G-3: ok, n/a (no new routes)
- G-4: ok, n/a (no UI strings)
- G-5: ok, n/a (no new UI; axe not added by design)
- G-6: ok, n/a (tooling and report only)
- G-7: ok, n/a
- G-8: ok (README and DESIGN.md updated)
- G-9: ok, n/a (no schema change; `checks.sql` not run)
- G-10: ok, n/a (no writes)
