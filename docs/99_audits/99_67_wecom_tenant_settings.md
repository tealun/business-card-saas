# 99_67 - WeCom Tenant Settings - 2026-07-16

## Scope
- Range: `499e628..3faa298`
- Files: 19 implementation files in admin UI, backend WeCom/admin/employee modules, and database schema/migration/RLS.
- Baseline: `main@3faa29872480baa9f23b109ee4a0072ad9edd303`; worktree dirty only for audit fix to `admin/app.js`; uncommitted audit fix included.
- Auto-selected depth: Deep.
- Risk score: 15. Signals: admin surface, auth/RBAC, PII/contact fields, file upload/QR image storage, third-party WeCom API/callbacks, tenant RLS/database writes.

## System Goal & Critical Paths
- Goal / protected properties: Tenant admins can configure WeCom sync and employee self-service policy; employees cannot bypass tenant settings; tenant settings remain isolated by tenant.
- Path: Admin settings read/write -> Zod contract -> admin RBAC -> `tenant_wecom_settings` -> UI policy summary. Health: Healthy.
- Path: WeCom authorization/member sync -> tenant settings -> create-card and stale-disable behavior. Health: Healthy.
- Path: Employee card/privacy/QR update -> tenant settings -> server-side 403 for disabled self-service. Health: Healthy.
- Path: Database migration/RLS -> schema baseline -> tenant transaction queries. Health: Healthy.

## Confirmed Strengths
- Server enforces employee field and privacy policy; UI locks are not the only control.
- WeCom enterprise QR cache and employee-upload QR are stored separately, preserving `enterprise_first`, `employee_upload_only`, and `enterprise_only` semantics.
- `tenant_wecom_settings` is present in migration, baseline schema, and RLS policy.
- Full backend suite passed after implementation: 54 suites, 256 tests.

## Verification Gaps
- No live WeCom sandbox was available, so external WeCom API behavior was verified by existing mocked unit/integration tests rather than a real tenant authorization.
- No project npm script exists for RLS validation; RLS was statically verified against `database/schema.sql`, `database/rls.sql`, and `database/migrations/migrate_v1_11.sql`.

## Findings

### P0 - Must Fix
| ID | Type | Confidence | Status | Title | Path/Dimension | File | Line | Evidence | Fix |
|----|------|------------|--------|-------|----------------|------|------|----------|-----|
| None | N/A | High | Fixed | No P0 findings | All | N/A | N/A | Deep review plus full test suite found no must-fix issue. | N/A |

### P1 - Should Fix Soon
| ID | Type | Confidence | Status | Title | Path/Dimension | File | Line | Evidence | Fix |
|----|------|------------|--------|-------|----------------|------|------|----------|-----|
| None | N/A | High | Fixed | No P1 findings | All | N/A | N/A | RBAC, tenant isolation, QR source semantics, migration/RLS, and update paths were inspected. | N/A |

### P2 - Nice to Have
| ID | Type | Confidence | Status | Title | Path/Dimension | File | Line | Evidence | Fix |
|----|------|------------|--------|-------|----------------|------|------|----------|-----|
| A67-P2-1 | Confirmed | High | Fixed | WeCom settings save button did not enter permission-disabled UI state | Admin UX / Security affordance | `admin/app.js` | 286 | `saveWecomSettings` used `requirePermission("tenant.member.sync")` on click, but `refreshPermissionControls()` did not call `applyPermissionState` for the button. Backend RBAC still protected the API, so impact was UI affordance only. | Added `applyPermissionState("#saveWecomSettings", "tenant.member.sync")`; verified with `node --check admin/app.js` and DOM ID scan. |

## Evidence Log
- Accepted A67-P2-1: inspected `admin/app.js`; confirmed click-time permission check existed and visual disabled state was missing; fixed and rechecked.
- Rejected candidate: SQL injection in settings repository. Reason: all database writes use parameterized `$1..$8` queries.
- Rejected candidate: tenant isolation gap. Reason: settings repository reads/writes through `TenantTx`, and schema/RLS include `tenant_wecom_settings`.
- Rejected candidate: employee can bypass privacy settings. Reason: `assertCanUpdatePrivacy()` runs server-side before persistence.
- Rejected candidate: QR source cannot distinguish enterprise cache vs employee upload. Reason: fixed during audit by ensuring employee upload writes `wechat_qrcode_url` and WeCom sensitive auth writes `wecom_qrcode_url`.

## 12-Dimension Coverage
- 1 Architecture: Healthy; settings contract/repository/module boundaries are explicit.
- 2 Platform Integration: Healthy; WeCom sync and auth paths read tenant policy before side effects.
- 3 Security: Healthy; admin write path requires admin role and employee self-service is enforced server-side.
- 4 Code Efficiency: Healthy; no extra external calls beyond one settings lookup per critical operation.
- 5 Runtime Smoothness: Healthy; admin settings and sync events load concurrently.
- 6 Info Isolation: Healthy; tenant setting table has tenant FK and RLS, and access goes through tenant transactions.
- 7 Data Accuracy: Healthy; QR source policy maps to distinct persisted fields.
- 8 Parameter Passing: Healthy; request bodies are validated by Zod enums/booleans.
- 9 UX: Fixed P2 permission affordance; settings page shows policy impact and saved timestamp/default state.
- 10 Coding Standards: Healthy; typecheck, lint, build, and JS syntax checks passed.
- 11 Testing: Healthy for this phase; targeted tests and full backend suite passed.
- 12 Deploy & Ops: Healthy with one gap; migration exists, but no dedicated RLS npm validation script exists.

## Verification Commands
- `npm.cmd run typecheck` in `backend/` -> passed.
- `npm.cmd test -- --runTestsByPath src/wecom/wecom-contact-sync.service.spec.ts src/wecom/wecom-authorization.service.spec.ts src/employee/employee-card.repository.spec.ts src/admin-management/admin-management.service.spec.ts` -> passed, 31 tests.
- `npm.cmd run lint` in `backend/` -> passed.
- `npm.cmd run build` in `backend/` -> passed.
- `npm.cmd test` in `backend/` -> passed, 54 suites / 256 tests.
- `node --check admin/app.js` -> passed.
- Admin DOM ID scan -> `{"refs":210,"missing":[]}`.

## Doc Updates Needed
- None beyond this audit report.
