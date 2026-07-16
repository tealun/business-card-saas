# 99_68 - Employee Self-Service Policy - 2026-07-16

## Scope
- Range: `affc6eb..fb140d6`
- Files: 6 changed files covering employee card contract, repository response, employee edit page, and employee home QR flow.
- Baseline: `main@fb140d62ee9fd4a0e3b1ae0d70f42643f2f56328`; worktree dirty only for audit fix to `miniprogram/pages/employee/index.js`; uncommitted audit fix included.
- Auto-selected depth: Deep.
- Risk score: 13. Signals: employee identity, privacy/PII fields, QR upload, WeCom integration, API response contract, frontend user flow.

## System Goal & Critical Paths
- Goal / protected properties: Tenant-controlled employee self-service settings must be visible in employee UI and enforced in submitted payloads without breaking enterprise WeCom authorization.
- Path: `/employee/cards/current` -> `employee_self_service` -> edit page disabled controls -> PUT payload omits locked privacy/share fields. Health: Healthy.
- Path: employee home QR action -> policy-aware QR source -> employee upload or WeCom sensitive authorization. Health: Fixed and healthy.
- Path: backend default response -> miniprogram fallback defaults. Health: Healthy.

## Confirmed Strengths
- Backend still enforces policy server-side; miniprogram changes are UX and payload alignment, not the security boundary.
- The edit page no longer submits forbidden privacy/share keys when the tenant disabled employee edits.
- Employee home QR source logic distinguishes enterprise cache from employee upload through `qrcode_source`.

## Verification Gaps
- No WeChat Developer Tools runtime was available in this shell; miniprogram verification used `node --check` for JS syntax and static WXML/flow inspection.

## Findings

### P0 - Must Fix
| ID | Type | Confidence | Status | Title | Path/Dimension | File | Line | Evidence | Fix |
|----|------|------------|--------|-------|----------------|------|------|----------|-----|
| None | N/A | High | Fixed | No P0 findings | All | N/A | N/A | No bypass of server-side policy was found. | N/A |

### P1 - Should Fix Soon
| ID | Type | Confidence | Status | Title | Path/Dimension | File | Line | Evidence | Fix |
|----|------|------------|--------|-------|----------------|------|------|----------|-----|
| A68-P1-1 | Confirmed | High | Fixed | Enterprise-only QR policy could block WeCom sensitive authorization when upload was disabled | Employee QR / Platform integration | `miniprogram/pages/employee/index.js` | 428 | After GET `/employee/cards/current/wechat-qrcode` returned no QR, code checked `allow_wecom_qrcode_upload === false` and showed "企业统一维护二维码" before navigating to `/pages/wecom-sensitive/index`. This incorrectly tied enterprise authorization to employee upload permission. | Removed the upload-permission guard from the enterprise authorization fallback; no-QR enterprise flows now navigate to sensitive authorization. Verified with JS syntax check and static path inspection. |

### P2 - Nice to Have
| ID | Type | Confidence | Status | Title | Path/Dimension | File | Line | Evidence | Fix |
|----|------|------------|--------|-------|----------------|------|------|----------|-----|
| None | N/A | High | Fixed | No P2 findings | All | N/A | N/A | Minor formatting differences did not affect syntax or behavior. | N/A |

## Evidence Log
- Accepted A68-P1-1: inspected `openWechatQr()` path and confirmed enterprise authorization fallback was unreachable when upload was disabled and cached QR was absent.
- Rejected candidate: employee can still submit locked privacy. Reason: `buildPayload()` only includes privacy/share keys when the corresponding `selfService` flag allows it, and backend still rejects forbidden keys.
- Rejected candidate: `employee_self_service` missing from response. Reason: repository adds it on `getCurrentCard()` and update responses, and contract allows it.

## 12-Dimension Coverage
- 1 Architecture: Healthy; backend policy response and miniprogram usage are localized.
- 2 Platform Integration: Fixed P1; WeCom sensitive authorization remains reachable.
- 3 Security: Healthy; backend remains the enforcement layer.
- 4 Code Efficiency: Healthy; one extra current-card request is bounded and needed for policy.
- 5 Runtime Smoothness: Healthy; current card and preview load concurrently.
- 6 Info Isolation: Healthy; no new tenant data exposure path.
- 7 Data Accuracy: Healthy; QR source semantics remain separated.
- 8 Parameter Passing: Healthy; locked fields are omitted from request body.
- 9 UX: Healthy; controls are disabled before submission instead of failing with 403.
- 10 Coding Standards: Healthy; JS syntax and backend typecheck passed.
- 11 Testing: Adequate for backend contract; miniprogram runtime remains manually verified/static.
- 12 Deploy & Ops: N/A for this phase beyond existing app deployment.

## Verification Commands
- `node --check miniprogram/pages/employee/index.js; node --check miniprogram/pages/employee/edit.js` -> passed.
- `npm.cmd run typecheck` in `backend/` -> passed.
- `npm.cmd test -- --runTestsByPath src/employee/employee-card.repository.spec.ts src/contracts/employee-card.spec.ts` -> passed, 16 tests.
- Earlier phase validation also ran `npm.cmd run lint` and `npm.cmd run build` successfully before this audit.

## Doc Updates Needed
- None beyond this audit report.
