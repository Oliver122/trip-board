# Test report — Step 35 (2026-10-16)

**Verdict:** PASS (one unrelated flaky API test, see Failures)

| Check | Result |
| --- | --- |
| lint | pass (eslint + prettier) |
| typecheck | pass |
| unit+api | web 205/205, scripts 55/55, api 260/261 in the full run (T-08-02 failed once, passed when its file was re-run alone: 12/12) |
| e2e | n/a, the step has no e2e or a11y specs |

## Definition of Done

| ID | Type | Result | Note |
| --- | --- | --- | --- |
| T-35-01 | unit | pass | `scripts/req/stack.test.mjs` (4 tests) |
| T-35-02 | unit | pass | `scripts/req/stack.test.mjs` |
| T-35-03 | unit | pass | `scripts/req/stack.test.mjs` (2 tests) |
| T-35-04 | unit | pass | `scripts/req/command.test.mjs` (2 tests) |
| T-35-05 | ci | manual/ci | needs a throwaway stack of two PRs on GitHub |
| T-35-06 | manual | manual/ci | herdr run |
| T-35-07 | manual | manual/ci | herdr run |
| T-35-08 | manual | manual/ci | herdr run |

## Failures

- `T-08-02` (not a step 35 test), `pnpm test`, `apps/api/src/images/images.test.ts:183`: `expect(await storage.list()).toEqual([])` received one leftover `trips/<id>/spots/<id>/<id>.webp`. Re-run alone (`vitest run src/images/images.test.ts`): 12/12 pass. Likely a timing flake when files run in parallel.

## Global DoD (G-1..G-10)

- G-1: ok, all automated T-35 tests pass; T-35-05 is CI-only.
- G-2: ok (lint and typecheck clean; `pnpm test` had the one flake above, which passed on re-run).
- G-3: n/a, no new routes.
- G-4: n/a, no UI strings.
- G-5: n/a, no UI.
- G-6: n/a, no UI.
- G-7: n/a, no data views.
- G-8: ok, README "Flow of a change" is guarded by T-35-04.
- G-9: n/a, no schema change.
- G-10: n/a, no user writes.
