# Test report — Step 37 (2026-10-16)

**Verdict:** PASS (one unrelated flaky API test, see Failures)

| Check | Result |
| --- | --- |
| lint | pass |
| typecheck | pass |
| unit+api | web 205/205; api 260/261 in the full run (T-08-02 failed once, 12/12 when its file was re-run alone); scripts 56/56 via `pnpm test:req`, because the failing API step stopped the chained run; `pnpm req:check` OK (INDEX.md up to date) |
| e2e | n/a, the step has no e2e specs |

## Definition of Done

| ID | Type | Result | Note |
| --- | --- | --- | --- |
| T-37-01 | unit | pass | `scripts/overview.test.mjs` (20 tests) |
| T-37-02 | unit | pass | in `scripts/overview.test.mjs`: the check runs under `pnpm test` and the CLI exits non-zero on a broken document |
| T-37-03 | manual | manual/ci | mermaid rendering on GitHub |
| T-37-04 | manual | manual/ci | integration values checked against the cited `path:line` |
| T-37-05 | manual | manual/ci | data table checked against `DATABASE.md` |
| T-37-06 | manual | manual/ci | checklist walk |
| T-37-07 | manual | manual/ci | README and `PROJECT_SCOPE.md` links |

## Failures

- `T-08-02` (not a step 37 test), `pnpm test`, `apps/api/src/images/images.test.ts:183`: `expect(await storage.list()).toEqual([])` received a leftover `.webp`. Re-run alone: 12/12 pass. This is the same flaky test that failed in the step 35 report.

## Global DoD (G-1..G-10)

- G-1: ok, all automated T-37 tests pass.
- G-2: ok (lint and typecheck clean; `pnpm test` had the one flake above, which passed on re-run).
- G-3: n/a, no new routes.
- G-4: n/a, no UI.
- G-5: n/a, no UI.
- G-6: n/a, no UI.
- G-7: n/a, no data views.
- G-8: ok, docs-only step, overview linked per T-37-07 (manual, not checked here).
- G-9: n/a, no schema change.
- G-10: n/a, no user writes.
