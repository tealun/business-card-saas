# Admin Backoffice Phase 3 Audit - Real Observability Views

Date: 2026-07-16

Scope:
- `admin-observability` backend module.
- Tenant admin list, platform account list, tenant audit events, platform callback/audit events.
- Admin frontend pages that replaced previous "backend not connected" empty states.

Result: Passed after one RBAC fix.

## Findings

### A64-P1-1 - Tenant audit events relied on menu visibility only

Status: Fixed in `6d150ad`.

The first Phase 3 implementation exposed `GET /admin/audit-events` without an explicit backend role check. The Phase 2 frontend menu hid tenant audit from operators, but a direct API call could still read tenant callback/sync event summaries.

Fix:
- `AdminObservabilityService.listTenantAuditEvents` now permits only `owner`, `admin`, and `auditor`.
- Added a regression test proving tenant operators are rejected.

## Verification

Passed:
- `node --check admin\app.js`
- Static DOM reference scan: 171 references, 0 missing ids.
- `npm.cmd run typecheck` from `backend/`
- Targeted admin tests:
  - `src/admin-observability/admin-observability.service.spec.ts`
  - `src/admin-auth/admin-permissions.spec.ts`
  - `src/admin-auth/admin-rbac.spec.ts`
  - `src/admin-auth/platform-admin.service.spec.ts`
  - `src/admin-management/admin-management.controller.spec.ts`
  - `src/platform-tenants/platform-tenant.service.spec.ts`
- `npm.cmd run lint` from `backend/`
- `npm.cmd test` from `backend/` - 52 suites, 251 tests passed.
- `npm.cmd run build` from `backend/`
- `npm.cmd run rls:validate` from `database/`
- `git diff --check` over touched Phase 3 files.

Security review:
- Platform account response does not return `password_hash`.
- Callback/audit event responses do not return `payload_encrypted`.
- Event error text is truncated to 240 characters before returning to admin UI.
- Tenant admin listing uses `TenantTx.run`, so tenant RLS context is set for `tenant_admins`.
- Platform event and account queries read platform-level tables directly, matching existing RLS posture.
- Frontend `innerHTML` usage was rechecked: dynamic table and drawer values continue to pass through `escapeHtml` / `escapeAttr` before interpolation.

Known remaining gap:
- Commercial subscription/order/quota pages still correctly stay in a "backend not connected" state because no real commercial database tables or APIs exist yet. No mock commercial data was introduced.
