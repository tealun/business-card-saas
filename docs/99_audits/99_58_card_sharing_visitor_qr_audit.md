# 99_58 Card Sharing, Visitor Folding, and QR Storage Audit - 2026-07-12

## Scope
- Working tree audit for the current uncommitted card-sharing and visitor-flow changes.
- Changed areas: employee card contracts/controller/service/repository, public card contracts/service/repository, storage category support, miniprogram employee home, public card page, card wallet, shared card styles, visitor formatting.
- Auto-selected depth: deep. Risk drivers: PII fields on cards, authenticated visitor attribution, anonymous visitor aggregation, image/data-URL upload storage, tenant-scoped card writes.

## Summary
- Findings: P0 0, P1 0, P2 2 fixed during audit.
- No new hardcoded secret found. The secret scan only matched expected token/password variable names and test/example tokens.
- Tenant isolation remains scoped through existing employee session and tenant transaction paths; new QR persistence updates the current tenant/card only.
- Public visitor actions still require authenticated context where intended; anonymous visitors are folded in the employee-facing formatter and do not expose exchange affordances in the miniprogram UI.

## Findings

| ID | Severity | Status | Area | Evidence | Fix |
|----|----------|--------|------|----------|-----|
| QR-P2-1 | P2 | Fixed | Enterprise QR selection | Enterprise helper could prefer `wechat_qrcode_url` before `wecom_qrcode_url`, so a mixed-field card might show a personal QR for an enterprise identity. | Changed employee helper to prefer `wecom_qrcode_url` for enterprise; public page now prefers enterprise QR when the card has company profile data. |
| QR-P2-2 | P2 | Fixed | Storage materialization | The dedicated QR endpoint stored data URLs through `StorageService`, but a regular card update carrying QR data URL would have persisted the raw data URL. | Extended `materializeStorageFields` so `wechat_qrcode_url` and `wecom_qrcode_url` also materialize through the `wechat-qrcodes` storage category. |

## Verification
- `backend`: `npm.cmd run typecheck` - pass.
- `backend`: `npm.cmd test -- employee-card.repository.spec.ts public-card.controller.spec.ts personal-identity.repository.spec.ts` - pass, 23/23 tests.
- Miniprogram JS syntax: `node --check` for `pages/employee/index.js`, `pages/public/card.js`, `pages/card-wallet/index.js`, `utils/format.js` - pass.
- `git diff --check` - pass.
- Secret pattern scan with `rg` - no introduced secrets found.
- `npm.cmd audit --audit-level=high` - blocked by local npm runtime error: `Class extends value undefined is not a constructor or null`. This was recorded as an environment/tooling blocker, not an application test failure.

## Residual Notes
- Enterprise WeCom QR live retrieval is intentionally not implemented yet. The interface and persistent cache fields are ready, and the UI/backend now avoid repeat fetching once a QR URL exists.
- Offline paper-card OCR and image binding UI is scaffolded; recognition/storage backends can be connected in a follow-up when the OCR endpoint is available.
