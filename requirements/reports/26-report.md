# Test report — Step 26 (2026-10-09)
**Verdict:** FAIL

| Check | Result |
| --- | --- |
| lint | FAIL — eslint clean; `prettier --check` flags 9 untracked/modified `.claude/**/*.md` files (not app code) |
| typecheck | pass (shared, api, web) |
| unit + api | pass — api 34 files / 185 tests; web 38 files / 89 tests |
| e2e (`e2e/cleanup.spec.ts`, chromium) | FAIL — flaky: 3 runs gave 2, 3 and 2 failures, different tests each time (13-15 of 17 passed) |
| db checks | not run (no schema change) |

## Definition of Done
| ID | Type | Result | Note |
| --- | --- | --- | --- |
| T-26-01 | unit | pass | components/ui/modal.test.tsx |
| T-26-02 | e2e | pass | cleanup.spec.ts |
| T-26-03 | unit | pass | menu.test.tsx |
| T-26-04 | e2e | fail (flaky) | failed in 1 of 3 runs, passed in the others |
| T-26-05 | unit | pass | confirm.test.tsx |
| T-26-06 | e2e | fail (flaky) | 3 sub-tests (discard, delete comment, clear stay); failed in all full runs, passed when run in isolation |
| T-26-07 | unit | pass | select.test.tsx |
| T-26-08 | e2e | pass | |
| T-26-09 | unit | pass | api/http.test.ts |
| T-26-10 | e2e | fail (flaky) | the 401 redirect test timed out once; the conflict test passed |
| T-26-11 | api | pass | trips/roles.test.ts |
| T-26-12 | api | pass | http/params.test.ts |
| T-26-13 | api | pass | http/error-shape.test.ts, errors.test.ts |
| T-26-14 | ci | pass | web/src/structure-lint.test.ts |
| T-26-15 | a11y | pass | cleanup.spec.ts (en, de, confirm) |
| T-26-16 | unit | missing | no test carries the ID; the generic locale missing-key test may cover it |
| T-26-17 | manual | manual | `docs/DESIGN.md` has a "Components" section (line 513); content not verified |

## Failures
- T-26-06 `pnpm test:e2e e2e/cleanup.spec.ts --project=chromium` — `expect(locator).toBeVisible() failed` (discard); `locator.selectOption: Test timeout of 30000ms exceeded, waiting for getByLabel('Category')` (clear stay); delete-comment timed out the same way.
- T-26-04 — `expect(locator).toBeFocused() failed: menuitem 'Log out' Expected: focused, Received: inactive`.
- T-26-10 (401 test) — `locator.click: Timeout 30000ms; waiting for button 'Members' ... element was detached from the DOM, retrying`.
- lint — prettier warnings: `.claude/commands/req-*.md`, `.claude/step26*`.

## Global DoD (G-1..G-10)
- G-1: gap — e2e flaky (see above)
- G-2: gap — lint fails on prettier of `.claude/*.md`; typecheck and test ok
- G-3: ok — T-26-12 and T-26-13 cover id params and error bodies
- G-4: ok — web unit tests pass; T-26-16 has no explicit ID
- G-5: ok — T-26-15 passes
- G-6: not checked (no screenshots attached)
- G-7: not checked
- G-8: not checked
- G-9: ok — no schema change
- G-10: ok — no new writes
