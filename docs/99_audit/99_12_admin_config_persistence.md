# 99_12 - Admin Config Persistence - 2026-07-06

## Scope
- Range: `db212f2..1259073` (`feat: persist admin configuration settings` plus audit fix)
- Files: 7 changed
- Auto-selected depth: deep
- Risk score: 8 (admin surface, multi-tenant RLS, database writes, user-facing API, PII-related contact fields)

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
| B-P1-1 | Fixed | Empty DB template lists returned a non-persisted fallback ID | `backend/src/admin-config/admin-config.repository.ts` | 179 | In `7703836`, a DB tenant with no template rows received fallback `tpl_demo_business`; later update/default calls could not find that row in `templates`. | Fixed in `1259073`: DB list now seeds and returns a real default template row, with conflict handling for concurrent first reads. |

### P2 - Nice To Have
| ID | Status | Title | File | Line | Evidence | Fix |
|----|--------|-------|------|------|----------|-----|
| - | - | None | - | - | - | - |

## Verification Log
- Passed: `npm.cmd test` (16 suites, 62 tests)
- Passed: `npm.cmd run typecheck`
- Passed: `npm.cmd run lint`
- Passed: `npm.cmd run build`
- Passed: `npm.cmd run rls:validate`
- Passed: `git diff --check`
- Blocked locally: `npm.cmd run db:verify` requires `DATABASE_URL`
- Blocked locally: `npm.cmd audit --omit=dev` fails in local npm with `Class extends value undefined is not a constructor or null`

## Coverage Notes
- Tenant data paths use `TenantTx.run`, so `app.tenant_id` is set before DB reads/writes.
- `tenant_field_settings`, `templates`, and `company_profiles` all have RLS policies using `current_setting('app.tenant_id', true)::bigint`.
- Config write operations still require `admin` or `owner` through `requireAdminRole`; auditor read access remains read-only.
- Added database-path tests for first persisted template defaulting and empty-list template seeding.

## Doc Updates Needed
- None for this audit. The development plan already notes that field rules, company profiles, and templates are now persisted with memory fallback.
