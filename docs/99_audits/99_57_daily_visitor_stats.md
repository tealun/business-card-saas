# 99_57 — daily changes: visitor stats, likes, card styling & storage — 2026-07-12

## Scope
- Range: `cc8d6d9..72e396c` (8 commits, 58 files, +3028 / -358)
- Auto-selected depth: **deep** (capped at config default `max_depth: deep`)
- Risk score: **12** — auth/session tokens (+3), PII on cards: phone/email/address/IP (+3), file upload/data-URL avatars & backgrounds (+3), multi-tenant + RLS isolation (+3); medium: public API routes, DB writes, runtime DDL
- Today's commits:
  - `9394383` feat: improve card styling and sharing flows
  - `1cbd020` fix: keep employee card preview stable after schema drift
  - `c7bc371` fix: avoid empty json body admin requests
  - `5edb4d4` fix: allow signed visitor anon ids
  - `86befe6` feat: align public card visitor experience
  - `9aca9cb` fix: refine public card visitor layout
  - `b65e787` fix: refine public visitor stats and owner actions
  - `72e396c` fix: 修复小程序前端样式和Bug

## Health gate (verified)
- `tsc --noEmit`: **0 errors**
- `npm run lint`: **clean**
- Affected suites (`public-card`, `employee-card`, `database-schema`, `storage`): **27 passed / 27**

## Summary
- **P0: 0 | P1: 3 (3 fixed) | P2: 4 (3 fixed, 1 declined)**
- Health re-run after fixes: full suite **186 passed / 186 (40 suites)** — all green.
- No hardcoded secrets introduced (secret scan clean; matches were SVG namespace URIs).
- Tenant isolation preserved: all new stats/like queries are wrapped in `tenantTx.run(directory.tenantId, …)` and every SQL predicate is scoped by `tenant_id = $1`. ✅ (dim 6)
- Storage upload path is well-guarded: MIME allowlist, `storageMaxUploadBytes` cap, `safeSegment` + `resolveLocalKey` path-traversal guard. ✅
- Visit/like abuse is server-enforced via `visit_token` verification + per-anon dedup; client `isOwnCard` is UX-only. ✅

## Findings

### P1 — Should Fix Soon
| ID | Status | Title | File | Line | Evidence | Fix |
|----|--------|-------|------|------|----------|-----|
| S-P1-1 | Fixed | IP hashed with unkeyed SHA-256 (PIPL / reversible) | [backend/src/public-card/public-card.service.ts](backend/src/public-card/public-card.service.ts#L162) | 162 | `createHash("sha256").update(\`v1.ip.${normalized}\`)` — no secret salt; IPv4 space (2^32) is trivially brute-forced, so `ip_hash` is effectively reversible PII | Use keyed HMAC with an existing secret (e.g. `createHmac("sha256", readSecret("VISIT_TOKEN_SECRET"))`), same as `AnonIdService.issueStable` |
| A-P1-1 | Fixed | Runtime DDL guard duplicates migrations (3 sources of truth + needs DDL priv) | [backend/src/database/database-schema-guard.service.ts](backend/src/database/database.module.ts#L1) | — | `onModuleInit` ran `ALTER TABLE` on every boot, duplicating `migrate_v1_5/v1_6`; required runtime DDL privileges | Owner has already migrated. Removed `DatabaseSchemaGuard` (service + spec deleted), dropped it from `DatabaseModule`, removed now-dead `DatabaseService.isConfigured()`. Schema is now owned solely by `schema.sql` + `database/migrations` |
| T-P1-1 | Fixed | Broken test from today's commits: personal card `company` expectation stale | [backend/src/auth/auth-employee.controller.spec.ts](backend/src/auth/auth-employee.controller.spec.ts#L174) | 174 | Today's employee-card change sets `company: session.identityType === "personal" ? null : …`, but the test still asserted `card.company).toBe("个人名片")`; CI was red. Failed identically on `72e396c` before any audit fix | Owner decision: a personal card shows **no company** unless a company short name is set. Updated the test to `expect(card.company).toBeNull()`; the `null` behavior in code is correct |

### P2 — Nice to Have
| ID | Status | Title | File | Line | Evidence | Fix |
|----|--------|-------|------|------|----------|-----|
| B-P2-1 | Fixed | Dead code + misleading trust_level for fingerprint path | [backend/src/public-card/public-card.service.ts](backend/src/public-card/public-card.service.ts#L100) | 100-111 | `resolveAnonId(request, session, ipHash)` — `ipHash` param and `const fingerprint = request.fingerprint?.trim()` are both computed but never used; anonymous fingerprinted visitors still get a fresh random `anon_id`, yet the visit is stored with `trust_level = "anonymous_fingerprint"` (dim 7 data accuracy: label implies dedup that does not happen) | Removed unused `fingerprint`/`ipHash`; `trust_level` now honestly `anonymous_client` |
| B-P2-2 | Fixed | Global 8 MB body limit exposed to public unauthenticated endpoints | [backend/src/main.ts](backend/src/main.ts#L11) | 11-33 | `bodyLimit: 8 * 1024 * 1024` applied to all routes including public `POST /public/cards/:id/visit` | Global default lowered to 1 MB; an `onRoute` hook raises it to 8 MB only for the image-upload routes (`employee/cards/current[/style]`, `admin/company-profile`, `admin/templates[/:id]`, `admin/members/:id/card`) |
| S-P2-1 | Fixed | `x-forwarded-for` / `x-real-ip` trusted without proxy allowlist | [backend/src/public-card/public-card.controller.ts](backend/src/public-card/public-card.controller.ts#L18) | 18-40 | Client-supplied forwarding headers were read directly; spoofable | Enabled Fastify `trustProxy: "loopback"` (BaoTa/Nginx proxies from 127.0.0.1) and switched the controller to `@Ip()` / `request.ip`; spoofed headers are ignored on any non-loopback direct hit |
| M-P2-1 | Declined | Historical migration edited in place (immutability) | [database/migrations/migrate_v1_1.sql](database/migrations/migrate_v1_1.sql#L169) | 169 | `anon_id` widened to `VARCHAR(128)` in the base migration | Owner decision: keep `VARCHAR(128)` in `migrate_v1_1.sql` so fresh installs get the wider column directly; `migrate_v1_6.sql` covers already-migrated DBs. Narrowing to 64 would truncate signed anon ids — intentionally kept wide |

## 12-Dimension coverage
| # | Dim | Verdict |
|---|-----|---------|
| 1 | Architecture | OK — clean service/repo/tx layering; **A-P1-1** runtime-DDL boundary blurs the migration boundary |
| 2 | Platform integration | N/A for this diff — no WeCom/SDK surface touched today |
| 3 | Security | OK — token verification intact; **S-P1-1** (ip hash), **S-P2-1** (forwarded headers) |
| 4 | Code efficiency | OK — stats use 2–3 scoped aggregates; **B-P2-1** dead code |
| 5 | Runtime smoothness | OK — optimistic like/visit UI with server reconciliation |
| 6 | Info isolation | OK — all new SQL scoped by `tenant_id` inside `tenantTx.run` |
| 7 | Data accuracy | Mostly OK — visitor/visit/like dedup by `COALESCE(visitor_account_id, anon_id, id)`; owner previews excluded; **B-P2-1** trust_level mislabel |
| 8 | Parameter passing | OK — Zod schemas validate visit/action/style bodies incl. `website z.url()`, `email z.email()` |
| 9 | UX | OK — empty/disabled/owner states, like-once guard, theme restore fallback |
| 10 | Coding standards | OK — lint/tsc clean; response envelope consistent (`stats` added to contracts) |
| 11 | Testing | Good — new specs for stats/like dedup, owner-preview exclusion, schema drift, storage materialization (27 tests) |
| 12 | Deploy & Ops | **A-P1-1** runtime DDL requires elevated DB grants; otherwise no infra change |

## Fix Guide
1. **S-P1-1** ✅ done — `hashIp` now uses `createHmac(readSecret("VISIT_TOKEN_SECRET"))`.
2. **A-P1-1** ✅ done — removed `DatabaseSchemaGuard` (owner already migrated); schema owned by `schema.sql` + migrations only.
3. **B-P2-1** ✅ done — deleted unused `ipHash` param + `fingerprint` local; `trust_level` honest.
4. **B-P2-2** ✅ done — global limit 1 MB, `onRoute` raises upload routes to 8 MB.
5. **S-P2-1** ✅ done — `trustProxy: "loopback"` + `@Ip()`.
6. **M-P2-1** ⊘ declined — owner keeps `VARCHAR(128)` in `migrate_v1_1.sql` (narrowing would truncate signed anon ids).
7. **T-P1-1** ✅ done — personal card shows no company unless a short name is set; stale test updated to `toBeNull()`.

### Verification Log (2026-07-12)
- ✅ S-P1-1 / B-P2-1 / A-P1-1 / B-P2-2 / S-P2-1 / T-P1-1 — `tsc --noEmit` clean, `eslint` clean; full suite **186/186 (40 suites)** pass. (not yet committed)

## Doc Updates Needed
- `docs/00-core/00_02_Database_Schema.md` — note `card_visits.anon_id` is now `VARCHAR(128)` (signed anon ids) and document `card_actions.action_type` new values `like_card`, `exchange_card`.
- `docs/01-specs/01_02_Api_Spec.md` — document the `stats` object on public-card / visit / action responses and the new `fingerprint` visit field.
