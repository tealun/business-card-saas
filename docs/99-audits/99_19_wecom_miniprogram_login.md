# 99_19 - WeCom MiniProgram Login - 2026-07-06

## Scope
- Range: `d9625ee..ed91b38`
- Files: 6 changed
- Auto-selected depth: deep
- Risk score: 11
- Signals: auth path, third-party WeCom API call, tenant isolation, database-backed authorization state, user-facing API surface

## Summary
- P0: 0 | P1: 0 | P2: 0
- New issues: 0 | Fixed from previous: 0
- Result: No verified code defects found in the Stage 2.1/2.2 MiniProgram login adapter.

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
| 1 Architecture | Covered | Adapter stays in `WecomModule`; auth wiring is intentionally deferred to the next stage. |
| 2 Platform integration | Covered | `jscode2session` uses the suite access token and existing timeout/error mapping. |
| 3 Security | Covered | Empty codes are rejected; unauthorized corps are rejected before identity is returned. |
| 4 Code efficiency | Covered | No extra caching or broad abstractions added. |
| 5 Runtime smoothness | Covered | External call uses the shared `WECOM_HTTP_TIMEOUT_MS` guard. |
| 6 Info isolation | Covered | `open_corpid` must resolve to an authorized tenant before login succeeds. |
| 7 Data accuracy | Covered | Code accepts both observed provider field families: `open_corpid/open_userid` and `corpid/userid`. |
| 8 Parameter passing | Covered | Suite token is URL-encoded, js code is sent in JSON body. |
| 9 UX | N/A | Backend adapter only; no UI changed in this range. |
| 10 Coding standards | Covered | Tests, lint, typecheck, and build passed. |
| 11 Testing | Covered | Unit coverage added for success and unauthorized-tenant paths, plus API client payload validation. |
| 12 Deploy & Ops | Covered | No new runtime env var was introduced in this range. |

## Verification Log
- `git pull --ff-only`: passed; branch already up to date.
- `git diff --stat d9625ee..ed91b38`: 6 files, 227 insertions, 3 deletions.
- `npm.cmd test`: passed; 11 suites / 43 tests.
- `npm.cmd run typecheck`: passed.
- `npm.cmd run lint`: passed.
- `npm.cmd run build`: passed.
- `npm.cmd run rls:validate`: passed.
- `npm.cmd run db:verify`: blocked by missing `DATABASE_URL` in the local audit environment.
- `npm.cmd audit --omit=dev`: blocked by local/global npm failure: `Class extends value undefined is not a constructor or null`.
- Static scan for `eval`, `Function`, string-built SQL, debug logs, TODO/FIXME/HACK, and unsafe HTML in touched backend areas: no matches.

## Residual Risk
- The provider response field names for `service/miniprogram/jscode2session` are mapped defensively, but still need M0-M1 verification against a real authorized WeCom tenant.
- This commit adds the adapter only. The public `POST /api/v1/auth/qy-login` endpoint is still demo-backed until the next implementation stage wires the adapter into Auth and employee provisioning.

## Doc Updates Needed
- `docs/02-tasks/02_02_First_Enterprise_Wecom_Admin_Plan.md` already marks Stage 2.1/2.2 complete and keeps Stage 2.3/2.4 pending.

## Next Steps
1. Wire the MiniProgram adapter into `AuthService.qyLogin`.
2. Add first-login employee provisioning and default card initialization.
3. Keep demo login available only as an explicit local/dev fallback.
