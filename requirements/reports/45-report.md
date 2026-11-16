# Test report — Step 45 (2026-11-16)
**Verdict:** PASS (T-45-02 pending: manual on the host, needs a deploy)

| Check | Result |
| --- | --- |
| lint (eslint + prettier) | pass |
| typecheck | pass |
| unit + api (`pnpm test`) | pass — web 221/221, api 325/325 |
| `pnpm db:check` | pass — 86 schema checks |
| e2e (`insights`, `service-health`, dev-login admin axe, chromium) | pass — 9/9 |
| `pnpm req:check` | OK (46 steps, 397 core rules) |

## Definition of Done
| ID | Type | Result | Note |
| --- | --- | --- | --- |
| T-45-01 | manual | pass | step 44 `**Status:** integrated 2026-11-13`; C-OPS-54/55 in core/ops.md; req:build/req:check OK |
| T-45-02 | manual | not-run (pending) | needs a deploy; run on host: `kill <api pid>`, `/api/health` answers within ~10 s, restart visible in `journalctl`. Record the outcome here |
| T-45-03 | e2e | pass | e2e/insights.spec.ts:7 |
| T-45-04 | unit | pass | apps/web/src/locales.test.ts:221 |
| T-45-05 | api | pass | apps/api/src/admin/insights.test.ts:223 |
| T-45-06 | db | pass | schema tests + `db:check` 86 ok; counters.test.ts:59 |
| T-45-07 | api | pass | apps/api/src/ops/counters.test.ts:104,128 |
| T-45-08 | api | pass | apps/api/src/housekeeping/runs.test.ts |
| T-45-09 | api | pass | apps/api/src/admin/ops.test.ts:54 |
| T-45-10 | e2e | pass | e2e/service-health.spec.ts:6 (plus seed.test.ts, ServiceHealth.test.tsx) |
| T-45-11 | api | pass | apps/api/src/admin/ops.test.ts:104,127 |

## Failures
None.

## Global DoD (G-1..G-10)
- G-1: ok, except T-45-02 (manual, pending deploy)
- G-2: ok
- G-3: ok (`ops.test.ts` covers the new routes; not audited line by line for every 401/403 case)
- G-4: ok (locales test passes for en and de)
- G-5: ok (axe passes on the dashboard with the panel, en and de)
- G-6: ok (service-health spec captures the dashboard; 768 px not verified separately)
- G-7: not verified in this run
- G-8: ok (docs and requirements modified)
- G-9: ok (migration 0008, schema.sql and checks.sql updated, 86 checks pass)
- G-10: n/a (admin run-now writes `admin_audit_log`, covered by T-45-11)
