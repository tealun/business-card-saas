# 99_03 - WeCom Suite Token - 2026-07-06

## Scope
- Range: `59a3c76..9a2256d`
- Commit audited: `9a2256d feat: refresh WeCom suite access token`
- Files changed: 9
- Auto-selected depth: deep
- Risk score: 11 (WeCom external API client + token caching/refresh + encrypted platform state + SaaS auth context)
- Stack: NestJS 11 backend, TypeScript strict mode, PostgreSQL/RLS schema, WeCom third-party service APIs.

## Summary
- P0: 0 | P1: 1 | P2: 0
- New issues found: 1
- Fixed during audit: 1
- Residual risk: real `service/get_suite_token` still requires a live `suite_ticket` from a configured WeCom command callback.

## Findings

### P0 - Must Fix
| ID | Status | Title | File | Line | Evidence | Fix |
|----|--------|-------|------|------|----------|-----|
| - | - | None found in this audit range | - | - | - | - |

### P1 - Should Fix Soon
| ID | Status | Title | File | Line | Evidence | Fix |
|----|--------|-------|------|------|----------|-----|
| WST-P1-1 | Fixed | WeCom token HTTP request had no timeout or network-error mapping | `backend/src/wecom/wecom-api-client.service.ts` | 26 | The audited commit called `fetch()` directly. A stuck WeCom/network request could hang the refresh path, and DNS/socket failures would escape as generic errors instead of a controlled platform-unavailable response. | Added `AbortController` timeout via `WECOM_HTTP_TIMEOUT_MS`, mapped network failures to `ServiceUnavailableException`, mapped invalid JSON to `BadGatewayException`, and added API client unit tests. |

### P2 - Nice to Have
| ID | Status | Title | File | Line | Evidence | Fix |
|----|--------|-------|------|------|----------|-----|
| - | - | None found in this audit range | - | - | - | - |

## Verification Log
- `npm.cmd test` - passed, 8 suites / 34 tests.
- `npm.cmd test -- --runTestsByPath src/wecom/wecom-api-client.service.spec.ts src/wecom/wecom-suite-token.service.spec.ts` - passed, 6 tests.
- `npm.cmd run typecheck` - passed.
- `npm.cmd run lint` - passed.
- `npm.cmd run build` - passed.
- `npm.cmd run rls:validate` - passed.
- `npm.cmd run db:verify` - blocked locally because `DATABASE_URL` is not configured.
- `npm.cmd audit --omit=dev` - blocked by local global npm runtime failure: `Class extends value undefined is not a constructor or null`.

## 12-Dimension Coverage Map
| # | Dimension | Status |
|---|-----------|--------|
| 1 | Architecture | Checked: API client, token service, and state repository have separate responsibilities. |
| 2 | Platform integration | Checked: `service/get_suite_token` request payload, response mapping, HTTP timeout, and error normalization. |
| 3 | Security | Checked: suite secrets/tickets are not logged; returned tokens are AES-GCM encrypted in state storage. |
| 4 | Code efficiency | Checked: singleflight prevents concurrent refresh stampedes. |
| 5 | Runtime smoothness | Checked: fresh cache reuse avoids unnecessary external calls; missing `suite_ticket` fails clearly. |
| 6 | Info isolation | N/A for tenant data: suite token is platform state outside tenant RLS. |
| 7 | Data accuracy | Checked: token expiration is persisted and refresh skew prevents near-expiry reuse. |
| 8 | Parameter passing | Checked: WeCom API payload uses server-side suite config and stored suite ticket only. |
| 9 | UX | N/A for this commit: backend platform adapter only. |
| 10 | Coding standards | Checked with lint/typecheck/build. |
| 11 | Testing | Checked: cache hit, singleflight, missing ticket, successful API payload, network failure, invalid JSON. |
| 12 | Deploy & Ops | Checked: `.env.example` includes `WECOM_API_BASE_URL` and `WECOM_HTTP_TIMEOUT_MS`. |

## Fix Guide
All verified findings were fixed during this audit cycle. No additional code changes are required before Stage 1.5.

## Doc Updates Needed
- None. The Stage 1.4 completion note is already in `docs/02-tasks/02_02_First_Enterprise_Wecom_Admin_Plan.md`.
