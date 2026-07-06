# 99_07 - WeCom Employee Login - 2026-07-06

## Scope
- Range: `4c21917..0345ad6`
- Files: 18 changed
- Auto-selected depth: deep
- Risk score: 14
- Signals: auth path, third-party WeCom API call, tenant isolation, database writes, public card publishing, user-facing API surface

## Summary
- P0: 0 | P1: 1 | P2: 0
- New issues: 1 | Fixed from previous: 0
- Result: Stage 2.3/2.4 is implemented and verified after fixing one provisioning race edge.

## Findings

### P0 - Must Fix
| ID | Status | Title | File | Line | Evidence | Fix |
|----|--------|-------|------|------|----------|-----|
| - | - | None | - | - | - | - |

### P1 - Should Fix
| ID | Status | Title | File | Line | Evidence | Fix |
|----|--------|-------|------|------|----------|-----|
| WEL-P1-1 | Fixed | Concurrent employee provisioning could return an unbound new account id | `backend/src/wecom/wecom-employee-provisioning.repository.ts` | 73 | The original code created a new `accounts` row, inserted `account_identity_bindings ON CONFLICT DO NOTHING`, but did not re-read the existing binding when the insert conflicted. Two simultaneous first logins for the same `tenant_id + member_identity_id` could return the second, unbound account id. | `account_identity_bindings` insert now returns `account_id`; on conflict it re-reads the existing binding and returns that account. Added a regression test for the conflict branch. |

### P2 - Nice to Have
| ID | Status | Title | File | Line | Evidence | Fix |
|----|--------|-------|------|------|----------|-----|
| - | - | None | - | - | - | - |

## Coverage Map
| Dimension | Status | Notes |
|-----------|--------|-------|
| 1 Architecture | Covered | Auth delegates WeCom identity resolution to `WecomModule`; employee card defaults stay in employee/public-card repositories. |
| 2 Platform integration | Covered | `AuthRepository` now calls `WecomMiniProgramLoginService`; API timeout/error mapping remains in the WeCom client. |
| 3 Security | Covered | Demo auth remains non-production only; unauthorized `open_corpid` is rejected before provisioning. |
| 4 Code efficiency | Covered | No broad framework added; default public ids are deterministic and local. |
| 5 Runtime smoothness | Covered | No extra external calls beyond existing `jscode2session`; DB writes are one transaction. |
| 6 Info isolation | Covered | Tenant is selected from authorized `open_corpid`; member and card records include tenant ids. |
| 7 Data accuracy | Covered | Repeated logins reuse `member_identity`; fixed concurrent binding conflict return value. |
| 8 Parameter passing | Covered | Internal ids stay in signed employee session; public ids are derived and schema-compatible. |
| 9 UX | Covered | Real employee sessions now auto-initialize a current card and publish it for public viewing. |
| 10 Coding standards | Covered | Tests, typecheck, lint, build, and RLS validation passed. |
| 11 Testing | Covered | Added unit tests for provisioning reuse and binding conflict, plus app-level default-card/public-card flow. |
| 12 Deploy & Ops | Covered | No new env var introduced; local DB verification remains blocked without `DATABASE_URL`. |

## Verification Log
- `git pull --ff-only`: passed; branch already up to date.
- `git diff --stat 4c21917..0345ad6`: 18 files, 585 insertions, 44 deletions.
- `npm.cmd test`: passed after fix; 12 suites / 47 tests.
- `npm.cmd run typecheck`: passed.
- `npm.cmd run lint`: passed.
- `npm.cmd run build`: passed.
- `npm.cmd run rls:validate`: passed.
- `npm.cmd run db:verify`: blocked by missing `DATABASE_URL` in the local audit environment.
- `npm.cmd audit --omit=dev`: blocked by local/global npm failure: `Class extends value undefined is not a constructor or null`.
- Static scan for `eval`, `Function`, string-built SQL, debug logs, TODO/FIXME/HACK, and unsafe HTML in touched backend areas: no matches.

## Fix Guide
1. WEL-P1-1: Fixed in the audit follow-up patch by returning the inserted binding account id or re-reading the pre-existing binding on conflict.

## Doc Updates Needed
- `docs/02-tasks/02_01_M1_Walking_Skeleton.md` updated to reflect real WeCom login path implementation.
- `docs/02-tasks/02_02_First_Enterprise_Wecom_Admin_Plan.md` updated to mark Stage 2.3/2.4 complete and Stage 3 next.

## Residual Risk
- Real WeCom field semantics for `jscode2session` still need M0-M1 gate verification against an authorized tenant.
- `db:verify` still needs a disposable local PostgreSQL `DATABASE_URL` to exercise the schema and RLS probe end to end.

## Next Steps
1. Commit and push the WEL-P1-1 fix plus this report.
2. Continue Stage 3: enterprise administrator OAuth/scan login, `tenant_admins` lookup, admin session/guard, and minimal RBAC.
