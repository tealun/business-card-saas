# Audit #04 — v0.4.5 实施就绪深度审计

日期：2026-07-01  
审计对象：`docs/` 重构后的 v0.4.5 文档体系  
重点文件：

- `docs/00-core/00_01_Dev_Doc.md`
- `docs/00-core/00_02_Database_Schema.md`
- `docs/01-specs/01_01_Wecom_Integration.md`
- `docs/01-specs/01_02_Api_Spec.md`
- `docs/01-specs/01_03_Miniprogram_Guide.md`
- `docs/01-specs/01_04_Admin_Web_Guide.md`
- `docs/03-compliance/03_01_PIPL.md`
- `docs/99-audits/99_03_Docs_Split_Audit.md`

审计类型：实施就绪 / 多租户安全 / 企业微信关键链路 / PostgreSQL RLS / 技术栈生命周期 / 合规边界  
结论等级：**可以进入 M0/M1 预研与脚手架阶段，但不建议直接进入完整 M1 编码。先修 P0，再开主干开发。**

> ✅ **修复状态（2026-07-01，v0.4.6；2026-07-06 更新数据访问边界）**：本报告 P0 全部 + P1/P2 全部已落地文档。修复清单与位置见 [`99_05_Verification_And_New_Findings.md`](99_05_Verification_And_New_Findings.md) §5「修复落地」。核心：Node 24 / PG 17+ / WAL-PITR（§3.1/§33/§31.3）、`public_card_directory`（§15.4）、account 绑定表 RLS 分级（§15.4 / DB 指引 §2）、`contact_ways.channel` NOT NULL + active 部分唯一（§15.3）、关键外键 Plan A（§15.4）、软删除部分唯一（§15.4）、owner bootstrap（§15.4）、visit_token 契约（§14.6）、growth_leads 双角色（PIPL §1 + §15.3 字段）、node-postgres RLS 事务硬约束（§33.2）、API 路径收口（§14）。

---

## 0. 总体判断

v0.4.5 比 v0.3/v0.4 已经成熟很多。值得肯定的改进包括：

- 文档目录已重构为 `00-core / 01-specs / 03-compliance / 99-audits`，并且有索引与事实源约定。
- 主文档已吸收 `public_id`、`share_id`、联系我配置策略、welcome_code 调度、隐私默认收紧、PostgreSQL/RLS、技术栈收敛等关键修复。
- M1 从“先微信、后企微”改为“垂直切片”，尽早验证企业微信服务商模式，这是合理的。
- 已经意识到 M0 平台接入有审核周期，且单独作为前置并行轨。

本轮审计不再重复上一轮已修复的问题。剩下的问题更偏“实现时会摔跤”的细节：RLS 与公开访问如何配合、跨企业身份绑定表是否泄漏、PostgreSQL 唯一约束细节、技术栈版本生命周期、管理端首个 owner 如何产生、以及 M1 关键企微接口不能继续停留在“待核对”。

---

## 1. P0 — 进入 M1 主干开发前必须修复

### A4-P0-1：公开名片 `public_id` 查询与 RLS 存在启动矛盾

**位置**：主文档 §14.3 / §16.1 / §30，数据库指引 §2  
**现状**：

- 公开接口为 `GET /api/v1/public/cards/{public_id}`，无登录，只有 `public_id`。
- 文档要求所有含 `tenant_id` 的表启用 RLS，并通过 `SET LOCAL app.tenant_id = <tenant>` 控制访问。
- 但是公开请求开始时还不知道 `tenant_id`，而 `cards` 又是启用 RLS 的租户表。

**风险**：

如果直接按文档实现，公开接口在解析 `public_id` 时会遇到悖论：

```text
要查 cards，必须先 SET app.tenant_id
要 SET app.tenant_id，必须先根据 public_id 查到 tenant_id
```

开发者很可能为了让公开接口能跑，给 public service role 加 `BYPASSRLS` 或写特殊直查，这会削弱 RLS 的隔离价值。

**正确修复**：新增一个不含 PII 的全局公开索引表，专门用于解析 `public_id`。

```sql
CREATE TABLE public_card_directory (
  public_id VARCHAR(32) PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  card_id BIGINT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  card_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_public_card_directory_tenant ON public_card_directory (tenant_id, card_id);
```

公开访问流程改为：

```text
1. public service 查询 public_card_directory(public_id)，拿 tenant_id/card_id/status。
2. 若不存在或停用，返回统一异常态。
3. 在事务内 SET LOCAL app.tenant_id = tenant_id。
4. 之后按 RLS 查询 cards/templates/member_identities。
5. 输出字段仍走 §11.3 隐私判定。
```

要求：

- `public_card_directory` 不存姓名、手机号、邮箱、企业名等个人信息。
- public service role 只允许查该目录表和执行公开读取流程，不允许任意跨租户查询业务表。
- 名片停用、企业取消授权、员工离职、public_id 变更时同步更新该目录表。

---

### A4-P0-2：`account_identity_bindings` / `account_preferences` 不能简单归为“平台表不启用 RLS”

**位置**：数据库指引 §2、主文档 §5.5 / §16  
**现状**：

数据库指引把 `accounts`、`account_*` 归为平台/跨租户表，不启用租户 RLS；但 `account_identity_bindings` 记录的是：

```text
account_id + tenant_id + member_identity_id
```

这正是“一人绑定多家企业身份”的敏感关系。

**风险**：

如果企业管理员、员工接口或运营接口误查了该表，就可能暴露：

```text
某员工还绑定了哪些其它企业身份
某自然人属于哪些企业
某账号的跨企业历史
```

这与主文档“企业管理员不得看到员工绑定了哪些其他企业”的原则冲突。

**正确修复**：给 account 相关表拆分访问策略，而不是笼统“不启用 RLS”。

建议：

1. `accounts` 本体保持平台表，但接口只允许当前 account 自查或平台脱敏运维。
2. `account_identity_bindings` 启用 RLS 或等效策略，支持两类上下文：

```sql
-- 租户上下文：只能看到本租户下绑定
USING (tenant_id = current_setting('app.tenant_id', true)::bigint)

-- 个人上下文：只能看到当前自然人自己的绑定
USING (account_id = current_setting('app.account_id', true)::bigint)
```

3. `account_preferences` 只允许 `account_id = current app.account_id` 访问；租户管理员不应直接访问。
4. 平台运营需要跨租户排障时，走独立 service role + 审计日志 + 默认脱敏。

文档应把 `account_identity_bindings` 从“普通平台表”移出，归入“跨租户敏感绑定表”。

---

### A4-P0-3：技术栈选了 Node.js 20 LTS，但当前日期下 Node 20 已 EOL

**位置**：主文档 §3.1 / §33  
**现状**：

主文档把后端运行时固定为 `Node.js 20 LTS + TypeScript + NestJS`。但按 Node.js Release Working Group 的发布计划，Node 20.x 已在 2026-04-30 End-of-life；当前时间是 2026-07-01，已过维护期。

**风险**：

- 新项目从已 EOL runtime 开始，安全审计与企业交付会被质疑。
- 后续依赖版本、镜像基线、漏洞扫描都会持续报风险。
- “§33 技术栈单一事实源”会把整个团队锁在错误版本上。

**正确修复**：立即把运行时改为当前受支持的 LTS 线，建议：

```text
Node.js 24 LTS + TypeScript + NestJS
```

同时落地：

- `package.json engines.node` 固定 `>=24 <25` 或按团队策略锁 minor。
- Docker base image 改 `node:24-bookworm-slim` 或企业镜像基线。
- CI 增加 Node 版本检查。
- 若依赖还不兼容 Node 24，则临时选 Node 22 Maintenance LTS，但必须登记迁移到 24 的时间点。

---

### A4-P0-4：`contact_ways` 的唯一约束因为 `channel` 可空，在 PostgreSQL 下无法阻止重复静态配置

**位置**：主文档 §9.1 / §15.3  
**现状**：

文档设计了：

```sql
UNIQUE (tenant_id, member_identity_id, strategy, channel)
```

但 `channel` 是可空列。PostgreSQL 中唯一约束允许多行 NULL，因此下面数据可以重复插入：

```text
tenant=1, member=10, strategy=per_member_static, channel=NULL
```

**风险**：

这会直接破坏“禁止动态爆量 / 每员工每渠道最多一个长期 contact_way”的核心策略，最终仍可能生成大量重复 config。

**正确修复**：

```sql
ALTER TABLE contact_ways
  ALTER COLUMN channel SET DEFAULT 'default',
  ALTER COLUMN channel SET NOT NULL;

CREATE UNIQUE INDEX uk_cw_static_member_channel_active
ON contact_ways (tenant_id, member_identity_id, strategy, channel)
WHERE deleted_at IS NULL AND status = 'active';
```

如果需要允许历史停用配置保留，则唯一约束必须是 active/未删除部分唯一索引，而不是全表唯一约束。

---

### A4-P0-5：M1 依赖的企业微信关键字段仍停在“待核对”，应提升为 M0 阻塞任务

**位置**：企业微信指引 §6 / §13 待核对  
**现状**：

企业微信指引把第三方小程序 `jscode2session` 是否返回 `open_userid`、`session_key` 有效期、unionid 映射确切条件、接口频率上限等放在“待核对”。这些不是普通实现细节，而是 M1 闭环能否跑通的前置事实。

**风险**：

M1 验收要求“员工从企业微信工作台打开，经 wx.qy.login 自动识别 open_userid”。如果实现到一半才发现返回字段、权限、许可或可见范围与预期不同，M1 会整体返工。

**正确修复**：在 M0 新增“官方接口实测 Spike”，作为 M1 开工门槛。

产出文件建议：

```text
02-tasks/02_00_M0_Platform_Verification.md
```

必须记录：

- 试点企业授权截图 / 回调事件样例脱敏。
- `service/miniprogram/jscode2session` 实际请求与脱敏返回。
- open_userid / userid / corpid / session_key 实际字段。
- 应用可见范围外成员的失败样例。
- 接口调用许可缺失时的 errcode。
- unionid → external_userid 在三态下的实际返回。
- contact_way / welcome_msg 的实际 errcode 与频率上限。

只有这个文件完成，M1 企业微信部分才算“事实闭环可开发”。

---

## 2. P1 — 建议在对应模块编码前修复

### A4-P1-1：PostgreSQL 版本写 `14+`，但 14 已接近 EOL

**位置**：主文档 §3.1 / §33  
**现状**：数据库选型写 PostgreSQL 14+。PostgreSQL 官方版本政策显示每个主版本支持 5 年；PostgreSQL 14 的 final release 时间是 2026-11-12，离当前日期很近。

**修复建议**：

- 新项目最低版本改为 PostgreSQL 17+；如果云厂商已稳定支持 PostgreSQL 18，可选 18。
- 文档改为：`PostgreSQL 17+（推荐 18，视云厂商托管可用性）`。
- RLS、JSONB、partial index 等特性都不依赖 14，升级没有架构阻力。

---

### A4-P1-2：灾备章节使用了 MySQL 术语 `binlog`，与 PostgreSQL 选型冲突

**位置**：主文档 §31.3  
**现状**：备份写法为：

```text
数据库：每日全量 + 15 分钟增量 binlog
```

这是 MySQL 术语。PostgreSQL 应使用 WAL / PITR。

**修复建议**：改为：

```text
数据库：每日 base backup + 连续 WAL 归档；支持 PITR，RPO ≤ 15 分钟
```

如果用云数据库，写清楚：

```text
云数据库 PostgreSQL 自动备份 + WAL/PITR + 跨可用区备份
```

---

### A4-P1-3：软删除与唯一约束需要统一成 partial unique index

**位置**：主文档 §15.2 / §15.3  
**现状**：文档要求所有业务表追加 `deleted_at`，但唯一约束大多没有考虑软删除。

**风险**：

- 删除员工名片后无法重建同 `slug` 或同 `card_type` 的新名片。
- 停用/软删 contact_way 后仍被唯一约束挡住。
- 运营后台“删除后重新创建”会出现莫名其妙的唯一冲突。

**修复建议**：

- `public_id` 永久唯一，不复用。
- 租户内可复用的自然键改部分唯一：

```sql
CREATE UNIQUE INDEX uk_cards_slug_active
ON cards (tenant_id, slug)
WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX uk_cards_identity_type_active
ON cards (member_identity_id, card_type)
WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX uk_cws_state_active
ON contact_way_states (tenant_id, state)
WHERE deleted_at IS NULL;
```

---

### A4-P1-4：完全不使用数据库外键，M1 数据完整性风险偏高

**位置**：数据库指引 §1  
**现状**：文档写“无数据库级外键，多租户 + 软删除下用应用层/触发器约束”。

**判断**：这不是一定错，但对 M1/M2 早期项目风险偏大。现在还没有代码、没有成熟测试、没有数据修复工具，完全无 FK 会放大孤儿数据与跨租户错配概率。

**修复建议**：二选一：

方案 A：M1 使用关键外键，后续流量上来再评估是否拆掉。

```sql
-- 需要先在父表建立 (tenant_id, id) 唯一约束
cards(tenant_id, member_identity_id) -> member_identities(tenant_id, id)
card_visits(tenant_id, card_id) -> cards(tenant_id, id)
contact_ways(tenant_id, member_identity_id) -> member_identities(tenant_id, id)
```

方案 B：坚持无 FK，则必须补：

- 写入前 invariant validator。
- CI 数据完整性测试。
- 每日 orphan scanner。
- 管理后台健康检查。

不能只写“应用层约束”，否则落不了地。

---

### A4-P1-5：`tenant_admins` 有表，但首个企业 owner 的产生流程不完整

**位置**：主文档 §15.3、后台指引 §1/§5  
**现状**：企业管理员登录方案有了，但“企业完成授权后谁成为 owner”还在待核对。

**风险**：

企业完成授权后，如果没有 owner bootstrap，后台可能无人可进；或者平台人工赋权，留下安全与运营漏洞。

**修复建议**：新增 owner bootstrap 流程：

```text
企业授权完成
→ 解析授权操作者 / 应用管理员信息
→ 若能拿到 open_userid，创建 tenant_admins(owner)
→ 若拿不到，生成一次性 admin_claim_token
→ 企业管理员从企业微信 OAuth/扫码进入绑定
→ 绑定成功后 token 失效
```

要求：

- token 有效期短，单次使用。
- 绑定全程落 audit_logs。
- 平台人工赋 owner 必须双人复核或超级管理员 MFA。

---

### A4-P1-6：`growth_leads` 让平台方从“受托处理方”变成部分场景下的独立处理者

**位置**：主文档 §7.4、PIPL 指引 §1  
**现状**：PIPL 指引写平台方多数场景是受托处理方，企业租户是个人信息处理者。但 `growth_leads` 是平台级增长漏斗，平台收集潜在企业客户联系人信息，并且不归入任何租户视图。

**风险**：

这类留资不是企业租户委托平台处理，而是平台自己的获客行为。平台方在该场景下更接近独立个人信息处理者，不能只套“受托处理方”口径。

**修复建议**：

- PIPL 指引增加“双角色模型”：

```text
企业名片业务：企业=处理者，平台=受托处理方。
growth_leads 留资：平台=个人信息处理者。
```

- 留资弹窗单独告知处理者是平台方，不能沿用企业租户隐私告知。
- `growth_leads` 增加 `consent_version`、`consented_at`、`source_public_id`、`source_share_id`、`contact_phone_hash`。
- 来源员工只见聚合数，不见明细，这一点保持。

---

### A4-P1-7：`visit_token` 是关键安全件，但还没有契约

**位置**：主文档 §14.3 / §32，小程序指引 §7  
**现状**：文档要求公开动作必须带 `visit_token`，但没有定义 token 结构、过期、绑定范围、重放规则。

**修复建议**：补充：

```text
visit_token = 服务端签发的短期 JWT 或 HMAC opaque token
绑定：visit_id + public_id + share_id + issued_at + nonce
有效期：建议 30 分钟
存储：Redis 记录 nonce 或 visit_id 状态，用于幂等与撤销
重放：同 visit_id/action_type 短时幂等；超过窗口拒绝
```

注意：不能把它当强身份，只能防低成本刷量。强可信转化仍以企业微信回调为准。

---

### A4-P1-8：API 路径事实源仍有漂移，应处理 99_03 已发现的问题

**位置**：主文档 §14、API 指引、审计 99_03  
**现状**：`01_02_Api_Spec.md` 已统一 `/api/v1`，但主文档 §14 仍保留无 `/api/v1` 的路径示例；99_03 已标为 P2，但现在进入实施准备，应收口。

**修复建议**：

- 主文档 §14 只保留分组与指针，不再列路径。
- 路径、请求、响应、错误码全部以 `01_02_Api_Spec.md` 为唯一事实源。
- `action_type` 取值只保留在 `00_02_Database_Schema.md` §4。

---

### A4-P1-9：`account_identity_bindings.is_default` 与 `account_preferences` 存在双事实源

**位置**：主文档 §5.5 / §15 / §15.3  
**现状**：绑定表仍有 `is_default`，同时 §15.3 新增 `account_preferences.default_member_identity_id`。

**风险**：两个字段都能表达“默认身份”，后续必然漂移。

**修复建议**：

- 删除或弃用 `account_identity_bindings.is_default`。
- 默认身份唯一事实源为 `account_preferences`。
- 绑定表只保留绑定关系与 `last_used_at` 等行为字段。

---

### A4-P1-10：node-postgres + RLS + `SET LOCAL` 要求所有租户查询在事务内，需写成硬约束

**位置**：主文档 §33.2、数据库指引 §2  
**现状**：文档已经提醒 PgBouncer transaction 模式兼容性待验证，但还没有把“租户查询必须在事务内执行”写成工程硬规则。

**修复建议**：

- 所有需要 RLS 的请求都通过 `TenantTx.run(tenantId, callback)` 包裹。
- `TenantTx` 内部开启事务并执行 `SET LOCAL app.tenant_id = ...`。
- Repository 层禁止绕过 `TenantTx` / `DatabaseService` 访问租户表。
- CI 增加测试：无 `SET LOCAL` 时查询不到数据；不同 tenant 上下文互不可见。
- 若使用 PgBouncer，先验证 transaction pooling 下 `SET LOCAL` 的生命周期，不通过则不用 transaction pooling 或改连接策略。

---

## 3. P2 — 可后置，但建议排进文档治理

### A4-P2-1：仓库根目录缺少 README

`docs/README.md` 已经很好，但仓库根目录当前没有 `README.md`。主文档推荐结构里有根 README。建议补一个极简根 README：项目定位、阅读入口、当前状态、M0/M1 目标。

### A4-P2-2：测试计划仍缺覆盖率与 CI 门禁

§20 有测试类型，§33 选了 Jest/Supertest/Playwright/GitHub Actions，但还没有门槛：

```text
后端核心服务单测覆盖率 ≥ 70%
鉴权/RLS/回调安全相关覆盖率 ≥ 90%
每个 PR 必跑越权测试、API schema 测试、迁移测试
```

### A4-P2-3：`02-tasks/` 可以开始落 M0 检查单

99_03 说 `02-tasks/` 暂缓是合理的。但现在已经进入实施审计，建议至少创建：

```text
02-tasks/02_00_M0_Platform_Verification.md
02-tasks/02_01_M1_Walking_Skeleton.md
```

不要写大而全排期，只写阻塞项、验收项、负责人和状态。

### A4-P2-4：公共 H5 兜底页需补域名与跳转策略

主文档已有 H5 兜底页，但执行细节还少：

- 微信内 H5 如何引导小程序。
- 普通浏览器展示哪些字段。
- 是否允许搜索引擎索引。
- `robots`、canonical、分享卡片 OG 信息。
- H5 与小程序缓存失效同源。

---

## 4. 建议修复顺序

### 立即修主文档 / schema

1. A4-P0-1：新增 `public_card_directory`，解决 public_id 与 RLS 的启动矛盾。
2. A4-P0-2：重新定义 `account_identity_bindings` / `account_preferences` 的访问控制，不要简单归为非 RLS 平台表。
3. A4-P0-3：Node 20 改 Node 24 LTS，更新 §3.1 / §33 / Docker / CI。
4. A4-P0-4：`contact_ways.channel` 改 NOT NULL + active partial unique。
5. A4-P0-5：M0 新增企业微信接口实测 Spike。

### M1 编码前修

6. PostgreSQL 版本改 17+/18，灾备从 binlog 改 WAL/PITR。
7. 软删除唯一约束改 partial unique index。
8. owner bootstrap、visit_token 契约、API 路径事实源收口。
9. node-postgres RLS 事务包装器定为工程规范。

### M2/M3 前修

10. growth_leads 单独合规角色。
11. 客户联系配额实测与 errcode 清单。
12. 客户继承 / 离职接替与企业微信继承接口联动细化。

---

## 5. 结论

v0.4.5 已经不是“想法文档”，而是可以启动工程的方案。但如果直接按当前文档开 M1，会在三个地方很容易卡住：

1. **公开访问 + RLS**：public_id 查不到 tenant 时无法安全设置 RLS 上下文。
2. **跨企业身份绑定表**：account_identity_bindings 一旦不受强约束，很容易泄露“一个人属于哪些企业”。
3. **技术栈生命周期**：Node 20 在当前日期已 EOL，不能作为新项目基线。

本轮建议不是推翻方案，而是把最后几颗“地雷”提前挖出来。修完 P0 后，可以进入 M0/M1 的 walking skeleton；P1 在对应模块编码前逐步收口即可。
