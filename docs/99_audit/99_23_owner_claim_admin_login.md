# 99_23 - Owner Claim Admin Login - 2026-07-07

## Scope
- Range: `0f91c5c..ae38e63` (`feat: support owner claim admin login`)
- Files: 19 changed
- Auto-selected depth: deep
- Risk score: 12 (admin login, owner bootstrap, one-time secret token, tenant RLS, DB uniqueness)

## Summary
- P0: 0
- P1: 0
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
| - | - | None | - | - | - | - |

### P2 - Nice To Have
| ID | Status | Title | File | Line | Evidence | Fix |
|----|--------|-------|------|------|----------|-----|
| - | - | None | - | - | - | - |

## Verification Log
- Passed: `npm.cmd test -- owner-bootstrap.repository.spec.ts admin-auth.service.spec.ts owner-bootstrap.service.spec.ts` (3 suites, 10 tests)
- Passed: `npm.cmd test` (23 suites, 95 tests)
- Passed: `npm.cmd run typecheck`
- Passed: `npm.cmd run lint`
- Passed: `npm.cmd run build`
- Passed: `npm.cmd run rls:validate`
- Passed: `node --check admin/app.js`
- Passed: `git diff --check 0f91c5c..ae38e63`
- Passed: static scan for `eval`, `Function`, unsafe HTML, string-built SQL, unsafe `current_setting`, and `BYPASSRLS` in touched backend/admin/database surfaces
- Known local blockers remain unchanged: `npm.cmd run db:verify` requires `DATABASE_URL`; `npm.cmd audit --omit=dev` fails in local npm with `Class extends value undefined is not a constructor or null`

## Coverage Notes
- `admin_claim_tokens` is now tenant-scoped through RLS and the validation script treats it as a required tenant RLS table.
- Claim token login is tenant-bound: the WeCom code resolves the tenant first, and token lookup/consumption runs inside `TenantTx` for that tenant.
- Token reuse is blocked by `used_at IS NULL` plus the transaction-local update-before-insert flow.
- Concurrent active owner creation is guarded by `uk_tenant_owner_active`.
- Admin workbench can now exchange a WeCom admin code plus optional owner claim token for a signed admin token without manually pasting a token first.

## Doc Updates Needed
- None.
