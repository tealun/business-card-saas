# 99_33 - Admin Member Card Persistence - 2026-07-07

## Scope
- Range: `3a066e5..31b5f08` (`feat: persist admin member card fields`)
- Files: 8 changed
- Auto-selected depth: deep
- Risk score: 12 (admin write surface, PII fields, tenant-scoped DB writes, public directory status, WeCom module dependency)

## Summary
- P0: 0
- P1: 1
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
| A20-P1-1 | Fixed | DB-mode member misses could fall back to in-memory cards | `backend/src/admin-management/admin-management.service.ts` | 89 | In `31b5f08`, `getMemberCard()` and `updateMemberCard()` called the DB repository first, but a `null` result then continued into `toEmployeeSession()` and the in-memory `EmployeeCardService`. With `DATABASE_URL` configured, a missing persisted member could be masked as a local fallback card when the requested id matched the admin session member id. | Added `AdminManagementRepository.isDatabaseConfigured()` and changed admin card read/write to throw `NotFoundException` when persistence is enabled but no DB member/card row is found; added a service regression test covering both GET and PUT. |

### P2 - Nice To Have
| ID | Status | Title | File | Line | Evidence | Fix |
|----|--------|-------|------|------|----------|-----|
| - | - | None | - | - | - | - |

## Verification Log
- Passed before audit fix: `npm.cmd test` (22 suites, 83 tests)
- Passed before audit fix: `npm.cmd run typecheck`
- Passed before audit fix: `npm.cmd run lint`
- Passed before audit fix: `npm.cmd run build`
- Passed before audit fix: `npm.cmd run rls:validate`
- Passed before audit fix: `node --check admin/app.js`
- Passed before audit fix: `git diff --check`
- Passed after audit fix: `npm.cmd test -- admin-management.service.spec.ts admin-management.repository.spec.ts` (2 suites, 10 tests)
- Passed after audit fix: `npm.cmd test` (22 suites, 84 tests)
- Passed after audit fix: `npm.cmd run typecheck`
- Passed after audit fix: `npm.cmd run lint`
- Passed after audit fix: `npm.cmd run build`
- Passed after audit fix: `npm.cmd run rls:validate`
- Passed after audit fix: `node --check admin/app.js`
- Passed after audit fix: `git diff --check`
- Blocked locally: `npm.cmd run db:verify` requires `DATABASE_URL`
- Blocked locally: `npm.cmd audit --omit=dev` fails in local npm with `Class extends value undefined is not a constructor or null`

## Coverage Notes
- Admin card read/write now uses tenant-scoped `TenantTx.run()` and parameterized SQL.
- Contact fields are stored in `cards.fields_encrypted`; legacy `email_encrypted` / `phone_encrypted` remain as compatibility fields.
- Public directory upsert stores only `public_id`, `tenant_id`, `card_id`, and `status`, not PII.
- The regression test verifies encrypted storage does not contain plaintext email or mobile values.

## Doc Updates Needed
- None. The API spec, main dev doc, and WeCom admin development plan were updated in `31b5f08`.
