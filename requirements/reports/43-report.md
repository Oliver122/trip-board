# Test report — Step 43 (2026-10-25)
**Verdict:** PASS (all T-43 tests pass; remaining e2e failures are environment/flaky, none in step 43 code)

| Check | Result |
| --- | --- |
| lint (eslint + prettier) | pass |
| typecheck | pass (shared, api, web) |
| unit + api | pass — api 288/288, web 217/217, `test:req` 127/127 |
| e2e (chromium + firefox, `file-size-limit`, `a11y`, `dev-login`) | 25 passed, 1 failed, 2 skipped |
| e2e `images.spec.ts` | T-08-11 fails (environment, see below) |
| e2e webkit | all fail to launch: host lacks browser dependencies (`playwright install-deps`) |

## Definition of Done
| ID | Type | Result | Note |
| --- | --- | --- | --- |
| T-43-01 | db | pass | `apps/api/src/db/file-size-limit.test.ts`; includes the `docs/database/checks.sql` check, passes |
| T-43-02 | api | pass | `images/file-size.test.ts` |
| T-43-03 | api | pass | `images/file-size.test.ts` |
| T-43-04 | api | pass | `admin/file-size.test.ts` |
| T-43-05 | api | pass | `images/file-size.test.ts` |
| T-43-06 | api | pass | `images/file-size.test.ts` |
| T-43-07 | unit | pass | `images/wikimedia.test.ts` |
| T-43-08 | api | pass | `images/wikimedia-links.test.ts` |
| T-43-09 | api | pass | `images/wikimedia-links.test.ts` |
| T-43-10 | unit | pass | `web/src/images/reasons.test.ts` |
| T-43-11 | e2e | pass | chromium + firefox (both tests); webkit not runnable here |
| T-43-12 | e2e | pass | chromium + firefox; no webkit run |
| T-43-13 | a11y | pass | chromium + firefox; webkit not runnable here |

## Failures
- **T-08-11** (`e2e/images.spec.ts:13`, chromium/webkit) — environment: seeded user aiko already has 100/100 images from earlier runs (as told by the head agent). Not step 43. Likewise T-34-09 and T-34-08 (not re-run here).
- **T-08-12** webkit — browser launch failure (see below).
- **T-15-09** (`e2e/a11y.spec.ts:7`, firefox) — `Test timeout of 120000ms exceeded` plus `browserContext.close: Protocol error`. The same test passed on chromium (1.8 min, close to the limit); a slow multi-page axe run, not step 43 code. In the first full run it also failed on chromium, so it is flaky under load.
- **All webkit projects** (T-15-09, T-31-11, T-42-19, T-32-10, T-43-11, T-43-13, T-08-11/12, T-22-08/09) — `browserType.launch: Host system is missing dependencies to run browsers`. Environment.

## Global DoD (G-1..G-10)
- G-1: ok for T-43 on chromium and firefox; gap: webkit not runnable on this host.
- G-2: ok.
- G-3: ok — 413/400/401/403/404 covered in the new api tests (not individually audited).
- G-4: ok — T-43-13 and the lint rules cover `en`/`de` keys.
- G-5: ok — T-43-13 passes axe on chromium and firefox.
- G-6: gap — no screenshots checked in this run.
- G-7: not checked (no new data view).
- G-8: ok — `PROJECT_SCOPE.md`, `SYSTEM_OVERVIEW.md` and `DATABASE.md` modified.
- G-9: ok — migration `0007_file_size_limit.sql` exists; `checks.sql` passes inside T-43-01.
- G-10: ok — audit rows asserted in T-43-03 and T-43-04.
