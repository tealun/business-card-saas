# 99_01 - WeCom Crypto - 2026-07-06

## Scope
- Range: `21579a4..2b3adac`
- Commit audited: `2b3adac feat: add WeCom callback crypto foundation`
- Files changed: 6
- Auto-selected depth: deep
- Risk score: 10 (enterprise WeCom platform integration/callback crypto + webhook-style receiver path + SaaS auth/JWT context + secret/config handling)
- Stack: NestJS 11 backend, TypeScript strict mode, PostgreSQL/RLS schema, WeChat Mini Program surface.

## Summary
- P0: 0 | P1: 2 | P2: 0
- New issues found: 2
- Fixed during audit: 2
- Residual risk: real WeCom callback E2E still needs external service-provider credentials, public HTTPS callback URLs, and pilot corp authorization.

## Findings

### P0 - Must Fix
| ID | Status | Title | File | Line | Evidence | Fix |
|----|--------|-------|------|------|----------|-----|
| - | - | None found in this audit range | - | - | - | - |

### P1 - Should Fix Soon
| ID | Status | Title | File | Line | Evidence | Fix |
|----|--------|-------|------|------|----------|-----|
| WC-P1-1 | Fixed | Example WeCom AES key was not 43 characters | `backend/.env.example` | 13 | The audited commit added `WECOM_CALLBACK_AES_KEY=43_character_encoding_aes_key_xxxxxxxxxxx`, which is 41 characters. Copying it into local config makes `WecomConfigService` reject the callback config before decrypting. | Replaced the sample with the 43-character dev key used by tests: `abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG`. |
| WC-P1-2 | Fixed | PKCS7 unpadding did not validate every padding byte | `backend/src/wecom/wecom-callback-crypto.service.ts` | 84 | `removePkcs7Padding()` checked only the final byte before slicing. A malformed signed ciphertext with inconsistent padding bytes could be accepted. | Added full padding-byte validation and a regression test using a deliberately corrupted encrypted fixture. |

### P2 - Nice to Have
| ID | Status | Title | File | Line | Evidence | Fix |
|----|--------|-------|------|------|----------|-----|
| - | - | None found in this audit range | - | - | - | - |

## Verification Log
- `npm.cmd test` - passed, 5 suites / 23 tests.
- `npm.cmd run typecheck` - passed.
- `npm.cmd run lint` - passed.
- `npm.cmd run build` - passed.
- `npm.cmd run rls:validate` - passed; `database/schema.sql` + `database/rls.sql` baseline validated.
- `npm.cmd run db:verify` - blocked locally because `DATABASE_URL` is not configured.
- `pnpm audit --prod` - blocked because the project uses `package-lock.json` and no `pnpm-lock.yaml` exists.
- `npm.cmd audit --omit=dev` - blocked by local global npm runtime failure: `Class extends value undefined is not a constructor or null`.

## 12-Dimension Coverage Map
| # | Dimension | Status |
|---|-----------|--------|
| 1 | Architecture | Checked: WeCom code is isolated in `backend/src/wecom` and exported through `WecomModule`. |
| 2 | Platform integration | Checked: signature formula, AES-256-CBC decrypt, receiveId validation, and failure paths covered by unit tests. |
| 3 | Security | Checked: bad signatures and receiver mismatch reject; padding validation fixed. |
| 4 | Code efficiency | Checked: no network/database work added; crypto path is bounded by callback payload size. |
| 5 | Runtime smoothness | Checked: module import does not force live WeCom env in non-production. |
| 6 | Info isolation | N/A for this commit: no tenant data reads/writes added. |
| 7 | Data accuracy | Checked: callback message length and receiver fields are parsed from the decrypted wire format. |
| 8 | Parameter passing | Checked: token/timestamp/nonce/encrypt inputs are explicit and signature-bound. |
| 9 | UX | N/A for this commit: backend crypto foundation only. |
| 10 | Coding standards | Checked with lint/typecheck/build. |
| 11 | Testing | Checked: positive decrypt, bad signature, wrong receiver, and malformed padding are covered. |
| 12 | Deploy & Ops | Checked: `.env.example` now has all WeCom required variables; real env and public callback URL remain external setup tasks. |

## Fix Guide
All verified findings were fixed during this audit cycle. No additional code changes are required before continuing to Stage 1.3.

## Doc Updates Needed
- None for this audit range. Stage progress remains tracked in `docs/02-tasks/02_02_First_Enterprise_Wecom_Admin_Plan.md`.
