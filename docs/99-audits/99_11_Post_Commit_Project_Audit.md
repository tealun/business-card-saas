# Audit #11 — 2026-07-06

## Scope

- Trigger: after commit `c287a77 chore: align db-first architecture`.
- Focus: database boundary, security, documentation, and feature alignment.
- Auto-selected depth: deep.
- Risk score: 13.
- Signals: auth/token paths, PII fields, tenant/RLS isolation, admin/bootstrap, database initialization, deployment readiness, miniprogram/admin client paths.

## Summary

- P0: 1
- P1: 5
- P2: 1
- Result: architecture direction is now cleaner after removing Prisma, but this is not ready for public/server exposure until the auth demo path and persistence boundary are tightened.

## Follow-Up Fixes Applied

- A11-P0-1 fixed: demo qy-login now requires `DEMO_AUTH_ENABLED=1`, is disabled in `NODE_ENV=production`, and only accepts `demo-qy-code`.
- A11-P1-4 partially fixed: production now fails fast when `DATABASE_URL` is missing. Full resolution still depends on A11-P1-1, because business repositories are not yet PgSQL-backed.
- A11-P1-5 fixed: production now fails fast when `CORS_ORIGINS` is empty.
- A11-P1-3 fixed: RLS validation now derives tenant-scoped tables from `database/schema.sql` and compares them against `database/rls.sql`, with explicit platform-table exceptions.
- A11-P2-1 clarified: `database/README.md` now documents `db:verify` as a destructive disposable-database probe only.

## P0 — Must Fix

| ID | Title | File | Line | Evidence | Fix |
|----|-------|------|------|----------|-----|
| A11-P0-1 | Demo qy-login is an auth bypass if deployed | `backend/src/auth/auth.repository.ts` | 27 | `resolveQyCode()` accepts any non-empty code and returns a fixed demo identity. `AuthService.qyLogin()` then signs a real bearer token. Miniprogram also falls back to `demo-qy-code` on qy-login failure in `miniprogram/utils/api.js:35`. | Add a production/staging guard that disables demo auth unless an explicit local-only flag is set. Then replace with real WeCom `jscode2session` before public deploy. |

## P1 — Should Fix Soon

| ID | Title | File | Line | Evidence | Fix |
|----|-------|------|------|----------|-----|
| A11-P1-1 | Runtime business data is still in memory, not PgSQL-backed | `backend/src/employee/employee-card.repository.ts`, `backend/src/public-card/public-card.repository.ts`, `backend/src/admin-bootstrap/owner-bootstrap.repository.ts` | 13, 23, 19 | Core employee card, public visits/actions/shares, and owner bootstrap state use `Map`. Restart loses data, `database/schema.sql` is not used by business APIs, and RLS cannot protect those flows yet. | Convert M1 repositories to SQL via `DatabaseService` / `TenantTx`: auth identity lookup, current card read/update/style, share/visit/action persistence, owner bootstrap token storage. |
| A11-P1-2 | `database/schema.sql` is not aligned with database docs | `docs/00-core/00_02_Database_Schema.md`, `database/schema.sql` | 14 | The database guide lists `wecom_suite_state`, `account_openid_bindings`, `tenant_external_customers`, `tenant_customer_owners`, `contact_ways`, `contact_way_states`, `licenses`, `api_quota_counters`, `audit_logs`, `callback_events`, and `growth_leads`, but the committed schema only creates the M1 subset. | Decide whether `schema.sql` is M1-only or full initial schema. If it is full, add the missing tables. If M1-only, rename/update docs so they do not imply those tables are already initialized. |
| A11-P1-3 | RLS validation can miss future tenant tables | `backend/scripts/validate-rls.cjs` | 7 | `tenantTables` is a hard-coded list, so adding a `tenant_id` table to `database/schema.sql` will not fail CI unless the list is manually updated. | Parse `database/schema.sql` for `tenant_id` tables and compare against `database/rls.sql`, with an explicit allowlist for platform tables. |
| A11-P1-4 | Production can start without a database while demo repositories serve data | `backend/src/database/database.service.ts`, `backend/src/auth/auth.repository.ts` | 13, 17 | `DatabaseService` only creates a pool when `DATABASE_URL` exists, and current routes do not require the pool because repositories are in memory. A misconfigured server could appear healthy while not using PgSQL. | Fail fast in production when `DATABASE_URL` is missing, and make health/readiness distinguish app boot from database readiness. |
| A11-P1-5 | CORS fails open when `CORS_ORIGINS` is empty | `backend/src/main.ts` | 11 | `allowed.length === 0` causes every origin to be accepted. This is convenient locally but unsafe for deployed admin/API surfaces. | In production, require a non-empty allowlist. Keep fail-open only for local development. |

## P2 — Nice To Have

| ID | Title | File | Line | Evidence | Fix |
|----|-------|------|------|----------|-----|
| A11-P2-1 | Real database probe remains unverified in this environment | `README.md`, `backend/scripts/db-verify.cjs` | 23, 247 | Static checks pass, but this machine has no Docker CLI / local PgSQL, so `npm run db:verify` has not executed against a real database after the Prisma removal. | Run `npm run db:verify` once on a disposable PgSQL database before treating server DB integration as green. |

## Verification Log

- Passed: `npm run typecheck`
- Passed: `npm test` — 4 suites / 16 tests
- Passed: `npm run lint`
- Passed: `npm run build`
- Passed: `npm run rls:validate`
- Passed: `npm audit --omit=dev`
- Passed: full-repo Prisma residue scan — no `Prisma`, `schema.prisma`, `@prisma/client`, or `prisma:` references remain outside historical git metadata.
- Not run: real `npm run db:verify`, because local Docker / PgSQL is unavailable in this environment.

## Fix Guide

1. A11-P0-1: block demo login outside local development before any server exposure.
2. A11-P1-1: wire the M1 repositories to PgSQL through `DatabaseService` / `TenantTx`.
3. A11-P1-2 and A11-P1-3: make schema/docs/RLS validation derive from the same database truth.
4. A11-P1-4 and A11-P1-5: add production fail-fast guards for `DATABASE_URL` and `CORS_ORIGINS`.
5. A11-P2-1: run the destructive database probe only on a disposable database.

## Deferred

- Full WeCom login and callback persistence remain blocked on M0-M1 credentials and server PgSQL access.
- M2/M3 admin content APIs and real content persistence are still staged after the M1 database-backed slice.
