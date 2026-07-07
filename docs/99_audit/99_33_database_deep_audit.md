# 99.33 Backend Database Deep Audit

- Date: 2026-07-07
- Commit audited: `a39e3b9 docs: add backend deployment guide`
- Scope: `backend/src`, `backend/scripts`, `backend/migrations`, `.github/workflows/deploy-backend.yml`, `database/schema.sql`, `database/rls.sql`
- Focus: backend database connection, SQL interaction paths, tenant context / RLS, database migration and deployment readiness
- Overall risk after fix: **Code-level blockers fixed; production deployment still requires live `db:migrate` + `db:check` against the target database**

## Findings

| ID | Severity | Status | Finding | Evidence | Impact | Recommendation |
| --- | --- | --- | --- | --- | --- | --- |
| A33-P0-1 | P0 | Fixed | Employee card and public-card runtime paths were still in-memory, not PostgreSQL-backed | `backend/src/employee/employee-card.repository.ts`, `backend/src/public-card/public-card.repository.ts`, `backend/src/employee/employee-card.module.ts`, `backend/src/public-card/public-card.module.ts` | Employee card edits, styles, shares, public visits, actions, and derived shares could be process-local only. | Added DB-first repository paths. Employee card reads/writes/styles run through `TenantTx`; public reads resolve `public_card_directory` and enter tenant context; visits/actions/shares persist to `card_visits`, `card_actions`, and `card_shares`. |
| A33-P0-2 | P0 | Fixed | `callback_events` had tenant RLS, but callback repositories queried it without setting tenant context | `database/rls.sql`, `backend/scripts/validate-rls.cjs` | Callback idempotency, retry/dead-letter tracking, and admin sync visibility could be unreliable under the intended runtime role. | Made `callback_events` an explicit platform operations table without tenant RLS and added static validation that it remains outside tenant RLS. |
| A33-P1-1 | P1 | Fixed | Deployment synced only `backend/`, but baseline migration read SQL from repo-root `database/` | `.github/workflows/deploy-backend.yml`, `backend/migrations/0000000000000_baseline.js` | First-time migration or recovery from the deployed app directory could fail because SQL assets were absent. | Workflow now syncs `database/` to `${DEPLOY_PATH}/database/`; baseline migration resolves both repo-root and deployed app-root database asset paths. |
| A33-P1-2 | P1 | Fixed | RLS validation did not cover nullable-tenant or platform tables | `backend/scripts/validate-rls.cjs` | Static RLS validation could pass while `callback_events` had an unusable posture. | Added explicit `callback_events` platform-table assertions. Live role/query coverage is now handled by `npm run db:check`. |
| A33-P1-3 | P1 | Fixed | Database runtime pool had no production operational guardrails | `backend/src/config/app-config.ts`, `backend/src/database/database.service.ts`, `backend/.env.example` | Slow or partitioned database connections had weak timeout/pool handling and config validation could drift. | Added validated pool max/connect timeout/idle timeout/statement timeout/SSL/application name settings and a pool error listener. |
| A33-P1-4 | P1 | Fixed | No non-destructive database readiness/migration verification existed for production | `backend/scripts/db-check.cjs`, `backend/package.json` | Operators lacked a safe live DB command for schema/index/RLS posture checks. | Added `npm run db:check`, a read-only live database check for required tables, critical indexes, and RLS posture. |
| A33-P2-1 | P2 | Fixed | `DatabaseService` duplicated raw env parsing instead of using validated `AppConfig` | `backend/src/config/app-config.ts`, `backend/src/database/database.service.ts` | Validation and runtime behavior could drift when database options expand. | DI/runtime paths now inject optional `AppConfig`; direct unit-test construction still falls back to `process.env` for focused tests. |

## Positive Checks

- Tenant-scoped admin, config, owner-bootstrap, contact sync, and provisioning paths generally use `TenantTx` and set `app.tenant_id` locally inside a transaction.
- `TenantTx` uses `set_config('app.tenant_id', $1, true)`, which correctly scopes the tenant GUC to the current transaction.
- SQL search did not find string interpolation of user-controlled values in the audited application queries; the reviewed queries use parameter arrays.
- `public_card_directory` is intentionally outside tenant RLS and documented as the public lookup table.

## Verification

- `git pull --ff-only` - passed, repository already up to date.
- `rg` scans over DB interaction paths, RLS, migration references, and pool configuration - completed.
- `.\node_modules\.bin\tsc.cmd -p tsconfig.json --noEmit` - passed after fix.
- `.\node_modules\.bin\eslint.cmd "src/**/*.ts"` - passed.
- Targeted Jest for public/employee/callback/admin/config paths - passed after fix.
- `.\node_modules\.bin\jest.cmd --runInBand` - passed after fix: 34 suites, 138 tests.
- `node scripts\validate-rls.cjs` - passed after fix.
- `node -c scripts\db-check.cjs` - passed syntax check after fix.
- `npm run build` - passed after fixing tsbuildinfo cleanup.
- `npm.cmd audit --omit=dev --audit-level=moderate` - blocked by local npm runtime failure: `Class extends value undefined is not a constructor or null`.
- `db:check` live database probe - not run because no real target `DATABASE_URL` is configured in this environment.
- `db:verify` destructive integration probe - not run because no disposable `DATABASE_URL` is configured in this environment.

## Deployment Recommendation

The code-level blockers from this audit are fixed. Before production deployment, run `npm run db:migrate` and `npm run db:check` against the target database, then exercise the public card visit/action/share flow and employee card edit flow with the intended runtime role.
