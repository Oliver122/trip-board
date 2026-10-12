# Test report — Step 31 (2026-10-12)
**Verdict:** PASS (step 31 automated checks); T-31-06 manual still pending

| Check | Result |
| --- | --- |
| lint (eslint + prettier) | pass |
| typecheck | pass |
| unit + api | web 173/173, api 227/227 pass |
| `pnpm test` overall | fail only in `test:req` (T-30-04, T-30-05), unrelated to step 31 (see Failures) |
| e2e chromium (scroll, delete-icons, a11y, spots, comments, polish, cleanup) | 73 passed, 0 failed |
| e2e WebKit + Firefox (`pnpm test:e2e:docker`, run by head agent) | 26 passed, 0 failed, 4 skipped (dev-login teardown project) |

Notes: shared e2e server on 127.0.0.1:5180, not started or stopped. Chromium only here, since WebKit cannot launch on this host. Schema unchanged, so checks.sql was not run.

## Definition of Done
| ID | Type | Result | Note |
| --- | --- | --- | --- |
| T-31-01 | e2e | pass | e2e/scroll.spec.ts |
| T-31-02 | e2e | pass | scroll.spec.ts, 1280 and 768 px |
| T-31-03 | e2e | pass | scroll.spec.ts |
| T-31-04 | e2e | pass | scroll.spec.ts |
| T-31-05 | unit | pass | AppShell, modal, SpotList tests |
| T-31-06 | manual | manual/ci (pending) | NOT done on a real phone (iOS Safari, Android Chrome) |
| T-31-07 | unit | pass | SpotPanel, EntryDialog, SpotDiscussion tests |
| T-31-08 | e2e | pass | e2e/delete-icons.spec.ts |
| T-31-09 | e2e | pass | delete-icons.spec.ts |
| T-31-10 | e2e | pass | delete-icons.spec.ts |
| T-31-11 | a11y | pass | e2e/a11y.spec.ts:103 |

## Failures
- `pnpm test` → `test:req`: T-30-04 and T-30-05 fail with "req:check failed: 1 problem". Cause: the uncommitted edit to `requirements/21-ci-cd.md` (missing Core/Status/Result lines, T-21-17 renamed to T-21-17P). Not step 31.

## Global DoD (G-1..G-10)
- G-1: gap. All step 31 tests pass locally; the CI run is not confirmed, and T-31-06 is pending.
- G-2: gap. lint and typecheck ok; `pnpm test` fails only in test:req (21-ci-cd.md, unrelated).
- G-3: ok, n/a (no new routes).
- G-4: ok (en and de keys added; unit tests pass).
- G-5: ok (T-31-11 axe passes).
- G-6: gap. Screenshots not attached because no PR exists yet.
- G-7: ok, n/a (no new data views).
- G-8: ok (requirements/core and INDEX updated; no setup change).
- G-9: ok, n/a (no schema change).
- G-10: ok, n/a (no new writes).
