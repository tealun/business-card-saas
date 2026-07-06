# 99_25 - WeCom Callback Alerts - 2026-07-07

## Scope
- Range: `f3369ab..d499af5`
- Commits: `f4a5e23 feat: alert on WeCom callback dead letters`; `d499af5 fix: hash WeCom callback alert event keys`
- Files: 10 changed
- Auto-selected depth: deep
- Risk score: 10 (external webhook, callback dead-letter state, tenant identifiers, encrypted callback payload handling)

## Summary
- P0: 0
- P1: 1 fixed
- P2: 0
- Open issues: 0

## Findings

### P0 - Must Fix
| ID | Status | Title | File | Line | Evidence | Fix |
|----|--------|-------|------|------|----------|-----|
| - | - | No P0 findings verified | - | - | - | - |

### P1 - Should Fix Soon
| ID | Status | Title | File | Line | Evidence | Fix |
|----|--------|-------|------|------|----------|-----|
| WCA-P1-1 | Fixed | External callback alert payload exposed raw event keys | `backend/src/wecom/wecom-callback-alert.service.ts` | 46 | `f4a5e23` sent `event_key` to the configured webhook. Some event keys can include provider/corp identifiers before the message id, so this was not fully redacted. | Fixed in `d499af5`: webhook payload now sends `event_key_hash` only, with a regression test asserting the raw key is absent. |

### P2 - Nice To Have
| ID | Status | Title | File | Line | Evidence | Fix |
|----|--------|-------|------|------|----------|-----|
| - | - | No P2 findings verified | - | - | - | - |

## Verification
- `npm.cmd test -- wecom-callback-alert.service.spec.ts wecom-data-callback.service.spec.ts` - passed, 2 suites / 11 tests.
- `npm.cmd test` - passed, 26 suites / 103 tests.
- `npm.cmd run typecheck` - passed.
- `npm.cmd run lint` - passed.
- `npm.cmd run build` - passed.
- `npm.cmd run rls:validate` - passed.
- `node --check admin/app.js` - passed.
- `git diff --check f3369ab..d499af5` - passed.
- Static scan confirmed alert code sends `event_key_hash`, does not send stored encrypted callback payloads, and does not send `permanentCode` / `permanent_code`.

## Blocked / Environment Checks
- `npm.cmd run db:verify` did not run locally because `DATABASE_URL is required`.
- `npm.cmd audit --omit=dev` did not run because the local npm CLI failed with `Class extends value undefined is not a constructor or null`.

## Dimension Coverage
| # | Dimension | Result |
|---|-----------|--------|
| 1 | Architecture | Checked: alerting is isolated in `WecomCallbackAlertService`, while data callback service only triggers it on dead-letter transitions. |
| 2 | Platform integration | Checked: alert webhook is optional, timeout-bound, and does not block callback retry/dead-letter results. |
| 3 | Security | Checked: webhook bearer token is optional env config; outbound payload excludes ciphertext, raw event key, and permanent code. |
| 4 | Code efficiency | Checked: implementation is a small service with no new storage layer or job framework. |
| 5 | Runtime smoothness | Checked: webhook errors/timeouts resolve to `{ sent: false }` and do not throw into callback processing. |
| 6 | Info isolation | Checked: tenant id is included for internal triage, but raw callback payload and raw event key are not exported. |
| 7 | Data accuracy | Checked: retry/dead counts preserve existing behavior; alert fires on dead-letter state. |
| 8 | Parameter passing | Checked: env vars are optional and trimmed; webhook payload has explicit keys. |
| 9 | UX | Checked: admin sync-events view remains the detailed source of truth; webhook only wakes operators. |
| 10 | Coding standards | Checked: lint/type/build pass. |
| 11 | Testing | Checked: added alert skip/post tests and data callback dead-letter alert assertion. |
| 12 | Deploy & Ops | Checked: `.env.example` documents `WECOM_CALLBACK_ALERT_WEBHOOK_URL` and `WECOM_CALLBACK_ALERT_WEBHOOK_TOKEN`; real destination is deployment config. |

## Next Steps
1. Configure `WECOM_CALLBACK_ALERT_WEBHOOK_URL` in staging when an ops notification endpoint exists.
2. Run `npm.cmd run db:verify` with a real PostgreSQL test URL.
3. Re-run `npm.cmd audit --omit=dev` after fixing the local npm CLI/runtime issue.
