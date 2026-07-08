# Audit #09 — 2026-07-06

## Scope

- Trigger: user updated business architecture, API, database, and miniprogram experience docs.
- Files compared: `docs/01-specs/01_02_Api_Spec.md`, `docs/01-specs/01_03_Miniprogram_Guide.md`, `docs/00-core/00_02_Database_Schema.md`, `docs/design/miniprogram-card-experience-brief.md`, backend contracts/controllers/repositories, `admin/`, `miniprogram/`.
- Depth: focused deep alignment review.

## Findings And Fixes

| ID | Doc Fact | Previous Code State | Alignment Done |
|----|----------|---------------------|----------------|
| A9-1 | Public card GET returns a content package with `card`, `template`, `company_profile`, `videos`, `honors`; GET still does not return `visit_token`. | Backend returned a flat card shape. | Updated `publicCardResponseSchema`, demo public repository, tests, admin/miniprogram consumers. |
| A9-2 | Employee APIs include `GET /employee/cards/current/preview` and `PUT /employee/cards/current/style`. | Missing. | Added controller/service/repository support and API tests. |
| A9-3 | Miniprogram IA uses three tabs: 首页 / 名片夹 / 企业名片. | Only two pages existed: employee card and public card. | Added tabBar and pages: `employee/index`, `employee/edit`, `employee/style`, `card-wallet/index`, `company-card/index`; kept old `employee/card` as compatibility page. |
| A9-4 | Visitor detail page includes employee card, contact actions, company intro, video, honors carousel, and content actions. | Public page only showed basic contact fields. | Updated `pages/public/card` to render content package and action types: `expand_company_intro`, `play_company_video`, `view_honor_image`. |
| A9-5 | Employee share path must use `public_id + share_id` and current miniprogram route. | Backend still returned old `/pages/card/detail`. | Updated share path to `/pages/public/card?card=...&share=...` and added test coverage. |
| A9-6 | Action enum includes content-detail actions. | Backend contract only allowed contact actions. | Extended `actionRequestSchema`; database field is varchar so no migration required for enum expansion. |

## Deferred By Stage

- M2 database tables in `00_02` (`company_profiles`, `company_videos`, `company_honors`, `company_honor_images`, `card_style_overrides`) are already folded into the single `database/schema.sql` initialization script. Current code still returns demo content from in-memory repositories until server PostgreSQL persistence is wired.
- M2/M3 full admin content management APIs in `01_02 §3.6` are not implemented yet. The miniprogram exposes entry points and placeholders; Web admin still has a static workbench for M1联调.
- Real WeCom login and tenant content persistence remain blocked on M0-M1 gate credentials and server PostgreSQL integration.

## Verification

- `npm run typecheck`
- `npm test`
- `node --check` for admin and miniprogram JS files
