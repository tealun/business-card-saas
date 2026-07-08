# 99_13 - Miniprogram Recent Commits - 2026-07-06

## Scope
- Range: `52f48cb..a373a87`
- Commits: 3 (`5d9efe8`, `05f8080`, `a373a87`)
- Files: 41 changed
- Project shape: SaaS / web service with native WeChat miniprogram client
- Detected stack: native WeChat miniprogram + NestJS/TypeScript backend + PostgreSQL/RLS baseline
- Risk score: 9
  - Auth surface: employee login/session (+3)
  - PII/contact fields: mobile, phone, email, WeChat, address (+3)
  - Public card/request entry surface (+1)
  - Third-party platform integration: WeCom/WeChat miniprogram (+1)
  - Database/write operations exist in backend path (+1)
- Auto-selected depth: deep

## Summary
- P0: 0
- P1: 2
- P2: 2
- Verification notes:
  - `node --check` passed for changed miniprogram JavaScript files.
  - `git diff --check HEAD~3..HEAD` only reported blank lines at EOF in WXML files; no blocking whitespace errors.
  - Backend `npm.cmd run typecheck` and `npm.cmd test -- --runInBand` could not complete because local `node_modules/.bin/tsc` and `jest` are unavailable.

## P0 - Must Fix
| ID | Status | Title | File | Line | Evidence | Fix |
|----|--------|-------|------|------|----------|-----|
| - | - | No P0 findings verified | - | - | - | - |

## P1 - Should Fix Soon
| ID | Status | Title | File | Line | Evidence | Fix |
|----|--------|-------|------|------|----------|-----|
| MRC-P1-1 | Fixed | Public card page silently falls back to demo card/share IDs | `miniprogram/pages/public/card.js` | 7 | `publicId` and `shareId` default to `pub_demo0001` / `shr_demo0001`; `onLoad` also substitutes those values when `query.card` / `query.share` is absent. A malformed, stripped, or internal navigation without params shows the demo card and can create demo visits instead of failing closed. | Fixed: public card IDs now default to empty, missing card IDs enter the error state, visit creation omits absent shares, and share paths omit empty share params. Verified with `node --check` and `rg "pub_demo0001|shr_demo0001" miniprogram/pages/public/card.js` returning no matches. |
| MRC-P1-2 | Fixed | "Show WeCom entry" privacy control is not wired to the backend or public page | `miniprogram/pages/employee/edit.wxml` | 80 | The edit page renders a `show_wecom` switch and updates local state, but `saveCard` sends only `show_mobile`, `show_email`, and `show_wechat`; backend privacy schemas also only define those three fields. The public card page always renders the WeCom actions. Users are offered a privacy control that cannot take effect. | Fixed: removed the unsupported `show_wecom` edit control and local state until the backend contract supports it. Verified with `rg "show_wecom" miniprogram/pages/employee/edit.*` returning no matches. |

## P2 - Nice to Have
| ID | Status | Title | File | Line | Evidence | Fix |
|----|--------|-------|------|------|----------|-----|
| MRC-P2-1 | Fixed | Enterprise video tap navigates back to the card page with an ignored `_v` param | `miniprogram/pages/public/card.js` | 185 | `playVideo()` calls `wx.navigateTo({ url: \`/pages/public/card?_v=...\` })`, but `onLoad` only reads `card`, `public_id`, and `share`. Once videos are populated, tapping a video reloads the public card route instead of opening/playing the video. | Fixed: `playVideo()` now opens the media with `wx.previewMedia` and falls back to copying the video URL. Verified with `node --check` and absence of `_v=` navigation in `pages/public/card.js`. |
| MRC-P2-2 | Fixed | Company address row initiates a phone call | `miniprogram/pages/company-card/index.wxml` | 31 | The address row uses `bindtap="callCompany"`, the same handler as the phone row. Tapping the address dials the company phone instead of copying/opening the address. | Fixed: added `copyAddress()` and bound the address row to it while leaving the phone row on `callCompany`. Verified with `node --check` and WXML binding inspection. |

## 12-Dimension Coverage Map
| Dimension | Status |
|-----------|--------|
| 1 Architecture | Checked changed miniprogram page boundaries; no cross-layer DB/ORM reach-in found. |
| 2 Platform integration | WeChat/WeCom surfaces checked; `show_wecom` control drift recorded as MRC-P1-2. |
| 3 Security | PII/contact privacy checked; demo fallback and unwired privacy control recorded. |
| 4 Code efficiency | No meaningful compute/query inefficiency in changed miniprogram files. |
| 5 Runtime smoothness | JS parse checks passed; broken video navigation recorded. |
| 6 Info isolation | Public/private contact field behavior checked at preview/page boundary; WeCom control gap recorded. |
| 7 Data accuracy | Demo fallback can misattribute visits/actions; recorded as MRC-P1-1. |
| 8 Parameter passing | Public route query handling checked; missing-param fallback recorded. |
| 9 UX | Address tap and video tap issues recorded. |
| 10 Coding standards | `git diff --check` found only blank EOF lines in WXML files; not raised as an issue. |
| 11 Testing | Backend type/test commands could not run because dependencies are not installed locally. |
| 12 Deploy & Ops | No changed deployment files in scope; miniprogram environment hardening remains outside this commit range. |

## Fix Guide
1. MRC-P1-1: Remove `pub_demo0001` / `shr_demo0001` fallbacks from `pages/public/card.js`; set `uiState: "error"` for missing card IDs; optionally preserve a dev-only demo entry behind an explicit route or build flag.
2. MRC-P1-2: Decide whether `show_wecom` is a real M1 privacy field. If yes, update backend schemas/repository/preview response and make public WeCom UI conditional. If no, remove the switch from the edit screen.
3. MRC-P2-1: Replace the self-navigation with an actual video playback flow.
4. MRC-P2-2: Add an address-specific handler for the company card address row.

## Doc Updates Needed
- If `show_wecom` becomes a supported privacy field, update `docs/01-specs/01_02_Api_Spec.md` and the core dev doc privacy model.
- If demo public card fallback is kept for local development, document the dev-only entry point and production build expectation.
