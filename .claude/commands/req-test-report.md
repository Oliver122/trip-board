---
description: Run a step's Definition of Done tests and write a test report (cheap Sonnet 5.5, low effort)
argument-hint: <step number, e.g. 07>
model: claude-sonnet-5-5
effort: low
---

Produce a test report for step `$ARGUMENTS`. Read-only for source code: do not fix anything.

1. Read `requirements/$ARGUMENTS-*.md` and the global DoD in `requirements/README.md`.
2. Run: `pnpm lint`, `pnpm typecheck`, `pnpm test`, and the step's e2e/a11y specs (`pnpm test:e2e <spec files for this step>`). Run `docs/database/checks.sql` only if the step changed the schema. Capture pass/fail counts and the first lines of each failure.
3. Map each `T-$ARGUMENTS-xx` to a result: `pass`, `fail`, `missing` (no test found), or `manual/ci` (not automated). Find tests by grepping the ID in `apps/`, `packages/`, `e2e/`.
4. Write `requirements/reports/$ARGUMENTS-report.md`:

```
# Test report — Step NN (<date>)
**Verdict:** PASS | FAIL
**Core:** <core IDs from the step's `**Core:**` line / `## Core changes` table, or —>; `pnpm req:check` pass | fail
| Check | Result |
| lint / typecheck / unit+api / e2e |
## Definition of Done
| ID | Type | Result | Note |
## Failures
<test id, command, short error excerpt>
## Global DoD (G-1..G-10)
<one line each: ok / gap>
```

   Fill the **Core** line: list the core IDs the step changes and run `pnpm req:check` (add its first failing lines if it fails; a failing `req:check` makes the verdict FAIL).
5. Reply with the verdict, the failing/missing IDs and the report path. Keep it short.
