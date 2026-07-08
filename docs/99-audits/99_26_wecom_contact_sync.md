# 99_26 - WeCom Contact Sync - 2026-07-06

## Scope
- Range: `c303d30..caf298e` (`feat: add WeCom contact sync MVP` plus audit fix)
- Files: 18 changed
- Auto-selected depth: deep
- Risk score: 9 (WeCom platform API, admin write action, multi-tenant RLS, identity data, database writes)

## Summary
- P0: 0
- P1: 1 fixed
- P2: 0
- Open issues: 0

## Findings

### P0 - Must Fix
| ID | Status | Title | File | Line | Evidence | Fix |
|----|--------|-------|------|------|----------|-----|
| - | - | None | - | - | - | - |

### P1 - Should Fix Soon
| ID | Status | Title | File | Line | Evidence | Fix |
|----|--------|-------|------|------|----------|-----|
| B-P1-1 | Fixed | Contact sync could hit identity unique-key conflicts after partial identity discovery | `backend/src/wecom/wecom-contact-sync.repository.ts` | 68 | `a6dd2c1` matched members by `open_userid OR userid` and then wrote both identifiers onto the selected row. If one employee had separate rows from login-only and contact-sync-only discovery, the update could collide with `uk_member_userid` or `uk_member_open_userid`. | Fixed in `caf298e`: before updating, the repository checks whether each identifier is already owned by another member and only fills non-conflicting values. |

### P2 - Nice To Have
| ID | Status | Title | File | Line | Evidence | Fix |
|----|--------|-------|------|------|----------|-----|
| - | - | None | - | - | - | - |

## Verification Log
- Passed: `npm.cmd test` (17 suites, 66 tests)
- Passed: `npm.cmd run typecheck`
- Passed: `npm.cmd run lint`
- Passed: `npm.cmd run build`
- Passed: `npm.cmd run rls:validate`
- Passed: `node --check admin/app.js`
- Passed: `git diff --check`
- Blocked locally: `npm.cmd run db:verify` requires `DATABASE_URL`
- Blocked locally: `npm.cmd audit --omit=dev` fails in local npm with `Class extends value undefined is not a constructor or null`

## Coverage Notes
- `POST /api/v1/admin/members/sync` requires admin/owner through `requireAdminRole(session.role, "admin")`.
- Sync resolves tenant authorization by `tenantId`, then obtains a corp access token and pages through WeCom `user/list_id`.
- Member and card writes run inside `TenantTx.run`, so tenant RLS context is set before DB writes.
- `member_identities` stores both `userid` and `open_userid` as optional identity fields; API summaries expose both as nullable to reflect WeCom permission differences.
- Existing card/public directory status is updated during sync, so later disabled-member handling has a consistent write path.

## Doc Updates Needed
- None remaining for this audit. API spec and the WeCom admin development plan already include `POST /api/v1/admin/members/sync` and stage 5.1 status.
