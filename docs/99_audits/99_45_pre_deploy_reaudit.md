# 99_45 - Pre Deploy Reaudit - 2026-07-07

## Scope
- Range: `479ac73` after `git pull --ff-only`
- Files: backend config/runtime, CI/Docker, admin/miniprogram risk scans, database RLS scripts, previous audit `99_31`
- Auto-selected depth: deep
- Risk score: 15 (auth + admin surface + WeCom callbacks + PII + multi-tenant DB/RLS + Docker/CI + production deployment)

## Summary
- P0: 1 fixed
- P1: 1 fixed
- P2: 1 open
- Build/test/security checks are mostly green, but deployment should not proceed until P0 is fixed.

## P0 - Must Fix

| ID | Status | Title | File | Line | Evidence | Fix |
|----|--------|-------|------|------|----------|-----|
| A32-P0-1 | Fixed | Production database URL documented and composed as `postgresql://`, but `AppConfig` rejects it | `backend/src/config/app-config.ts`; `backend/.env.example`; `docker-compose.yml`; `README.md` | 21; 5; 23; 43, 59 | `DATABASE_URL` was validated with `.startsWith("postgres://")`, while the sample env, compose backend service, and README all use `postgresql://...`. A production config constructed with those values failed with `Invalid application configuration: DATABASE_URL: Invalid string: must start with "postgres://"` before the app could start. | `AppConfig` now accepts both `postgres://` and `postgresql://`, with a regression test for the standard `postgresql://` scheme used by compose and docs. |

## P1 - Should Fix Soon

| ID | Status | Title | File | Line | Evidence | Fix |
|----|--------|-------|------|------|----------|-----|
| A32-P1-1 | Fixed | Required card-field encryption key is not deployment-ready in docs/env examples | `backend/.env.example`; `README.md`; `backend/src/config/app-config.ts` | 12; 18, 59-75; 26 | `.env.example` set `CARD_FIELD_ENCRYPTION_KEY_BASE64=change-me-in-production-32-byte-base64`, which is not a valid base64-encoded 32-byte key. The README first-step secret checklist named JWT/Admin/Visit/WeCom secrets but omitted this key, and the production env block did not list it. `AppConfig` requires it at startup. | `.env.example` now includes a valid 32-byte base64 sample plus a generation command; README now lists `CARD_FIELD_ENCRYPTION_KEY_BASE64` in production setup. |

## P2 - Nice To Have

| ID | Status | Title | File | Line | Evidence | Fix |
|----|--------|-------|------|------|----------|-----|
| A32-P2-1 | Open | Local toolchain has package-manager drift that can obscure real failures | local environment; `backend/package-lock.json`; `backend/node_modules` | n/a | The repo is npm/CI based, but local `node_modules` was pnpm-style and stale after pull. Global `npm.cmd ci` failed inside npm 11.12.1 with `Class extends value undefined is not a constructor or null`; direct tool invocation after dependency sync passed. | Before release, verify in clean CI or a clean container with `npm ci`. Locally, repair Node/npm or use the Docker builder path as the authoritative install check. |

## Verification Log
- `git pull --ff-only`: updated to `479ac73`.
- `npm.cmd ci`: blocked by local npm internal error (`minipass-sized` / npm 11.12.1), treated as local toolchain issue after alternate verification.
- `pnpm install --lockfile=false`: populated local dependencies but exited non-zero due pnpm build-script approval policy; generated temporary pnpm files were removed.
- `node_modules/.bin/tsc.cmd -p tsconfig.json --noEmit`: passed.
- `node_modules/.bin/eslint.cmd "src/**/*.ts"`: passed.
- `node_modules/.bin/jest.cmd --runInBand`: 34 suites passed, 137 tests passed.
- `node_modules/.bin/jest.cmd --runInBand --coverage`: passed configured coverage thresholds.
- `node -e "fs.rmSync(...)"` + `node_modules/.bin/tsc.cmd -p tsconfig.build.json`: passed.
- `node scripts/validate-rls.cjs`: passed (`schema.sql` + `rls.sql` baseline validated).
- `pnpm audit --prod --audit-level moderate --registry=https://registry.npmjs.org`: no known vulnerabilities found.
- Static risk scan: no production hits for `eval`, `Function`, `dangerouslySetInnerHTML`, admin token localStorage persistence, hardcoded DB password, or localhost API default. Hits were limited to scripts/specs.
- Production-config reproduction: constructing `AppConfig` with the repo-documented `postgresql://...` `DATABASE_URL` failed, verifying A32-P0-1.
- Fix verification: `app-config.spec.ts` now covers `postgresql://`, and direct production-config construction with `postgresql://...` passes.

## Positive Observations
- Backend typecheck, lint, test, coverage, build, RLS validation, and production dependency audit are green after dependency sync.
- CI now exists and runs typecheck, lint, coverage-threshold tests, and RLS validation.
- Dockerfile builds the backend as non-root in the final image.
- RLS baseline validator passes.
- Prior P0/P1 issues in `99_44_comprehensive.md` were not re-observed except the new deployment-config mismatch above.

## Release Recommendation
A32-P0-1 and A32-P1-1 are fixed. Before deployment, re-verify in a clean `npm ci` environment:

```powershell
cd backend
npm ci
npm run typecheck
npm run lint
npm test -- --coverage
npm run build
npm run rls:validate
npm audit --omit=dev --audit-level=moderate
```

Then start the Docker compose stack with the same `DATABASE_URL` scheme used in production and verify `/api/v1/health/ready`.
