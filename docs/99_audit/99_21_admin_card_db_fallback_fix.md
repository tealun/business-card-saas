# 99_21 - Admin Card DB Fallback Fix - 2026-07-07

## Scope
- Range: `31b5f08..6abf4f1` (`fix: prevent admin card fallback in db mode`)
- Files: 4 changed
- Auto-selected depth: deep
- Risk score: 9 (admin read/write path, tenant-scoped persistence, fallback behavior)

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
- Passed: `npm.cmd test -- admin-management.service.spec.ts admin-management.repository.spec.ts` (2 suites, 10 tests)
- Passed: `npm.cmd run typecheck`
- Passed: `git diff --check 31b5f08..6abf4f1`

## Coverage Notes
- `AdminManagementService.getMemberCard()` now throws `NotFoundException` when DB persistence is configured and the repository returns no persisted member card.
- `AdminManagementService.updateMemberCard()` applies the same DB-mode not-found behavior before any in-memory fallback.
- Local no-DB fallback remains available because `AdminManagementRepository.isDatabaseConfigured()` delegates to the existing `TenantTx + DATABASE_URL` check.

## Doc Updates Needed
- None.
