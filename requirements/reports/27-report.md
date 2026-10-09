# Test report — Step 27 (2026-10-09)
**Verdict:** PASS (Chromium and Firefox); WebKit cannot launch on the local host (see open items)

| Check | Result |
| --- | --- |
| lint | pass — eslint clean; `prettier --check .` exits 0 (`.claude` is in `.prettierignore`) |
| typecheck | pass (shared, api, web) |
| unit + api | pass — web 38 files / 96 tests; api 34 files / 185 tests |
| e2e `cleanup.spec.ts`, chromium, `--repeat-each=10` | pass — 160 of 160 (16 tests × 10) plus the 4 dev-login teardown tests |
| e2e 401 test, `--repeat-each=20` | pass — 20 of 20 |
| e2e `cleanup.spec.ts`, firefox | pass — 16 of 16 (2 dev-login teardown tests skip on Firefox as before) |
| e2e `cleanup.spec.ts`, webkit | not run — `browserType.launch: Host system is missing dependencies to run browsers` (CachyOS is not a Playwright WebKit host) |
| full e2e suite (chromium + mobile + teardown), 3 runs in a row | pass — 133 of 133 three times |
| db checks | not run (no schema change) |

## Root causes (R-27-01)
Each cause was reproduced before the fix.

| Test | Cause | Evidence | Fix |
| --- | --- | --- | --- |
| T-26-06 discard, delete comment, clear stay | All three signed in as the seeded `aiko` and ran in parallel. Two of them call `setLocale(page, 'de')`, which stores German on aiko's account, so the other test's page renders German mid-test | `--repeat-each=3`: delete-comment failed 2 of 3. Failure snapshot shows `textbox "Kommentar hinzufügen"` and `combobox "Kategorie"` while the test waited for `'Add a comment'` | Every cleanup test that sets a language uses a fresh user; seeded users are read-only |
| T-26-10 401 redirect | `clearCookies()` let any background request (live `/events` reconnect or a refetch) get the 401 first. The app correctly redirected to `/login` before the test clicked `Members`, and the click waited 30 s for a button that no longer existed ("element was detached") | `-g "401" --repeat-each=20`: 1 of 20 failed. The page snapshot at failure is the Log in page; nothing was clicked | Keep the cookies; answer only `**/api/trips/*/members**` and then `**/api/me` with 401, click `Members`, expect `/login`. 20 of 20 |
| T-26-04 avatar menu `End` | App bug. `Menu.openAndFocus` moved focus in `requestAnimationFrame`, so the menu was visible before focus moved. A key pressed in that gap (`End`) went to the trigger, which ignores it, then the frame focused the first item | Unit test with the old code: both new T-27-04 tests fail, focus is on `<body>` | Focus moves in a `useLayoutEffect` before paint (`pendingFocus` ref); rAF removed. Regression tests in `components/ui/menu.test.tsx` fail before and pass after |
| Full suite: `comments` T-24-17, `map-board` T-05-02, `live` T-19-12 (found during this step) | Same class as T-26-06 across files: `import.spec` stored `de` on `aiko`, `map-board` T-05-05 on `sven`, `comments` T-24-13 on `tom` (restored in `finally`, but parallel specs read the account while it was German) | Three full runs: 3, 4 and 5 failures; snapshots show German UI (`Kontomenü`, `Karte`, `Aktivitäten`) in tests that set English | New `e2e/locale.ts` `showLocale(page, locale)` rewrites that page's `GET /api/me` and writes nothing; the three specs use it |
| Full suite: `admin` T-16-13, T-16-16 | The tests clicked `link "Aiko"` on the first page of `/admin/users`. Every run adds fresh test users (more after this step's fixes), so Aiko fell off the first page | Snapshot: 59 links, the first page is all `u1791542…` test users | `openAiko()` searches the list by name first |

No retries, sleeps, `test.slow()` or raised timeouts were added; the two 90 s / 120 s timeouts in `cleanup.spec.ts` were removed and the tests pass at the default.

One more full run (before the three clean ones) failed 4 tests in `schedule` and `responsive` with "Execution context was destroyed … because of a navigation". It started while `apps/web/src/structure-lint.ts` was being edited; Vite reloads every open page on a change under `src/`. The three runs after the last edit were clean.

## Definition of Done
| ID | Type | Result | Note |
| --- | --- | --- | --- |
| T-27-01 | manual | pass | the table above |
| T-27-02 | ci | pass | `structure-lint.test.ts`: cleanup rule plus a suite-wide rule; flags the pre-step `import`, `comments` and `map-board` specs, passes on the repo |
| T-27-03 | ci | pass | `structure-lint.test.ts` T-27-03; `playwright.config.ts` unchanged |
| T-27-04 | unit | pass | `menu.test.tsx` T-27-04 ×2; fail on the old code, pass on the fix |
| T-27-05 | e2e | pass | 20 of 20 |
| T-27-06 | e2e | pass | `T-26-16 shared step 26 labels exist in en and de` |
| T-27-07 | ci | pass | `pnpm exec prettier --check .` exits 0 |
| T-27-08 | e2e | pass | 160 of 160; full suite 133 of 133 three times in a row |
| T-27-09 | e2e | partial | Firefox 16 of 16, no `@chromium` tag needed. WebKit cannot launch locally; CI (step 21) runs it |
| T-27-10 | manual | pass | all 11 components of the T-26-17 list are in `docs/DESIGN.md` "Components", and every linked file and export exists |

## Global DoD (G-1..G-10)
- G-1: ok locally; WebKit only in CI
- G-2: ok
- G-3, G-9, G-10: n/a — no routes, schema or writes changed
- G-4: ok — no new UI strings
- G-5, G-6, G-7: n/a — no new UI; the menu change keeps its markup
- G-8: ok — this report; `docs/DESIGN.md` unchanged

## Open items
- WebKit e2e has to be confirmed in CI.
- `dev-login.spec.ts` still stores German on `sven` by design; it runs alone as a teardown, and the specs that use `sven` set English first.
- Fresh test users accumulate in the local e2e database across runs. Nothing depends on the count any more, but a reset in `pnpm dev:e2e` would keep the admin list small.
