# 99_27 - WeCom Data Callbacks - 2026-07-06

## Scope
- Range: `64c008a..d9f1c1b` (`feat: add WeCom data contact callbacks`)
- Files: 12 changed
- Auto-selected depth: deep
- Risk score: 10 (WeCom signed callback receiver, third-party platform integration, multi-tenant identity data, database writes, admin/member lifecycle impact)

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
| B-P1-1 | Fixed | Data callbacks do not persist event-level idempotency state | `backend/src/wecom/wecom-data-callback.service.ts` | 52 | `receive()` decrypted and immediately applied member mutations. Existing writes were mostly idempotent, but project specs require `callback_events.event_key` with `UNIQUE(event_key)` and retry status tracking before business processing. Duplicate `change_contact` deliveries could not be audited or explicitly skipped at the event layer. | Fixed in the follow-up callback idempotency change: added `callback_events` schema/index, `WecomCallbackEventRepository`, and data callback begin/done/failed wrapping. Duplicate `done/processing` events return success; `failed` events can retry and increment `retry_count`. |

### P2 - Nice To Have
| ID | Status | Title | File | Line | Evidence | Fix |
|----|--------|-------|------|------|----------|-----|
| - | - | None | - | - | - | - |

## Verification Log
- Passed: `npm.cmd test` (20 suites, 77 tests)
- Passed: `npm.cmd run typecheck`
- Passed: `npm.cmd run lint`
- Passed: `npm.cmd run build`
- Passed: `npm.cmd run rls:validate`
- Passed: `node --check admin/app.js`
- Passed: `git diff --check`
- Blocked locally: `npm.cmd run db:verify` requires `DATABASE_URL`
- Blocked locally: `npm.cmd audit --omit=dev` fails in local npm with `Class extends value undefined is not a constructor or null`

## Coverage Notes
- Data callback decryption uses independent `WECOM_DATA_CALLBACK_TOKEN` and `WECOM_DATA_CALLBACK_AES_KEY`; production requires both separately.
- The handler now supports third-party `InfoType=change_contact` + `AuthCorpId` + `SuiteId`, with internal-app `Event=change_contact` fallback.
- Receiver ownership is checked: third-party payload `SuiteId` must match the encrypted receiver, and internal-app corp id must match the encrypted receiver.
- `create_user/update_user` upsert active members; `delete_user` disables existing member identity, primary card, and public directory entry.
- `NewUserID` is preferred on update events so Enterprise WeChat userid changes are not lost.

## Doc Updates Needed
- Keep `docs/01-specs/01_02_Api_Spec.md` and `docs/02-tasks/02_02_First_Enterprise_Wecom_Admin_Plan.md` aligned after the idempotency fix.
