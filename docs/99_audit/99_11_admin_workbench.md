# 99_11 - Admin Workbench - 2026-07-06

## Scope
- Range: `560c3b3..ccfc4fb`
- Files: 4 changed
- Auto-selected depth: standard
- Risk score: 5
- Signals: admin UI token handling, user-facing admin workflow, API request wiring

## Summary
- P0: 0 | P1: 0 | P2: 1
- New issues: 1 | Fixed from previous: 0
- Result: Static admin workbench is wired to the MVP APIs after fixing one token-input UX issue.

## Findings

### P0 - Must Fix
| ID | Status | Title | File | Line | Evidence | Fix |
|----|--------|-------|------|------|----------|-----|
| - | - | None | - | - | - | - |

### P1 - Should Fix
| ID | Status | Title | File | Line | Evidence | Fix |
|----|--------|-------|------|------|----------|-----|
| - | - | None | - | - | - | - |

### P2 - Nice to Have
| ID | Status | Title | File | Line | Evidence | Fix |
|----|--------|-------|------|------|----------|-----|
| AW-P2-1 | Fixed | Admin API requests used stale token until Save Token was clicked | `admin/app.js` | 49 | `adminRequest` originally sent `state.adminToken`; editing the input without pressing Save left state stale and made API calls fail with the previous token. | `adminRequest` now reads `#adminToken` before every admin API request. |

## Coverage Map
| Dimension | Status | Notes |
|-----------|--------|-------|
| 1 Architecture | Covered | Static workbench remains no-build and API-base configurable. |
| 2 Platform integration | Covered | UI calls existing backend admin/session, overview, members, config, employee, public, visit, and share endpoints. |
| 3 Security | Covered | Admin token is manually supplied and sent only as Bearer for admin requests. |
| 4 Code efficiency | Covered | Existing request/envelope helpers are reused. |
| 5 Runtime smoothness | Covered | JS syntax check passes; no build step required. |
| 6 Info isolation | Covered | Tenant/member scoping remains backend-enforced. |
| 7 Data accuracy | Covered | Admin card edits reuse the same card form payload as employee edits. |
| 8 Parameter passing | Covered | Member id is URL-encoded before admin card requests. |
| 9 UX | Covered | Added visible admin session, overview, members, company, fields, and template controls. |
| 10 Coding standards | Covered | Static JS syntax check and backend checks passed. |
| 11 Testing | Covered | `node --check admin/app.js` plus backend test suite passed. |
| 12 Deploy & Ops | Covered | No new build or hosting requirement. |

## Verification Log
- `git pull --ff-only`: passed; branch already up to date.
- `git diff --stat 560c3b3..ccfc4fb`: 4 files, 225 insertions, 19 deletions.
- `node --check admin/app.js`: passed.
- `npm.cmd test`: passed after fix; 16 suites / 60 tests.
- `npm.cmd run typecheck`: passed.
- `npm.cmd run lint`: passed.
- `npm.cmd run build`: passed.
- `npm.cmd run rls:validate`: passed.
- `npm.cmd run db:verify`: blocked by missing `DATABASE_URL` in the local audit environment.
- `npm.cmd audit --omit=dev`: blocked by local/global npm failure: `Class extends value undefined is not a constructor or null`.

## Residual Risk
- Real admin OAuth/scan login is not yet a visual flow; the workbench accepts a manually pasted admin token for API testing.
- Static workbench remains a联调台, not the final production admin application shell.

## Doc Updates Needed
- `admin/README.md` updated with the expanded workbench coverage.

## Next Steps
1. Commit and push the AW-P2-1 fix plus this report.
2. Continue Stage 5: WeCom contact/member sync or replace in-memory admin config with durable DB-backed repositories.
