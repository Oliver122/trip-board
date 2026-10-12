# Test report — Step 34 (2026-10-12)
**Verdict:** PASS (T-34-14 is manual and still open; `pnpm test` is red only through an unrelated uncommitted edit, see Failures)

| Check | Result |
| --- | --- |
| lint (eslint + prettier) | pass |
| typecheck | pass |
| unit+api | web 197/197, api 261/261 pass; `test:req` 2 fail (unrelated, below) |
| e2e (chromium, this run: web-photos, photo-suggestions, add-photos, a11y-photos + step 33 specs) | 33 passed |
| e2e (head agent, chromium+mobile, full) | 222 passed |
| db checks | T-34-12 passes in `db/web-photos.test.ts`; `checks.sql` not run directly (`psql` not installed on this host) |

## Definition of Done
| ID | Type | Result | Note |
| --- | --- | --- | --- |
| T-34-01 | api | pass | apps/api/src/images/web-images.test.ts |
| T-34-02 | api | pass | web-images.test.ts |
| T-34-03 | api | pass | web-images.test.ts |
| T-34-04 | unit | pass | apps/web/src/images/drop.test.ts |
| T-34-05 | e2e | pass | e2e/web-photos.spec.ts |
| T-34-06 | api | pass | web-images.test.ts, housekeeping/jobs.test.ts |
| T-34-07 | api | pass | web-images.test.ts |
| T-34-08 | e2e | pass | e2e/photo-suggestions.spec.ts |
| T-34-09 | e2e | pass | e2e/add-photos.spec.ts |
| T-34-10 | e2e | pass | e2e/web-photos.spec.ts |
| T-34-11 | a11y | pass | e2e/add-photos.spec.ts, e2e/a11y-photos.spec.ts |
| T-34-12 | db | pass | apps/api/src/db/web-photos.test.ts |
| T-34-13 | unit | pass | apps/web/src/images/locales.test.ts |
| T-34-14 | manual | manual/ci | Real Chrome/Firefox drag check not done |

## Failures
- `pnpm test` → `test:req` T-30-01/T-30-03: `req:check failed: 2 problems` (`core/ops.md:44: C-OPS-21: T-21-17 ...`, stale `INDEX.md`). Cause: uncommitted, unrelated edit to `requirements/21-ci-cd.md`. The committed version passes. Not a step 34 failure.
- Chromium only; WebKit cannot launch on this host.

## Global DoD (G-1..G-10)
- G-1: ok (step tests pass; CI not run here)
- G-2: gap — lint and typecheck ok, `pnpm test` red from the unrelated 21-ci-cd.md edit
- G-3: ok (T-34-02, T-34-06, T-34-07, T-34-10 cover 400/403/404/422/502)
- G-4: ok (T-34-13)
- G-5: ok (T-34-11)
- G-6: gap — no 1280/768 screenshots attached by this run
- G-7: ok (empty and retry states in T-34-08, failed-photo toast in T-34-09)
- G-8: ok (README and docs/database modified)
- G-9: ok (migration 0006, schema.sql updated; T-34-12). `checks.sql` not run directly
- G-10: ok (`image.upload` event with source covered in T-34-01 and T-34-07)
