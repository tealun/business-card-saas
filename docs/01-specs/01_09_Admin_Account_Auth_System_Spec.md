# 01_09 管理后台账号登录系统规格

版本: v2 · 日期: 2026-07-17 · 归属: admin/auth
关联: `01_08_Admin_Backoffice_Architecture_Guide.md`（双身份域基线）、`01_04_Admin_Web_Guide.md`、`02_02_First_Enterprise_Wecom_Admin_Plan.md`、`02_04_Admin_Account_Auth_Gates.md`、`99_72_admin_account_auth_readiness.md`

> v2 变更（M0 取证修订）：扫码链路从旧 `3rd_qrConnect` + `get_login_info` 更正为**新版企业微信登录组件** + `getuserinfo3rd`；`get_admin_list` 采用第三方应用服务商接口（`suite_access_token` + `auth_corpid` + `agentid`）调用。证据见 02_04 M0 表。

## 1. 背景与目标

企业已安装第三方应用，但管理后台对企业侧无可用登录入口；平台侧缺账号管理能力。本规格在既有双身份域（`account_type = platform / tenant`）之上补齐两条链路：

- G1 **企业管理员扫码登录**：企业微信扫码 → 实时鉴权"该企业管理员" → 自动建档 → 直接进入企业后台（`account_type=tenant`）。
- G2 **平台账号管理**：owner 用户名密码登录（已有）→ 创建 / 禁用 / 配置角色 / 删除平台管理员。
- G3 同一后台、双登录入口、单会话体系，Guard 强制 scope 隔离。

## 2. 范围与非目标

**范围（M1）**：扫码登录全链路、企业管理员自动建档、平台账号 CRUD + 角色配置、登录/管理操作审计、隔离回归。

**非目标（M2+，见 02_04 Deferred）**：多企业切换页、企微管理员周期对账、MFA、会话撤销、细粒度能力点覆盖、企业侧纯密码登录（`01_04` 已明确第一版不做）、React 目标架构迁移。

## 3. 角色与身份域

| 身份域 | 角色 | 来源 |
|---|---|---|
| platform | `platform_owner`（内建，不可删/禁）、`ops`、`support`、`finance`、`engineer`、`auditor` | 沿用 `01_08` 角色矩阵；M1 仅开放 owner 可指派 `ops` / `support`，其余角色随能力点落地逐步开放 |
| tenant | `owner` / `admin` / `operator` / `auditor` | 沿用现有 `tenant_admins.role` |

关键决策：
- 企业管理员身份的唯一信任源 = 企微实时管理员状态（`get_admin_list`），每次扫码实时核验。
- 本地 `tenant_admins` = 档案缓存 + 本地管控；`status=disabled` 优先于企微侧身份（本地最终否决权）。
- 企微侧是管理员但本地无档案 → 自动建档（tenant 内无 active owner 的首位管理员建档为 `owner`，其后为 `admin`）。

## 4. 登录链路

### 4.1 平台账号（已有能力 + 补齐管理端点）

已有：`POST /admin/auth/login`（scrypt + 限流 15min/5 次）、`PUT /admin/auth/password`、`GET /admin/session/me`、账号列表 + 启停（仅 owner，禁止停自己）。

M1 补齐（均仅 `platform_owner`，全部落审计）：
- `POST /api/v1/admin/platform/accounts` — 创建 `{username, password, role}`；用户名唯一、密码复杂度校验、scrypt 哈希。
- `PATCH /api/v1/admin/platform/accounts/:id/role` — 配置角色（M1 限定 `ops` / `support`）。
- `DELETE /api/v1/admin/platform/accounts/:id` — 硬删除；禁止删除自己与内建 owner。

### 4.2 企业管理员扫码登录（新建，核心链路）

> 链路选型（M0 取证结论）：采用**新版企业微信登录**——官方文档 98170《单点登录》明确"新版企业微信登录是对原扫码登录的能力升级"，旧 `3rd_qrConnect` + `get_login_info`（provider_access_token）为旧链路，不采用。授权码经 `getuserinfo3rd`（官方 91121，`suite_access_token`）换取身份；管理员判定经服务商 `get_admin_list`（官方 100073，`suite_access_token` + `auth_corpid` + `agentid`）。

**前置配置（运维项，证据要求见 02_04 M0-4）**：
1. 服务商后台开启「登录授权」（网页授权登录）并配置品牌名称（官方 98170）。
2. 回调域名必须与第三方应用「可信域名」完全一致，否则企微返回 50001（官方 91121）。
3. 新增环境变量 `WECOM_ADMIN_LOGIN_REDIRECT_URI`（扫码登录回调地址）。

**时序**：

1. 登录页「企业管理员」Tab → 前端请求 `GET /api/v1/admin/auth/wecom/login-config` → 后端生成一次性 state（随机串，库中只存 SHA-256；TTL 10 分钟；绑定 client_ip/user_agent）→ 返回企业微信登录组件初始化参数（appid = 服务商 CorpID，即 `WECOM_PROVIDER_CORP_ID`；redirect_uri；state；组件其余参数以官方 98170 子页面为准）。
2. 前端内嵌企业微信登录组件（或新窗口登录页）→ 用户用企业微信扫码 / 桌面端确认授权。
3. 企微回跳 `GET /api/v1/admin/auth/wecom/scan-callback?code=...&state=...`（授权码参数名为 `code`，98170）：校验 state（存在、未过期、未使用 → 立即标记 `used_at`）。
4. `getuserinfo3rd(suite_access_token, code)` → `{corpid, userid, open_userid}`（官方 91121；`user_ticket` 仅 snsapi_privateinfo 场景返回，本链路不依赖；响应字段大小写差异以部署联调真实回调为准）。
5. 以 `corpid` 查 `tenants`（`open_corpid` 匹配且 `auth_status` 为已授权）→ 未安装 / 已取消授权 → 拒绝并提示"企业未安装或已取消授权，请先完成安装"。
6. 服务商 `get_admin_list`（`POST /cgi-bin/service/get_admin_list?suite_access_token=...`，请求体 `{auth_corpid, agentid}`；`agentid` 来自企业授权保存的应用 id）→ `admin:[{userid/open_userid, auth_type}]`（官方 100073）：
   - 扫码人 `userid` 命中且 `auth_type=1`（管理权限）→ 通过；
   - 命中但 `auth_type=0`（仅发消息权限）→ 拒绝"无管理权限"；
   - 未命中 → 拒绝"你不是该企业的企业微信管理员"；
   - **成员授权模式**下企微不返回管理员列表（100073 注）：列表为空时结合 `tenants.auth_scope_json` 判定授权模式，返回"无法确认管理员身份"并告警，降级引导走 claim-token 认领通道。
7. 命中 → upsert `tenant_admins`（角色规则见 §3）+ 最小化 `member_identities` 建档 → 更新 `last_login_at` / `auth_source='wecom_scan'` → 发放 `account_type=tenant` 会话（复用 `admin-session-token`，8h）。
8. 本地档案 `status=disabled` → 拒绝（本地管控优先）。

**异常处理**：state 过期/复用 → 400；企微 API 调用失败 → 502 + 复用 `WECOM_CALLBACK_ALERT_WEBHOOK_URL` 告警；`code` 已消费/过期（40029）→ 400 提示重新扫码。

**前端注意**：内嵌登录组件需加载企微官方 JS（wwcdn 域），静态后台的 CSP 白名单需同步放行（M1 前端项）。

### 4.3 会话与安全

- 会话：复用现有 `admin-session-token`（HMAC-SHA256，8h，`ADMIN_JWT_SECRET`）；载荷含 `account_type` + `tenant_id`（tenant 侧）；`AdminAuthGuard` 按端点身份域强制校验。
- 扫码两个公开端点限流（throttler，建议 IP 15 分钟 10 次）；回调仅 GET；日志不落 `code` / `user_ticket` / state 原文。
- 全部登录成功/失败、平台账号管理操作 → `admin_operation_logs`。
- 存量 `POST /admin/auth/qy-login`（手动 jscode 联调通道）保留至 M2，规格上标注"降级/联调通道，扫码链路稳定后退役"。

## 5. 数据变更（→ `database/migrations/migrate_v1_14.sql`）

- `platform_admins`：`role` 枚举扩展为 `01_08` 矩阵，存量 `'owner'` 归一为 `'platform_owner'`；新增 `created_by`。
- `tenant_admins`：新增 `last_login_at`、`auth_source`（存量归一为 `'claim_token'`）。
- 新表 `admin_auth_states`：一次性扫码 state（平台级表，不入租户 RLS，与 `admin_claim_tokens` 同级）。

## 6. API 契约（含鉴权边界）

| 路由 | 方法 | 身份域 | 角色要求 | 状态 |
|---|---|---|---|---|
| `/api/v1/admin/auth/login` | POST | platform | 公开 + 限流 | 已有 |
| `/api/v1/admin/auth/password` | PUT | platform | 登录本人 | 已有 |
| `/api/v1/admin/session/me` | GET | 双域 | 登录 | 已有 |
| `/api/v1/admin/platform/accounts` | GET | platform | `platform_owner` | 已有 |
| `/api/v1/admin/platform/accounts/:id` | PATCH | platform | `platform_owner` | 已有（启停），M1 扩展 role |
| `/api/v1/admin/platform/accounts` | POST | platform | `platform_owner` | **新增 M1** |
| `/api/v1/admin/platform/accounts/:id` | DELETE | platform | `platform_owner` | **新增 M1** |
| `/api/v1/admin/auth/wecom/login-config` | GET | tenant | 公开 + 限流 | **新增 M1**：返回登录组件初始化参数 + 一次性 state |
| `/api/v1/admin/auth/wecom/scan-callback` | GET | tenant | 公开（state 校验） | **新增 M1**：回调鉴权 + 发会话 |
| `/api/v1/admin/auth/qy-login` | POST | tenant | 公开 + 限流 | 保留为联调/降级通道，M2 退役 |

## 7. 验收标准（可观测）

- AC1 企业管理员扫码 → 进入后台首页，`session/me` 返回 `account_type=tenant` 且 tenant 正确。
- AC2 非管理员扫码 → 403 中文提示，不建档、不发会话。
- AC3 本地 `disabled` 管理员扫码 → 拒绝。
- AC4 未安装/已取消授权企业 → 拒绝并提示先安装。
- AC5 owner 创建 `ops` 账号 → 可登录，菜单/能力符合 `01_08` 矩阵。
- AC6 owner 禁用/删除账号立即生效（存量会话行为以 M1-S7 决策为准）。
- AC7 上述全部事件落 `admin_operation_logs`。
- AC8 tenant 会话访问 platform 端点 → 403，反之亦然。

## 8. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 企微管理员撤销无回调，本地档案滞留 | 每次登录实时 `get_admin_list` + M2 周期对账任务 |
| 同一用户是多个已安装企业的管理员 | M1 以企微返回的 `corpid` 为准单企业登录；M2 企业选择页 |
| 成员授权模式下企微不返回管理员列表（100073 注） | 登录时检测空列表 + `auth_scope_json` 判定，明确报错并降级 claim-token 通道 |
| 响应字段大小写/ID 策略（明文/密文 userid）差异 | 两端同 corp 同应用取值一致，按 `userid` 匹配；部署联调实证回填 02_04 |
| 误删平台账号 | 禁止删自己/内建 owner + 审计 + 前端二次确认 |
| 敏感凭据泄露 | 复用现有 `permanent_code` / token AES-GCM 加密设施；日志脱敏 |
