# 99_27 - Admin Field Settings UI - 2026-07-07

## Scope
- Range: `1cfca81..0095b12`
- Commit: `0095b12 feat: edit admin field settings`
- Files: 3 changed
- Auto-selected depth: deep
- Risk score: 7 (admin surface, auth/session controls, configurable employee card fields, user-facing static UI)

## Summary
- P0: 0
- P1: 0
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
| - | - | No P1 findings verified | - | - | - | - |

### P2 - Nice To Have
| ID | Status | Title | File | Line | Evidence | Fix |
|----|--------|-------|------|------|----------|-----|
| - | - | No P2 findings verified | - | - | - | - |

## Verification
- `git pull` - passed, already up to date.
- `git diff --stat 1cfca81..0095b12` - confirmed only `admin/README.md`, `admin/app.js`, and `admin/index.html` changed.
- `node --check admin/app.js` - passed.
- Static DOM check: every `querySelector("#...")` in `admin/app.js` has a matching unique `id` in `admin/index.html`.
- `git diff --check 1cfca81..0095b12` - passed.
- `npm.cmd test -- admin-config.service.spec.ts admin-management.service.spec.ts` - passed, 2 suites / 15 tests.
- `npm.cmd test` - passed, 26 suites / 103 tests.
- `npm.cmd run typecheck` - passed.
- `npm.cmd run lint` - passed.
- `npm.cmd run build` - passed.
- `npm.cmd run rls:validate` - passed.
- Headless Edge default admin page screenshots (`1440x1000`, `390x900`) - nonblank and readable.

## Blocked / Environment Checks
- `npm.cmd run db:verify` did not run locally because `DATABASE_URL is required`.
- `npm.cmd audit --omit=dev` did not run because the local npm CLI failed with `Class extends value undefined is not a constructor or null`.
- Interactive browser screenshot of the `字段与模板` view was not completed in this environment. Direct `file://` access was blocked by the browser safety policy, and a temporary local HTTP server on `127.0.0.1:4177` listened but local HTTP clients timed out. Static DOM checks and automated backend coverage were used as the verification anchor for this small UI change.

## Dimension Coverage
| # | Dimension | Result |
|---|-----------|--------|
| 1 | Architecture | Checked: the static admin console still calls the existing `/admin/settings/fields` contract; no new frontend stack or cross-layer dependency was introduced. |
| 2 | Platform integration | N/A for this slice: no new WeCom or external API call was added. |
| 3 | Security | Checked: admin token handling is unchanged; saved field settings are built from controlled checkbox state and submitted through the existing admin request helper. |
| 4 | Code efficiency | Checked: rendering uses direct DOM creation and no new dependency or polling loop. |
| 5 | Runtime smoothness | Checked: the field table is generated on demand and the save action re-renders from the API response. |
| 6 | Info isolation | Checked: no tenant/company selector was added; the admin API remains scoped by the admin session token. |
| 7 | Data accuracy | Checked: payload preserves `field_key`, `label`, `locked`, `employee_editable`, and `default_visible`, matching the backend field settings contract. |
| 8 | Parameter passing | Checked: request method, path, and body shape match `PUT /admin/settings/fields`; malformed local table state fails before sending. |
| 9 | UX | Checked: the rules view now exposes a save action next to the load action and keeps the existing operation output flow. |
| 10 | Coding standards | Checked: JS syntax, diff whitespace, backend lint/type/build all pass. |
| 11 | Testing | Checked: target admin config/management tests plus full backend suite pass. Browser interaction coverage remains a project-tooling gap. |
| 12 | Deploy & Ops | Checked: still static-hostable with no build step; README updated to reflect field settings read/save coverage. |

## Next Steps
1. Add editable template controls in the Admin Console for the existing template create/update/default backend APIs.
2. Add a stable browser interaction test path when the project has a first-class frontend test runner or local browser server setup.
