# 管理后台重构后端架构开发指南

状态：重构基线  
制定日期：2026-07-16  
适用范围：系统管理员后台、企业管理员后台、企业授权管理、付费版本与额度控制、后台全部管理能力  
关联文档：

- [`01_04_Admin_Web_Guide.md`](01_04_Admin_Web_Guide.md)
- [`01_07_Commercialization_And_Quota_Spec.md`](01_07_Commercialization_And_Quota_Spec.md)
- [`../00-core/00_02_Database_Schema.md`](../00-core/00_02_Database_Schema.md)
- [`../design/admin-backoffice-ui-architecture.md`](../design/admin-backoffice-ui-architecture.md)

## 1. 重构目标

管理后台重构的目标不是把现有静态页面简单美化，而是把后台升级为可长期运营的 SaaS 控制台。目标状态如下：

1. 系统管理员和企业管理员身份彻底分离，登录方式、可见导航、数据范围、操作权限和审计规则均不同。
2. 企业授权、成员同步、企业资料、名片、模板、字段、视频功能、数据库迁移、商业化订单和额度控制统一进入后台能力矩阵。
3. 后端接口以领域模块暴露能力，前端不拼业务规则，不传 `tenant_id` 越权访问，不直接改账。
4. 所有写操作具备角色校验、租户边界、幂等能力、操作审计和必要的速率限制。
5. 付费版本控制以服务端能力判断为准，公开名片展示先准入再返回数据，避免额度不足时泄露完整名片。

## 2. 当前实现基线

当前仓库已经具备以下基础：

| 能力 | 当前模块 | 现状 |
|---|---|---|
| Admin token 会话 | `backend/src/admin-auth/` | 已有签名 token、`AdminAuthGuard`、`account_type`、`role` |
| 企业管理员 RBAC | `admin-rbac.ts` | 已有 `owner/admin/operator/auditor` 等级校验 |
| 平台管理员账号 | `platform_admins` | 已有密码登录数据表和平台账号类型 |
| 企业成员管理 | `admin-management/` | 已有概览、成员列表、成员同步、名片读写、同步事件重试 |
| 企业配置管理 | `admin-config/` | 已有字段、企业资料、荣誉、模板管理 |
| 企业授权只读面板 | `platform-tenants/` | 已有平台侧授权企业列表和详情 |
| 视频功能开关 | `company-video-feature/` | 已有平台默认和企业级 override |
| 数据库迁移入口 | `admin-database/` | 已有 owner 级迁移状态和执行入口 |
| 商业化规格 | `01_07_Commercialization_And_Quota_Spec.md` | 已定义套餐、订单、额度、扣量、通知模型 |

主要缺口：

1. 系统管理员内部角色仍复用 `AdminRole`，缺少专用平台角色与权限矩阵。
2. 后台接口路径同时存在 `/admin/platform/*` 和租户 `/admin/*`，需要形成清晰网关和菜单分组。
3. 商业化模块尚未落地，付费版本、额度、订单和通知还只是规格。
4. 审计日志、敏感操作确认、强权限动作的二次校验需要统一中间层。
5. 现有静态后台偏联调工具，后续应迁移到组件化前端并保留联调面板为 dev-only。

## 3. 身份与权限模型

### 3.1 身份域

后台必须分成两个身份域：

| 身份域 | 登录入口 | 会话字段 | 数据范围 | 典型用户 |
|---|---|---|---|---|
| 企业管理员 | 企业微信 OAuth/扫码、首个 owner 认领 | `account_type=tenant` | 当前企业 `tenant_id` | 企业 owner、运营、审计人员 |
| 系统管理员 | 独立账号密码，后续强制 MFA | `account_type=platform` | 平台级资源，默认脱敏跨租户读取 | 平台超级管理员、运营、客服、技术、财务 |

后端不得只通过角色名判断权限，必须同时判断身份域：

```ts
if (session.accountType !== "platform") {
  throw new ForbiddenException("platform administrator required");
}
```

企业管理员任何请求都不得接受前端传入的 `tenant_id` 作为权限依据。系统管理员跨企业读取必须由平台服务显式执行，且返回脱敏字段。

### 3.2 企业管理员角色

企业管理员沿用 `tenant_admins.role`：

| 角色 | 权限定位 | 可写能力 | 禁止能力 |
|---|---|---|---|
| owner | 企业最高管理员 | 管理员、企业配置、成员、名片、模板、字段、商业化查看 | 修改平台套餐、人工加额度、查看其他企业 |
| admin | 企业配置管理员 | 成员同步、名片、企业资料、字段、模板、荣誉 | 管理 owner、平台功能开关、账务调整 |
| operator | 日常运营 | 成员名片状态、基础资料维护 | 字段规则、模板默认、商业订单 |
| auditor | 只读审计 | 无 | 所有写操作 |

现有 `requireAdminRole(session.role, "admin")` 模式可以保留，但应扩展成能力点校验，避免未来角色等级无法表达横向权限。

建议新增：

```text
backend/src/admin-auth/
  admin-permission.ts
  admin-permission.decorator.ts
  admin-permission.guard.ts
```

能力点示例：

| 能力点 | owner | admin | operator | auditor |
|---|---:|---:|---:|---:|
| `tenant.overview.read` | Y | Y | Y | Y |
| `tenant.member.sync` | Y | Y | N | N |
| `tenant.member.card.write` | Y | Y | Y | N |
| `tenant.config.write` | Y | Y | N | N |
| `tenant.admin.write` | Y | N | N | N |
| `tenant.commercial.read` | Y | Y | N | Y |
| `tenant.audit.read` | Y | Y | N | Y |

### 3.3 系统管理员角色

系统管理员不得简单复用企业管理员语义。建议平台角色如下：

| 角色 | 权限定位 | 关键能力 |
|---|---|---|
| `platform_owner` | 平台最高权限 | 账号管理、全局配置、套餐映射、功能开关、迁移审批 |
| `platform_ops` | 运营管理 | 企业授权、功能开关、通知重放、试点企业处理 |
| `platform_support` | 客服支持 | 企业和订单只读、问题排查、通知状态查看 |
| `platform_finance` | 商业化与账务 | 订单、订阅、额度账本、退款待处理 |
| `platform_engineer` | 技术运维 | 回调、同步、数据库迁移、系统健康、告警 |
| `platform_auditor` | 只读审计 | 全局只读、审计日志 |

平台能力点示例：

| 能力点 | owner | ops | support | finance | engineer | auditor |
|---|---:|---:|---:|---:|---:|---:|
| `platform.tenant.read` | Y | Y | Y | Y | Y | Y |
| `platform.tenant.authorization.read` | Y | Y | Y | N | Y | Y |
| `platform.feature.write` | Y | Y | N | N | N | N |
| `platform.commercial.plan.write` | Y | N | N | Y | N | N |
| `platform.commercial.adjust_quota` | Y | N | N | Y | N | N |
| `platform.database.migrate` | Y | N | N | N | Y | N |
| `platform.audit.read` | Y | Y | Y | Y | Y | Y |

平台角色迁移契约：

1. 过渡期仍允许 `platform_admins.role` 使用现有 `owner/admin/operator/auditor` 枚举，先通过 `account_type=platform` + 等级角色派生能力点，避免破坏当前 token 和 contract。
2. 当需要 `platform_ops/platform_support/platform_finance/platform_engineer/platform_auditor` 细分角色时，必须先新增独立 `platform_role` contract 和迁移脚本，再更新 `AdminSession`、`session/me`、前端菜单和权限测试。
3. 不得把 `platform_*` 字符串直接塞入现有 `AdminRole`，否则会破坏 `adminRoleSchema` 和企业管理员角色校验。

强权限操作必须额外要求：

1. 操作原因 `reason`。
2. 幂等键 `idempotency_key`。
3. before/after hash 审计。
4. 可选二次确认或 MFA step-up，优先用于迁移、额度调整、套餐映射变更。

## 4. 后端模块分层

推荐目标结构：

```text
backend/src/
  admin-auth/               # 身份、会话、权限、审计上下文
  admin-audit/              # 操作日志、审计查询、before/after hash
  admin-platform/           # 系统管理员聚合入口和平台 Dashboard
  admin-tenant/             # 企业管理员聚合入口和企业 Dashboard
  platform-tenants/         # 企业授权、授权健康、企业检索
  admin-management/         # 成员、名片、同步事件
  admin-config/             # 字段、模板、企业资料、荣誉
  company-video-feature/    # 平台/企业功能开关
  commercialization/        # 套餐、订单、订阅、额度、通知
  public-card/              # 公开名片展示，调用 display-access
  wecom/                    # 企微通用授权、回调、token、加解密
```

边界规则：

1. `wecom/` 只处理企微协议层，不写商业权益。
2. `commercialization/` 是付费版本和额度的唯一事实源。
3. `public-card/` 不判断套餐，不直接扣量，只调用 `DisplayAccessService`。
4. `admin-*` 不直接改额度账本，通过商业化服务发起受审计命令。
5. `platform-tenants/` 只读授权和健康信息，除非明确新增平台运维命令。

## 5. 管理后台 API 架构

### 5.1 路径规范

当前已有 `/api/v1/admin/*`。重构后建议保持兼容，并形成两类逻辑命名：

| 路径前缀 | 身份域 | 示例 |
|---|---|---|
| `/api/v1/admin/tenant/*` | 企业管理员 | `/admin/tenant/dashboard`、`/admin/tenant/members` |
| `/api/v1/admin/platform/*` | 系统管理员 | `/admin/platform/tenants`、`/admin/platform/commercial/orders` |
| `/api/v1/admin/session/*` | 两者共用 | `/admin/session/me` |

为降低一次性迁移风险，现有接口可以先保留：

- `/admin/overview`
- `/admin/members`
- `/admin/settings/fields`
- `/admin/company-profile`
- `/admin/templates`
- `/admin/platform/tenants`

新增前端应通过 API client 做路径适配，避免页面散落旧路径。

### 5.2 响应契约

所有后台接口遵循：

1. 输入使用 zod schema 校验。
2. 输出使用 contract schema parse。
3. 分页统一返回 `items/page/page_size/total`。
4. 权限错误返回稳定错误码，不让前端解析英文异常。
5. 敏感字段默认脱敏，只有强授权详情页可按需显示掩码后的末尾信息。

### 5.3 审计中间层

新增 `AdminAuditService.record()`，所有写操作统一记录：

| 字段 | 说明 |
|---|---|
| `actor_account_type` | `tenant` 或 `platform` |
| `actor_id` | 管理员 id 或 open_userid |
| `actor_role` | 当前角色 |
| `tenant_id` | 企业操作必填，平台全局操作可空 |
| `action` | 稳定动作码，如 `tenant.member.sync` |
| `target_type` / `target_id` | 操作目标 |
| `reason` | 强权限操作必填 |
| `before_hash` / `after_hash` | 敏感详情不入日志，只存 hash |
| `request_id` | 链路追踪 |
| `created_at` | 操作时间 |

禁止在审计详情里存明文 token、永久授权码、手机号、邮箱、二维码、完整订单回调载荷。

## 6. 企业授权管理

系统管理员侧企业授权中心应覆盖：

| 功能 | 后端来源 | 权限 |
|---|---|---|
| 企业列表 | `platform-tenants.list` | `platform.tenant.read` |
| 授权详情 | `platform-tenants.get` | `platform.tenant.authorization.read` |
| 授权健康 | `auth_status`、permanent code、corp token、last callback | 只读 |
| 成员/名片规模 | 当前企业汇总 | 只读 |
| 最近回调 | `wecom_callback_events` | 脱敏只读 |
| 同步任务状态 | `admin-management` sync events | 平台运维可读 |

不得提供：

1. 永久授权码、suite token、corp token 明文查看。
2. 前端直接修改 `auth_status`。
3. 删除企业授权历史。

允许后续新增的受控动作：

| 动作 | 约束 |
|---|---|
| 重新拉取企业 token | 仅 engineer/owner，需限流和审计 |
| 重新同步通讯录 | ops/engineer，按企业限流 |
| 标记授权异常已处理 | ops/engineer，需原因 |

## 7. 付费版本与额度控制

商业化模块以 [`01_07_Commercialization_And_Quota_Spec.md`](01_07_Commercialization_And_Quota_Spec.md) 为业务事实源。后台重构需要把它拆成三组能力。

### 7.1 企业管理员可见

| 页面能力 | 数据 | 权限 |
|---|---|---|
| 当前版本 | plan、subscription、有效期、状态 | `tenant.commercial.read` |
| 额度摘要 | 总额度、已用、剩余、使用率 | `tenant.commercial.read` |
| 使用趋势 | 近 7/30 天按日统计 | `tenant.commercial.read` |
| 成员/名片用量排行 | 聚合后的展示次数 | `tenant.commercial.read` |
| 订单列表 | 本企业订单，不含加密载荷 | `tenant.commercial.read` |
| 购买入口 | 企业微信版本购买链接 | owner/admin |

企业管理员不得修改额度、订单金额、套餐映射。

### 7.2 系统管理员可见

| 页面能力 | 权限 |
|---|---|
| 套餐目录 | `platform.commercial.plan.read` |
| 企业微信版本 ID 映射 | `platform.commercial.plan.write` |
| 全局订单查询 | `platform.commercial.order.read` |
| 异常订单队列 | `platform.commercial.order.review` |
| 额度账本查询 | `platform.commercial.ledger.read` |
| 人工额度调整 | `platform.commercial.adjust_quota` |
| 通知失败重放 | `platform.commercial.notification.replay` |

人工额度调整必须写不可变账本，不允许直接 `UPDATE quota_grants.remaining_units` 后不留流水。

### 7.3 展示准入主链路

目标链路：

```text
public card request
  -> PublicCardController
  -> DisplayAccessService.evaluateAndReserve()
  -> transaction locks dedupe state and quota grants
  -> card payload is returned only after access is granted
```

重要约束：

1. 未授权访客不能通过旧接口绕过扣量拿到完整名片。
2. 可信预览必须由员工/管理员认证会话决定，客户端不能声明免扣量。
3. 同一访客 30 分钟内重复打开同一张名片只记一次。
4. 扣量和访问记录必须在同一事务内完成。

## 8. 功能架构清单

### 8.1 系统管理员后台

| 一级模块 | 二级功能 | 优先级 |
|---|---|---|
| 平台总览 | 企业数、授权健康、订单异常、额度风险、回调状态 | P0 |
| 企业管理 | 企业列表、授权详情、同步状态、功能开关、只读企业画像 | P0 |
| 授权与回调 | suite ticket、授权回调、数据回调、失败重试、死信 | P0 |
| 商业化 | 套餐、版本映射、订单、订阅、额度账本、人工调整 | P0/P1 |
| 功能开关 | 平台默认、企业 override、视频能力、未来模块能力 | P1 |
| 运维 | 数据库迁移、健康检查、日志入口、指标和告警 | P1 |
| 审计 | 平台操作日志、企业管理员操作日志查询 | P1 |
| 系统账号 | 平台账号、角色、MFA、禁用 | P2 |

### 8.2 企业管理员后台

| 一级模块 | 二级功能 | 优先级 |
|---|---|---|
| 企业总览 | 成员、名片、访问、商业化摘要、待办 | P0 |
| 成员与名片 | 成员列表、同步、状态、名片编辑、分享码 | P0 |
| 企业主页 | 企业资料、服务、介绍、荣誉、视频模块 | P0 |
| 字段与模板 | 字段显示规则、模板列表、默认模板、品牌色 | P0 |
| 数据分析 | 访问趋势、成员排行、互动转化 | P1 |
| 版本与额度 | 当前版本、额度、订单、用量、购买入口 | P0/P1 |
| 管理员 | 管理员列表、角色调整、owner 认领 | P1 |
| 审计日志 | 本企业操作日志 | P1 |

## 9. 数据库与迁移建议

### 9.1 短期新增

1. 沿用并扩展既有 `audit_logs`，不要另建并行的 `admin_audit_logs`
2. `platform_admin_mfa_factors`
3. `platform_admin_sessions` 或 Redis 会话索引
4. 商业化规格中定义的 `commercial_plans`、`wecom_plan_mappings`、`tenant_subscriptions`、`billing_orders`、`quota_grants`、`quota_ledger`、`display_dedupe_states`、`notification_outbox`、`notification_deliveries`

### 9.2 RLS 要求

1. 企业级业务表默认启用 RLS。
2. 企业管理员请求必须在事务内设置 `app.tenant_id`。
3. 平台查询不得关闭权限判断，应通过平台专用 repository 执行脱敏聚合。
4. 平台全局表如 `commercial_plans` 不含个人信息，可不绑定租户。

### 9.3 迁移入口

现有 `/admin/database/migrations/run` 属于高风险动作。重构后要求：

1. 仅 `platform_owner` 或 `platform_engineer` 可见。
2. 生产环境必须二次确认并填写原因。
3. 执行前展示 pending migrations 和数据库目录。
4. 执行结果写审计。

## 10. 开发里程碑

### M1：权限和后台壳

1. 拆分平台角色与企业角色。
2. 新增能力点权限层。
3. 统一后台 API client 和 session/me 返回可见菜单。
4. 搭建新版后台导航壳，保留旧静态页面为 dev-only 或 legacy。

验收：

- 平台账号看不到企业后台写操作入口。
- 企业账号看不到平台企业授权、功能开关、数据库迁移。
- auditor 无法执行写操作。

### M2：企业管理后台产品化

1. 企业总览、成员名片、企业主页、字段模板迁移到新版界面。
2. 所有写操作接入审计。
3. 企业管理员列表和 owner 认领闭环。

验收：

- 企业 owner/admin/operator/auditor 权限矩阵通过单元测试。
- 企业管理员无法跨租户查询数据。

### M3：系统管理后台产品化

1. 企业授权中心升级。
2. 功能开关中心升级。
3. 回调和同步事件运维台。
4. 数据库迁移和健康检查仅平台可见。

验收：

- 平台详情默认脱敏。
- 强操作都有原因、幂等键和审计。

### M4：商业化闭环

1. 套餐和版本映射。
2. 订单回调状态机。
3. 订阅和额度账本。
4. 公开展示准入与扣量。
5. 企业版本与额度页面。
6. 平台异常订单和额度调整页面。

验收：

- 额度不足时公开访客拿不到完整名片。
- 重复回调不重复入账。
- 人工调整不直接改历史账本。
- 企业管理员只能查看本企业商业化数据。

## 11. 测试策略

必须新增的测试类型：

| 类型 | 覆盖 |
|---|---|
| 单元测试 | 权限矩阵、能力点 guard、商业化状态机 |
| Repository 测试 | RLS、跨租户隔离、平台脱敏查询 |
| 幂等测试 | 订单回调、额度调整、通知 outbox |
| 并发测试 | 展示扣量、去重状态、额度不为负 |
| e2e 代理测试 | session/me、菜单可见性、关键写操作 403 |

最小验证命令：

```powershell
cd backend
npm run typecheck
npm test
npm run lint
```

商业化落地后补充数据库验证：

```powershell
cd database
npm run rls:validate
npm run verify
```

`database` 的 `verify` 会重建目标库，只允许本地或明确授权的测试库执行。

## 12. 安全红线

1. 不在前端存储或展示永久授权码、suite token、corp token、订单加密载荷。
2. 不通过前端传入 `tenant_id` 决定企业管理员数据范围。
3. 不在额度不足时先返回完整名片再报错。
4. 不直接删除账务、订单、额度流水。
5. 不在生产环境启用 demo 登录。
6. 不让企业管理员看到其他企业名称、订单、成员或授权信息。
7. 不把手机号、邮箱、二维码、token 写入日志或审计详情。

## 13. 后续实施检查表

- [ ] 平台角色类型从企业 `AdminRole` 中拆出或增加明确映射层。
- [ ] session/me 返回 `account_type`、role、permissions、menu scopes。
- [ ] 所有后台写接口接入能力点权限和审计。
- [ ] 新增商业化模块和迁移。
- [ ] 公开名片接口改为展示准入优先。
- [ ] 新版后台 UI 按双身份信息架构实现。
- [ ] 旧联调工具面板标记 dev-only，不暴露给生产普通用户。
- [ ] 文档同步 `01_02_Api_Spec.md`、数据库文档和部署说明。
