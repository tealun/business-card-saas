# 99_18 - WeCom Corp Token - 2026-07-06

## Scope
- Range: `8731310..8c13415`
- Commit audited: `8c13415 feat: add WeCom corp access token refresh`
- Files changed: 9
- Auto-selected depth: deep
- Risk score: 11 (tenant-scoped WeCom token refresh + encrypted credential cache + external platform API)
- Stack: NestJS 11 backend, TypeScript strict mode, PostgreSQL/RLS schema, WeCom third-party service APIs.

## Summary
- P0: 0 | P1: 0 | P2: 0
- New issues found: 0
- Fixed during audit: 0
- Residual risk: real `get_corp_token` cannot be exercised until Stage 0 external callback and pilot authorization are configured.

## Findings

### P0 - Must Fix
| ID | Status | Title | File | Line | Evidence | Fix |
|----|--------|-------|------|------|----------|-----|
| - | - | None found in this audit range | - | - | - | - |

### P1 - Should Fix Soon
| ID | Status | Title | File | Line | Evidence | Fix |
|----|--------|-------|------|------|----------|-----|
| - | - | None found in this audit range | - | - | - | - |

### P2 - Nice to Have
| ID | Status | Title | File | Line | Evidence | Fix |
|----|--------|-------|------|------|----------|-----|
| - | - | None found in this audit range | - | - | - | - |

## Verification Log
- `npm.cmd test` - passed, 10 suites / 40 tests.
- `npm.cmd run typecheck` - passed.
- `npm.cmd run lint` - passed.
- `npm.cmd run build` - passed.
- `npm.cmd run rls:validate` - passed.
- `npm.cmd run db:verify` - blocked locally because `DATABASE_URL` is not configured.
- `npm.cmd audit --omit=dev` - blocked by local global npm runtime failure: `Class extends value undefined is not a constructor or null`.

## 12-Dimension Coverage Map
| # | Dimension | Status |
|---|-----------|--------|
| 1 | Architecture | Checked: corp token refresh is isolated in `WecomCorpTokenService`; persistence stays in tenant auth repository. |
| 2 | Platform integration | Checked: `get_corp_token` uses server-side suite token, open corpid, and stored permanent_code. |
| 3 | Security | Checked: corp access tokens are AES-GCM encrypted in DB/memory state and never accepted from clients. |
| 4 | Code efficiency | Checked: singleflight prevents concurrent corp token refresh stampedes. |
| 5 | Runtime smoothness | Checked: fresh cache reuse and near-expiry refresh behavior match suite token pattern. |
| 6 | Info isolation | Checked: corp token lookup is keyed by `open_corpid`; no frontend tenant_id parameter is introduced. |
| 7 | Data accuracy | Checked: missing tenant authorization fails before token fetch; cached expiration is persisted. |
| 8 | Parameter passing | Checked: API client sends `auth_corpid` and `permanent_code` from server state only. |
| 9 | UX | N/A for this commit: backend platform adapter only. |
| 10 | Coding standards | Checked with lint/typecheck/build. |
| 11 | Testing | Checked: cache hit, singleflight refresh, missing authorization, and API client `get_corp_token` mapping. |
| 12 | Deploy & Ops | Checked: schema now includes `corp_access_token_encrypted` and `corp_access_token_expires_at`. |

## Fix Guide
No verified findings in this audit range.

## Doc Updates Needed
- None. The Stage 1.6 completion note is already in `docs/02-tasks/02_02_First_Enterprise_Wecom_Admin_Plan.md`.
