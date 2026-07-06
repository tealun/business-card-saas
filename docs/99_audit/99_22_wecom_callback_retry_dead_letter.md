# 99_22 - WeCom Callback Retry Dead Letter - 2026-07-07

## Scope
- Range: `e1d9288..b5b5b93` (`feat: retry failed WeCom callback events`)
- Files: 18 changed
- Auto-selected depth: deep
- Risk score: 11 (WeCom callbacks, tenant-scoped admin API, stored encrypted payload replay, dead-letter state)

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
- Passed: `npm.cmd test -- wecom-callback-event.repository.spec.ts wecom-callback-crypto.service.spec.ts wecom-data-callback.service.spec.ts admin-management.service.spec.ts` (4 suites, 28 tests)
- Passed: `npm.cmd run typecheck`
- Passed: `npm.cmd run lint`
- Passed: `git diff --check e1d9288..b5b5b93`
- Pre-commit full verification passed: `npm.cmd test`, `npm.cmd run build`, `npm.cmd run rls:validate`, `node --check admin/app.js`, `git diff --check`
- Known local blockers remain unchanged: `npm.cmd run db:verify` requires `DATABASE_URL`; `npm.cmd audit --omit=dev` fails in local npm with `Class extends value undefined is not a constructor or null`

## Coverage Notes
- Retry candidate selection is restricted to failed `source=data` events with stored encrypted payloads and an explicit retry budget.
- Tenant isolation is preserved by passing the admin session tenant into `retryFailedEvents()` and filtering retry candidates by `tenant_id`.
- Dead-lettered callback events use status `dead` and are excluded from retry candidate listing.
- Stored ciphertext retry bypasses callback signature recreation only after the original encrypted payload has already been recorded; decrypted payloads still pass the normal SuiteId/AuthCorpId receive-id validation through `handleDataMessage()`.
- Admin retry execution requires `admin` role and is exposed through the existing admin session flow.

## Doc Updates Needed
- None.
