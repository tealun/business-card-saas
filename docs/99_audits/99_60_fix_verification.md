# 99_60 — 99_59 Fix Verification — 2026-07-13

## Scope
- Baseline: `main@bbb3ab26e6155a9cffb0b22490c325499b8e9b29`; dirty worktree containing the uncommitted 99_59 fixes.
- Method: inspected the complete working-tree diff, re-traced affected paths, checked audit status/deferred records, and reran the backend test suite.
- Result: 40/40 suites and 189/189 tests passed; `git diff --check` passed.

## Verdict
- Verified complete: A59-P1-1, P1-6, P1-8, P1-9, P2-1, P2-7, P2-8.
- Existing production guard verified: A59-P2-11 (`AppConfig` rejects production startup without `DATABASE_URL`).
- Correctly deferred: A59-P1-2, P1-4, P1-7, P2-2, P2-3, P2-4, P2-5, P2-6, P2-10.
- Rejected original finding: A59-P1-10; Compose project interpolation already fails closed through `${VAR:?message}`.
- Needs correction: A59-P1-3, P1-5 and P2-9 are marked `Fixed` but do not yet satisfy their documented invariant.

## Findings

### P1 — Should Fix

| ID | Type | Confidence | Status | Title | Evidence | Required completion |
|----|------|------------|--------|-------|----------|---------------------|
| V60-P1-1 | Confirmed | High | Open | Migration execution still trusts an arbitrary configured directory | `resolveDatabaseDir()` still returns `path.resolve(DATABASE_DIR)` without an allowed-root check. The change executes `<database_dir>/scripts/migrate.cjs` directly, so a directory containing a matching `package.json`, `migrations/`, and script remains executable. Existing tests only use arbitrary temp directories and do not assert rejection. | Resolve the canonical expected database directory/allowed roots, compare real paths (including symlink handling), and add a rejection test. Until then A59-P1-3 must not be `Fixed`. |
| V60-P1-2 | Confirmed | High | Open | Visitor identity invariant remains nullable and statistics now undercount null identities | `database/schema.sql:164` and `migrate_v1_1.sql:169` still allow nullable `anon_id`. The new `count(DISTINCT COALESCE(visitor_account_id::text, anon_id))` excludes rows where both values are null. Other identity comparisons at `public-card.repository.ts:495` and `:713-714`, plus recent visitors at `employee-card.repository.ts:123`, still fall back to row IDs. No migration, backfill, NOT NULL constraint, or partial unique like index was added. | Define/backfill a non-null visitor identity, make all metrics/dedup paths use the same identity expression, add the intended like uniqueness constraint or equivalent transaction-safe control, and test null/duplicate cases. Until then A59-P1-5 must not be `Fixed`. |

### P2 — Should Correct

| ID | Type | Confidence | Status | Title | Evidence | Required completion |
|----|------|------------|--------|-------|----------|---------------------|
| V60-P2-1 | Confirmed | High | Open | Request PII redaction does not cover nested/dynamic card fields | Redaction covers top-level `mobile`, `phone`, `email`, and `wechat_id`, but update contracts send PII under `req.body.fields.*`; tests demonstrate payloads such as `fields.email`, `fields.mobile`, and `fields.wechat_id`. There is no redaction test. | Redact known nested paths (and any intentionally logged dynamic field container) and add a logger/redaction test. Until then A59-P2-9 must not be `Fixed`. |
| V60-P2-2 | Confirmed | High | Open | Audit statuses conflate fixed, rejected, and pre-existing controls | A59-P1-10 remains typed `Confirmed` but is marked `Declined`, although verification calls it a rejected false positive. A59-P2-11 is marked `Fixed` although no fix was applied; the control pre-existed. A59-P1-3/P1-5/P2-9 are prematurely `Fixed`. | Restore incomplete items to `Open` or `Deferred`; record rejected candidates in the verification log rather than as `Declined`; describe P2-11 as an existing control/rejected finding. |

## Regression Review
- The tenant/card ownership guard was applied consistently to all five `public_card_directory` upserts found in production TypeScript sources.
- Removing the second member-status transaction is consistent with `AdminManagementRepository.updateMemberCard`, which already updates and reloads within one `TenantTx`.
- Error-code mappings have direct tests for 422/429/503.
- The Docker health command is compatible with the Alpine/BusyBox runtime image.
- Dependency upgrade is locked and the full backend suite passes.

## Verification Gaps
- No live PostgreSQL migration/RLS verification was run in this review.
- No WeChat developer-tool runtime test exists for the demo-auth environment check.
- GitHub Actions and Docker image execution were inspected statically, not executed remotely.
