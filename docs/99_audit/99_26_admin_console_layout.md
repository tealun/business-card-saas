# 99_26 - Admin Console Layout - 2026-07-07

## Scope
- Range: `f8c4c18..d73ea46`
- Commits: `974e4fd feat: upgrade admin console layout`; `d73ea46 fix: improve admin console mobile layout`
- Files: 4 changed
- Auto-selected depth: deep
- Risk score: 7 (admin surface, auth/session controls, user-facing static UI, operational workflows)

## Summary
- P0: 0
- P1: 0
- P2: 1 fixed
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
| ACL-P2-1 | Fixed | Mobile admin header and action rows could overflow horizontally | `admin/styles.css` | 429 | Headless Edge mobile screenshot of `974e4fd` showed the topbar/action row still behaving like a horizontal flex layout, clipping content near the right edge. | Fixed in `d73ea46`: mobile media query switches `.topbar`, `.view-head`, and `.panel-head` to grid, left-aligns compact action rows, reduces nav to two columns, and hides workspace x-overflow. |

## Verification
- `node --check admin/app.js` - passed.
- Static DOM check: every `querySelector("#...")` in `admin/app.js` has a matching unique `id` in `admin/index.html`.
- Static navigation check: every `data-view-target` has a matching `data-view`.
- `git diff --check f8c4c18..d73ea46` - passed.
- Headless Edge desktop screenshot (`1440x1000`) - passed visual smoke: nonblank, no visible overlap, nav/metrics/output readable.
- Headless Edge mobile screenshot (`390x900`) - passed visual smoke after `d73ea46`: no horizontal clipping or overlapping controls in first viewport.
- `npm.cmd test` - passed, 26 suites / 103 tests.
- `npm.cmd run typecheck` - passed.
- `npm.cmd run lint` - passed.
- `npm.cmd run build` - passed.
- `npm.cmd run rls:validate` - passed.

## Blocked / Environment Checks
- `npm.cmd run db:verify` did not run locally because `DATABASE_URL is required`.
- `npm.cmd audit --omit=dev` did not run because the local npm CLI failed with `Class extends value undefined is not a constructor or null`.

## Dimension Coverage
| # | Dimension | Result |
|---|-----------|--------|
| 1 | Architecture | Checked: static admin remains buildless and uses existing backend endpoints/IDs instead of introducing a new frontend stack. |
| 2 | Platform integration | N/A for this slice: no new external platform calls. Existing WeCom authorization controls are preserved. |
| 3 | Security | Checked: admin token handling is unchanged; dynamic API data is rendered through `textContent`, not raw HTML. |
| 4 | Code efficiency | Checked: table rendering uses one small DOM helper and no additional dependency. |
| 5 | Runtime smoothness | Checked: layout switching is client-only and simple; no blocking startup work beyond existing health check. |
| 6 | Info isolation | Checked: no tenant id input was added; admin API calls still rely on the admin token session. |
| 7 | Data accuracy | Checked: overview/member/sync/template/field widgets render the same API responses also written to the JSON output panel. |
| 8 | Parameter passing | Checked: API base, tokens, member id, launch token, and redirect URI controls retain their previous request boundaries. |
| 9 | UX | Checked: desktop/mobile screenshots; side navigation, metrics, tables, and global output panel replace the earlier debug-card layout. |
| 10 | Coding standards | Checked: JS syntax and backend lint/type/build all pass. |
| 11 | Testing | Checked: static selector/navigation checks and full backend suite pass. |
| 12 | Deploy & Ops | Checked: still static-hostable with no build step; README updated. |

## Next Steps
1. Replace the static admin console with the planned React + TypeScript + Vite stack when the product moves beyond M1 static hosting.
2. Add real browser interaction tests once a stable browser automation dependency is available in the project toolchain.
