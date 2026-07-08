# 99_34 — Miniprogram Config — 2026-07-08

## Scope

- Range: `51986dd..c8312af` plus immediate verification fix in working tree
- Files: `.gitignore`, `miniprogram/app.js`, `miniprogram/utils/api.js`, `miniprogram/config.example.js`, `miniprogram/pages/employee/index.js`, `miniprogram/README.md`, `docs/README.md`, `docs/01-specs/01_06_Miniprogram_Config_Guide.md`
- Auto-selected depth: standard
- Risk score: 7
- Signals: auth/session code, public miniprogram runtime config, PII-bearing card fields, production-domain documentation, multi-tenant WeCom integration

## Summary

- P0: 0
- P1: 1
- P2: 0
- New issues: 1
- Fixed from this audit: 1

## P0 — Must Fix

None.

## P1 — Should Fix

| ID | Status | Title | File | Line | Evidence | Fix |
|----|--------|-------|------|------|----------|-----|
| MC-P1-1 | Fixed | Local config load errors were swallowed | `miniprogram/app.js` | 1 | `require("./config.local")` caught every error and silently fell back to `{}`, which would hide syntax errors as `API Base 未配置`. | Preserve non-missing config load errors in `globalData.configError`; `apiBase()` now reports `本地配置加载失败：...`. |

## P2 — Nice to Have

None.

## Verification Log

- `node --check miniprogram\app.js`
- `node --check miniprogram\utils\api.js`
- `node --check miniprogram\config.example.js`
- `node --check miniprogram\pages\employee\index.js`
- `git check-ignore -v miniprogram\config.local.js miniprogram\project.private.config.json`
- `npm.cmd test -- --runTestsByPath src/health.controller.spec.ts`
- `rg "config.example" miniprogram\app.js miniprogram\utils\api.js` returned no runtime references.
- `rg "wecomcard\.yuanyin|yuanyin\.design" miniprogram docs\01-specs\01_06_Miniprogram_Config_Guide.md` returned no committed real backend domain.

## Doc Updates Needed

- None for this audit. The config guide already documents that `config.example.js` is a template and `config.local.js` is the only local runtime config file.

## Next Steps

1. Continue with the identity architecture phase: WeChat personal account login, personal card creation, and identity switching.
