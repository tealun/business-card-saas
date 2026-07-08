# 99_52 - Deep Re-Audit: Copilot Audit Verification - 2026-07-08

## Scope

- Repository state: `main` at `d58e8fa`
- Primary target: verify `docs/99-audits/99_51_daily_identity_audit.md`, then run an independent deep audit of the identity/login/public-card surfaces.
- Skill mode: Tasker Level L + Project Audit highest-depth review.
- Phase boundary: audit only. No source-code fixes were made in this pass.

## Executive Summary

- P0: 0
- P1: 0 new open findings
- P2: 2 verified findings were fixed in the follow-up hardening patch
- Copilot audit verdict: materially accurate. Its fixed findings are fixed; its deferred findings were real and are now fixed.
- Minor audit-document issue: the original `99_38` report, now renamed to `99_51`, is stale on metadata. It reports range `51986dd..42151ac` and `141/141 tests`, while current audited HEAD is `d58e8fa` and the current backend test run is `142/142`.

## Copilot Audit Verification

| Copilot ID | Verdict | Evidence | Notes |
|------------|---------|----------|-------|
| S-P1-1 | Verified fixed | `backend/src/config/app-config.ts:67` rejects `NODE_ENV=production` with `DEMO_AUTH_ENABLED=true`; `backend/src/config/app-config.spec.ts` covers the guard. | This was a real production auth foot-gun and the current fix is correct. |
| B-P2-2 | Verified fixed | `backend/src/auth/wx-miniprogram-login.service.ts:28` trims the code and `:30` throws `UnauthorizedException("invalid WeChat login code")` for empty values. | Correctly changes a client/input error from 502-class to 4xx-class behavior. |
| S-P2-1 | Verified fixed | `backend/src/auth/auth.controller.ts` now adds route-level `identity` throttles to `identities` and `switch-identity`. | The endpoints still require a valid employee session and are additionally bounded below the global default throttle. |
| B-P2-3 | Verified fixed | `backend/src/auth/personal-identity.repository.ts` now acquires transaction-scoped advisory locks for openid/unionid before account lookup and insert. | This serializes concurrent first-login provisioning for the same WeChat account keys. |

## Fixed Findings

### P2-1 - Authenticated identity endpoints relied only on global throttling

- Files:
  - `backend/src/auth/auth.controller.ts:25`
  - `backend/src/auth/auth.controller.ts:31`
  - `backend/src/app.module.ts:28`
- Previous behavior: `GET /auth/identities` and `POST /auth/switch-identity` were guarded by `EmployeeAuthGuard`, but only received the global 100/min throttle.
- Fix: added route-level `identity` throttles, 30/min for listing and 20/min for switching.
- Status: fixed.


### P2-2 - First personal-login account creation had a rare unique-conflict race

- File: `backend/src/auth/personal-identity.repository.ts:166`
- Previous behavior: `findOrCreateAccount()` checked for an existing account, then inserted if none was found.
- Fix: added deterministic transaction-scoped advisory locks for the relevant `openid` and `unionid` keys before the SELECT/INSERT path, plus a regression test asserting locks occur before account lookup and insert.
- Status: fixed.


## Security / Isolation Review

- Demo auth: production guard is now present and tested.
- WeChat login input: empty/whitespace code handling is now correct.
- Identity switching: service-level ownership check prevents switching to identities not bound to the current `account_id`.
- Public card reads/actions: public endpoints validate `public_id`, signed visit tokens, and tenant-scoped share resolution before writing visit/action/share records.
- Tenant DB access: public-card and employee-card repository calls use tenant-aware transaction boundaries for tenant data.
- RLS baseline: schema/RLS validation passed.
- Miniprogram config: runtime config comes from ext config or local config; example config is not loaded as runtime input.

## Validation Log

| Command | Result | Notes |
|---------|--------|-------|
| `npm.cmd run typecheck` | Pass | Backend TypeScript check passed. |
| `npm.cmd run lint` | Pass | ESLint passed. |
| `npm.cmd test` | Pass | 35 suites, 142 tests passed. |
| `npm.cmd run build` | Pass | Backend build passed. |
| `npm.cmd run rls:validate` | Pass | `database/schema.sql` + `database/rls.sql` baseline validated. |
| `node --check miniprogram/...` | Pass | Checked main miniprogram auth/api/page scripts. |
| `npm.cmd run db:check` | Blocked locally | Requires `DATABASE_URL`; current local shell does not define it. |
| `npm.cmd run db:verify` | Blocked locally | Requires `DATABASE_URL`; current local shell does not define it. |
| `npm.cmd audit --audit-level=moderate` | Blocked by local npm runtime | npm 11.12.1 on Node v24.15.0 throws `Class extends value undefined is not a constructor or null` inside npm's own dependency stack. |
| `npm.cmd ls --depth=0` | Blocked by local npm runtime | Same npm runtime exception as `npm audit`. |

## Audit Quality Notes

- The Copilot audit is substantively true.
- The only inaccuracy found is audit metadata staleness, not a code/security conclusion.
- No additional P0/P1 defects were verified in this pass.
- The verified P2 issues from this report have been fixed in the follow-up hardening patch.
