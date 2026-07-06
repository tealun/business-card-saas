# 99_08 - WeCom Admin Auth - 2026-07-06

## Scope
- Range: `11df117..9383c2c`
- Files: 17 changed
- Auto-selected depth: deep
- Risk score: 13
- Signals: admin auth path, tenant admin lookup, signed session token, RBAC, third-party WeCom identity dependency, RLS context

## Summary
- P0: 0 | P1: 0 | P2: 0
- New issues: 0 | Fixed from previous: 0
- Result: No verified code defects found in the Stage 3 backend admin auth slice.

## Findings

### P0 - Must Fix
| ID | Status | Title | File | Line | Evidence | Fix |
|----|--------|-------|------|------|----------|-----|
| - | - | None | - | - | - | - |

### P1 - Should Fix
| ID | Status | Title | File | Line | Evidence | Fix |
|----|--------|-------|------|------|----------|-----|
| - | - | None | - | - | - | - |

### P2 - Nice to Have
| ID | Status | Title | File | Line | Evidence | Fix |
|----|--------|-------|------|------|----------|-----|
| - | - | None | - | - | - | - |

## Coverage Map
| Dimension | Status | Notes |
|-----------|--------|-------|
| 1 Architecture | Covered | Admin auth is isolated in `AdminAuthModule`; WeCom identity and owner/admin lookup remain separate services. |
| 2 Platform integration | Covered | Admin login currently uses the existing WeCom identity adapter; real Web OAuth/scan exchange remains an M0 integration item. |
| 3 Security | Covered | Employee and admin tokens use different secrets and HMAC domains; non-admin users are rejected. |
| 4 Code efficiency | Covered | RBAC is a compact helper; no new framework or broad abstraction added. |
| 5 Runtime smoothness | Covered | Login performs one WeCom identity resolution and one tenant-admin lookup. |
| 6 Info isolation | Covered | Admin lookup uses backend-derived `tenantId/openUserid`; DB lookup runs through `TenantTx` to set `app.tenant_id`. |
| 7 Data accuracy | Covered | Active `tenant_admins` records define role and member binding; inactive admins are ignored. |
| 8 Parameter passing | Covered | No frontend-supplied tenant id is accepted by admin login; tenant context comes from WeCom identity. |
| 9 UX | Covered | `GET /api/v1/admin/session/me` gives the admin UI a stable login-state endpoint. |
| 10 Coding standards | Covered | Tests, typecheck, lint, build, and RLS validation passed. |
| 11 Testing | Covered | Unit tests cover successful admin login, non-admin rejection, token verification, and RBAC ordering. |
| 12 Deploy & Ops | Covered | New `ADMIN_JWT_SECRET` is supported via existing `readSecret`; Redis/revocation is documented as a production enhancement. |

## Verification Log
- `git pull --ff-only`: passed; branch already up to date.
- `git diff --stat 11df117..9383c2c`: 17 files, 431 insertions, 12 deletions.
- `npm.cmd test`: passed; 14 suites / 51 tests.
- `npm.cmd run typecheck`: passed.
- `npm.cmd run lint`: passed.
- `npm.cmd run build`: passed.
- `npm.cmd run rls:validate`: passed.
- `npm.cmd run db:verify`: blocked by missing `DATABASE_URL` in the local audit environment.
- `npm.cmd audit --omit=dev`: blocked by local/global npm failure: `Class extends value undefined is not a constructor or null`.
- Static scan for `eval`, `Function`, string-built SQL, debug logs, TODO/FIXME/HACK, and unsafe HTML in touched admin backend areas: no matches.

## Residual Risk
- Real enterprise WeCom Web OAuth/scan-login code exchange still needs M0 credential-backed verification; this backend slice reuses the current WeCom identity adapter until that platform fact is confirmed.
- Stateless admin tokens cannot be revoked before expiry. The admin guide now records Redis-backed session/revocation as a production enhancement.
- `OwnerBootstrapRepository.createOwner` remains a local skeleton path; durable owner bootstrap persistence should be completed when exposing an owner bootstrap API or UI.

## Doc Updates Needed
- `docs/01-specs/01_02_Api_Spec.md` updated with admin auth/session endpoints.
- `docs/01-specs/01_04_Admin_Web_Guide.md` updated to reflect MVP signed admin token before Redis sessions.
- `docs/02-tasks/02_02_First_Enterprise_Wecom_Admin_Plan.md` updated to mark Stage 3 backend minimum complete and Stage 4 next.

## Next Steps
1. Continue Stage 4: admin UI login-state wiring and the first tenant dashboard/member configuration APIs.
2. Complete real Web OAuth/scan-login field verification when WeCom credentials and callback URL are available.
