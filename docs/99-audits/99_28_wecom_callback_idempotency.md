# 99_28 - WeCom Callback Idempotency - 2026-07-06

## Scope
- Range: `d9f1c1b..0d5b310` (`feat: add WeCom callback event idempotency`)
- Files: 10 changed
- Auto-selected depth: deep
- Risk score: 10 (WeCom callback retry semantics, platform event state, database writes, tenant member lifecycle, operational recovery)

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
| B-P1-1 | Fixed | Processing callback events can get stuck and block retries | `backend/src/wecom/wecom-callback-event.repository.ts` | 116 | `beginProcessing()` returned `shouldProcess: false` for any existing `processing` event. If the process crashed after marking `processing`, or if `markFailed()` could not update status, Enterprise WeChat retries would be acknowledged without re-running the business mutation. | Fixed in the follow-up stale retry change: processing events older than 5 minutes are retryable, increment `retry_count`, clear `last_error`, refresh `updated_at`, and re-run the callback mutation. |

### P2 - Nice To Have
| ID | Status | Title | File | Line | Evidence | Fix |
|----|--------|-------|------|------|----------|-----|
| - | - | None | - | - | - | - |

## Verification Log
- Passed: `npm.cmd test` (20 suites, 78 tests)
- Passed: `npm.cmd run typecheck`
- Passed: `npm.cmd run lint`
- Passed: `npm.cmd run build`
- Passed: `npm.cmd run rls:validate`
- Passed: `node --check admin/app.js`
- Passed: `git diff --check`
- Blocked locally: `npm.cmd run db:verify` requires `DATABASE_URL`
- Blocked locally: `npm.cmd audit --omit=dev` fails in local npm with `Class extends value undefined is not a constructor or null`

## Coverage Notes
- `callback_events` is a platform table and remains outside tenant RLS; application code sets tenant identity in the event row.
- Duplicate `done` events are safely skipped.
- `failed` events are retryable and increment `retry_count`.
- Stale `processing` events older than 5 minutes are retryable to recover from process crashes or status-write failures.

## Doc Updates Needed
- None. API spec documents the current stale retry behavior.
