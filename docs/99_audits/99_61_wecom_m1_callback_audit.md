# 99_61 - WeCom M1 Callback Audit - 2026-07-16

## Scope
- Range: `95199ed..57800d2` (2 commits)
- Files audited: `backend/src/wecom/wecom-authorization.service.ts`, `backend/src/wecom/wecom-authorization.service.spec.ts`, `backend/src/wecom/wecom-data-callback.service.ts`, `backend/src/wecom/wecom-data-callback.service.spec.ts`
- Baseline: `main@57800d26058450822827c1f62ccdc3418d983ffc`; worktree dirty from pre-existing doc changes and this audit report; unrelated uncommitted docs excluded
- Auto-selected depth: Deep
- Risk score: 10 (WeCom third-party callbacks +3, auth/JWT platform +3, tenant isolation +3, database writes +1)

## Summary
- P0: 0
- P1: 0 open / 1 fixed
- P2: 0

Verdict: the new code improves the M1 WeCom walking skeleton by connecting authorization to contact sync and department callbacks to full contact refresh. The main remaining risk is recovery: post-authorization contact sync failures are intentionally swallowed and are not persisted as retryable work.

## System Goal & Critical Paths
- Goal / protected properties: a real WeCom enterprise can authorize the third-party app, create/update tenant authorization, sync members, provision default cards, and keep contact data aligned without cross-tenant leakage.
- Path A: `create_auth` command callback -> permanent code -> tenant authorization -> first contact sync -> member/card provisioning. Health: At risk because contact sync failure is logged only, not persisted for retry.
- Path B: `change_auth` command callback -> authorization refresh -> contact sync. Health: At risk for the same retry gap.
- Path C: `change_contact` department callback -> tenant lookup -> full contact sync -> callback event retry/dead-letter. Health: Healthy; failures flow through existing callback retry handling.

## Confirmed Strengths
- `handleAuthCode` still single-flights concurrent duplicate auth-code processing via `authCodeOperations`.
- Tenant lookup and contact mutation still flow through existing tenant-aware repository/service boundaries.
- Data callback department events now use the existing retry/dead-letter path because failures are thrown inside `handleDataMessage`.
- Tests cover authorization-triggered sync, sync failure not rolling back authorization, and department callback-triggered sync.

## Verification Gaps
- Live WeCom authorization and contact API behavior were not exercised; this audit used static inspection and Jest tests.
- Command callback retry for `create_auth` failures remains outside this patch's implemented surface.
- No DB-backed outbox or retry table was observed for post-authorization sync failures.

## Findings

### P0 - Must Fix
None.

### P1 - Should Fix Soon
| ID | Type | Confidence | Status | Title | Path/Dimension | File | Line | Evidence | Fix |
|----|------|------------|--------|-------|----------------|------|------|----------|-----|
| A61-P1-1 | Confirmed | High | Fixed | Post-authorization contact sync failures are logged but not recoverable | WeCom authorization / Platform integration, Runtime, Data accuracy, Ops | `backend/src/wecom/wecom-authorization.service.ts` | 95 | `syncAuthorizedTenant` catches all errors, logs a warning, and returns; tests assert authorization stays active when sync fails. The command callback can then mark the event done, leaving no durable retry record for the initial member/card provisioning step. | Fixed by recording failed authorization-triggered contact sync as a durable `sync` callback event and including it in admin retry. Verification: `npm.cmd run lint`, `npm.cmd test`, `npm.cmd run build` passed. |

### P2 - Nice to Have
None.

## 12-Dimension Coverage
- 1 Architecture: Mostly healthy; changes reuse existing WeCom services and repositories.
- 2 Platform integration: At risk; authorization-to-sync is connected, but sync failure has no durable compensation.
- 3 Security: Healthy in inspected diff; no new secret exposure or auth bypass found.
- 4 Code efficiency: Acceptable; full sync on department change is conservative and bounded by existing page safety limit.
- 5 Runtime smoothness: At risk; WeCom contact API outage after authorization requires manual intervention.
- 6 Info isolation: Healthy in inspected diff; tenant IDs come from saved authorization/tenant lookup, not request body.
- 7 Data accuracy: At risk; failed initial sync can leave tenant authorization active with missing members/cards.
- 8 Parameter passing: Healthy; no public/internal ID boundary regression found.
- 9 UX: Indirect risk; newly authorized enterprise may not see expected members/cards after transient sync failure.
- 10 Coding standards: Healthy; lint/typecheck pass and patterns match existing services.
- 11 Testing: Good for new paths; missing test for a durable retry mechanism because none exists.
- 12 Deploy & Ops: At risk; no durable operational recovery path for post-auth sync failure.

## Verification Log
- Accepted A61-P1-1: inspected `WecomAuthorizationService.syncAuthorizedTenant` lines 95-108 and `WecomAuthorizationService` tests; ran `npm.cmd test -- --runTestsByPath src/wecom/wecom-authorization.service.spec.ts src/wecom/wecom-data-callback.service.spec.ts src/wecom/wecom-contact-sync.service.spec.ts` (18 passed) and `npm.cmd run typecheck` (passed).
- Fixed A61-P1-1: `recordTenantSyncFailure` persists failed auth-triggered sync as `source='sync'`; `retryFailedContactSyncs` consumes retryable sync events; admin retry aggregates data callback and sync compensation results. Verification after fix: `npm.cmd test -- --runTestsByPath src/wecom/wecom-authorization.service.spec.ts src/wecom/wecom-callback-event.repository.spec.ts src/admin-management/admin-management.service.spec.ts src/admin-management/admin-management.repository.spec.ts` (26 passed), `npm.cmd run typecheck` (passed), `npm.cmd run lint` (passed), `npm.cmd test` (50 suites / 243 tests passed), `npm.cmd run build` (passed).
- Rejected candidate: department callback failures might be lost. Static inspection shows `contactSync.syncTenantMembers` runs inside `handleDataMessage` try/catch and errors mark the callback failed for retry/dead-letter.
- Rejected candidate: cross-tenant department sync. Static inspection shows tenant is resolved from decrypted callback `openCorpid` before sync.

## Doc Updates Needed
- `docs/01-specs/01_01_Wecom_Integration.md` should clarify whether post-authorization contact sync failure is allowed to be eventually consistent and what retry surface owns recovery.
- `docs/99_audits/99_9999_deferred.md` can track A61-P1-1 if it is intentionally deferred until a platform-level command callback retry/outbox is built.
