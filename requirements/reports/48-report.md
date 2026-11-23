# Test report — Step 48 (2026-11-23)
**Verdict:** PASS (T-48-03 and the throwaway half of T-48-08 still need a pull request; 3 e2e failures are environmental, not step 48)

| Check | Result |
| --- | --- |
| lint (eslint + prettier) | pass |
| typecheck | pass |
| unit+api | pass: web 72 files / 267 tests, api 62 / 344, scripts 133 (0 failures) |
| e2e (chromium, full run from head agent notes, not rerun) | 319 passed, 3 failed (T-34-05, T-34-08, T-34-09; environment, see Failures). Step 48 has no e2e specs |
| req:check | OK (49 steps, 397 core rules) |
| deadcode (knip) | exit 0, no output |
| check:bundle | 252704 B gzip (budget 256000) |

## Definition of Done
| ID | Type | Result | Note |
| --- | --- | --- | --- |
| T-48-01 | api | pass | `apps/api/src/images/test-storage.test.ts` |
| T-48-02 | manual | pass | `pnpm test` 3 runs in a row, 0 failures: web 72/267, api 62/344, scripts 133 tests (head agent, final tree); api suite 62/344 again in this run |
| T-48-03 | ci | manual/ci | needs a throwaway PR; `failOnFlakyTests: !!process.env.CI` is set in `playwright.config.ts:27`; not yet run |
| T-48-04 | unit | pass | `scripts/eslint-test-hygiene.test.mjs` |
| T-48-05 | unit | pass | `scripts/req/req.test.mjs` |
| T-48-06 | ci | pass locally | `pnpm req:check` exits 0; `untagged-tests.json` has 2 entries (`e2e/00-webgl.spec.ts`, `e2e/ui-review/capture.spec.ts`); CI run pending |
| T-48-07 | unit | pass | `scripts/deadcode.test.mjs` |
| T-48-08 | ci | manual/ci | `pnpm deadcode` exits 0 locally; CI `static` run and the throwaway-commit half are pending |
| T-48-09 | manual | pass | checklist below |

### T-48-09 checklist
- Files removed: 0. Dependencies removed: 0 (unlisted `estree` fixed with a JSDoc type).
- `export` keyword dropped: 172.
- Code deleted: `BarChart`, `HorizontalChart`, `kindLabels`, `spotSubtitle`, `formatWallClock`, 4 `*RetentionDays` constants, `resetDataSaverState`, `resetMapGate`, `resetPlaceNames`, `isShownPhoto`, `resetShownPhotos`, the `categories` const, `export { spotImportLimit }`, `export type { MeResponse }`.
- Duplicate aliases removed: `activityEventSchema`, `createCommentSchema`, `patchCommentSchema`.
- knip ignore/entry entries (reasons are in `knip.jsonc`): `ignoreDependencies` `@fontsource/inter` and `tailwindcss` (CSS `@import` only); entries `apps/web/public/sw.js` (registered by path) and `apps/web/src/photobook/fixtures/make-fixtures.mjs` (CLI only); ignore `scripts/deadcode/fixtures/**` (inputs of T-48-07).
- Open point: `scripts/**/*.mjs` are entries, so unused exports in repo scripts are not reported.
- `pnpm test` pass, `pnpm check:bundle` pass (252704 B), e2e chromium 319/322 (failures environmental).
- `git grep "migrated.sql|reference.sql"` outside docs/requirements: no hits. I-33 is marked "fixed in step 48" in `docs/SYSTEM_OVERVIEW.md:434`.

## Failures
Not step 48 defects. From the head agent's full run `pnpm test:e2e --project chromium` (not rerun here):
- T-34-09 `add-photos.spec.ts:17`, T-34-08 `photo-suggestions.spec.ts:9`, T-34-05 `web-photos.spec.ts:16`: "Image limit reached". The local e2e seed user Aiko holds 102 images against a quota of 100, left over from local runs on 2026-10-12..16. They fail again when rerun alone. CI uses a fresh database. Suggest an issue: the step 34 specs leak images into the shared seed user.

## Global DoD (G-1..G-10)
- G-1: gap, CI-only tests (T-48-03, T-48-08) pending the PR run
- G-2: ok
- G-3: ok, no new routes
- G-4: ok, no UI strings added
- G-5: ok, no new UI
- G-6: ok, no new UI
- G-7: ok, no new data views
- G-8: ok (I-33 updated; check that README/docs mention `pnpm deadcode`)
- G-9: ok, no schema change; checks.sql not run
- G-10: ok, no new writes
