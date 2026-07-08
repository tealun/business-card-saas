# 99_15 - WeCom Suite Ticket - 2026-07-06

## Scope
- Range: `ffc7122..58c7c35`
- Commit audited: `58c7c35 feat: receive WeCom suite ticket callbacks`
- Files changed: 13
- Auto-selected depth: deep
- Risk score: 11 (enterprise WeCom callback endpoint + encrypted platform state + SaaS auth/JWT context + PostgreSQL/RLS schema change)
- Stack: NestJS 11 backend, Fastify, TypeScript strict mode, PostgreSQL/RLS schema, WeCom third-party app callbacks.

## Summary
- P0: 0 | P1: 2 | P2: 0
- New issues found: 2
- Fixed during audit: 2
- Residual risk: real callback verification still requires a public HTTPS callback URL and real WeCom service-provider configuration.

## Findings

### P0 - Must Fix
| ID | Status | Title | File | Line | Evidence | Fix |
|----|--------|-------|------|------|----------|-----|
| - | - | None found in this audit range | - | - | - | - |

### P1 - Should Fix Soon
| ID | Status | Title | File | Line | Evidence | Fix |
|----|--------|-------|------|------|----------|-----|
| WT-P1-1 | Fixed | Missing callback query validation before signature handling | `backend/src/wecom/wecom-command-callback.controller.ts` | 11 | The audited commit accepted `msg_signature`, `timestamp`, `nonce`, and `echostr` as typed strings, but runtime values can be missing. Missing signature inputs could flow into the crypto verifier as malformed values instead of returning a clear 400. | Added `normalizeQuery()` and explicit `echostr` validation in `WecomCommandCallbackService`; added a 400 regression test for missing signature query fields. |
| WT-P1-2 | Fixed | Older suite_ticket callbacks could overwrite newer ticket state | `backend/src/wecom/wecom-suite-state.repository.ts` | 39 | The audited commit unconditionally replaced the cached/DB `suite_ticket`. A delayed retry with an older `TimeStamp` could roll back the latest usable ticket. | Added memory and SQL guards so only equal/newer `suite_ticket_updated_at` values overwrite current state; stale DB updates return the current stored value. Added regression coverage for older retry arrival. |

### P2 - Nice to Have
| ID | Status | Title | File | Line | Evidence | Fix |
|----|--------|-------|------|------|----------|-----|
| - | - | None found in this audit range | - | - | - | - |

## Verification Log
- `npm.cmd test` - passed, 6 suites / 28 tests.
- `npm.cmd test -- --runTestsByPath src/wecom/wecom-command-callback.controller.spec.ts` - passed, 5 tests.
- `npm.cmd run typecheck` - passed.
- `npm.cmd run lint` - passed.
- `npm.cmd run build` - passed.
- `npm.cmd run rls:validate` - passed.
- `npm.cmd run db:verify` - blocked locally because `DATABASE_URL` is not configured.
- `npm.cmd audit --omit=dev` - blocked by local global npm runtime failure: `Class extends value undefined is not a constructor or null`.

## 12-Dimension Coverage Map
| # | Dimension | Status |
|---|-----------|--------|
| 1 | Architecture | Checked: callback controller, callback service, crypto, encrypted state, and repository are separated inside `backend/src/wecom`. |
| 2 | Platform integration | Checked: GET URL verification and POST command callback return raw text expected by WeCom, not API envelopes. |
| 3 | Security | Checked: query validation, signature verification, receiveId/SuiteId match, and encrypted state storage. |
| 4 | Code efficiency | Checked: no polling or unbounded loops added; callback path performs bounded XML extraction and one state write. |
| 5 | Runtime smoothness | Checked: XML parser is registered once in Fastify bootstrap; local tests use the same parser helper. |
| 6 | Info isolation | N/A for tenant data: `wecom_suite_state` is platform state and intentionally outside tenant RLS. |
| 7 | Data accuracy | Checked: stale `suite_ticket` callbacks no longer roll back newer state. |
| 8 | Parameter passing | Checked: callback query fields are normalized before cryptographic verification. |
| 9 | UX | N/A for this commit: backend callback infrastructure only. |
| 10 | Coding standards | Checked with lint/typecheck/build. |
| 11 | Testing | Checked: URL verification, suite_ticket storage, stale retry protection, missing query rejection, and bad signature rejection covered. |
| 12 | Deploy & Ops | Checked: `.env.example` includes callback and state-encryption variables; real HTTPS endpoint setup remains external. |

## Fix Guide
All verified findings were fixed during this audit cycle. No additional code changes are required before Stage 1.4.

## Doc Updates Needed
- None. `docs/02-tasks/02_02_First_Enterprise_Wecom_Admin_Plan.md` already marks Stage 1.1-1.3 implemented and identifies Stage 1.4 as next.
