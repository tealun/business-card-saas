# 99_17 - Admin Sync Events - 2026-07-06

## Scope
- Range: `987b953..96f39df` (`feat: expose WeCom sync event logs to admins`)
- Files: 10 changed
- Auto-selected depth: deep
- Risk score: 9 (admin route, platform event table, tenant filtering, callback operational data, UI workbench)

## Summary
- P0: 0
- P1: 0
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
| - | - | None | - | - | - | - |

### P2 - Nice To Have
| ID | Status | Title | File | Line | Evidence | Fix |
|----|--------|-------|------|------|----------|-----|
| D-P2-1 | Fixed | WeCom integration checklist still marked callback_events as incomplete | `docs/01-specs/01_01_Wecom_Integration.md` | 285 | The admin sync event work now reads `callback_events`, and earlier commits created the idempotency table/repository, but the M1 checklist still used an unchecked item for the callback service skeleton. | Updated the checklist item to `[x]` so the spec matches the implemented callback skeleton. |

## Verification Log
- Passed: `npm.cmd test` (21 suites, 80 tests)
- Passed: `npm.cmd run typecheck`
- Passed: `npm.cmd run lint`
- Passed: `npm.cmd run build`
- Passed: `npm.cmd run rls:validate`
- Passed: `node --check admin/app.js`
- Passed: `git diff --check`
- Blocked locally: `npm.cmd run db:verify` requires `DATABASE_URL`
- Blocked locally: `npm.cmd audit --omit=dev` fails in local npm with `Class extends value undefined is not a constructor or null`

## Coverage Notes
- `GET /api/v1/admin/sync-events` is behind `AdminAuthGuard`.
- Repository query filters platform `callback_events` by `tenant_id = $1` using the current admin session tenant.
- Response schema excludes `payload_encrypted`; the workbench shows only event status metadata.
- Repository test verifies tenant parameter binding and non-exposure of encrypted payload data.

## Doc Updates Needed
- None.
