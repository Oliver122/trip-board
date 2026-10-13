# Test report — Step 33 (2026-10-12)
**Verdict:** PASS (T-33-12 is manual and still open; `pnpm test` is red only through an unrelated uncommitted edit, see Failures)

| Check | Result |
| --- | --- |
| lint (eslint + prettier) | pass |
| typecheck | pass |
| unit+api | web 197/197, api 261/261 pass; `test:req` 2 fail (unrelated, below) |
| e2e (chromium, this run: place-link, share, pwa, a11y-share, a11y-places + dev-login) | 33 passed (with the step 34 specs) |
| e2e (head agent, chromium+mobile, full) | 222 passed |
| db checks | not run for this step (no schema change in 33; `psql` is not installed on this host) |

## Definition of Done
| ID | Type | Result | Note |
| --- | --- | --- | --- |
| T-33-01 | unit | pass | apps/web/src/import/url-coords.test.ts |
| T-33-02 | api | pass | apps/api/src/places/places.test.ts |
| T-33-03 | api | pass | apps/api/src/places/places.test.ts |
| T-33-04 | api | pass | apps/api/src/places/places.test.ts |
| T-33-05 | e2e | pass | e2e/place-link.spec.ts |
| T-33-06 | e2e | pass | e2e/place-link.spec.ts, model.test.ts |
| T-33-07 | e2e | pass | e2e/share.spec.ts |
| T-33-08 | e2e | pass | e2e/pwa.spec.ts |
| T-33-09 | unit | pass | apps/web/src/share/bookmarklet.test.tsx |
| T-33-10 | a11y | pass | e2e/a11y-share.spec.ts, e2e/a11y-places.spec.ts |
| T-33-11 | unit | pass | apps/web/src/locales.test.ts |
| T-33-12 | manual | manual/ci | Real Android/desktop/iPhone check not done; no `placed: false` links noted |

## Failures
- `pnpm test` → `test:req` T-30-01/T-30-03: `req:check failed: 2 problems` (`core/ops.md:44: C-OPS-21: T-21-17 is not a Definition of Done row`, and a stale `INDEX.md`). Cause: uncommitted, unrelated edit to `requirements/21-ci-cd.md`. The committed version passes (head agent: test:req 6/6). Not a step 33 failure.

## Global DoD (G-1..G-10)
- G-1: ok (step tests pass; CI not run here)
- G-2: gap — lint and typecheck ok, `pnpm test` red from the unrelated 21-ci-cd.md edit
- G-3: ok (T-33-02 covers the new route's 200/400/403/404/429)
- G-4: ok (T-33-11)
- G-5: ok (T-33-10)
- G-6: gap — no 1280/768 screenshots attached by this run
- G-7: ok (unplaceable and error states covered in T-33-06)
- G-8: ok (README and .env.example modified)
- G-9: ok (no schema change in this step)
- G-10: gap — not verified (spot is saved through the existing add route)
