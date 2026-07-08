# 99_32 - Member Status Alignment - 2026-07-07

## Scope
- Range: `2f92302..79b8d13` (`fix: reflect persisted member status in cards`)
- Files: 6 changed
- Auto-selected depth: deep
- Risk score: 8 (member lifecycle status, public preview visibility, admin read path, tenant-scoped DB state)

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
- Persisted `member_identities.status` now flows into admin member card sessions.
- `EmployeeCardRepository` aligns existing and newly created in-memory cards with optional session status.
- Public preview status is derived from the aligned card state.
- Existing privacy gates for mobile/email/wechat fields remain unchanged.

## Doc Updates Needed
- None.
