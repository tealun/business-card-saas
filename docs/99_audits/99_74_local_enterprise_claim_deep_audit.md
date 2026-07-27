# 99_74 — Local Enterprise Onboarding & Platform Tenant Deep Audit — 2026-07-27

## Scope

- Baseline: `main@99d390c`; worktree clean, no uncommitted changes.
- Range audited: `b5246ad..99d390c` (68 commits, 188 files, +15,123/-1,208) — everything since the last comprehensive baseline (`99_71`, `b5246ad`). `99_72` and `99_73` are narrower audits inside this range (admin-auth readiness spec review; WeCom server API contract) and are not re-litigated here.
- Depth: **Deep**, targeted at critical paths — this range introduces new tenant-onboarding, platform-admin, and upload surfaces (`local-enterprise` claim/join, `platform-tenants` lifecycle management, `enterprise-admin` console, portrait photo upload). Full line-by-line coverage of all 188 files was not attempted; see Coverage and Evidence Limits.
- Evidence limits: no live PostgreSQL instance available in this environment — the central finding below is proven by static RLS-policy/query inspection, not by running the query against a real database. The project's own README currently lists "真实 PostgreSQL 验证" as a pending next step, which is consistent with this class of bug shipping unnoticed. Miniprogram frontend logic (`enterprise-admin/index.js`, portrait editor, card style unification) and the full `wecom-contact-sync`/`wecom-sensitive` bodies were spot-checked, not fully traced.

## Verdict

- P0: 1 | P1: 0 | P2: 0
- Main risk: the newly shipped "本地企业认领" (claim a platform-created shell enterprise) flow is unreachable against a real RLS-enabled Postgres — its first query is blocked by the very RLS policy meant to protect the table it reads, so every claim attempt will fail with "认领码无效或已过期" regardless of token validity.

## Critical Paths

- Local enterprise self-serve create (`POST /local-enterprises`): **Healthy** — advisory lock + ownership cap + RLS context set before tenant-scoped writes.
- Local enterprise claim (`POST /local-enterprises/claim`): **Broken** — see A74-P0-1.
- Local enterprise join code / join request (`join-code`, `join-requests`, review): **Healthy** — RLS deliberately disabled on `tenant_join_codes`/`member_join_requests` (documented in `rls.sql:44-47`) with tenant scoping enforced entirely by explicit `tenant_id` parameters bound to the authenticated admin session; verified this holds for every query in `local-enterprise.repository.ts`.
- Platform tenant lifecycle (create/rename/enable/disable/delete/sync members) (`admin/platform/tenants/*`): **Healthy** — every mutating method calls `requirePlatformAdminRole`/`requirePlatform` before touching the repository; `syncTenantMembers` additionally checks `creationSource==='wecom' && authStatus==='active'` before delegating to contact sync.
- Local admin scan-login (`admin/auth/local-scan/challenges`, poll, confirm): **Healthy** — random 21-byte token, hashed at rest, 5-minute expiry, single-use consume guarded by `FOR UPDATE` + status transition check.
- Portrait/image upload (`storage.service.ts`, feeding portrait-photo-editor): **Healthy** — MIME allowlist, size caps enforced before write, local-path traversal blocked by a final normalized-path containment check (`resolveLocalKey`) independent of the character-allowlist on path segments, WeCom remote-image fetch restricted to an exact-or-suffix hostname allowlist checked both pre- and post-redirect (SSRF guard).
- WeCom login callback (`wecom-login-callback.service.ts`): **Not fully verified** — signature/AES decrypt path and `receiveId`/`suiteId` checks read correctly on inspection; not exercised against live WeCom traffic in this pass.

## Confirmed Strengths

- All new claim/join/invitation tokens are stored only as SHA-256 hashes, never in plaintext, with expiry and single-use consumption enforced via `FOR UPDATE` + status/`used_at` transitions.
- `createEnterprise` and `claimEnterprise` both take a `pg_advisory_xact_lock`/pre-check to prevent race conditions (double-claim, ownership-limit bypass under concurrent requests).
- Storage path handling defends in depth: even though `safeSegment`'s character allowlist (`[A-Za-z0-9_.-]+`) technically permits a bare `..` segment, `resolveLocalKey`'s final `target.startsWith(root+sep)` check independently rejects any traversal outside the storage root — the two layers don't share a single point of failure.
- Platform-admin endpoints consistently gate on `requirePlatformAdminRole`/`requirePlatform` before any read or write, including the newer lifecycle actions (rename/enable/disable/delete/claim-token reissue).

## Findings

| ID | Severity | Type / Confidence | Status | Finding | Path / Dimension | Evidence | Remediation |
|---|---|---|---|---|---|---|---|
| A74-P0-1 | P0 | Confirmed / High | Fixed | `LocalEnterpriseRepository.claimEnterprise` reads `admin_claim_tokens` by `token_hash` alone, before any `set_config('app.tenant_id', ...)` call in that transaction. `admin_claim_tokens` has RLS **enabled** with policy `tenant_id = current_setting('app.tenant_id', true)::bigint` (`database/rls.sql:34-37`). With `app.tenant_id` unset, `current_setting(..., true)` returns NULL, so `tenant_id = NULL` is never true and the SELECT returns zero rows for every token — the claim flow can never succeed against a real non-superuser, non-BYPASSRLS Postgres connection (which `database/README.md`'s own `verify` script requires: "tenant RLS actually isolates A/B tenant data ... without BYPASSRLS"). The exact same "resolved before tenant context is known" problem was already identified and fixed for sibling tables (`member_invitations`, `tenant_join_codes`, `member_join_requests`, `local_admin_login_challenges` — all RLS-disabled with an explicit comment to that effect in `rls.sql:39-50`), but `admin_claim_tokens` was left RLS-enabled because it also serves the older `owner-bootstrap` flow, which supplies `tenant_id` up front via `tenantTx!.run(input.tenantId, ...)` (`backend/src/admin-bootstrap/owner-bootstrap.repository.ts:122-181`) and therefore never hits this problem. The new `claimEnterprise` consumer (added in `ad5464c feat: add enterprise claim and admin management`) reuses the same table under a fundamentally different access pattern (resolve tenant from an opaque token with no tenant known in advance) that its RLS policy cannot support. | Local enterprise claim / Information isolation, Platform integration | `backend/src/local-enterprise/local-enterprise.repository.ts:42-59` (query before `this.context(tx, ...)` at line 62); `database/rls.sql:34-37`; contrast with `backend/src/admin-bootstrap/owner-bootstrap.repository.ts:122-181` (same table, context supplied up front) and `database/rls.sql:39-50` (sibling tables already fixed by disabling RLS with matching rationale comment) | Either (a) disable RLS on `admin_claim_tokens` and require every consumer (`claimEnterprise` and `owner-bootstrap`) to filter explicitly by tenant_id/token_hash — the same pattern already used for the sibling tables — or (b) have `claimEnterprise` first resolve `tenant_id` with a query that runs under a role/path unaffected by the policy (e.g., a narrowly-scoped lookup function), then set `app.tenant_id` before the row is read. Given three sibling tables already took approach (a), that is the smaller, consistent fix. Add a repository unit test for `claimEnterprise` (currently absent) and, ideally, exercise it once against a real RLS-enabled database before the next release. |

## Fix Verification (2026-07-27)

- Disabled RLS on `admin_claim_tokens` (matching the sibling `tenant_join_codes`/`member_join_requests`/`local_admin_login_challenges` pattern): `database/rls.sql` — replaced `ENABLE ROW LEVEL SECURITY` + `CREATE POLICY` with `DISABLE ROW LEVEL SECURITY` and a rationale comment.
- Added a forward migration for already-initialized databases: `database/migrations/migrate_v1_21.sql` (`DROP POLICY IF EXISTS` + `DISABLE ROW LEVEL SECURITY`).
- Updated the two static validators that previously asserted the opposite: `database/scripts/validate-rls.cjs` (added `admin_claim_tokens` to `tenantRlsExceptions` + the disabled-table assertion loop) and `database/scripts/db-check.cjs` (moved it out of `tenantRlsTables`, added an explicit "must not enable RLS" assertion). `npm run rls:validate` passes against the updated baseline.
- Closed the test-coverage gap: added four cases to `backend/src/local-enterprise/local-enterprise.repository.spec.ts` covering `claimEnterprise`'s happy path, already-claimed rejection, invalid-token rejection, and — as a direct regression guard for this bug class — an assertion that the token lookup is the first query issued and precedes any `set_config('app.tenant_id', ...)` call in the transaction.
- Verified no regression: `cd backend && npm run typecheck` clean; `npx jest` — 68 suites / 430 tests passed (up from 426; the 4 new cases pass).
- Corrected the two canonical fact-source docs that asserted the old (incorrect) RLS status: `docs/00-core/00_02_Database_Schema.md` §2 and `docs/00-core/00_01_Dev_Doc.md` (A4-P1-5 section).
- Residual: this fix was verified by static inspection, unit tests, and the schema-diffing validators — not by running the claim flow against a live PostgreSQL instance (none available in this environment). Recommend exercising `POST /local-enterprises/claim` once against a real RLS-enabled database (e.g. via `database`'s `npm run verify` extended with a claim-token probe) before the next production deploy, per the README's own pending "真实 PostgreSQL 验证" step.

## Verification Gaps

- `claimEnterprise` has zero test coverage anywhere in the repo (`grep -rn "\.claim(" backend/src --include=*.spec.ts` → no matches; `local-enterprise.repository.spec.ts` and `local-enterprise.service.spec.ts` cover every other repository method except this one). This is exactly the gap that let A74-P0-1 ship undetected — unit tests use a `FakeDatabase` mock with no RLS semantics, and `database/scripts/db-verify.cjs` only `TRUNCATE`s `admin_claim_tokens`, it never inserts/consumes a token through the real claim path.
- WeCom login callback signature/decrypt path (`wecom-login-callback.service.ts`) was read but not exercised against live or recorded WeCom traffic in this pass.
- `enterprise-admin/index.js` (2,181 lines, new) and the portrait-photo-editor/card-style-unification miniprogram changes were not read in full; this audit did not check their client-side logic for correctness or state bugs.
- `wecom-contact-sync`/`wecom-sensitive` service bodies changed materially in this range (permission-fallback logic, member detail sync) but were only spot-checked, not traced end-to-end; `99_73`'s open findings (`A73-P1-1/2/3`, `A73-P2-1/2`) already cover known contract mismatches in the WeCom API client layer and remain open/unaffected by this audit.

## Coverage

- This audit intentionally traded 12-dimension breadth for depth on the highest-risk new paths (tenant boundary creation/claim/join, platform-admin authority, upload handling). It is **not** a full standard/deep sweep of all 188 changed files — architecture, code-efficiency, coding-standards, and full UX/accessibility dimensions were not separately assessed this round.
- Security / Information isolation: covered in depth for the paths above — 1 P0 found.
- Platform integration (WeCom callbacks, storage remote drivers): spot-checked, healthy on inspection.
- Testing: verification gap noted above (no coverage for the broken path).
- Remaining dimensions (Architecture, Code efficiency, Runtime smoothness, Data accuracy outside the traced paths, Parameter passing outside the traced paths, User experience, Coding standards, Deploy & ops): **Not assessed this round** — no evidence gathered either way.

## Evidence Log

- Accepted: `admin_claim_tokens` RLS policy (`database/rls.sql:34-37`) combined with `claimEnterprise`'s pre-context lookup (`local-enterprise.repository.ts:44-59`) — statically proven to return zero rows for any token under real RLS enforcement.
- Accepted (context, not a finding): `owner-bootstrap.repository.ts`'s use of the same table succeeds because it supplies `tenant_id` before querying (`tenantTx!.run(input.tenantId, ...)`), confirming the divergence is specific to the new claim consumer, not the table itself.
- Rejected: `reviewJoinRequest`/`listJoinRequests`/`createJoinCode` querying `member_join_requests`/`tenant_join_codes` without setting RLS context — not a bug, because RLS is deliberately disabled on both tables (`rls.sql:44-47`) and every query filters by `tenant_id` bound to the caller's authenticated session.
- Rejected: `storage.service.ts`'s `safeSegment` allowing a bare `..` path segment — not exploitable, because `resolveLocalKey`'s final resolved-path containment check independently rejects anything that would land outside `storageLocalRoot`.
- Rejected: `storage.controller.ts`'s public, unauthenticated read route — by design; served objects are public card-facing assets (avatars, logos, portraits, company images) and the file predates this audited range.
