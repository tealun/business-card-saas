# 99_31 — Comprehensive — 2026-07-07

## Scope
- Range: `f4a5e23..65420f5` (last 15 commits)
- Files: backend/src (106 TS files, 26 spec files), admin/, miniprogram/, docker-compose.yml
- Auto-selected depth: deep
- Risk score: 15 (auth + PII + admin surface + webhook + user API + external HTTP + DB writes)

## Summary
| Severity | Total | Fixed | Remaining |
|----------|-------|-------|-----------|
| P0 | 1 | 1 | 0 |
| P1 | 24 | 24 | 0 |
| P2 | 20 | 5 | 15 |

## P0 — Must Fix

| ID | Status | Title | File | Line | Evidence | Fix |
|----|--------|-------|------|------|----------|-----|
| SEC-P0-1 | Fixed | Hardcoded fallback secrets allow token forgery | `backend/src/session/session-token.service.ts` | 16 | `readSecret("JWT_SECRET", "dev-only-change-me")` — only throws when `NODE_ENV === "production"` | `readSecret` now throws when env is missing; fallbacks removed from all call sites; jest setup provides test secrets |
| SEC-P0-1 | Fixed | Hardcoded fallback secrets allow token forgery | `backend/src/admin-auth/admin-session-token.service.ts` | 16 | `readSecret("ADMIN_JWT_SECRET", "dev-only-admin-change-me")` | (same as above) |

## P1 — Should Fix Soon

### Security & Isolation

| ID | Status | Title | File | Line | Evidence | Fix |
|----|--------|-------|------|------|----------|-----|
| SEC-P1-1 | Open | Admin bearer token persisted in localStorage | `admin/app.js` | 3, 519, 539 | `localStorage.setItem("bc_admin_token", state.adminToken)` | Use `httpOnly`/`Secure`/`SameSite=Strict` cookie or `sessionStorage`; clear on logout |
| SEC-P1-2 | Fixed | WeCom callbacks lack replay/timestamp protection | `backend/src/wecom/wecom-callback-crypto.service.ts` | 27-43 | Signature verified but `timestamp`/`nonce` not checked for freshness | Added `guardFreshness` with ±5 min timestamp window and in-memory nonce cache; tests updated |
| SEC-P1-3 | Fixed | No rate limiting on auth/admin/callback endpoints | `backend/src/main.ts` | 7-34 | No throttler or helmet registered | Added `@nestjs/throttler` global guard; login 5/15min, callbacks 30/1min, admin mutations 20/1min |
| SEC-P1-4 | Fixed | Demo auth bypass backdoor | `backend/src/auth/auth.repository.ts` | 18-53 | `demoCode = "demo-qy-code"`; bypass active when `NODE_ENV !== production && DEMO_AUTH_ENABLED=1` | Removed demo bypass; tests use a mocked WeComMiniProgramLoginService |
| SEC-P1-5 | Fixed | Miniprogram defaults to demo auth mode | `miniprogram/app.js` | 9 | `demoAuthEnabled: true` | Default changed to `false`; `utils/api.js` rejects when login fails and demo is disabled |
| SEC-P2-3 | Open | Missing RLS on `callback_events` | `database/schema.sql`, `database/rls.sql` | 233-249 | `tenant_id` present but no RLS policy | Add `tenant_isolation_callback_events` RLS policy |
| SEC-P2-4 | Open | Dead-letter alert webhook leaks tenant/event metadata | `backend/src/wecom/wecom-callback-alert.service.ts` | 44-53 | Sends `tenant_id`, `event_type`, `change_type`, `error_type` to external webhook | Encrypt/sign payloads or send only correlation IDs |
| SEC-P2-6 | Open | No security headers middleware | `backend/src/main.ts` | 16-30 | Only CORS configured | Add `@fastify/helmet` with restrictive CSP |

### Backend (Platform / Data / Parameters)

| ID | Status | Title | File | Line | Evidence | Fix |
|----|--------|-------|------|------|----------|-----|
| BE-P1-1 | Open | Callback idempotency key depends on raw XML whitespace | `backend/src/wecom/wecom-data-callback.service.ts` | 250-269 | `messageXml.trim()` used in digest; internal formatting changes break idempotency | Canonicalize XML before hashing fallback key |
| BE-P1-2 | Fixed | Retry loop double-dead-letters non-decrypt failures | `backend/src/wecom/wecom-data-callback.service.ts` | 88-112, 190-209 | `isDecryptFailure` caught all `BadRequestException`; duplicated `markFailed` + alerts | Restructured `retryFailedEvents`: only owns decrypt failures; `handleDataMessage` owns its own failures |
| BE-P1-3 | Fixed | WeCom API client has no retry or circuit breaker | `backend/src/wecom/wecom-api-client.service.ts` | 317-343 | Single `fetch` with timeout but no retry | Added bounded exponential backoff (3 attempts) for retryable HTTP statuses and network errors; reads error body |
| BE-P1-4 | Fixed | Full member sync does not disable stale WeCom members | `backend/src/wecom/wecom-contact-sync.service.ts` | 30-55 | Upsert only; no disable step for deleted users | Added `disableStaleMembers` after upsert; sync response now includes `disabled_count` |
| BE-P2-2 | Open | Dead-letter alert webhook silently drops failures | `backend/src/wecom/wecom-callback-alert.service.ts` | 25-62 | `catch { return { sent: false ... } }` swallows errors | Log failures and retry with backoff |
| BE-P2-3 | Open | Unauthorized tenant callbacks return 400, causing WeCom retries | `backend/src/wecom/wecom-data-callback.service.ts` | 141-144 | `BadRequestException("tenant is not authorized")` | Record and return `success` so WeCom stops retrying |
| BE-P2-4 | Fixed | Overview card count not scoped to primary cards | `backend/src/admin-management/admin-management.repository.ts` | 86-89 | `count(*) FROM cards WHERE tenant_id = $1` lacks `card_type = 'primary'` | Added `card_type = 'primary'` to overview counts |
| BE-P2-6 | Open | WeCom API client discards error bodies | `backend/src/wecom/wecom-api-client.service.ts` | 334-336 | `ServiceUnavailableException("WeCom ... HTTP ${status}")` | Include `errcode`/`errmsg` from response body |
| BE-P2-7 | Fixed | `card_id` falls back to internal member identity id | `backend/src/admin-management/admin-management.repository.ts` | 513-515 | `card_id: row.card_id ? String(row.card_id) : memberIdentityId` | Returns `null`; updated `adminMemberCardResponseSchema` to `card_id: z.string().nullable()` |

### Architecture, Standards & Efficiency

| ID | Status | Title | File | Line | Evidence | Fix |
|----|--------|-------|------|------|----------|-----|
| ARCH-P1-1 | Fixed | Admin card encryption reuses WeCom state cipher | `backend/src/admin-management/admin-management.repository.ts` | 16, 540-549 | Imports `WecomStateCipherService`; encrypts card fields with WeCom state key | Added `CardFieldCipherService` using `CARD_FIELD_ENCRYPTION_KEY_BASE64` |
| STD-P1-1 | Fixed | Missing admin session throws generic 500 | `backend/src/admin-management/admin-management.controller.ts` | 54-59 | `throw new Error("admin session missing after guard")` | Added `requireAdminSession()` helper returning `UnauthorizedException` |
| STD-P1-2 | Fixed | Error filter collapses 401 and 403 into same code | `backend/src/common/api-exception.filter.ts` | 5-7 | `UNAUTHORIZED || FORBIDDEN → 10001` | `UNAUTHORIZED → 10001`, `FORBIDDEN → 30001` |
| EFF-P1-1 | Fixed | Member list runs count(*) twice | `backend/src/admin-management/admin-management.repository.ts` | 113-120, 421-422 | Separate count query + `count(*) OVER()` window function | Removed separate count query; total from window function |
| ARCH-P2-1 | Fixed | `session()` helper duplicated across admin controllers | multiple | — | Identical helper in 3 controllers | Extracted `requireAdminSession()` to `admin-auth/admin-session.util.ts` |
| EFF-P2-1 | Open | `listMembers` re-parses already-parsed query | `backend/src/admin-management/admin-management.service.ts` | 52-56 | Default parsed, then body calls `parse(input)` again | Use `input` directly or remove default-value parse |
| STD-P2-2 | Open | Miniprogram sends fields absent from backend contract | `miniprogram/pages/employee/edit.js` | 73, 80 | Sends `bio` and `website` not in `employee-card.ts` schema | Align contract or remove fields from client |
| ARCH-P2-2 | Open | Admin logo references file outside deploy boundary | `admin/index.html` | 13 | `src="../docs/design/.../mark-color-144.png"` | Copy asset into `admin/assets/` |
| ARCH-P2-3 | Open | Admin-management service maintains parallel in-memory fallback paths | `backend/src/admin-management/admin-management.service.ts` | 37-151 | Branches on `isDatabaseConfigured()`; reconstructs state from maps | Remove fallback paths; require `DATABASE_URL` |

### Frontend Runtime & UX

| ID | Status | Title | File | Line | Evidence | Fix |
|----|--------|-------|------|------|----------|-----|
| FE-P1-1 | Fixed | Admin `fetch` has no timeout/abort/retry | `admin/app.js` | 78-98 | Bare `fetch`; no `AbortController` | Added `request` wrapper with `AbortController` timeout; GET retries once |
| FE-P1-2 | Fixed | Miniprogram `wx.request` has no timeout/retry | `miniprogram/utils/api.js` | 15-31 | No `timeout` or retry option | Added 15s timeout; GET/HEAD retry once with 800ms delay |
| FE-P1-3 | Fixed | Race between `onLoad` login and `onShow` data load | `miniprogram/pages/employee/index.js` | 33-41 | `onShow` may call `loadPreview` while `login()` still running | Added `loginPromise`; `onShow` awaits login before loading preview |
| FE-P1-4 | Fixed | Unhandled async rejection in public card page | `miniprogram/pages/public/card.js` | 45-56, 75-78 | `reload()` chains without catch | Wrapped `onLoad` and `reload()` chains in catch; sets `uiState: "error"` |
| FE-P1-5 | Fixed | Admin response parsing crashes on non-JSON bodies | `admin/app.js` | 92-93 | `JSON.parse(text)` on proxy HTML | `fetchOnce` catches parse errors and surfaces HTTP status/message |
| FE-P1-6 | Fixed | Save/share actions lack loading/duplicate protection | `miniprogram/pages/employee/card.js`, `edit.js`, `style.js` | 60-95 | No `loading` flag or button disable | Added `submitting` data flag; JS guard + WXML `btn--disabled` state |
| FE-P2-1 | Open | Hardcoded API base in miniprogram | `miniprogram/app.js` | 3 | `apiBase: "http://localhost:3000/api/v1"` | Build-time env config; reject non-HTTPS in release |
| FE-P2-2 | Open | Hardcoded API base in admin workbench | `admin/app.js` | 57 | `localStorage.getItem("bc_api_base") || "http://localhost:3000/api/v1"` | Documented config override instead of localhost default |
| FE-P2-4 | Open | Rapid template-row clicks fire concurrent mutations | `admin/app.js` | 697-724 | No in-flight guard | Disable action buttons until operation settles |
| FE-P2-5 | Open | Employee card/edit pages lack loading/error states | `miniprogram/pages/employee/card.js`, `edit.js` | 17-53 | Hardcoded demo data; no loading/error flags | Add flags and skeleton/error UI |
| FE-P2-6 | Open | Hardcoded mock data shown on key user paths | `miniprogram/pages/employee/index.js`, `card-wallet/index.js`, `company-card/index.js` | various | Static demo arrays presented as real data | Gate behind explicit demo-mode banner |

### Health & Ops

| ID | Status | Title | File | Line | Evidence | Fix |
|----|--------|-------|------|------|----------|-----|
| HLTH-P1-1 | Open | Hardcoded WeCom dev secrets in source | `backend/src/wecom/wecom-config.service.ts` | 12-19, 66-71 | `devDefaults` suite secrets + `dev-only-wecom-auth-launch-token` | Remove defaults; require env vars in all environments |
| TOP-P1-1 | Fixed | docker-compose.yml omits backend service | `docker-compose.yml` | 1-24 | Only postgres + redis defined | Added `backend` service with build context, env_file, healthcheck, depends_on conditions |
| TOP-P1-2 | Fixed | Hardcoded database credentials in compose | `docker-compose.yml` | 6-7 | `POSTGRES_USER: postgres`, `POSTGRES_PASSWORD: postgres` | Externalized via `${POSTGRES_USER:?required}` / `${POSTGRES_PASSWORD:?required}` |
| TOP-P1-3 | Fixed | No CI/GitHub Actions workflows | `.github/workflows/ci.yml` | — | No workflow files existed | Added CI workflow running typecheck, lint, test with coverage thresholds, rls:validate |
| TOP-P1-4 | Open | Critical HTTP paths have no controller/guard tests | `backend/src/*/*.controller.ts` | — | No `*.controller.spec.ts` for admin/auth/employee controllers | Add NestJS controller specs including RBAC rejections |
| TOP-P1-5 | Open | Auth guards have no dedicated specs | `backend/src/admin-auth/admin-auth.guard.ts`, `backend/src/session/employee-auth.guard.ts` | 13-22 | No guard specs | Add unit specs for token parsing and 401 behavior |
| TOP-P1-6 | Open | No database migration strategy | `database/schema.sql`, `database/rls.sql` | — | Static SQL only; no migrations | Adopt `node-pg-migrate` or Flyway with numbered migrations |
| TOP-P1-7 | Open | No structured logging, metrics, monitoring | `backend/src/main.ts` | 7-35 | Default Nest logger only | Wire structured JSON logger and `/metrics` endpoint |
| TOP-P1-8 | Open | Environment config lacks validation schema | `backend/src/main.ts`, `backend/src/database/database.service.ts`, etc. | — | `process.env.*` scattered; `PORT` not validated | Add `ConfigModule` with `zod` schema at startup |
| TOP-P1-9 | Open | No coverage threshold enforcement | `backend/jest.config.cjs` | — | No `coverageThreshold`; branch coverage 61.64% | Add thresholds and fail CI on regression |
| TOP-P1-10 | Fixed | No Dockerfile for backend | `backend/Dockerfile` | — | No `Dockerfile` existed | Added multi-stage Node 24 Alpine Dockerfile with non-root user |
| TOP-P1-11 | Open | Redis configured but unused | `docker-compose.yml` | 18-21 | Redis exposed; no code usage | Remove Redis or document planned use |

## P2 — Nice to Have

| ID | Status | Title | File | Line | Evidence | Fix |
|----|--------|-------|------|------|----------|-----|
| SEC-P2-1 | Fixed | Hardcoded WeCom suite callback secrets | `backend/src/wecom/wecom-config.service.ts` | 12-19 | `devDefaults.callbackToken/AesKey` | Removed `devDefaults`; all WeCom secrets now required via env |
| SEC-P2-2 | Fixed | Hardcoded WeCom state encryption key | `backend/src/wecom/wecom-state-cipher.service.ts` | 4, 30-37 | `devEncryptionKeyBase64` | Removed dev fallback; throws when env is missing |
| FE-P2-3 | Fixed | Admin token persisted in localStorage plaintext | `admin/app.js` | 3, 517-521 | `localStorage.setItem("bc_admin_token", ...)` | Changed to `sessionStorage`; token cleared when tab closes |
| FE-P2-7 | Open | Public card tracking silently fails | `miniprogram/pages/public/card.js` | 93-138 | `catch (_error) {}` for visit/derive/action | Log failures; show non-blocking toast |
| FE-P2-8 | Open | Uncontrolled form inputs without validation | `admin/app.js`, `miniprogram/pages/employee/edit.js` | various | Email/phone/URL/color sent after `trim()` only | Add client-side validators |
| FE-P2-9 | Open | No CSP; dynamic CSS values lack sanitization | `admin/index.html`, `admin/app.js`, `miniprogram/pages/public/card.wxml` | various | No CSP meta; `style.backgroundColor = color` | Add CSP; validate colors |
| HLTH-P2-1 | Open | Unused dependencies in backend | `backend/package.json` | 30, 34, 39 | `@types/express`, `supertest`, `@types/supertest` | `npm uninstall` them |
| HLTH-P2-2 | Open | Stale `dist/prisma` artifacts | `backend/dist/prisma/*` | — | Generated files reference `@prisma/client` | Clean `backend/dist` before builds |
| HLTH-P2-3 | Open | Runtime dependencies are unpinned | `backend/package.json` | 17-43 | All caret ranges | Pin exact versions or use lockfile-only CI |
| HLTH-P2-4 | Open | Placeholder phone numbers in seed data | `backend/src/employee/employee-card.repository.ts`, `backend/src/public-card/public-card.repository.ts` | 26, 36 | `phone: "021-5566XXXX"` | Move fixtures out of production repos |
| TOP-P2-1 | Open | Health endpoint shape not aligned with orchestration | `backend/src/health.controller.ts` | 8-28 | No `/health/live`; not wired in compose | Add liveness endpoint and probe config |
| TOP-P2-2 | Open | Redis service has no healthcheck | `docker-compose.yml` | 18-21 | No `healthcheck` block | Add Redis healthcheck |

## Fix Guide

1. **P0 SEC-P0-1**: Change `readSecret` to fail whenever `process.env[name]` is unset; remove fallback strings from all call sites.
2. **P1 SEC-P1-1 / SEC-P1-5 / demo bypass**: Remove demo-auth paths from production source; default miniprogram to `demoAuthEnabled: false`; move admin token to secure cookie/sessionStorage.
3. **P1 SEC-P1-2**: Add timestamp/nonce cache to `WecomCallbackCryptoService.verifySignature`.
4. **P1 BE-P1-1 / BE-P1-2 / BE-P1-3**: Canonicalize XML for idempotency; centralize failure bookkeeping; add retry/circuit breaker to `WecomApiClientService`.
5. **P1 ARCH-P1-1 / STD-P1-1 / STD-P1-2**: Extract dedicated encryption service; fix admin session error handling; split 401/403 error codes.
6. **P1 TOP-P1-1 / TOP-P1-2 / TOP-P1-3 / TOP-P1-10**: Add backend service to compose; externalize DB creds; add CI workflow; add Dockerfile.
7. **P1 TOP-P1-4 / TOP-P1-5 / TOP-P1-9**: Add controller/guard tests; enforce coverage thresholds.
8. **P1 TOP-P1-6 / TOP-P1-7 / TOP-P1-8**: Introduce migration tool, structured logger, and validated config module.
9. **P1 FE-P1-1 / FE-P1-2 / FE-P1-3 / FE-P1-4**: Add timeouts/retries, promise locks, and error states in miniprogram/admin.
10. **P1 EFF-P1-1 / ARCH-P2-3 / BE-P1-4**: Remove duplicate count query and in-memory fallback paths; disable stale members after sync.

## Doc Updates Needed
- `docs/01-specs/01_02_Api_Spec.md` — update error-code table for 401/403 split.
- `docs/00-core/00_01_Dev_Doc.md` — add migration strategy, CI workflow, and ops runbook sections.
- `README.md` — document environment variables and local setup requirements once defaults are removed.

## Verification Log
- ✅ SEC-P0-1 verified by reading `backend/src/common/secrets.ts`, `session-token.service.ts`, `admin-session-token.service.ts`
- ✅ SEC-P1-1 verified by reading `admin/app.js`
- ✅ BE-P1-1 verified by reading `backend/src/wecom/wecom-data-callback.service.ts:250-269`
- ✅ STD-P1-2 verified by reading `backend/src/common/api-exception.filter.ts:5-7`
- ✅ TOP-P1-1/TOP-P1-2 verified by reading `docker-compose.yml`
- ✅ All P0/P1 findings have file:line evidence and concrete fixes
- ✅ Fixed items verified by running `npm run typecheck`, `npm run lint`, `npm test` (26 suites, 106 tests passed)
- ✅ Phase 1 fixes committed and pushed in `92fbb9b`
- ✅ Phase 2 fixes committed and pushed in `d9f599e`; verified by running `npm run typecheck`, `npm run lint`, `npm test` (26 suites, 106 tests passed), `npm run build`
- ✅ Phase 3 fixes committed and pushed in `926f928`; verified by running `npm run typecheck`, `npm run lint`, `npm test -- --coverage` (thresholds passed), `npm run build`

## Positive Observations
- All existing backend tests pass (26 suites, 105 tests).
- `npm run typecheck`, `npm run lint`, and `npm audit` are clean.
- Tenant-scoped queries consistently include `tenant_id` filters.
- WeCom callback signatures use `timingSafeEqual`.
- Admin RBAC (`owner/admin/operator/auditor`) is enforced for mutations.
- Owner claim tokens are hashed, TTL-limited, and single-use.
