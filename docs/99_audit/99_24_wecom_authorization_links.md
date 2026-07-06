# 99_24 - WeCom Authorization Links - 2026-07-07

## Scope
- Range: `064972b..4a83865`
- Commits: `63c2832 feat: generate WeCom authorization links`; `4a83865 fix: handle WeCom authorization redirects`
- Files: 18 changed
- Auto-selected depth: deep
- Risk score: 11 (external WeCom platform calls, pre-tenant auth surface, admin tooling, webhook/redirect handling, tenant authorization state)

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
| WAIL-P1-1 | Fixed | Generated authorization links pointed at a redirect URI with no backend handler | `backend/.env.example` | 20 | `63c2832` configured the default `WECOM_INSTALL_REDIRECT_URI` as `/api/v1/wecom/authorization-complete`, but no route existed to accept redirect `auth_code`. A real install flow could land on 404 or drop the URL auth code path. | Fixed in `4a83865`: added `GET /api/v1/wecom/authorization-complete`, query/response schemas, bad-request validation, and a regression test that exchanges `auth_code` without returning `permanentCode`. |

### P2 - Nice To Have
| ID | Status | Title | File | Line | Evidence | Fix |
|----|--------|-------|------|------|----------|-----|
| - | - | No P2 findings verified | - | - | - | - |

## Verification
- `npm.cmd test -- wecom-api-client.service.spec.ts wecom-authorization-link.service.spec.ts wecom-authorization-complete.controller.spec.ts` - passed, 3 suites / 12 tests.
- `npm.cmd test` - passed, 25 suites / 101 tests.
- `npm.cmd run typecheck` - passed.
- `npm.cmd run lint` - passed.
- `npm.cmd run build` - passed.
- `npm.cmd run rls:validate` - passed.
- `node --check admin/app.js` - passed.
- `git diff --check 064972b..4a83865` - passed.
- Static scan for debug residue, dynamic execution sinks, token/permanent_code exposure, and new WeCom auth surfaces found no new unsafe code path. The new complete controller returns tenant metadata only and does not return `permanentCode`.

## Blocked / Environment Checks
- `npm.cmd run db:verify` did not run locally because `DATABASE_URL is required`.
- `npm.cmd audit --omit=dev` did not run because the local npm CLI failed with `Class extends value undefined is not a constructor or null`.

## Dimension Coverage
| # | Dimension | Result |
|---|-----------|--------|
| 1 | Architecture | Checked: API-client calls, link creation, redirect completion, and tenant authorization stay in separate services/controllers. |
| 2 | Platform integration | Checked: `get_pre_auth_code`, `set_session_info`, redirect `auth_code`, and existing `create_auth` callback path are documented and covered. |
| 3 | Security | Checked: launch endpoint uses header token with timing-safe comparison; production env requires `WECOM_AUTH_LAUNCH_TOKEN`; redirect response omits `permanentCode`. |
| 4 | Code efficiency | Checked: no extra abstraction beyond thin controllers and existing authorization service reuse. |
| 5 | Runtime smoothness | Checked: WeCom API calls keep existing timeout/error mapping through `postJson`; bad request validation returns controlled `BadRequestException`. |
| 6 | Info isolation | Checked: pre-tenant link endpoint has internal launch token; redirect completion only creates/updates tenant authorization from WeCom auth code. |
| 7 | Data accuracy | Checked: redirect and callback paths both funnel through `WecomAuthorizationService.handleAuthCode()`. |
| 8 | Parameter passing | Checked: body/query/header schemas constrain `redirect_uri`, `state`, `auth_type`, `app_ids`, and `auth_code`. |
| 9 | UX | Checked: admin workbench can generate authorization links; redirect URI no longer points to a missing backend route. |
| 10 | Coding standards | Checked: lint, typecheck, build, and docs contract alignment pass. |
| 11 | Testing | Checked: added targeted API-client/link/complete tests; full Jest suite passes. DB integration still awaits a real `DATABASE_URL`. |
| 12 | Deploy & Ops | Checked: `.env.example` includes launch token and install URL config; real HTTPS callback/redirect environment remains an external M0 gate. |

## Next Steps
1. Use a real PostgreSQL test URL to run `npm.cmd run db:verify`.
2. Re-run `npm.cmd audit --omit=dev` after fixing the local npm CLI/runtime issue.
3. During real pilot authorization, verify both possible auth-code delivery paths: `redirect_uri` query and encrypted `create_auth` command callback.
