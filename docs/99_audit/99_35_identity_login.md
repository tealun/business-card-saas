# 99_35 — Identity Login — 2026-07-08

## Scope

- Range: `e12f06f..1517434` plus immediate verification fix in working tree
- Files: auth contracts/controllers/services, personal identity repository, WeChat login service, session token payload, database schema and migration, API/miniprogram docs, backend env example
- Auto-selected depth: deep
- Risk score: 11
- Signals: auth/session changes, identity switching, multi-tenant cards, PII-bearing WeChat openid/unionid, database migration, external platform login

## Summary

- P0: 0
- P1: 1
- P2: 0
- New issues: 1
- Fixed from this audit: 1

## P0 — Must Fix

None.

## P1 — Should Fix

| ID | Status | Title | File | Line | Evidence | Fix |
|----|--------|-------|------|------|----------|-----|
| IL-P1-1 | Fixed | Demo WeChat login code was enabled in all non-production environments | `backend/src/auth/wx-miniprogram-login.service.ts` | 27 | `demo-wx-code` was accepted whenever `NODE_ENV !== production`; a deployed staging/dev server could mint personal sessions without real WeChat code2session. | Added `DEMO_AUTH_ENABLED` config and now allow `demo-wx-code` only in `test` or when `DEMO_AUTH_ENABLED=1`. |

## P2 — Nice to Have

None.

## Verification Log

- `npm.cmd run typecheck`
- `npm.cmd test -- --runTestsByPath src/config/app-config.spec.ts src/auth/auth-employee.controller.spec.ts`
- `npm.cmd test` before the audit fix: 34 suites / 140 tests passed.
- `npm.cmd run lint`
- `node --check backend\migrations\1783520000000_personal_identities.js`
- `rg "SELECT.*\\$\\{|INSERT.*\\$\\{|UPDATE.*\\$\\{|DELETE.*\\$\\{" backend\src\auth -n` returned no dynamic SQL interpolation findings.

## Doc Updates Needed

- API spec now documents `identity_type`, `wx-login`, `identities`, and `switch-identity`.
- Miniprogram guide now documents `personal` and `wecom_member` identities.
- Backend env example now documents `WECHAT_MINIPROGRAM_APPID`, `WECHAT_MINIPROGRAM_SECRET`, and `WECHAT_HTTP_TIMEOUT_MS`.

## Residual Risk

- Automatic account merge between a prior WeChat personal account and a later WeCom enterprise identity still requires an explicit bind/merge flow. This is intentionally left for the later identity switching/binding phase.
- Database migration is additive and not auto-reversible; rollback should be a forward migration or database restore, consistent with existing migration policy.

## Next Steps

1. Continue with the miniprogram phase: call `wx-login` in normal WeChat, call `qy-login` in WeCom, display identity choices, and switch token through `/auth/switch-identity`.
