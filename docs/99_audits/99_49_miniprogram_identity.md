# 99_49 â€?Miniprogram Identity â€?2026-07-08

## Scope

- Commits: `e94f925..a89d15c`
- Files changed: 11
- Auto-selected depth: Deep
- Risk score: 9
- Signals: JWT/auth session handling, WeChat/WeCom third-party login, PII card fields, multi-identity account boundary, user-facing miniprogram UI

## Summary

- P0: 0
- P1: 1 fixed
- P2: 0
- Stage focus: ordinary WeChat personal-card login, WeCom employee-card login, current identity state, and miniprogram identity switching.

## P0 â€?Must Fix

None.

## P1 â€?Should Fix

| ID | Status | Title | File | Line | Evidence | Fix |
|----|--------|-------|------|------|----------|-----|
| MI-P1-1 | Fixed | `wx.qy.login` success without `code` continued with empty login code | `miniprogram/utils/api.js` | 74 | In the Stage 2 implementation, the qy login success callback resolved `maybeDemoCode()` even when demo was disabled; that produced `""` and sent an avoidable invalid request to `/auth/qy-login`. | Reject with `wx.qy.login did not return code` unless an explicit demo code is enabled. |

## P2 â€?Nice to Have

None.

## Verification Log

- Checked changed file range with `git diff --name-only e94f925..a89d15c`.
- Reviewed miniprogram identity flow in `miniprogram/utils/auth.js`, `miniprogram/utils/api.js`, and `miniprogram/pages/employee/index.js`.
- Verified `switchIdentity()` submits only `member_identity_id`; no miniprogram code sends `tenant_id` for identity switching.
- Ran `node --check` on `miniprogram/utils/api.js`, `miniprogram/utils/auth.js`, `miniprogram/pages/employee/index.js`, `miniprogram/pages/employee/edit.js`, and `miniprogram/pages/employee/card.js`.
- Ran backend `npm.cmd run typecheck`: passed.
- Ran backend `npm.cmd run lint`: passed.
- Ran backend `npm.cmd test`: 34 suites / 140 tests passed.

## Residual Risk

- WeCom login failure currently falls back to ordinary WeChat login in `ensureSession()`. This matches the product decision to keep a personal card available when no enterprise card can be resolved, but support/ops copy should make this state clear in a later UX pass.
- Manual validation is still required in WeChat DevTools or a real device for the exact `wx.qy.login` / `wx.login` environment split because the local CI can only syntax-check miniprogram JavaScript.

## Doc Updates Needed

- Completed: `docs/01-specs/01_03_Miniprogram_Guide.md` now states that `miniprogram/utils/auth.js` is the only employee-side login entry and that switching submits only `member_identity_id`.
