# 99_10 - Admin Config MVP - 2026-07-06

## Scope
- Range: `2652970..6bb3831`
- Files: 9 changed
- Auto-selected depth: deep
- Risk score: 12
- Signals: admin-protected config APIs, RBAC write permissions, tenant-scoped settings, template defaults, structured field-rule data

## Summary
- P0: 0 | P1: 1 | P2: 0
- New issues: 1 | Fixed from previous: 0
- Result: Stage 4.5-4.7 backend config APIs are implemented and verified after fixing one field-rule validation gap.

## Findings

### P0 - Must Fix
| ID | Status | Title | File | Line | Evidence | Fix |
|----|--------|-------|------|------|----------|-----|
| - | - | None | - | - | - | - |

### P1 - Should Fix
| ID | Status | Title | File | Line | Evidence | Fix |
|----|--------|-------|------|------|----------|-----|
| ACM-P1-1 | Fixed | Field settings allowed duplicate `field_key` entries | `backend/src/contracts/admin-config.ts` | 13 | The original field settings schema only required a non-empty array. Duplicate keys such as two `email` rules would make downstream card-field policy ambiguous. | Added `superRefine` uniqueness validation on field rule lists and a regression test. |

### P2 - Nice to Have
| ID | Status | Title | File | Line | Evidence | Fix |
|----|--------|-------|------|------|----------|-----|
| - | - | None | - | - | - | - |

## Coverage Map
| Dimension | Status | Notes |
|-----------|--------|-------|
| 1 Architecture | Covered | Admin config is isolated in `AdminConfigModule`; persistence is behind `AdminConfigRepository`. |
| 2 Platform integration | N/A | No new external platform call added in this range. |
| 3 Security | Covered | All routes require `AdminAuthGuard`; config writes require admin/owner. |
| 4 Code efficiency | Covered | In-memory MVP keeps simple per-tenant maps and clone boundaries. |
| 5 Runtime smoothness | Covered | Operations are bounded and synchronous for the MVP repository. |
| 6 Info isolation | Covered | Tenant id comes only from admin session, not request body. |
| 7 Data accuracy | Covered | Field-rule duplicate keys are now rejected; template default switching keeps one default. |
| 8 Parameter passing | Covered | Template ids are path parameters and checked against tenant-local templates. |
| 9 UX | Covered | Field rules, company profile, and templates now have backend endpoints for admin UI wiring. |
| 10 Coding standards | Covered | Tests, typecheck, lint, build, and RLS validation passed. |
| 11 Testing | Covered | Tests cover default reads, writes, RBAC rejection, template default uniqueness, and duplicate field-key rejection. |
| 12 Deploy & Ops | Covered | No new env vars or infra changes. |

## Verification Log
- `git pull --ff-only`: passed; branch already up to date.
- `git diff --stat 2652970..6bb3831`: 9 files, 498 insertions, 6 deletions.
- `npm.cmd test`: passed after fix; 16 suites / 60 tests.
- `npm.cmd run typecheck`: passed.
- `npm.cmd run lint`: passed.
- `npm.cmd run build`: passed.
- `npm.cmd run rls:validate`: passed.
- `npm.cmd run db:verify`: blocked by missing `DATABASE_URL` in the local audit environment.
- `npm.cmd audit --omit=dev`: blocked by local/global npm failure: `Class extends value undefined is not a constructor or null`.
- Static scan for `eval`, `Function`, string-built SQL, debug logs, TODO/FIXME/HACK, and unsafe HTML in touched admin config areas: no matches.

## Doc Updates Needed
- `docs/01-specs/01_02_Api_Spec.md` updated to expose field-rule GET/PUT.
- `docs/02-tasks/02_02_First_Enterprise_Wecom_Admin_Plan.md` updated to mark Stage 4.5-4.7 backend MVP progress.

## Residual Risk
- Config persistence is still in-memory in this MVP slice. Durable DB-backed settings are needed before production use.
- Employee-side enforcement of field locks/default visibility is not yet wired into card update behavior.

## Next Steps
1. Commit and push the ACM-P1-1 fix plus this report.
2. Wire the static admin UI to admin auth/session and Stage 4 config endpoints.
