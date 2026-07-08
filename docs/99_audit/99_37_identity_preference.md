# 99_37 — Identity Preference — 2026-07-08

## Scope

- Commits: `554f0fc..401a616`
- Files changed: 5
- Auto-selected depth: Deep
- Risk score: 9
- Signals: JWT session identity, multi-account identity switching, database writes to `account_preferences`, WeCom/WeChat login boundary

## Summary

- P0: 0
- P1: 0
- P2: 0
- Stage focus: preserving the user-selected sending identity across ordinary WeChat and Enterprise WeChat login paths.

## P0 — Must Fix

None.

## P1 — Should Fix

None.

## P2 — Nice to Have

None.

## Verification Log

- Reviewed `AuthService.qyLogin()` and confirmed it resolves the login identity first, then selects a preferred identity from the same account's bound identity list.
- Reviewed `PersonalIdentityRepository.pickPreferredIdentity()` and confirmed it only returns identities already loaded by `listAccountIdentitiesInTx(accountId)`, so a stale or malicious `last_member_identity_id` cannot select an identity outside the current account.
- Reviewed `ensureDefaultIdentity()` and WeCom provisioning preference upsert SQL; both preserve existing `last_member_identity_id` with `COALESCE(account_preferences.last_member_identity_id, EXCLUDED.last_member_identity_id)`.
- Reviewed `switchIdentity()` and confirmed it still verifies account ownership before writing `last_member_identity_id`.
- Ran targeted tests for personal identity preference, WeCom provisioning, and auth/employee flow: passed.
- Ran backend `npm.cmd run typecheck`: passed.
- Ran backend `npm.cmd run lint`: passed.
- Ran backend `npm.cmd test`: 35 suites / 141 tests passed.

## Residual Risk

- Cross-channel automatic account merge still depends on a trustworthy common identifier or an explicit bind flow. The current implementation correctly supports multiple identities once bound to one `account_id`, but it does not silently merge a WeChat personal account with a WeCom employee account without that shared account/binding evidence.
- Miniprogram runtime behavior for `wx.qy.login` vs `wx.login` still needs real-device or WeChat DevTools validation; CI covers backend contracts and miniprogram JavaScript syntax, not the native runtime API availability.

## Doc Updates Needed

- No additional spec change required. Existing docs already state that `account_preferences.last_member_identity_id` is the default current identity and that `switch-identity` is the active switching path.
