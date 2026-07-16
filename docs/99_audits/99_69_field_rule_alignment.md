# 99_69 - Field Rule Alignment - 2026-07-16

## Scope
- Range: `b2f4279..beaf0a4`
- Files: admin config contract/repository/test and employee card repository field-rule parser.
- Baseline: `main@beaf0a4d98e524343b7b06f5cc17e1c05b1ba3fb`; worktree clean at audit start.
- Auto-selected depth: Deep.
- Risk score: 11. Signals: admin config surface, employee PII fields, tenant settings, database writes, request validation.

## System Goal & Critical Paths
- Goal / protected properties: Admin field settings, backend employee field enforcement, and miniprogram editable fields must describe the same business fields.
- Path: Admin field settings -> Zod enum -> `tenant_field_settings.fields_json` -> employee `editable_fields`. Health: Healthy.
- Path: Existing persisted partial field settings -> normalized defaults -> employee edit permissions. Health: Healthy.
- Path: Employee update request -> `requestedEditableFields()` -> merged editable rules -> 403 on denied fields. Health: Healthy.

## Confirmed Strengths
- Admin field enum now includes company, short name, department, website, and both QR fields, matching backend employee field enforcement.
- Persisted legacy field settings are merged with default rules, so newly introduced fields do not become accidentally locked.
- Employee-side parsing also merges persisted overrides onto defaults, preserving backward compatibility for tenants with old `tenant_field_settings` rows.

## Verification Gaps
- No live database migration was run in this audit phase; behavior was verified through unit tests and static inspection.

## Findings

### P0 - Must Fix
| ID | Type | Confidence | Status | Title | Path/Dimension | File | Line | Evidence | Fix |
|----|------|------------|--------|-------|----------------|------|------|----------|-----|
| None | N/A | High | Fixed | No P0 findings | All | N/A | N/A | No data exposure or bypass path found. | N/A |

### P1 - Should Fix Soon
| ID | Type | Confidence | Status | Title | Path/Dimension | File | Line | Evidence | Fix |
|----|------|------------|--------|-------|----------------|------|------|----------|-----|
| None | N/A | High | Fixed | No P1 findings | All | N/A | N/A | Legacy compatibility and admin/backend field alignment were verified. | N/A |

### P2 - Nice to Have
| ID | Type | Confidence | Status | Title | Path/Dimension | File | Line | Evidence | Fix |
|----|------|------------|--------|-------|----------------|------|------|----------|-----|
| None | N/A | High | Fixed | No P2 findings | All | N/A | N/A | No minor issue requiring code change was accepted. | N/A |

## Evidence Log
- Rejected candidate: old tenant settings rows lock new fields by omission. Reason: both `normalizeFieldRules()` and `parseEditableFields()` overlay persisted rules onto the default complete field list.
- Rejected candidate: admin can save invalid field keys. Reason: `adminFieldRuleSchema` validates keys through `adminFieldKeySchema`.
- Rejected candidate: employee API allows hidden company/department/website changes. Reason: `requestedEditableFields()` includes those fields and checks them against merged editable rules.

## 12-Dimension Coverage
- 1 Architecture: Healthy; field rule normalization stays in admin repository and employee parser.
- 2 Platform Integration: N/A; no external WeCom calls changed.
- 3 Security: Healthy; server-side editable field enforcement remains intact.
- 4 Code Efficiency: Healthy; normalization is small in-memory map work.
- 5 Runtime Smoothness: Healthy; no new network or database loops.
- 6 Info Isolation: Healthy; tenant field settings remain tenant-scoped.
- 7 Data Accuracy: Healthy; field rule list now matches actual editable employee fields.
- 8 Parameter Passing: Healthy; invalid or duplicate field keys are rejected by contract validation.
- 9 UX: Healthy; admin field table now includes the fields employees actually see.
- 10 Coding Standards: Healthy; typecheck/lint/build passed.
- 11 Testing: Healthy; admin-config and employee-card tests cover the changed behavior.
- 12 Deploy & Ops: N/A for this code-only phase.

## Verification Commands
- `npm.cmd test -- --runTestsByPath src/admin-config/admin-config.service.spec.ts src/employee/employee-card.repository.spec.ts src/contracts/admin-config.spec.ts` -> passed, 29 tests.
- `npm.cmd run typecheck` in `backend/` -> passed.
- `npm.cmd run lint` in `backend/` -> passed.
- `npm.cmd run build` in `backend/` -> passed.

## Doc Updates Needed
- None beyond this audit report.
