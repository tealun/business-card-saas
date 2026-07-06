# 02_01 M1 Walking Skeleton（垂直切片）

版本：v1 · 日期：2026-07-01 · 归属：全栈
关联：主文档 §19（里程碑）、§23（验收）、§14（API 分组）、§15/§15.4（DDL）
前置：[`02_00_M0_Platform_Verification.md`](02_00_M0_Platform_Verification.md) 的 **M0-M1 gate** 完成（#1–#6）；M0-M3 gate 不阻塞本切片
后续执行：首个真实企业微信接入与企业配置后台按 [`02_02_First_Enterprise_Wecom_Admin_Plan.md`](02_02_First_Enterprise_Wecom_Admin_Plan.md) 拆解推进。

> 目标：打通一条最薄的垂直切片，尽早验证企业微信服务商模式。只写阻塞项与验收项。

## 垂直切片范围

员工从企业微信工作台打开 → `wx.qy.login` 识别 `open_userid` → 按需建档 + 默认名片 → 名片详情页 → 生成 `public_id` 公开链接 → 客户公开访问 + `visit_token` 埋点。

## 阻塞项

| # | 事项 | 依赖 | 状态 |
|---|------|------|------|
| 1 | 脚手架：NestJS(Node 24) + node-postgres(PG 17+) + Redis，独立子项目 contracts | §33 | ☑ |
| 2 | 初始建库最终形态（含 §15.4：public_card_directory、关键 FK、部分唯一索引；企业内容/样式表已并入 `database/schema.sql`；`contact_ways.channel NOT NULL` 随客户联系模块迁移） | §15/§15.4 | ◐ 单一初始化 schema 已生成 |
| 3 | `TenantTx.run` RLS 事务包装器 + 越权测试基线（§33.2 / §20.3） | A4-P1-10 | ◐ 包装器单测 + RLS 静态校验 |
| 4 | `qy-login`：jscode2session → 定位 tenant + member_identity → 按需建档 + 默认名片 | 02_00 #2/#3 | ◐ 骨架完成 |
| 5 | 员工名片读取/更新（01_02 §3.2） | | ◐ 当前读取/更新 + 分享签发完成 |
| 6 | 公开访问：public_card_directory 解析 public_id → RLS 查 cards → 隐私判定输出 | A4-P0-1 | ◐ demo 公开读取完成 |
| 7 | `visit_token` 签发与动作幂等（§14.6） | A4-P1-7 | ◐ 内存骨架完成 |
| 8 | owner bootstrap 最小闭环（§15.4） | A4-P1-5 | ◐ 模型已并入 `database/schema.sql`，服务骨架完成 |

## 当前落地记录

- 2026-07-02：提交 `befc204` 后继续落地 M1 骨架。
- 2026-07-06：小程序 UI/体验完成一轮按 `docs/design` handoff 的统一落地。已覆盖 `pages/employee/index`（我的名片首页 + 发名片弹层）、`pages/employee/edit`、`pages/employee/style`、`pages/public/card`、`pages/card-wallet/index`、`pages/company-card/index` 与旧兼容 `pages/employee/card`；统一修正页面标题、中文文案、全局 token、卡片/按钮/状态/底部操作栏样式，并补齐加载、错误、失效、空态等前端状态表达。
- 2026-07-06：小程序端当前仅负责调用 `wx.qy.login` 获取 code 并请求后端 `POST /api/v1/auth/qy-login`；真实企业微信第三方服务商授权、suite_ticket/permanent_code、`service/miniprogram/jscode2session` 换取 `open_userid`、租户/员工身份定位仍属于后端 + 平台接入线，待 `02_00_M0_Platform_Verification.md` 的 M0-M1 gate 实测完成后替换 demo repository。
- 2026-07-06：访客页已保留“加企微”动作入口和埋点占位，但真实添加企业微信依赖 M3 客户联系能力（contact_way / welcome_msg / external_userid 映射）与企业微信权限实测；M1 不把该动作计为已闭环。
- `backend/` 已具备 NestJS + Fastify + node-postgres 独立 npm 子项目，contracts 暂放 `backend/src/contracts/`。
- 已实现 `POST /api/v1/auth/qy-login` 的 demo code 登录骨架，返回员工 access token、当前身份和默认 `public_id`；真实企业微信 `jscode2session` 待 M0 实测凭据完成后替换 repository。
- 已实现 `GET /api/v1/employee/cards/current`、`PUT /api/v1/employee/cards/current` 和 `POST /api/v1/employee/cards/current/share`，可用 bearer token 读取/更新当前员工默认名片并签发 `share_id`。
- 已实现公开名片 `GET /api/v1/public/cards/{public_id}`、`POST /visit`、`POST /actions`、`POST /shares/derive` 的 demo 闭环，GET 不下发 `visit_token`，动作上报幂等，客户二次转发可用 `visit_token` 派生 `share_id`。
- 已新增 `admin/` 静态联调工作台和 `miniprogram/` 原生小程序骨架；小程序已按 `01_03 v1.2` 对齐三栏导航（我的名片 / 名片夹 / 企业名片），M1 覆盖员工首页、编辑资料、样式入口、访客详情、公开访问、visit、动作上报、派生分享，M2/M3 模块保留空状态入口。
- 已生成单一初始化建库脚本 `database/schema.sql`，覆盖 M1 core 表、owner bootstrap、企业内容/样式表、`public_card_directory`、访问/动作/分享归因字段、关键唯一索引与外键；真实 PostgreSQL apply/rollback 验证待服务器测试库接入。
- 已补 `TenantTx` 单测，验证事务内先注入 `app.tenant_id` / `app.account_id` 再执行查询；已补 `npm run rls:validate`，静态校验 RLS SQL 必须使用 `current_setting(..., true)` 且 `public_card_directory` 不启用租户 RLS。真实 A/B 租户数据库越权测试待 PostgreSQL 测试库接入。
- 已补 `tenant_admins` / `admin_claim_tokens` 表并并入 `database/schema.sql`；`tenant_admins` 纳入 RLS 静态校验。已实现 owner bootstrap 服务骨架：拿到 `open_userid` 时创建首个 owner，拿不到时生成短期一次性 claim token（只持久化 hash）。真实企业微信 OAuth 绑定入口待 M0 凭据与后台登录页接入。

## 验收标准（对齐主文档 §23）

- 员工从企业微信打开自动识别身份并看到自己的默认名片。
- 客户用公开链接访问，无登录也能看到隐私判定后的字段，动作上报带 `visit_token` 且幂等。
- GET 内容成功但 `POST /visit` 失败时，名片公开字段仍渲染；需要 `visit_token` 的动作进入短重试 / 弱提示，重试失败不阻断保存电话等本地能力，统计标记为丢失或低可信（审计 A7-P2-5）。
- 越权测试：A 企业上下文查不到 B 企业数据；无 tenant 上下文默认拒绝。
- CI 绿：迁移可回滚、越权测试、API schema 测试通过（§20.6）。

## 失败条件

- 公开访问需要给公开角色加 `BYPASSRLS` 才能跑通 → 说明 public_card_directory 流程未落地，退回修正。
