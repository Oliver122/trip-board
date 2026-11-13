# Test report — Step 44 (2026-11-13)
**Verdict:** FAIL

| Check | Result |
| --- | --- |
| lint (eslint + prettier) | pass |
| typecheck | pass |
| unit+api (`pnpm test`) | web 217/217 pass; api 310–311/312 — flaky failures outside step 44 (see Failures) |
| e2e | n/a — step 44 defines no e2e/a11y spec (no UI) |
| scripts/overview.test.mjs | pass (20/20) |
| checks.sql | not run — no schema change |

## Definition of Done
| ID | Type | Result | Note |
| --- | --- | --- | --- |
| T-44-01 | unit | pass | `process-guards.test.ts` |
| T-44-02 | unit | pass | `deploy-restart.test.ts` |
| T-44-03 | unit | pass | `http/limit.test.ts` |
| T-44-04 | api | pass | `geocode/timeout.test.ts` |
| T-44-05 | unit | pass | `images/storage.test.ts`, `admin/webhook-timeout.test.ts` |
| T-44-06 | unit | pass | `db.test.ts` |
| T-44-07 | api | pass | `images/decode.test.ts` |
| T-44-08 | manual | pass | I-10/I-18/I-26 marked fixed, Restart note at SYSTEM_OVERVIEW.md:387, overview test passes |

## Failures
All 8 step-44 tests pass. Existing tests fail intermittently in the full run:
- Run 1: `images/file-size.test.ts:136` and `images/images.test.ts` T-08-05 (line 245)
- Run 2: `images/images.test.ts` T-08-05 only
- Command: `pnpm test` (apps/api). Both files pass when run alone.
- Error: `expect(await storage.list()).toEqual([])` received one `trips/.../*.webp` key.
- Likely cause: the bucket is shared across parallel test files, so a stray blob from another file (possibly a new step-44 test) breaks the global-empty assertion. Not confirmed.

## Global DoD (G-1..G-10)
- G-1: gap — the api suite is not green (flaky failures above)
- G-2: gap — `pnpm test` fails; lint and typecheck ok
- G-3: ok — no new routes
- G-4: ok — no UI strings
- G-5: ok — no UI
- G-6: ok — no UI
- G-7: ok — no new data views
- G-8: ok — SYSTEM_OVERVIEW updated
- G-9: ok — no DB schema change
- G-10: ok — no new user writes
