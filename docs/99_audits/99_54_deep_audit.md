# 99_54 — Deep Audit (exposure & log hygiene) — 2026-07-10

## Scope
- Range: HEAD `3c8810a` + uncommitted working-tree fix (DEMO_AUTH_ENABLED coercion)
- Auto-selected depth: **deep**
- Risk score: **≥ 9** (auth/JWT +3, PII+encryption +3, WeCom callbacks/crypto +3, admin surface +1, multi-tenant +1)
- Trigger: `/project-audit` (auto mode)

## Summary
- **P0: 0** | P1: 2 | P2: 2 | Fixed this session: 1
- Verdict: **mature, well-defended codebase.** No data-loss / auth-bypass / injection found. Findings are hardening items (info exposure + log hygiene), not breakage.

## Coverage Map (12 dimensions)
| # | Dim | Result |
|---|-----|--------|
| 1 | Architecture | ✅ Clean module boundaries; NestJS/Fastify; services↔repos separated |
| 2 | Platform integration | ✅ WeCom callback crypto: replay window + nonce dedup + timing-safe sig + receiveId check; execFile (no shell) migration runner |
| 3 | Security | ⚠️ 2 findings (raw 500 message leak, unauth metrics) — see below |
| 4 | Code efficiency | ✅ Parameterized queries, no obvious duplication |
| 5 | Runtime smoothness | ✅ Throttler (100/60s + adminMutation 3/300s), migration concurrency guard, timeouts on external calls |
| 6 | Info isolation | ✅ Card queries scoped `WHERE tenant_id=$1 AND id=$2`; `switchIdentity` account-scoped w/ ForbiddenException; **Postgres RLS validated in CI** |
| 7 | Data accuracy | ✅ Transactions used; callback idempotency present (prior audits 99_28) |
| 8 | Parameter passing | ✅ `accountId`/`tenantId` sourced from JWT session, never request body |
| 9 | UX | ✅ (miniprogram) loading/guest/failed auth states present |
| 10 | Coding standards | ✅ Consistent response envelope (`{code,message,data,trace_id}`), error-code map |
| 11 | Testing | ✅ 36 spec files / 92 src; CI enforces coverage 60/75/75/75, not skippable |
| 12 | Deploy & Ops | ✅ CI + deploy workflows; ⚠️ log redaction gap (P2-1) |

## Findings

### P1 — Should Fix Soon
| ID | Status | Title | File | Line | Evidence | Fix |
|----|--------|-------|------|------|----------|-----|
| A54-P1-1 | Open | `/api/v1/metrics` is unauthenticated | backend/src/metrics/metrics.controller.ts | 4-16 | `@Controller("metrics")` has **no `@UseGuards`**; global prefix applies and nginx `location /` proxies all → publicly reachable. Exposes prom-client default metrics (process/heap/version/event-loop). | Guard the route (admin guard or a dedicated scrape token), or deny `/api/v1/metrics` in nginx and scrape it only from the internal network. |
| A54-P1-2 | Open | 500 responses return raw internal error message | backend/src/common/api-exception.filter.ts | 24-40 | `errorMessage()` returns `exception.message` for a generic `Error`; a `pg` error (constraint/column names, query fragments) is sent to the client on unhandled 500s. | For non-`HttpException` (status 500), return a fixed generic message (`"internal server error"`); keep the real message only in the server log via `trace_id`. |

### P2 — Nice to Have
| ID | Status | Title | File | Line | Evidence | Fix |
|----|--------|-------|------|------|----------|-----|
| A54-P2-1 | Open | No pino log redaction for auth header / login code | backend/src/app.module.ts | 24-28 | `pinoHttp` sets only `level`; no `redact`. On error-level request serialization the `authorization: Bearer <token>` header (and `/auth/*-login` `code` body) can be written to logs. | Add `redact: { paths: ["req.headers.authorization", "req.body.code"], censor: "[redacted]" }` to `pinoHttp`. |
| A54-P2-2 | Open | In-memory WeCom nonce dedup won't cover multi-instance | backend/src/wecom/wecom-callback-crypto.service.ts | 30-33 | `seenNonces` is a per-process `Map` (already noted in a code comment). Behind a load balancer with >1 instance, replays can slip to a different instance within the 5-min window. | When scaling horizontally, move nonce dedup to Redis/shared cache. Not urgent at single-instance. |

## Fixed This Session (not re-opened)
- **DEMO_AUTH_ENABLED string-coercion footgun** — `z.coerce.boolean()` treated `"0"`/`"false"` as `true`, crashing prod startup. Replaced with strict `booleanFlag()` token parser + regression tests; `.env.example` corrected. (backend/src/config/app-config.ts, .env.example, app-config.spec.ts — 14 tests green.)

## Fix Guide
1. **A54-P1-2** (smallest, highest value): in `ApiExceptionFilter.catch`, when `!(exception instanceof HttpException)` set `message = "internal server error"`; log the real error server-side keyed by `trace_id`.
2. **A54-P1-1**: add `@UseGuards(AdminAuthGuard)` to `MetricsController` **or** block `location = /api/v1/metrics { deny all; }` in nginx and scrape from localhost.
3. **A54-P2-1**: add `redact` to `pinoHttp`.
4. **A54-P2-2**: track for the horizontal-scaling milestone only.

## Doc Updates Needed
- None. Interfaces unchanged.
