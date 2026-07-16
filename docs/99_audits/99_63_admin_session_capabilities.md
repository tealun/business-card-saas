# Admin Backoffice Phase 2 Audit - Session Capabilities

Date: 2026-07-16

Scope:
- Admin session identity contract and password/QY login responses.
- Platform and tenant capability matrix.
- Admin frontend menu/action visibility driven by session capabilities.
- Regression risk around existing password login and password change behavior.

Result: Passed after one frontend capability fallback fix.

## Findings

### A63-P2-1 - Empty capability arrays were treated as full access

Status: Fixed in `a5dee84`.

The first Phase 2 implementation treated both missing capability fields and empty arrays as legacy full-access fallback. That made an explicit `permissions: []` or `menu_scopes: []` indistinguishable from an older backend that omitted the fields.

Fix:
- `admin/app.js` now only falls back to full access when the capability field is absent or non-array.
- A present empty array now means no capability, which matches the session contract semantics.

## Verification

Passed:
- `node --check admin\app.js`
- Static DOM reference scan: 138 references, 0 missing ids.
- `npm.cmd run typecheck` from `backend/`
- Targeted tests:
  - `src/admin-auth/admin-permissions.spec.ts`
  - `src/admin-auth/admin-auth.service.spec.ts`
  - `src/admin-auth/platform-admin.service.spec.ts`
  - `src/admin-auth/admin-rbac.spec.ts`
- `npm.cmd run lint` from `backend/`
- `npm.cmd test` from `backend/` - 51 suites, 247 tests passed.
- `npm.cmd run build` from `backend/`
- `npm.cmd run rls:validate` from `database/`

Notes:
- The temporary failed command `npm.cmd run rls:validate` from `backend/` was an operator path mistake. CI runs the RLS validator from `database/`, and that command passed.
- Admin password verification, password change, token shape, and QY login session verification were not altered; only identity response payloads were extended with `permissions` and `menu_scopes`.
- Frontend capability checks are UX gating. Backend RBAC guards remain the authoritative access control.
