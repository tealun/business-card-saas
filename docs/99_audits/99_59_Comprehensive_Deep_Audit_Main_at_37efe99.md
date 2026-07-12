# 99_59 — Comprehensive Deep Audit — 2026-07-12

## Scope
- Repository: `business-card-saas` (`https://github.com/tealun/business-card-saas`)
- Baseline: `main` @ `37efe9905b5d6fe67f3d77b566df3f47d54250fd`
- Worktree: clean; no uncommitted changes
- Audited by: 青雲蝦 (Hermes) with `project-audit` skill v2.5.0
- Auto-selected depth: **deep**
- Risk score: **≥ 9** (auth/JWT +3, PII/encryption +3, WeCom callbacks/crypto +3, admin surface +1, multi-tenant +1)

## Health Checks
| Command | Result |
|---------|--------|
| `backend npm run typecheck` | ✅ 0 errors |
| `backend npm run lint` | ✅ 0 errors |
| `backend npm test` | ✅ 186 passed / 40 suites |
| `backend npm run build` | ✅ success |
| `database npm run rls:validate` | ✅ CI enforced (run locally via script) |
| `backend npm audit` | ⚠️ 8 vulnerabilities (1 low, 4 moderate, 3 high) |

## Summary
- **P0: 0**
- **P1: 10**
- **P2: 11**

Verdict: **mature, well-defended codebase.** No confirmed data-loss, auth-bypass, or injection vulnerabilities. Most findings are structural hardening, data-accuracy, and operational hygiene issues that should be addressed before scaling to production traffic or horizontal deployment.

## System Goal & Critical Paths
- **Goal:** Employees share electronic business cards via WeChat mini-program; enterprise authorization and identity come from WeCom third-party application; tenant data is isolated; visitor actions and shares are tracked.
- **Protected properties:** tenant isolation, cardholder identity, visitor privacy, access-token integrity, WeCom credential security.

| Path | Health | Dimensions |
|------|--------|------------|
| Employee login (wx.qy.login / wx.login) | Healthy | 2, 3, 8 |
| Card share → public visit → action | At risk | 2, 5, 7, 9 |
| Admin card/member status mutation | At risk | 6, 7, 10 |
| WeCom authorization / suite token / corp token | Healthy | 2, 3, 12 |
| Database migration (owner-triggered) | At risk | 3, 10, 12 |
| Public card read with `visit_token` | Healthy | 3, 5, 8 |

## 12-Dimension Coverage Map

| # | Dimension | Result |
|---|-----------|--------|
| 1 | 架构 Architecture | ✅ NestJS modular; service/repository/controller separated. ⚠️ Admin console is a static-HTML monolith despite README claiming React/Vite/Ant Design. |
| 2 | 平台对接 Platform integration | ⚠️ WeCom API client has timeout + 3x retry but no circuit breaker or idempotent retry keys; contact sync is N+1. |
| 3 | 安全防护 Security | ✅ Strong: RLS, HMAC-signed domain-separated tokens, AES-GCM field encryption, scrypt passwords, demo-auth blocked in production, pino redact for auth/code. ⚠️ `public_card_directory` has no RLS on write; admin migration runs `npm run migrate` from configurable `cwd`. |
| 4 | 代码高效 Code efficiency | ⚠️ Contact sync N+1; duplicate `TEMPLATE_BACKGROUNDS`/`PRESET_BACKGROUNDS` constants in 5 mini-program pages. |
| 5 | 运行流畅 Runtime smoothness | ⚠️ WeCom outage causes hard failures; global 100/min throttle may be too permissive for public endpoints; no circuit breaker. |
| 6 | 信息隔离 Info isolation | ✅ Tenant RLS + `TenantTx` for business tables. ⚠️ `public_card_directory` intentionally lacks RLS; ON CONFLICT update allows `tenant_id`/`card_id` overwrite, and `public_id` is deterministic from `tenantId` + `memberIdentityId`. |
| 7 | 数据准确 Data accuracy | ⚠️ Visitor/like metrics fall back to primary key, inflating counts when `anon_id`/`visitor_account_id` is null; admin card/member status update uses two transactions. |
| 8 | 参数传递 Parameter passing | ✅ Internal IDs sourced from JWT/session, not request body. ⚠️ Raw `@Param` strings are not validated before repository use. |
| 9 | 用户体验 UX | ⚠️ Mini-program silently swallows errors in public card page; demo-auth flag is not environment-aware. |
| 10 | 编码规范 Coding standards | ✅ Consistent response envelope and trace IDs. ⚠️ Error-code mapper omits 429/422/503; raw migration stdout returned; admin console has no lint/tests. |
| 11 | 测试验证 Testing | ✅ 186 tests, CI enforces 60/75/75/75 coverage; RLS validation in CI. |
| 12 | 部署运维 Deploy & Ops | ⚠️ `docker-compose.yml` variable interpolation issue; Dockerfile lacks `HEALTHCHECK`; CI has no smoke test or rollback; `npm audit` 8 vulnerabilities in dev-dependency tree. |

## Confirmed Strengths
- `DEMO_AUTH_ENABLED` is rejected in production via `app-config.ts` super-refine.
- Passwords use `scrypt` with OWASP baseline parameters.
- `TenantTx.run` sets `app.tenant_id` transaction-scoped before each tenant query.
- Session/admin tokens are domain-separated HMAC (`v1.session.` / `v1.admin-session.`) with `timingSafeEqual`.
- CORS origins, helmet, pino redact for `authorization` and `code` are configured.
- CI enforces typecheck, lint, test coverage, and RLS validation on every PR/push.

## Verification Gaps
- WeCom callback replay/nonce verification was not fully re-traced in this pass (covered in prior audits 99_14–99_38).
- End-to-end WeCom live authorization and jscode2session were not exercised (requires real enterprise and app credentials).
- Full dependency tree exploitability for the 8 npm audit advisories was not manually confirmed; they are transitive dev dependencies of `@nestjs/cli` and may not affect runtime.

## Findings

### P0 — Must Fix
None.

### P1 — Should Fix Soon

| ID | Type | Confidence | Status | Title | Dimension | File | Line | Evidence | Fix |
|----|------|------------|--------|-------|-----------|------|------|----------|-----|
| A59-P1-1 | Confirmed | High | Open | `public_card_directory` lacks RLS; ON CONFLICT can overwrite `tenant_id`/`card_id` | Info isolation | `database/rls.sql:88`; `database/schema.sql:129-139`; `backend/src/auth/personal-identity.repository.ts:364-372`; `backend/src/admin-management/admin-management.repository.ts:588-594` | 88 / 364 / 588 | `rls.sql` explicitly notes "no tenant RLS"; upserts update `tenant_id = EXCLUDED.tenant_id, card_id = EXCLUDED.card_id` on PK conflict; `public_id` is deterministic `sha256(employee-card:${tenantId}:${memberIdentityId})` | Add RLS write policy scoped to `app.tenant_id`, or change `ON CONFLICT` to only update `status`/`card_updated_at` (never `tenant_id`/`card_id`) and require tenant match in `WHERE` clause. |
| A59-P1-2 | Confirmed | High | Open | State-less session/admin tokens cannot be revoked | Security | `backend/src/session/session-token.service.ts:14-16`; `backend/src/admin-auth/admin-session-token.service.ts:14-16` | 14 | HMAC tokens carry only `exp`; no denylist or session store | Keep short TTLs; add Redis/cache revocation list keyed by `jti` if tokens gain one, or by `(account_id, issued_before)` for admin deactivation; document this as accepted residual for MVP. |
| A59-P1-3 | Confirmed | High | Open | Admin migration endpoint spawns `npm run migrate` from configurable directory | Security / Ops | `backend/src/admin-database/admin-database.service.ts:67-79` | 67 | `execFileAsync(executable, ["run", "migrate"], { cwd: before.database_dir, env: process.env, ... })`; `database_dir` comes from `DATABASE_DIR` env | Validate `database_dir` against an allowlist (e.g., must be `database` or `../database`), drop `env: process.env`, and prefer `node scripts/migrate.cjs` directly. |
| A59-P1-4 | Confirmed | Medium | Open | WeCom API client lacks circuit breaker and idempotent retry keys | Platform integration / Runtime | `backend/src/wecom/wecom-api-client.service.ts` (full file) | entire | `maxRetries=3` and `httpTimeoutMs` exist, but no circuit breaker; retry uses exponential backoff without idempotency keys; token endpoints can cascade failures | Add a circuit breaker around suite/corp token endpoints and a fallback cache for recently valid tokens. Include idempotency keys for non-idempotent calls if WeCom supports them. |
| A59-P1-5 | Confirmed | High | Open | Visitor/like metrics fall back to row id, inflating counts | Data accuracy | `backend/src/employee/employee-card.repository.ts:103-112`; `backend/src/public-card/public-card.repository.ts:458-462`, `468-478` | 103 / 458 / 468 | `count(DISTINCT COALESCE(visitor_account_id::text, anon_id, id::text))` uses primary key as fallback; if `anon_id` is null every visit row counts as unique | Enforce `card_visits.anon_id` NOT NULL (or app-level default), then use `COALESCE(visitor_account_id::text, anon_id)` only. For likes, dedup by visitor identity and add a partial unique index on `(card_id, action_type, COALESCE(visitor_account_id, anon_id)) WHERE action_type = 'like_card'`. |
| A59-P1-6 | Confirmed | Medium | Open | Admin member-card status update is non-atomic | Data accuracy / Transactions | `backend/src/admin-management/admin-management.service.ts:80-102` | 80 | `repository.updateMemberCard` runs one tenant transaction; service then calls `repository.updateMemberStatus` in a **second** transaction, then re-reads | Wrap `updateMemberCard` + `updateMemberStatus` + reload inside a single `TenantTx.run` in the service, or remove the redundant status branch from the service. |
| A59-P1-7 | Confirmed | Medium | Open | Contact sync is N+1 per user | Code efficiency | `backend/src/wecom/wecom-contact-sync.repository.ts:61-82` | 61 | `for (const user of normalized) { await upsertMember(tx,...); await ensureDefaultCard(tx,...); }` | Batch member upsert with `INSERT ... ON CONFLICT` and card provisioning with a CTE per batch. |
| A59-P1-8 | Confirmed | High | Open | 8 npm audit vulnerabilities in dependency tree | Deploy & Ops | `backend/package.json` → `backend/package-lock.json` | N/A | `npm audit` reports 8 vulns (1 low, 4 moderate, 3 high) from transitive dev deps of `@nestjs/cli@11.0.7` (`glob`, `picomatch`, `webpack`, `ajv`) | Upgrade `@nestjs/cli` to `>=11.0.24`; add `npm audit --audit-level=moderate` gate to CI (allowed to fail only after triage). |
| A59-P1-9 | Confirmed | High | Open | Admin architecture mismatch: README promises React+Vite+Ant Design, code is static HTML/JS | Architecture / UX | `README.md:112`; `admin/README.md:1-3`; `admin/index.html`; `admin/app.js` | 1 / 112 | No `package.json`, `vite.config.ts`, `src/`, or React components; `admin/app.js` is a 1,142-line vanilla-JS monolith | Either update README/docs to reflect static-HTML reality, or finish the React+Vite+Ant Design migration and delete the static monolith. |
| A59-P1-10 | Confirmed | Medium | Open | Docker Compose `DATABASE_URL` uses `${POSTGRES_USER}` not guaranteed at project level | Deploy & Ops | `docker-compose.yml:23` | 23 | `DATABASE_URL: postgresql://${POSTGRES_USER}:***@postgres...` references `${POSTGRES_USER}` only defined inside `postgres` service env; fails if no project-level `.env` or shell var | Move `POSTGRES_USER`/`POSTGRES_PASSWORD` to top-level `.env` or define them as project-level `x-common-variables` and reference explicitly in both services. |

### P2 — Nice to Have

| ID | Type | Confidence | Status | Title | Dimension | File | Line | Evidence | Fix |
|----|------|------------|--------|-------|-----------|------|------|----------|-----|
| A59-P2-1 | Confirmed | Medium | Open | Mini-program demo-auth fallback is not environment-aware | Security / UX | `miniprogram/app.js:28`; `miniprogram/utils/api.js:170-177` | 28 / 170 | `maybeDemoCode` returns `demo-qy-code`/`demo-wx-code` whenever `globalData.demoAuthEnabled` is true, regardless of `envVersion` | In `api.js`, ignore `demoAuthEnabled` unless `wx.getAccountInfoSync().miniProgram.envVersion === "develop"`. |
| A59-P2-2 | Confirmed | High | Open | Public card page silently swallows errors | UX | `miniprogram/pages/public/card.js:106`, `561`, `585`, `606` | 106 / 561 / 585 / 606 | `catch (_error) {}` blocks with no logging or user feedback | Log to a debug utility or remote logger; surface user-facing failures for critical paths. |
| A59-P2-3 | Confirmed | High | Open | Duplicate template/background constants across pages | Code efficiency / Maintainability | `miniprogram/pages/employee/index.js:29-42`; `miniprogram/pages/employee/card.js:5-18`; `miniprogram/pages/company-card/index.js:17-30`; `miniprogram/pages/public/card.js:48-61` | 29 / 5 / 17 / 48 | `TEMPLATE_BACKGROUNDS` and `PRESET_BACKGROUNDS` are copy-pasted in 4+ pages | Centralize in `miniprogram/utils/theme.js` or a new `constants.js` and import everywhere. |
| A59-P2-4 | Confirmed | High | Open | Admin console has no tests, lint, or module split | Testing / Maintainability | `admin/app.js` | entire | 1,142-line vanilla-JS monolith; no `package.json`, no spec files, no ESLint config | Split into modules (api, auth, state, views) and add at least a CI lint/validity check. |
| A59-P2-5 | Confirmed | Medium | Open | Public card page may double-create visits | Data accuracy / UX | `miniprogram/pages/public/card.js:94-109`, `168` | 94 / 168 | `onLoad` calls `loadPublicCard()` then `createVisit()`; other interactions also call `createVisit()` | Track visit ID in page state; avoid creating additional visits on post-load actions unless user re-enters. |
| A59-P2-6 | Confirmed | Medium | Open | CI/CD has no smoke test or rollback | Deploy & Ops | `.github/workflows/deploy-backend.yml:217-243`; `.github/workflows/deploy-admin.yml:171-198` | 217 / 171 | Workflows rsync and run optional restart command; no post-deploy health check, no rollback window, no concurrency guard | Add post-deploy smoke test against `/api/v1/health/ready` and a versioned symlink or blue/green rollback path. |
| A59-P2-7 | Confirmed | Medium | Open | Error-code mapper is incomplete | Coding standards | `backend/src/common/api-exception.filter.ts:5-22` | 5 | Only 401/403/400/404/409 mapped; 429/422/503 fall back to `50001` | Add explicit codes for 429 (throttle), 422 (validation), 503 (service unavailable). |
| A59-P2-8 | Confirmed | Medium | Open | Dockerfile lacks `HEALTHCHECK` | Deploy & Ops | `backend/Dockerfile` | entire | No `HEALTHCHECK` instruction; orchestration relies solely on compose-level probe | Add `HEALTHCHECK CMD wget -qO- http://localhost:3000/api/v1/health/ready || exit 1`. |
| A59-P2-9 | Confirmed | Medium | Open | Pino redaction misses request body PII | Security / Ops | `backend/src/app.module.ts:30-33` | 30 | Redact only `req.headers.authorization` and `req.body.code`; other body fields (mobile, email, wechat_id, fields) can be logged | Extend redact paths to cover known sensitive body/query fields (`req.body.mobile`, `req.body.email`, `req.body.wechat_id`, `req.query.*`). |
| A59-P2-10 | Confirmed | Low | Open | Global 100/min throttle may be too permissive for public endpoints | Runtime smoothness | `backend/src/app.module.ts:36-44` | 36 | Single default throttler at 100 req/min; public card endpoints can be scraped | Add a stricter public-card throttle (e.g., 30/min per IP or per `public_id`) without affecting authenticated routes. |
| A59-P2-11 | Confirmed | Medium | Open | In-memory fallback mode bypasses database controls | Security / Architecture | `backend/src/admin-management/admin-management.repository.ts:443-449`; `backend/src/admin-config/admin-config.repository.ts:406-408`; `backend/src/employee/employee-card.repository.ts:723-724` | 443 / 406 / 723 | Repositories fall back to `Map` when `DATABASE_URL` is absent; production already requires `DATABASE_URL`, but code path remains | Hard-disable in-memory mode when `NODE_ENV=production` (throw if `!DATABASE_URL`). |

## Verification Log
- ✅ A59-P1-1 — `public_card_directory` ON CONFLICT update confirmed in 3 repositories; no RLS policy in `rls.sql`.
- ✅ A59-P1-2 — session/admin token services are HMAC-only with `exp`; no denylist found.
- ✅ A59-P1-3 — `execFileAsync("npm", ["run", "migrate"], { cwd: database_dir })` confirmed.
- ✅ A59-P1-4 — `wecom-api-client.service.ts` has `maxRetries=3` + `AbortController` timeout, no circuit breaker.
- ✅ A59-P1-5 — `COALESCE(..., id::text)` confirmed in `employee-card.repository.ts` and `public-card.repository.ts`.
- ✅ A59-P1-6 — `updateMemberCard` then `updateMemberStatus` then reload confirmed in service.
- ✅ A59-P1-7 — `for...of` loop with per-user upsert + card provisioning confirmed.
- ✅ A59-P1-8 — `npm audit` output reproduced; 8 vulnerabilities from `@nestjs/cli` transitive tree.
- ✅ A59-P1-9 — `admin/` contains static `index.html`/`app.js`/`styles.css`; no React/Vite artifacts.
- ✅ A59-P1-10 — `docker-compose.yml` references `${POSTGRES_USER}` at project level but only defines it inside `postgres` service env.
- ✅ A59-P2-1 — `maybeDemoCode` returns demo code whenever `demoAuthEnabled` is true.
- ✅ A59-P2-2 — `catch (_error) {}` patterns confirmed in `public/card.js`.
- ✅ A59-P2-3 — duplicate `TEMPLATE_BACKGROUNDS`/`PRESET_BACKGROUNDS` confirmed in 4 files.
- ✅ A59-P2-4 — `admin/app.js` is 1,142 lines; no tests or lint config.
- ✅ A59-P2-5 — multiple `createVisit()` call sites confirmed.
- ✅ A59-P2-6 — deploy workflows end after optional restart; no smoke or rollback.
- ✅ A59-P2-7 — `errorCode()` maps only 401/403/400/404/409.
- ✅ A59-P2-8 — `Dockerfile` has no `HEALTHCHECK`.
- ✅ A59-P2-9 — pino redact paths confirmed as only `authorization` and `code`.
- ✅ A59-P2-10 — `ThrottlerModule.forRoot` default limit 100/60s confirmed.
- ✅ A59-P2-11 — `hasDatabase()` Map fallbacks confirmed in 3 repositories.
- ❌ (rejected) Sub-agent claim "WeCom API client has no timeout/retry" — verified as false; it has both. Downgraded to P1-4 (missing circuit breaker only).
- ❌ (rejected) Sub-agent claim "Admin migration can run arbitrary npm lifecycle scripts" — while `pre-migrate`/`post-migrate` are technically possible, the project owns `database/package.json`; risk is better described as directory-traversal/command-spawn (A59-P1-3).

## Fix Guide
1. **A59-P1-1**: Harden `public_card_directory` writes. Either add a tenant-scoped RLS write policy or restrict `ON CONFLICT` updates to `status`/`card_updated_at` and validate tenant match in the `WHERE` clause. Regenerate existing public IDs with CSPRNG if switching away from deterministic IDs.
2. **A59-P1-2**: Document stateless-token revocation as an accepted residual for MVP; add Redis revocation list when admin deactivation / logout matters (post-M1).
3. **A59-P1-3**: Replace `npm run migrate` with direct `node scripts/migrate.cjs`; validate `database_dir` against an allowlist; do not pass `env: process.env`.
4. **A59-P1-4**: Add a circuit breaker (e.g., `opossum`) around suite/corp token fetches; cache last-known token for short grace period.
5. **A59-P1-5**: Make `card_visits.anon_id` non-null or default it; remove `id::text` fallback from visitor/like metrics; add like-card partial unique index.
6. **A59-P1-6**: Wrap `updateMemberCard` + `updateMemberStatus` in one tenant transaction in the service.
7. **A59-P1-7**: Batch member upsert and card provisioning with `INSERT ... ON CONFLICT` or a CTE.
8. **A59-P1-8**: Upgrade `@nestjs/cli` to `>=11.0.24`; add `npm audit` gate to CI.
9. **A59-P1-9**: Align README and docs with the static admin console reality; plan React migration separately if still intended.
10. **A59-P1-10**: Fix `docker-compose.yml` environment variable scope so `backend` service can resolve `${POSTGRES_USER}`.
11. **P2 items**: Address as part of normal polish sprints; none are production blockers today.

## Doc Updates Needed
- `README.md` §112 (technology stack) and admin references should clarify that the admin console is currently a static HTML console, not React/Vite/Ant Design.
- `docs/88-planning/88_02_Admin_Deployment_Guide.md` may need alignment if it assumes a build step.
- `database/README.md` and `backend/README.md` (if any) should mention the migration endpoint hardening and `public_card_directory` RLS design.

## Next Steps
1. Review P1 findings above and confirm which fixes should be prioritized for the M1 walking skeleton vs. post-M1.
2. For fixes that involve schema or RLS changes, synchronize `schema.sql`, `rls.sql`, and any pending migration files.
3. Re-run `npm run typecheck`, `npm run lint`, `npm test`, and `npm audit` after fixes.
4. Consider scheduling a follow-up verification audit once P1 fixes land.
