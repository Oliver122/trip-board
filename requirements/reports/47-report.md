# Test report — Step 47 (2026-11-23)
**Verdict:** PASS (all step 47 tests pass on chromium; one known environment failure in an older spec, not a step 47 defect)

| Check | Result |
| --- | --- |
| lint (eslint + prettier) | pass |
| typecheck | pass |
| unit + api | pass — web 267/267, api 343/343 |
| e2e (--project=chromium: photobook, photobook-upload, images, schedule, live) | 25 passed, 1 failed (T-08-11, environment); webkit not run (missing system libs) |
| checks.sql (`pnpm db:check`) | pass — 94 schema checks |

## Definition of Done
| ID | Type | Result | Note |
| --- | --- | --- | --- |
| T-47-01 | db | pass | `apps/api/src/db/photobook.test.ts`; checks.sql 94 ok |
| T-47-02 | api | pass | `apps/api/src/images/photos.test.ts` |
| T-47-03 | api | pass | `photos.test.ts` |
| T-47-04 | api | pass | `photos.test.ts` |
| T-47-05 | e2e | pass (chromium) | `e2e/photobook.spec.ts:26` |
| T-47-06 | e2e | pass (chromium) | `e2e/photobook.spec.ts:113` |
| T-47-07 | unit | pass | `apps/web/src/photobook/exif.test.ts` |
| T-47-08 | e2e | pass (chromium) | `e2e/photobook-upload.spec.ts:25` |
| T-47-09 | e2e | pass (chromium) | `e2e/photobook.spec.ts:236` |
| T-47-10 | e2e | pass (chromium) | `e2e/photobook.spec.ts:378` |
| T-47-11 | e2e | pass (chromium) | `e2e/photobook.spec.ts:181` |
| T-47-12 | a11y | pass (chromium) | `e2e/photobook.spec.ts:430`, light and dark |

## Failures
- T-08-11 (`e2e/images.spec.ts:13`, chromium): `pnpm test:e2e e2e/images.spec.ts --project=chromium` — `waiting for getByRole('progressbar', { name: 'Uploading' }) to be visible`, timeout 30 s. Per the head agent: seed user aiko's quota is full (100 gallery images from earlier test runs in the local DB). Environment, not a step 47 defect; not re-verified here.
- WebKit/Firefox projects not run (WebKit cannot launch on this host).

## Global DoD (G-1..G-10)
- G-1: ok on chromium (all T-47 pass); webkit not run
- G-2: ok
- G-3: ok (photos routes covered in `photos.test.ts`; not audited per status code)
- G-4: ok (lint and tests pass; no separate audit of de/en keys)
- G-5: ok (T-47-12)
- G-6: not verified (screenshots at 1280/768 not checked)
- G-7: not verified (loading/empty/error states per R-47-06 not separately tested)
- G-8: ok (README and docs modified in the working tree)
- G-9: ok (migration 0009, checks.sql 94 ok)
- G-10: ok (`image.upload` / `image.update` activity rows tested in T-47-02/04)
