# 99_62 - Admin Backoffice Phase 1 Audit - 2026-07-16

## Scope
- Range: `4e33733..4b20874`
- Files: `admin/index.html`, `admin/styles.css`, `admin/app.js`
- Baseline: `main@4b208747d365c70c41ead97b1b73b37f44ab8f40`; worktree dirty with pre-existing `.gitignore` and launch-doc edits excluded
- Auto-selected depth: deep
- Risk score: 9 (admin surface, auth/session token handling, password login, PII fields, protected API writes)

## System Goal & Critical Paths
- Goal / protected properties: rebuild the Admin static backoffice shell around platform and tenant identity without changing password-login or admin-session business logic.
- Password login path: `form -> /admin/auth/login -> session token -> session/me -> platform navigation`; Healthy. Existing endpoint preserved and related backend tests passed.
- Tenant admin path: `qy-login/token -> session/me -> tenant navigation -> tenant-scoped APIs`; Healthy. Frontend routes to tenant pages for `account_type=tenant`.
- Platform admin path: `password/token -> session/me -> platform navigation -> platform APIs`; Healthy. Frontend routes to platform pages for `account_type=platform`.
- Dangerous operation path: `sync/retry/migration button -> confirm dialog -> real API`; Healthy for client-side guard. Server-side role tests passed.

## Confirmed Strengths
- Password login, password change, token login, and session-me endpoints remain unchanged in `admin/app.js`.
- Production API base still rejects user-entered API hosts and only accepts same-origin or operator-managed HTTPS `config.js`.
- Missing commercial/audit/admin-list backends are shown as unavailable states instead of mock data.
- `innerHTML` call sites were inspected; dynamic server values are escaped via `escapeHtml` / `escapeAttr`, while remaining uses are static empty states.

## Verification Gaps
- No browser E2E run against a live backend session was performed; validation used static DOM/JS checks and backend test suites.
- Commercialization, audit-log, tenant-admin list, and platform account-management APIs are not implemented yet, so the corresponding Admin pages cannot be fully exercised.

## Findings

### P0 - Must Fix
| ID | Type | Confidence | Status | Title | Path/Dimension | File | Line | Evidence | Fix |
|----|------|------------|--------|-------|----------------|------|------|----------|-----|
| - | N/A | High | Fixed | No P0 findings | Admin shell / Security | - | - | `node --check`, DOM reference scan, full backend tests, RLS validation passed | - |

### P1 - Should Fix Soon
| ID | Type | Confidence | Status | Title | Path/Dimension | File | Line | Evidence | Fix |
|----|------|------------|--------|-------|----------------|------|------|----------|-----|
| A-P1-1 | Verification gap | High | Open | Several designed Admin modules still lack real backend APIs | Product completeness / Platform integration | `admin/index.html` | 400 | Pages intentionally show unavailable states; docs specify commercial/audit/admin APIs but codebase has no controllers for them | Implement backend contracts before enabling those pages |

### P2 - Nice to Have
| ID | Type | Confidence | Status | Title | Path/Dimension | File | Line | Evidence | Fix |
|----|------|------------|--------|-------|----------------|------|------|----------|-----|
| A-P2-1 | Exposure | Medium | Open | Static Admin frontend has no automated browser smoke test | Testing / UX | `admin/` | - | JS and DOM checks pass, but no scripted browser session validates responsive rendering | Add a lightweight Playwright/static smoke test when a frontend test harness exists |

## Verification Log
- Accepted strength: auth endpoint preservation - `rg` confirmed `/admin/auth/login`, `/admin/auth/password`, `/admin/session/me` remain wired.
- Accepted strength: backend invariants - `npm.cmd run typecheck`, `npm.cmd run lint`, and `npm.cmd test` passed.
- Accepted strength: RLS invariant - `npm.cmd run rls:validate` passed in `database`.
- Accepted gap A-P1-1 - `rg` found commercialization APIs only in specs, not implemented controllers.
- Rejected candidate: `innerHTML` XSS - inspected reachable call sites and found dynamic values escaped before insertion.

## 12-Dimension Coverage
- 1 Architecture: Healthy for phase 1; static shell now separates platform and tenant navigation.
- 2 Platform integration: At risk; several designed modules still need real backend APIs.
- 3 Security: Healthy for changed shell; login/password logic preserved and tests pass.
- 4 Code efficiency: Healthy; single static app with no added dependencies.
- 5 Runtime smoothness: Likely; no build/runtime syntax errors, but no browser E2E.
- 6 Info isolation: Healthy at client-routing layer; server tests cover role boundaries.
- 7 Data accuracy: Healthy for rendered pages because only real API data is used.
- 8 Parameter passing: Healthy; API calls use existing route parameters and encode IDs.
- 9 UX: Likely; design-shell implemented, but visual browser pass not performed.
- 10 Coding standards: Healthy; lint/typecheck pass for backend and static JS syntax passes.
- 11 Testing: At risk; backend coverage is strong, frontend browser smoke coverage missing.
- 12 Deploy & Ops: Healthy for unchanged static deployment model; database migration action remains platform guarded.

## Next Steps
1. Implement Admin session permissions/menu scopes so frontend visibility can follow server-provided capabilities.
2. Implement missing commercial/audit/admin/platform-account backend APIs before replacing unavailable states with live tables.
