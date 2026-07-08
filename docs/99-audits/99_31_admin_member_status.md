# 99_31 - Admin Member Status - 2026-07-07

## Scope
- Range: `52aee8a..2f92302` (`feat: let admins toggle member status`)
- Files: 11 changed
- Auto-selected depth: deep
- Risk score: 9 (admin write action, tenant member lifecycle, public directory status, employee card visibility, multi-tenant data)

## Summary
- P0: 0
- P1: 1 fixed
- P2: 1 fixed
- Open issues: 0

## Findings

### P0 - Must Fix
| ID | Status | Title | File | Line | Evidence | Fix |
|----|--------|-------|------|------|----------|-----|
| - | - | None | - | - | - | - |

### P1 - Should Fix Soon
| ID | Status | Title | File | Line | Evidence | Fix |
|----|--------|-------|------|------|----------|-----|
| B-P1-1 | Fixed | Persisted disabled status was not reflected when reading the admin member card | `backend/src/admin-management/admin-management.repository.ts` | 160 | `updateMemberStatus()` wrote `member_identities`, `cards`, and `public_card_directory`, but `getMemberSession()` did not carry `member_identities.status` into `EmployeeCardRepository`. A later `GET /admin/members/{id}/card` could show an in-memory/default active card despite the persisted row being disabled. | Fixed in the follow-up status alignment change: `EmployeeSession` now carries optional status, DB member sessions include normalized status, and `EmployeeCardRepository` aligns existing/new cards and previews to the session status. |

### P2 - Nice To Have
| ID | Status | Title | File | Line | Evidence | Fix |
|----|--------|-------|------|------|----------|-----|
| D-P2-1 | Fixed | API spec still implied a separate card status endpoint was available | `docs/01-specs/01_02_Api_Spec.md` | 134 | The implemented endpoint is `PUT /api/v1/admin/members/{id}/card` with a `status` field, while the spec still listed `/api/v1/admin/cards/{id}/status` without marking it as planned. | Updated the spec to mark independent `/admin/cards` and `/admin/cards/{id}/status` as planned, with the current status path documented on the member-card endpoint. |

## Verification Log
- Passed: `npm.cmd test` (22 suites, 82 tests)
- Passed: `npm.cmd run typecheck`
- Passed: `npm.cmd run lint`
- Passed: `npm.cmd run build`
- Passed: `npm.cmd run rls:validate`
- Passed: `node --check admin/app.js`
- Passed: `git diff --check`
- Blocked locally: `npm.cmd run db:verify` requires `DATABASE_URL`
- Blocked locally: `npm.cmd audit --omit=dev` fails in local npm with `Class extends value undefined is not a constructor or null`

## Coverage Notes
- `PUT /api/v1/admin/members/{id}/card` remains protected by `AdminAuthGuard` and requires operator/admin/owner through the service RBAC check.
- DB status updates run inside `TenantTx`, update the member row, primary card row, and `public_card_directory` status.
- Workbench exposes active/disabled through the admin member card panel.
- The new employee repository test verifies disabled session status reaches both card response and public preview.

## Doc Updates Needed
- None.
