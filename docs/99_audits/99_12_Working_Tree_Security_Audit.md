# Audit #12 — 2026-07-06

## Scope

- Trigger: working-tree review after commit `c287a77 chore: align db-first architecture` and the uncommitted follow-up fixes recorded in audit #11.
- Focus: auth/session tokens, tenant/RLS isolation, public visit/attribution surface, admin bootstrap, input validation, deploy readiness.
- Auto-selected depth: deep.
- Risk score: 13 (auth + session tokens, PII fields, tenant/RLS isolation, admin/bootstrap, DB init, miniprogram/admin clients).
- Backend stack: NestJS 11 + Fastify, `pg` (raw SQL), Zod 4. All M1 business repositories are still in-memory `Map`s.

## Summary

- P0: 0 (live) — the audit #11 P0 demo-auth bypass is mitigated; see "Verified from #11".
- P1: 1
- P2: 4
- Deploy state: not deployable as an auth system yet. In `NODE_ENV=production` the only login path (`qy-login`) returns 503 because real WeCom `jscode2session` is not implemented. This is a functional gap, not a live vulnerability.

## Fixes Applied (this session)

All five findings were fixed and verified (`typecheck` / `lint` / `rls:validate` / `build` clean, 19/19 tests):

- ✅ A12-P1-1: added `AnonIdService` (HMAC over `v1.anon.<value>` with `VISIT_TOKEN_SECRET`). `createVisit` now trusts an inbound `anon_id` only when its signature verifies, else issues a fresh signed id. `anonIdSchema` widened to allow the signature segment. New regression test covers reuse + forgery rejection.
- ✅ A12-P2-1: `EmployeeCardService.createShare` registers the share via `PublicCardRepository.registerRootShare`; `PublicCardModule` now exports the repository and `EmployeeCardModule` imports it.
- ✅ A12-P2-2: both `SessionTokenService` and `VisitTokenService` HMAC inputs are domain-prefixed (`v1.session.` / `v1.visit.`), so the two families can never validate across purposes even under a shared secret.
- ✅ A12-P2-3: `DatabaseService.ping()` + `GET /api/v1/health/ready` — returns pool status and 503 when a configured pool is unreachable (liveness `GET /health` unchanged).
- ✅ A12-P2-4: `PublicCardRepository.createVisit` resolves `share` through `resolveShareId`, dropping unknown/foreign share ids instead of recording spoofed attribution.

## Verified From Audit #11 (fixes hold)

- ✅ A11-P0-1 mitigated: `AuthRepository.demoAuthEnabled()` = `NODE_ENV !== "production" && DEMO_AUTH_ENABLED === "1"`, and `resolveQyCode` only accepts the exact `demo-qy-code` (`auth.repository.ts:40`). Production returns `ServiceUnavailable`.
- ✅ A11-P1-3 fixed: `validate-rls.cjs` now parses `database/schema.sql` for `tenant_id BIGINT NOT NULL` tables and diffs against `rls.sql` with an explicit platform allowlist (`admin_claim_tokens`, `public_card_directory`).
- ✅ A11-P1-4 (half): `DatabaseService` throws when `DATABASE_URL` is missing in production (`database.service.ts:13`). Readiness half still open — see A12-P2-3.
- ✅ A11-P1-5 fixed: `main.ts:11` throws when `CORS_ORIGINS` is empty in production; fail-open remains dev-only.
- ✅ Secrets guard: `readSecret()` throws in production if `JWT_SECRET` / `VISIT_TOKEN_SECRET` are left at the `dev-only-change-me` fallback.
- ⚠️ A11-P1-1 still open (by design, M1): employee card, public visit/action/share, and owner bootstrap state remain in memory. Restart loses data; RLS cannot protect flows that never touch PgSQL.

## P1 — Should Fix Soon

| ID | Title | File | Line | Evidence | Fix |
|----|-------|------|------|----------|-----|
| A12-P1-1 | Client-supplied `anon_id` is trusted unsigned, regressing the audit #06 signed-anon_id decision | `backend/src/public-card/public-card.service.ts` / `public-card.controller.ts` / `contracts/public-card.ts` | 34, 20, 5 | `visitRequestSchema` accepts `anon_id` from the request body, validated only by format regex, then stored verbatim as the anonymous unique-visitor key. The server-generated `anon_id` returned to the client is a plain random token with no signature. Any client can forge or replay another visitor's `anon_id`, poisoning UV dedup and per-visitor attribution — the product's core analytic. Audit #06 explicitly resolved UV dedup to a **server-signed** `anon_id`; current code drops the signature. | Sign the issued `anon_id` (HMAC, same pattern as `VisitTokenService`) and reject inbound `anon_id`s that fail verification; or issue it as an opaque signed cookie/token. Impact is latent while repos are in-memory but becomes real the moment `card_visits` is PgSQL-backed. |

## P2 — Nice To Have

| ID | Title | File | Line | Evidence | Fix |
|----|-------|------|------|----------|-----|
| A12-P2-1 | Employee-issued share IDs are never registered, so `shares/derive` only works from the seed demo share | `backend/src/employee/employee-card.repository.ts` / `public-card.repository.ts` | 111, 138 | `EmployeeCardRepository.createShare()` mints a `shr_…` id but never inserts it anywhere `PublicCardRepository.shares` (a separate `Map`, seeded only with `shr_demo0001`) can see. `deriveShare` looks up `parent_share_id` in that map, so any real employee share → `400 parent share not found`. | Persist shares in one store (resolved when M1 moves to PgSQL `card_shares`); until then, register employee shares in the shared repository. |
| A12-P2-2 | HMAC token schemes lack domain separation | `backend/src/session/session-token.service.ts` / `public-card/visit-token.service.ts` | 64, 50 | Both sign `base64url(payload)` with HMAC-SHA256 using independently-read secrets. If an operator ever sets `JWT_SECRET == VISIT_TOKEN_SECRET`, a token minted for one service is signature-valid for the other; only incidental payload-shape/scope checks (`publicId` mismatch) currently block cross-use. | Prefix the signed message with a version+type context (e.g. `v1.session.` / `v1.visit.`) so the two token families can never validate across purposes regardless of secret config. |
| A12-P2-3 | `/health` reports healthy with no DB readiness probe | `backend/src/health.controller.ts` | 6 | Returns `{ ok: true }` unconditionally. Audit #11 A11-P1-4 asked to distinguish app boot from DB readiness; only the prod fail-fast half was applied. A load balancer will route traffic to an instance whose pool is absent/unreachable. | Add a readiness endpoint that runs `SELECT 1` through `DatabaseService` and reports pool state separately from liveness. |
| A12-P2-4 | `visit.share` is recorded without verifying the share exists or belongs to the card | `backend/src/public-card/public-card.repository.ts` | 114 | `createVisit` stores `request.share` as-is with no lookup. A well-formed but nonexistent/foreign `share_id` is recorded, breaking share→visit chain integrity and enabling attribution spoofing. | Validate `share` against `card_shares` for the same `public_id` before persisting (natural once the share store is PgSQL-backed and RLS-scoped). |

## Verification Log (external anchor — L level)

- ✅ `npm run typecheck` — clean.
- ✅ `npm run lint` — clean.
- ✅ `npm run rls:validate` — RLS baseline validated against `schema.sql` + `rls.sql`.
- ✅ `npm test` — 4 suites / 18 tests passed.
- Not run: real `npm run db:verify` (no local Docker/PgSQL in this environment); business APIs are in-memory so a live DB probe is not yet meaningful.
- Confirmed no live P0: production `qy-login` is gated off; there is currently no other auth path in production (functional gap, tracked below).

## Deferred / Carried

- A11-P1-1 (SQL-back M1 repositories) and A11-P1-2 (schema vs. docs table-set decision) remain open and gate real deployment. A12-P1-1, P2-1, and P2-4 all resolve naturally as part of that PgSQL migration and should be folded into its acceptance criteria.
- Real WeCom `jscode2session` login + callback persistence remain blocked on M0–M1 credentials and server PgSQL access.

## Fix Guide

1. A12-P1-1: sign the `anon_id` and reject unverified inbound values before wiring `card_visits` to PgSQL.
2. A12-P2-2: add version+type domain separation to both HMAC token schemes (cheap, do now).
3. A12-P2-3: split liveness vs. readiness with a real DB probe.
4. A12-P2-1 / A12-P2-4: converge share storage and validate share→card ownership during the M1 SQL migration.
