# 99_61 — Admin Backoffice Audit — 2026-07-16

## Scope

- Range: uncommitted working-tree changes on `main`
- Baseline: `main@57800d26058450822827c1f62ccdc3418d983ffc`
- Worktree: dirty; uncommitted changes included
- Primary files audited:
  - `docs/01-specs/01_08_Admin_Backoffice_Architecture_Guide.md`
  - `docs/design/admin-backoffice-ui-architecture.md`
  - `docs/README.md`
- Related code inspected:
  - `backend/src/admin-auth/*`
  - `backend/src/admin-database/*`
  - `backend/src/company-video-feature/*`
  - `backend/src/platform-tenants/*`
  - `database/schema.sql`
- Auto-selected depth: deep
- Risk score: 12
  - Admin surface, role/permission model, JWT-like admin token, PII/contact fields, third-party WeCom integration, callbacks, production deployment, database writes.

## Summary

- P0: 1 fixed
- P1: 2 fixed
- P2: 1 fixed
- Fix mode: entered after user requested "做好修复".

## System Goal & Critical Paths

Protected goal: the management backend must separate system administrators from enterprise administrators, protect tenant data, keep platform-wide operations out of tenant reach, and make commercial entitlement/usage controls auditable.

Critical path health:

| Path | Health | Evidence |
|---|---|---|
| Tenant admin session -> database migration | Broken | `AdminDatabaseController` accepts any admin session; `runPendingMigrations` only checks `role=owner`, not `accountType=platform`. |
| Platform admin session -> feature flag writes | At risk | Platform feature writes check `accountType=platform` but no role/capability level. |
| New backoffice documentation -> implementation contract | At risk | New docs introduce `admin_audit_logs` even though canonical docs already define `audit_logs`; this creates schema drift risk. |
| Tenant/public card entitlement design | Healthy design, not implemented | New docs explicitly require display access before payload return and no client-declared preview. |

## Confirmed Strengths

- The new architecture guide correctly identifies that platform and tenant identity domains must be separated and that role name alone is insufficient.
- The new UI document correctly requires menu/button visibility to be driven by `session/me`, while preserving server-side authorization checks.
- Platform tenant authorization APIs already reject non-platform sessions through `PlatformTenantService.requirePlatform`.
- The commercialization design preserves the key safety invariant that external visitors must not receive full card payload when quota/subscription access is denied.

## Verification Gaps

- No runtime E2E exploit was executed; findings were proven statically from reachable controller/service paths and then covered with targeted unit tests.
- Targeted backend authorization tests, backend typecheck, and backend lint were run after fixes. The full backend Jest suite was not run.
- WeCom commercial order callback fields remain external-platform assumptions; real callback samples are still required before implementation.

## Findings

### P0 — Must Fix

| ID | Type | Confidence | Status | Title | Path/Dimension | File | Line | Evidence | Fix |
|---|---|---:|---|---|---|---|---:|---|---|
| A-P0-1 | Confirmed | High | Fixed | Tenant owner can reach global database migration execution | Security / Info isolation / Deploy & Ops | `backend/src/admin-database/admin-database.service.ts` | 50 | Fixed by requiring `requirePlatformAdminRole(session, ...)` for migration status/execution and adding tenant owner rejection tests. | Verified by `npm test -- --runTestsByPath src/admin-database/admin-database.service.spec.ts src/admin-auth/admin-rbac.spec.ts`. |

### P1 — Should Fix Soon

| ID | Type | Confidence | Status | Title | Path/Dimension | File | Line | Evidence | Fix |
|---|---|---:|---|---|---|---|---:|---|---|
| A-P1-1 | Confirmed | High | Fixed | Platform feature writes lack platform role/capability authorization | Security / Info isolation | `backend/src/company-video-feature/company-video-feature.service.ts` | 34 | Fixed by requiring platform account type plus at least `admin` role for platform feature writes; platform auditor write denial tests added. | Verified by `npm test -- --runTestsByPath src/company-video-feature/company-video-feature.service.spec.ts`. |
| A-P1-2 | Confirmed | High | Fixed | New guide creates audit schema drift by proposing `admin_audit_logs` beside canonical `audit_logs` | Architecture / Coding standards / Data accuracy | `docs/01-specs/01_08_Admin_Backoffice_Architecture_Guide.md` | 322 | Fixed by changing the guide to reuse and extend canonical `audit_logs`. | Verified by grep/read-back of `01_08_Admin_Backoffice_Architecture_Guide.md`. |

### P2 — Nice To Have

| ID | Type | Confidence | Status | Title | Path/Dimension | File | Line | Evidence | Fix |
|---|---|---:|---|---|---|---|---:|---|---|
| A-P2-1 | Likely | Medium | Fixed | Platform role naming is underspecified for the existing contract | Architecture / Parameter passing | `docs/01-specs/01_08_Admin_Backoffice_Architecture_Guide.md` | 106 | Fixed by adding an explicit platform role migration contract that preserves current `AdminRole` values during transition and requires a separate contract/migration for future `platform_*` role strings. | Verified by grep/read-back of `01_08_Admin_Backoffice_Architecture_Guide.md`. |

## Fix Guide

1. A-P0-1: Add a reusable `requirePlatform(session)` plus role/capability check to `AdminDatabaseService`, then add unit tests that a tenant owner cannot call `getMigrationStatus` or `runPendingMigrations`.
2. A-P1-1: Implement capability-level checks for `CompanyVideoFeatureService.updatePlatform` and `updateTenant`; keep `getPlatform/listTenants` read-only for lower platform roles if desired.
3. A-P1-2: Patch the new guide to reference `audit_logs` instead of `admin_audit_logs`, or document a deliberate table replacement.
4. A-P2-1: Add a small "role migration contract" subsection to the architecture guide before implementation starts.

## Evidence Log

- Accepted A-P0-1: Static proof inspected `AdminDatabaseController` lines 17-20, `AdminDatabaseService` lines 50-51, and `admin-rbac.ts` lines 4-17. The reachable path does not inspect `session.accountType`.
- Accepted A-P1-1: Static proof inspected `PlatformVideoFeatureController` lines 28-50 and `CompanyVideoFeatureService` lines 34-72. Mutating methods require only platform account type.
- Accepted A-P1-2: Static proof compared new guide line 322 with canonical `audit_logs` definitions in core and admin guide docs.
- Accepted A-P2-1: Static proof compared new guide platform role names with `adminRoleSchema` in `backend/src/contracts/admin-auth.ts`.
- Fix verification: `npm.cmd test -- --runTestsByPath src/admin-auth/admin-rbac.spec.ts src/admin-database/admin-database.service.spec.ts src/company-video-feature/company-video-feature.service.spec.ts` passed 3 suites / 16 tests.
- Fix verification: `npm.cmd run typecheck` passed.
- Fix verification: `npm.cmd run lint` passed.
- Rejected: `session/me` missing `permissions/menu_scopes` as a direct bug. The new guide lists this as a future implementation checklist, so it is not currently a contradiction by itself.
- Rejected: New `/admin/tenant/*` page paths as a route bug. The guide explicitly says old paths can be retained during migration.

## 12-Dimension Coverage

1. Architecture: At risk — audit table and platform role migration details need tightening.
2. Platform integration: Verification gap — WeCom commercial callback facts still require real samples.
3. Security: Broken — database migration path lacks account-domain authorization.
4. Code efficiency: Healthy for docs; no new runtime code.
5. Runtime smoothness: N/A for docs; targeted code paths are authorization, not performance.
6. Information isolation: Broken/At risk — tenant owner can satisfy global migration role guard; platform writes lack fine-grained role checks.
7. Data accuracy: At risk — duplicate audit-table guidance can fragment audit evidence.
8. Parameter passing: At risk — platform role values/capabilities are not fully specified.
9. UX: Healthy design — UI doc covers loading, empty, responsive, permission-visible states.
10. Coding standards: At risk — new spec should align with existing audit log naming.
11. Testing: Verification gap — no tests were run; missing tests for tenant owner 403 on migration route and platform auditor/support write denial.
12. Deploy & Ops: Broken — migration endpoint authorization is too broad for a production/global operation.

## Doc Updates Needed

- Update `01_08_Admin_Backoffice_Architecture_Guide.md` to use or extend canonical `audit_logs`.
- Add a platform role/capability migration subsection.
- Add explicit tests to the guide for tenant owner denial on `/admin/database/migrations/run`.

## Next Steps

1. Fix A-P0-1 first; it is a platform-wide destructive-operation boundary issue.
2. Fix A-P1-1 before adding more platform feature toggles.
3. Patch the new architecture guide to remove audit-table drift before implementation planning uses it.
