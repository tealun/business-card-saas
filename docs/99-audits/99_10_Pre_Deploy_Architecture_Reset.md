# Audit #10 — 2026-07-06

## Scope

- Trigger: project is not deployed yet; user explicitly allowed bottom/framework-level changes without migration compatibility constraints.
- Reviewed: API spec v1.2, miniprogram guide v1.2, database schema guide v1.2, design brief, `database/schema.sql`, RLS SQL, backend response framework, admin/miniprogram clients.
- Depth: deep architecture reset.

## Findings

### P1 — Framework / Contract Drift

| ID | Finding | Evidence | Fix |
|----|---------|----------|-----|
| A10-P1-1 | API spec requires unified `{ code, message, data, trace_id }`, but backend returned raw objects. | `docs/01-specs/01_02_Api_Spec.md` §1 vs controller tests expecting raw bodies. | Added global `ApiResponseInterceptor` and `ApiExceptionFilter`; updated tests and clients to unwrap `data`. |
| A10-P1-2 | New enterprise content/style model existed only in docs, not in initial schema. | `00_02` §5 lists `company_profiles`, `company_videos`, `company_honors`, `company_honor_images`, `card_style_overrides`; schema lacked all. | Merged tables/indexes/FKs/partial unique indexes into `database/schema.sql`. |
| A10-P1-3 | New tenant tables were not covered by RLS. | RLS file only covered M1 base tables. | Added RLS policies and validation coverage for `templates`, enterprise content tables, and style overrides. |

### P2 — Readiness Improvements

| ID | Finding | Fix |
|----|---------|-----|
| A10-P2-1 | `db:verify` did not grant/truncate newly added tables. | Updated probe role grants and reset order. |
| A10-P2-2 | Admin/miniprogram clients assumed raw response bodies. | Updated shared request wrappers to unwrap response envelopes. |

## Architecture Decisions

- Because no environment has been deployed, M2 content/style tables and owner bootstrap tables were folded into one initialization SQL file, not kept as staged compatibility files.
- Partial unique indexes such as active-only `card_style_overrides` are enforced directly in `database/schema.sql`; the database remains the only schema authority.
- Public content package remains supported in demo repositories; persistence tables are now ready for replacing in-memory demo data after server PgSQL is available.

## Verification

- `npm run typecheck`
- `npm test`
- `npm run lint`
- `npm run build`
- `npm run rls:validate`
- `node -c scripts/db-verify.cjs`
- `node --check` for admin and miniprogram JS files

## Remaining External Gate

- Real PostgreSQL execution of `npm run db:verify` still requires your server/test database. Use `DB_VERIFY_ALLOW_NONLOCAL=1` only on disposable test DBs because the probe resets M1 tables.
