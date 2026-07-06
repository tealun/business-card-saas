# 99_04 - WeCom Authorization - 2026-07-06

## Scope
- Range: `c9cdac1..6d0d102`
- Commit audited: `6d0d102 feat: handle WeCom tenant authorization callback`
- Files changed: 9
- Auto-selected depth: deep
- Risk score: 12 (WeCom authorization callback + permanent credential storage + tenant upsert + schema change)
- Stack: NestJS 11 backend, TypeScript strict mode, PostgreSQL/RLS schema, WeCom third-party authorization APIs.

## Summary
- P0: 0 | P1: 1 | P2: 0
- New issues found: 1
- Fixed during audit: 1
- Residual risk: production callback processing will eventually need durable callback idempotency/queueing; current MVP keeps synchronous bounded processing for the first pilot path.

## Findings

### P0 - Must Fix
| ID | Status | Title | File | Line | Evidence | Fix |
|----|--------|-------|------|------|----------|-----|
| - | - | None found in this audit range | - | - | - | - |

### P1 - Should Fix Soon
| ID | Status | Title | File | Line | Evidence | Fix |
|----|--------|-------|------|------|----------|-----|
| WA-P1-1 | Fixed | Local fallback retained permanent_code plaintext in memory | `backend/src/wecom/wecom-tenant-auth.repository.ts` | 24 | The audited commit used `StoredTenantAuthorization extends SaveTenantAuthorizationInput`, so the non-DB fallback record retained both `permanentCode` plaintext and `permanentCodeEncrypted`. | Changed the stored memory shape to keep only metadata plus `permanentCodeEncrypted`; snapshots decrypt only at read boundaries. |

### P2 - Nice to Have
| ID | Status | Title | File | Line | Evidence | Fix |
|----|--------|-------|------|------|----------|-----|
| - | - | None found in this audit range | - | - | - | - |

## Verification Log
- `npm.cmd test` - passed, 9 suites / 36 tests.
- `npm.cmd test -- --runTestsByPath src/wecom/wecom-authorization.service.spec.ts` - passed, 2 tests.
- `npm.cmd run typecheck` - passed.
- `npm.cmd run lint` - passed.
- `npm.cmd run build` - passed.
- `npm.cmd run rls:validate` - passed.
- `npm.cmd run db:verify` - blocked locally because `DATABASE_URL` is not configured.
- `npm.cmd audit --omit=dev` - blocked by local global npm runtime failure: `Class extends value undefined is not a constructor or null`.

## 12-Dimension Coverage Map
| # | Dimension | Status |
|---|-----------|--------|
| 1 | Architecture | Checked: authorization exchange, tenant persistence, API client, and callback parsing remain separate services. |
| 2 | Platform integration | Checked: `create_auth/change_auth` read `AuthCode`, use suite token, call `get_permanent_code`, and upsert tenant authorization. |
| 3 | Security | Checked: permanent_code is AES-GCM encrypted before DB/memory storage; plaintext fallback retention fixed. |
| 4 | Code efficiency | Checked: no unbounded loops; callback path reuses suite token cache/singleflight. |
| 5 | Runtime smoothness | Checked: external calls inherit the WeCom API timeout/error mapping from `WecomApiClientService`. |
| 6 | Info isolation | Checked: tenant authorization is keyed by `open_corpid`; tenant data tables remain protected by RLS separately. |
| 7 | Data accuracy | Checked: repeated authorization for the same corp updates the same tenant snapshot. |
| 8 | Parameter passing | Checked: auth_code is trimmed server-side and never accepted from frontend for tenant binding. |
| 9 | UX | N/A for this commit: backend platform adapter only. |
| 10 | Coding standards | Checked with lint/typecheck/build. |
| 11 | Testing | Checked: auth_code exchange and same-corp update are covered. |
| 12 | Deploy & Ops | Checked: schema now includes `permanent_code_encrypted`, `agent_id`, `auth_scope_json`, and `authorized_at`. |

## Fix Guide
All verified findings were fixed during this audit cycle. No additional code changes are required before Stage 1.6.

## Doc Updates Needed
- None. The Stage 1.5 completion note is already in `docs/02-tasks/02_02_First_Enterprise_Wecom_Admin_Plan.md`.
