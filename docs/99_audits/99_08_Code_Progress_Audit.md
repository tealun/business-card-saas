# Audit #08 — 2026-07-06

## Scope

- Range: current working tree on `main` after M1 backend skeleton changes.
- Files reviewed: backend source, database SQL, RLS SQL, local Docker/database verification scripts, M1 task/spec docs.
- Auto-selected depth: deep.
- Risk score: 12.
- Signals: auth/token paths, PII fields, tenant/admin/RLS isolation, public API writes, database initialization, deployment configuration.

`git pull` was intentionally not run because the working tree already contained local uncommitted changes. Audit findings are against the current local tree.

## Summary

- P0: 0
- P1: 3
- P2: 2
- Baseline checks passed before fixes: `npm run typecheck`, `npm test`, `npm run lint`, `npm audit --audit-level=moderate`.

## P1 — Should Fix Soon

| ID | Title | File | Line | Evidence | Fix |
|----|-------|------|------|----------|-----|
| A8-P1-1 | `db:verify` SQL splitter breaks on PostgreSQL `DO $$ ... $$` blocks | `backend/scripts/db-verify.cjs` | 37 | `splitSql` uses raw `.split(";")`, but the same script executes RLS and role setup containing procedural blocks with semicolons. A real database run can split blocks into invalid fragments, blocking the SQL/RLS probe. | Replace with a dollar-quote aware SQL splitter or avoid splitting procedural SQL. Add syntax/unit coverage for the splitter. |
| A8-P1-2 | Owner bootstrap response leaks `token_hash` | `backend/src/contracts/admin-bootstrap.ts`, `backend/src/admin-bootstrap/owner-bootstrap.service.ts` | 17, 44 | Project docs require claim token hash to be persisted only and plaintext to be one-time delivered. Current response returns both `claim_token` and `token_hash`, increasing accidental logging/exposure surface. | Keep hash internal to repository/tests; remove `token_hash` from public result schema and response. |
| A8-P1-3 | Production token secrets are not enforced | `backend/src/session/session-token.service.ts`, `backend/src/public-card/visit-token.service.ts` | 15, 50 | Both services silently fall back to `dev-only-change-me`. That is acceptable for local demo, but dangerous if `NODE_ENV=production` is started without configured secrets. | Fail fast in production when `JWT_SECRET` or `VISIT_TOKEN_SECRET` is missing or still the dev default. |

## P2 — Nice to Have

| ID | Title | File | Line | Evidence | Fix |
|----|-------|------|------|----------|-----|
| A8-P2-1 | Public share derivation is specified but missing in code | `docs/01-specs/01_02_Api_Spec.md`, `backend/src/public-card/public-card.controller.ts` | 62, 1 | Spec requires `POST /public/cards/{public_id}/shares/derive` for customer resharing, but backend only has GET, visit, and actions. | Add the endpoint in the M1 demo repository with visit_token scope check, parent share validation, and depth cap. |
| A8-P2-2 | Script linting does not cover backend scripts | `backend/package.json` | 8 | `npm run lint` only covers `src/**/*.ts`; `scripts/*.cjs` can regress without lint or focused tests. | Add light script coverage where scripts are risk-bearing, starting with `db-verify` splitter tests or syntax checks in docs/CI. |

## Verification Log

- Verified A8-P1-1: `backend/scripts/db-verify.cjs:37-41` uses raw semicolon split; same file has `DO $$` blocks at lines 54-62 and 77-83.
- Verified A8-P1-2: response schema includes `token_hash` at `backend/src/contracts/admin-bootstrap.ts:17-22`; service returns it at `backend/src/admin-bootstrap/owner-bootstrap.service.ts:44-49`; docs say "只存 hash，明文一次性下发" at `docs/00-core/00_01_Dev_Doc.md:1944`.
- Verified A8-P1-3: session/visit token services use `process.env.* ?? "dev-only-change-me"` with no production guard.
- Verified A8-P2-1: API spec lists `/shares/derive`; public controller does not implement it.

## Fix Guide

1. Fix A8-P1-1 before relying on `npm run db:verify` as a deployment gate.
2. Fix A8-P1-2 before exposing owner bootstrap through an API controller or admin UI.
3. Fix A8-P1-3 before any deployed environment uses real users or real enterprise data.
4. Implement A8-P2-1 as the next M1 backend endpoint after safety fixes.

## Deferred

- Real PostgreSQL execution of `npm run db:verify` remains blocked on this machine because Docker/psql are unavailable.
- Real enterprise WeCom integration remains blocked on M0-M1 gate credentials and callback configuration.
