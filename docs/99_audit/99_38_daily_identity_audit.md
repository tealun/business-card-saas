# 99_38 — Daily Audit: Personal Identity & Miniprogram Config — 2026-07-08

## Scope

- Range: `origin/main..HEAD` (`51986dd..42151ac`), 8 commits
- Files: 38 changed (+1893 / -54)
- Feature set: personal WeChat identity login (`wx-login`), multi-identity switching, preferred-identity preservation, miniprogram runtime config hardening
- Auto-selected depth: **Deep**
- Risk score: **12** — WeChat/WeCom auth (`+3`), JWT session identity (`+3`), PII/openid handling (`+3`), DB writes to `accounts`/`tenants`/`account_preferences` (`+1`), external HTTP to WeChat API (`+1`), admin/identity surface (`+1`)

This consolidates the per-commit notes (99_34–99_37) into one full-branch review across all 12 dimensions.

## Summary

- P0: 0
- P1: 1
- P2: 3
- Objective validation: build ✅ · 141/141 tests ✅ · eslint ✅

## Dimension Coverage

| # | Dimension | Result |
|---|-----------|--------|
| 1 | Architecture | OK — repository/service/controller layering respected; `hasDatabase()` uses the codebase-standard `process.env.DATABASE_URL` guard (consistent with owner-bootstrap/admin-config repos) |
| 2 | Platform integration | OK w/ note — `jscode2session` uses `AbortController` timeout, no retry (correct: WeChat codes are single-use). See P2-3 |
| 3 | Security | 1×P1 (demo-auth prod guard), 1×P2 (rate limiting) |
| 4 | Code efficiency | OK — provisioning runs in a single transaction, no N+1 |
| 5 | Runtime smoothness | OK — miniprogram has loading/error/demo states + switch spinner |
| 6 | Info isolation | OK — `switchIdentity()` verifies the target belongs to the caller's `account_id` (cross-account switch returns 403, covered by test) |
| 7 | Data accuracy | OK — preference upsert uses `COALESCE` to preserve `last_member_identity_id`; provisioning idempotent via `ON CONFLICT` |
| 8 | Parameter passing | 1×P2 (empty-code status class) |
| 9 | UX | OK — identity sheet guards empty list, no-op on same identity, toasts on failure |
| 10 | Coding standards | OK w/ note — error status class inconsistent with sibling service (P2-2) |
| 11 | Testing | OK — new suite covers wx-login personal provisioning + cross-account 403 + empty-code reject |
| 12 | Deploy & Ops | OK — new `WECHAT_*` env vars documented in `.env.example`; miniprogram forces HTTPS for non-develop envs |

## P0 — Must Fix

None.

## P1 — Should Fix

| ID | Status | Title | File | Line | Evidence | Fix |
|----|--------|-------|------|------|----------|-----|
| S-P1-1 | Fixed | No production guard on `DEMO_AUTH_ENABLED` (auth-bypass foot-gun) | backend/src/config/app-config.ts | 59 | `wx-miniprogram-login.service.ts:27` mints a real session for `demo-wx-code` whenever `demoAuthEnabled` is true, independent of `NODE_ENV`. `app-config` only forbids missing `DATABASE_URL` in production — nothing stops an operator from setting `DEMO_AUTH_ENABLED=true` in prod, which would let anyone posting `{"code":"demo-wx-code"}` obtain a valid personal session. | Reject `DEMO_AUTH_ENABLED=true` when `NODE_ENV=production` in the config `superRefine` (defense in depth) |

## P2 — Nice to Have

| ID | Status | Title | File | Line | Evidence | Fix |
|----|--------|-------|------|------|----------|-----|
| B-P2-2 | Fixed | Empty/whitespace WeChat code returns 502 instead of a 4xx | backend/src/auth/wx-miniprogram-login.service.ts | 24 | A whitespace-only `code` passes `z.string().min(1)`, then `.trim()` → `""`, throwing `BadGatewayException` (502). It is a client error, and the sibling `WecomMiniProgramLoginService` throws `UnauthorizedException` for the same case. | Throw `UnauthorizedException("invalid WeChat login code")` for consistency + correct status class |
| S-P2-1 | Deferred | `switch-identity` / `identities` endpoints have no `@Throttle` | backend/src/auth/auth.controller.ts | 23,30 | Login endpoints are throttled (5/15min); the authenticated identity endpoints are not. Low risk (requires a valid session; invalid IDs return 403), but inconsistent with the login surface. | Optionally add a modest `@Throttle` to bound authenticated abuse |
| B-P2-3 | Deferred | Race in `findOrCreateAccount` (SELECT-then-INSERT) | backend/src/auth/personal-identity.repository.ts | 173 | Two concurrent first-logins for the same new `openid` both SELECT empty then INSERT; the second violates `uk_accounts_primary_wx_openid` and aborts the transaction (500). Rare — login is throttled and `wx.login` codes are single-use. | Use `INSERT ... ON CONFLICT (primary_wx_openid) DO UPDATE ... RETURNING id`, or retry the transaction on unique violation |

## Fix Guide

1. **S-P1-1** — In `app-config.ts` `superRefine`, add: if `NODE_ENV === "production" && DEMO_AUTH_ENABLED`, raise a config error on path `["DEMO_AUTH_ENABLED"]`. Add a unit test asserting production rejects the flag.
2. **B-P2-2** — Replace `BadGatewayException("empty WeChat login code")` with `UnauthorizedException("invalid WeChat login code")` in `resolveJsCode`.
3. **S-P2-1 / B-P2-3** — Deferred (see `99_9999_deferred.md`); low severity, no active exploit path.

## Doc Updates Needed

- None. `.env.example` already documents `DEMO_AUTH_ENABLED` and `WECHAT_*`; behavior tightening for S-P1-1 is backward compatible (default `false`).

## Residual Risk

- Cross-channel account merge (same human logging in via both WeChat personal and WeCom employee) creates two separate `account_id`s unless a shared `wx_unionid`/`primary_wx_openid` or explicit bind flow links them. This is a product-design decision, not a defect.
- `wx.qy.login` vs `wx.login` runtime selection still needs real-device / WeChat DevTools validation; CI covers backend contracts and miniprogram JS syntax only, not native API availability.
