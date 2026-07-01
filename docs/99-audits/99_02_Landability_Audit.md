# Audit #02 — v0.3 落地性深度审计

日期：2026-07-01  
审计对象：`docs/wecom-business-card-saas-dev-doc.md` v0.3  
审计类型：落地性 / 多租户 / 企业微信平台约束 / 隐私合规 / 研发排期审计  
审计结论：v0.3 已经从“概念方案”进化到“可启动研发的架构草案”，但仍存在若干会影响真实上线、统计准确性、租户安全和企业微信客户联系链路的关键缺口。本次审计不为挑刺而挑刺，只保留会真实影响交付、扩展或合规的修复项。

---

## 总体判断

v0.3 的方向是对的：微信小程序作为主分享载体，企业微信作为增强层；自然人 account 与企业身份 member_identity 分离；客户不强制加企业微信；多租户隔离作为底线。

已经修复较好的部分：

- unionid 不稳定与 openid-only 降级。
- suite_ticket / suite_access_token 链路。
- 指令回调与数据回调拆分。
- open_userid 作为第三方应用主标识。
- PIPL 合规章节。
- 回调幂等与 token singleflight。
- 基础 DDL、API 规范、可观测性初稿。

但从真实项目落地看，仍需修复以下核心问题：

1. 公共名片 URL 与数据库唯一键不一致，可能导致公网访问无法唯一定位名片。
2. 分享参数暴露内部 ID，统计容易被伪造，也有隐私与枚举风险。
3. MVP 边界前后不一致，容易导致第一阶段被企业微信授权、许可、客户联系能力拖住。
4. 联系我配置策略可能造成 API 配额与配置数量爆炸。
5. 欢迎语 20 秒 / 一次性限制没有进入回调调度设计。
6. 数据模型缺少若干唯一约束、默认身份约束、分享表、租户管理员表。
7. 隐私默认值与字段规则优先级还不够安全。
8. 许可、配额、备份、灾备仍是“待实现”，但其中一部分需要提前进入 M3 / M4 前置门槛。

---

## P0 — 必须修复，否则会影响核心链路上线

### A2-P0-1：公共名片 slug 与接口路径无法唯一定位

**问题位置**：§5.6、§14.3、§15 cards DDL  
**现状**：`cards` 只有 `UNIQUE(tenant_id, slug)`，但公开接口是 `GET /api/public/cards/{slug}`，分享路径也只带 `card=8k3h29`。如果 slug 仅在租户内唯一，公网访问没有 tenant 上下文时无法唯一查到名片。

**真实风险**：

- A 企业和 B 企业都可能有 `8k3h29`。
- 客户打开小程序卡片时只有 card/slug，服务端可能查到多条或查错。
- 为避免查错而全局扫描会破坏数据隔离边界。

**正确修复**：二选一，推荐方案 A。

方案 A：新增全局唯一公开 ID。

```sql
ALTER TABLE cards
  ADD COLUMN public_id VARCHAR(32) NOT NULL AFTER slug,
  ADD UNIQUE KEY uk_cards_public_id (public_id);
```

接口改为：

```text
GET /api/public/cards/{public_id}
/pages/card/detail?card=pub_8k3h29x2
```

`slug` 保留给企业内部自定义短名，`public_id` 用于所有公网分享。

方案 B：路径显式携带租户标识。

```text
/api/public/tenants/{tenant_slug}/cards/{slug}
/pages/card/detail?tenant=guilin-brand&card=zhangsan
```

但此方案会暴露 tenant_slug，且租户改名迁移麻烦，因此不如全局 `public_id` 稳。

---

### A2-P0-2：分享参数暴露内部 ID，来源统计可被伪造

**问题位置**：§6.3 分享路径示例、§9.2 state 示例  
**现状**：分享路径示例包含 `from=identity_1024`，联系我 state 示例包含 `card:{card_id}:member:{member_identity_id}`。

**真实风险**：

- 暴露内部 `member_identity_id`、`card_id`，可被枚举。
- 客户端可以随意改 `from`、`channel`，导致分享统计被污染。
- 如果后续把 `from` 作为权限或归因依据，会出现越权与错误归因。

**正确修复**：引入 `share_id`，所有分享来源都由服务端生成。

```sql
CREATE TABLE card_shares (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  card_id BIGINT NOT NULL,
  member_identity_id BIGINT NOT NULL,
  public_share_id VARCHAR(64) NOT NULL,
  channel VARCHAR(64) NULL,
  scene VARCHAR(64) NULL,
  created_at DATETIME NOT NULL,
  UNIQUE KEY uk_public_share_id (public_share_id),
  KEY idx_share_card (tenant_id, card_id),
  KEY idx_share_member (tenant_id, member_identity_id)
);
```

分享路径改为：

```text
/pages/card/detail?card=pub_8k3h29x2&share=shr_a9K2mQ
```

服务端根据 `share` 查 source identity，客户端提交的 `channel` 仅作为辅助，不作为可信来源。

---

### A2-P0-3：联系我配置策略可能导致配额和配置数量爆炸

**问题位置**：§9.1、§9.2、§13.6、§19 M4  
**现状**：文档说每个员工可有一个或多个联系我配置，state 包含 channel + nonce。若为了每次分享、每张海报、每次点击都生成独立联系我配置，会迅速消耗企业微信配置额度和调用频率。

**真实风险**：

- 企业微信 API 添加的联系我配置需要保存 config_id，config_id 丢失可能无法编辑或删除。
- 每个企业 API 配置数量有上限；临时会话模式也有每日数量限制，并且临时模式仅适合单人短时场景。
- SaaS 多租户一旦按点击动态生成 config，会成为高并发、配额和运维灾难。

**正确修复**：新增联系我策略，禁止默认“每次访问动态创建”。

推荐策略：

```text
默认：per_member_static
  每个员工每个渠道最多一个长期 contact_way。
  适合名片页“添加企业微信”按钮。

活动：per_campaign_static
  每个活动 / 海报 / 展会渠道一个 contact_way。
  适合线下物料、广告投放。

临时：temp_session
  仅在强来源追踪、短期活动、单人接待时使用。
  必须经过配额检查。
```

补表：

```sql
ALTER TABLE contact_ways
  ADD COLUMN strategy VARCHAR(32) NOT NULL DEFAULT 'per_member_static',
  ADD COLUMN campaign_id BIGINT NULL,
  ADD COLUMN quota_policy_json JSON NULL,
  ADD UNIQUE KEY uk_cw_static_member_channel (tenant_id, member_identity_id, strategy, channel);
```

state 改为短 opaque token：

```text
state = cwst_x7K2pQ9a
```

不要把结构化长串直接传给企业微信。

---

### A2-P0-4：MVP 边界前后不一致，可能导致第一阶段被企微能力拖死

**问题位置**：§1.2、§19、§23  
**现状**：§1.2 第一阶段包含企业微信第三方应用授权与员工身份识别、一人多企业身份切换；§19 又把 M1 定义为小程序基础，M2 多租户，M3 企业微信第三方应用；§23 MVP 验收又要求企业授权、wx.qy.login、一人多企业。

**真实风险**：

- 对领导/研发/测试来说，“MVP 到底是什么”不一致。
- 如果把企业微信第三方应用、许可、回调、通讯录同步都放进 MVP，第一版会被外部平台配置和审核拖住。
- 如果只做小程序名片基础，§23 的验收又会判定 MVP 未完成。

**正确修复**：拆成两个明确版本。

```text
MVP-A：可演示名片 MVP
  小程序名片详情
  员工手动建档 / 后台导入
  保存通讯录
  拨打电话
  分享小程序卡片
  名片海报
  基础统计
  不依赖企业微信授权

MVP-B：SaaS 商业 MVP
  多租户
  企业微信第三方应用授权
  wx.qy.login
  open_userid 身份识别
  一人多企业身份切换
  企业后台
  基础许可状态
```

§23 应改成两个验收清单，不再混用。

---

## P1 — 应在开发前或对应里程碑前修复

### A2-P1-1：欢迎语 20 秒 / 一次性限制未进入回调调度设计

**问题位置**：§7.3、§8.4、§19 M4  
**现状**：文档写“可发送欢迎语”，但没有说明 welcome_code 的时间窗口、一次性、管理端已有欢迎语时不返回 welcome_code、多应用抢先调用等问题。

**修复建议**：

- 数据回调收到 add_external_contact 后，同步阶段仍快速返回，但必须把 welcome_code 投递到高优先级队列。
- 欢迎语 worker 目标处理时间 < 3 秒，超过 10 秒告警。
- 如果无 welcome_code，记录原因：管理端已有欢迎语 / 权限不足 / 非本应用可见范围。
- 欢迎语发送必须幂等：同一 welcome_code 只尝试一次；失败记录 errcode，不重试到超过有效窗口。

---

### A2-P1-2：账号 openid-only 降级缺少唯一约束与合并流程

**问题位置**：§5.2、§6.2、§15 accounts DDL  
**现状**：accounts 表只有 `UNIQUE(wx_unionid)`，`primary_wx_openid` 没有唯一约束，也没有 account 合并记录。

**风险**：同一个微信 openid 在并发登录下可能创建多个 account；unionid 后续到位时可能触发唯一键冲突，但缺少合并流程。

**修复建议**：新增独立绑定表，不要只依赖 `primary_wx_openid`。

```sql
CREATE TABLE account_openid_bindings (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  account_id BIGINT NOT NULL,
  appid VARCHAR(64) NOT NULL,
  openid VARCHAR(128) NOT NULL,
  unionid VARCHAR(128) NULL,
  bind_source VARCHAR(32) NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uk_app_openid (appid, openid),
  KEY idx_unionid (unionid)
);
```

补充 account merge 规则：

- 自动合并只允许同一 appid + openid。
- unionid 冲突时进入待合并队列，由用户确认或客服审核。
- 合并要迁移 account_identity_bindings、登录态、偏好设置，并保留 audit log。

---

### A2-P1-3：visitor_accounts 缺少去重约束

**问题位置**：§5.7、§15 visitor_accounts DDL  
**现状**：visitor_accounts 只有普通索引，没有唯一键。

**修复建议**：同样增加 `appid`，并加唯一键。

```sql
ALTER TABLE visitor_accounts
  ADD COLUMN appid VARCHAR(64) NOT NULL AFTER id,
  ADD UNIQUE KEY uk_visitor_app_openid (appid, wx_openid),
  ADD UNIQUE KEY uk_visitor_unionid (wx_unionid);
```

如果担心 `wx_unionid` 为空，MySQL 允许多个 NULL；PostgreSQL 可用 partial unique index。

---

### A2-P1-4：默认身份 is_default 缺少唯一性保证

**问题位置**：§5.5、§15 account_identity_bindings DDL  
**现状**：`is_default` 是普通字段，没有保证同一 account 只有一个默认身份。

**修复建议**：不要用布尔散落在多行里，新增偏好表更清晰。

```sql
CREATE TABLE account_preferences (
  account_id BIGINT PRIMARY KEY,
  default_member_identity_id BIGINT NULL,
  last_member_identity_id BIGINT NULL,
  updated_at DATETIME NOT NULL
);
```

如果继续用 `is_default`，则需要数据库部分唯一索引或应用层事务保证。

---

### A2-P1-5：字段隐私默认值偏开放，且缺少策略优先级

**问题位置**：§11.3  
**现状**：示例 privacy_json 默认 `show_mobile: true`，企业全局规则与员工个人开关没有明确优先级。

**风险**：手机号、邮箱、微信号属于高敏感业务字段。默认展示手机号会在企业试用期引发投诉或合规问题。

**修复建议**：默认保守，并定义优先级。

默认值：

```json
{
  "show_mobile": false,
  "show_email": true,
  "show_wechat_id": false,
  "show_wecom_contact": false,
  "show_address": true
}
```

展示规则：

```text
最终展示 = 企业字段规则允许
        AND 员工名片 privacy_json 允许
        AND 字段本身存在
        AND 名片状态 active
```

企业禁用字段时，员工端只能看到“企业不允许展示”，不能自行打开。

---

### A2-P1-6：tenant 管理员身份缺失

**问题位置**：§2.3、§12.3、§14.5、§16.2  
**现状**：有企业管理员角色，但没有 tenant_admins 表，也没有管理员登录来源设计。

**修复建议**：新增表与登录方案。

```sql
CREATE TABLE tenant_admins (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  member_identity_id BIGINT NULL,
  open_userid VARCHAR(128) NULL,
  role VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uk_tenant_admin_user (tenant_id, open_userid)
);
```

管理端登录建议：

- 企业管理员优先使用企业微信扫码 / OAuth 登录。
- 平台管理员使用独立后台账号 + MFA。
- 不建议第一版做纯密码式企业管理员登录。

---

### A2-P1-7：客户离职继承与 external_userid 归属过于模糊

**问题位置**：§13.3 离职处理  
**现状**：写了“external_userid 归属按平台规则处理（可迁移 / 冻结）”，但没有数据模型支撑。

**修复建议**：把客户归属从“来源员工”中拆出来。

```sql
CREATE TABLE tenant_customer_owners (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  tenant_external_customer_id BIGINT NOT NULL,
  owner_member_identity_id BIGINT NULL,
  source_member_identity_id BIGINT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  assigned_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_owner_member (tenant_id, owner_member_identity_id)
);
```

员工离职后：

- 名片停用。
- contact_way 停用。
- 历史访问统计保留。
- 客户所有权进入 `pending_transfer`，等待企业管理员或企业微信继承结果。
- 不自动跨企业迁移客户。

---

### A2-P1-8：cards 一身份一名片限制过硬

**问题位置**：§5.6、§15 cards DDL、§29 D-P2-7  
**现状**：`UNIQUE(member_identity_id)` 限制一个企业身份只能有一张名片。

**合理判断**：第一阶段一身份一张主名片是正确的，但数据库可以用低成本方式兼容未来多场景名片。

**修复建议**：增加 `card_type`，保留主名片唯一。

```sql
ALTER TABLE cards
  ADD COLUMN card_type VARCHAR(32) NOT NULL DEFAULT 'primary',
  DROP INDEX uk_cards_identity,
  ADD UNIQUE KEY uk_cards_identity_type (member_identity_id, card_type);
```

这样 M1 仍然只有 `primary`，M5 可增加 `recruiting`、`event`、`sales` 等场景卡。

---

### A2-P1-9：接口配额管理不能等到实现阶段再说

**问题位置**：§13.9、§29 D-P2-5  
**现状**：接口配额管理标记为待实现阶段细化，但 unionid → external_userid、联系我配置、欢迎语、通讯录同步都受企业微信侧限制。

**修复建议**：M3 前加入基础配额模块。

```sql
CREATE TABLE api_quota_counters (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NULL,
  api_name VARCHAR(128) NOT NULL,
  window_type VARCHAR(32) NOT NULL, -- minute/hour/day/month
  window_start DATETIME NOT NULL,
  count_used BIGINT NOT NULL DEFAULT 0,
  limit_value BIGINT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uk_quota_window (tenant_id, api_name, window_type, window_start)
);
```

要求：

- 企业微信 API 调用前先走本地 quota guard。
- 接近阈值时降级，不让客户链路报错。
- 429 / errcode 限频类错误进入指数退避。

---

### A2-P1-10：public action 埋点可信度不足

**问题位置**：§14.3、§15 card_actions  
**现状**：公开接口允许记录动作，例如 save_phone、call_phone、copy_email、add_wecom。

**风险**：客户端可伪造动作、刷统计、污染销售排名。

**修复建议**：

- 名片详情页首次加载返回 `visit_token`，服务端签发，短期有效。
- action 必须带 `visit_token`。
- 关键动作按 `visit_id + action_type` 做短时幂等。
- 所有统计标注 `trust_level`：anonymous_client / session_verified / wecom_callback_verified。
- 只有企业微信回调产生的“客户添加成功”才算强可信转化。

---

### A2-P1-11：suite_ticket 只放 Redis，冷启动仍有不稳定性

**问题位置**：§8.3  
**现状**：suite_ticket 写 Redis，冷启动无 suite_ticket 时等待下一次推送或“主动触发预案”。

**修复建议**：最新 suite_ticket 应同时加密落库，Redis 作缓存。

```sql
CREATE TABLE wecom_suite_state (
  suite_id VARCHAR(128) PRIMARY KEY,
  suite_ticket_encrypted TEXT NULL,
  suite_ticket_updated_at DATETIME NULL,
  suite_access_token_encrypted TEXT NULL,
  suite_access_token_expires_at DATETIME NULL,
  updated_at DATETIME NOT NULL
);
```

冷启动：先读 DB 中未过期的 suite_ticket，加载到 Redis；过期才进入等待状态并告警。

---

### A2-P1-12：链接字段 links_json 缺少安全规则

**问题位置**：§5.6、§11.1、§17.3  
**现状**：名片可放官网、案例、预约链接，但没有 URL 安全策略。

**风险**：员工可填钓鱼链接、违规内容、`javascript:`、短链跳转、恶意下载链接，企业品牌和平台审核都会受影响。

**修复建议**：

- 后台配置企业级允许域名列表。
- URL 入库时解析协议，只允许 `https://`。
- 禁止短链域名或要求展开后审核。
- 小程序内跳转外部网页需符合业务域名配置。
- links_json 增加 `review_status`。

---

## P2 — 建议补齐，提升长期可维护性

### A2-P2-1：备份 / 灾备 / 回滚仍缺细节

**问题位置**：§29 D-P2-3  
**修复建议**：补充 RPO/RTO、数据库备份、对象存储备份、KMS 密钥备份、灾难恢复演练、版本回滚流程。

建议初值：

```text
RPO：≤ 15 分钟
RTO：≤ 4 小时
数据库：每日全量 + 15 分钟增量 binlog
对象存储：版本控制 + 生命周期
密钥：KMS 托管，不导出明文
```

---

### A2-P2-2：海报生成方案需要具体化

**问题位置**：§17.3、§19 M1  
**修复建议**：

- M1 优先小程序 Canvas 生成，减少服务端 SSRF 面。
- 服务端生成时只允许读取对象存储白名单资源。
- 图片上传后统一转码、压缩、去 EXIF。
- 海报生成任务幂等：`card_id + template_id + version_hash`。
- 队列设置失败重试与死信队列。

---

### A2-P2-3：小程序审核 / 类目 / 域名 / 隐私协议前置清单缺失

**问题位置**：§8.1、§19  
**修复建议**：新增“上线前置条件清单”：

- 小程序主体认证。
- 小程序类目适配：企业服务 / 效率 / 商业服务等需确认。
- 服务器域名、业务域名、downloadFile 域名配置。
- HTTPS、ICP备案、公安备案按实际域名要求处理。
- 隐私协议与用户协议上线。
- 企业微信服务商账号、第三方应用、回调 URL、客户联系权限申请。
- 若使用联系我按钮而非二维码，确认小程序插件接入要求。

---

### A2-P2-4：管理员操作审计可进一步结构化

**问题位置**：§15.1 audit_logs、§16.2  
**修复建议**：`audit_logs.detail_json` 应标准化：

```json
{
  "before": {},
  "after": {},
  "reason": "",
  "request_id": "",
  "operator_ip_hash": ""
}
```

敏感字段只记录 hash 或掩码，不记录明文前后值。

---

### A2-P2-5：统计口径需要定义

**问题位置**：§13.8、§20、§23  
**修复建议**：定义每个指标的口径：

```text
PV：每次名片页展示
UV：同 openid / unionid / anonymous_fingerprint 的去重访客
保存电话：触发 wx.addPhoneContact 成功回调才计入 strong action
拨打电话：点击拨号按钮，只能算意向动作
添加企微：企业微信 add_external_contact 回调才算成功
```

没有口径，后续数据看板会非常容易争议。

---

### A2-P2-6：环境与发布策略缺失

**修复建议**：至少定义 dev / staging / production 三套环境：

- 企业微信回调 URL 分环境。
- 小程序体验版 / 预览版 / 正式版。
- 数据库迁移工具。
- 灰度发布与回滚。
- Feature flag：contact_way、welcome_msg、external_mapping 可独立开关。

---

### A2-P2-7：H5 兜底页面可以作为后续增强

**判断**：不是 M1 必须，但建议文档中留入口。

**原因**：名片可能被复制到短信、邮件、浏览器、电脑微信、企业官网等环境。小程序体验是主路径，但 H5 fallback 可提升兼容性。

**修复建议**：后续增加：

```text
https://card.example.com/c/{public_id}
```

微信内引导打开小程序，普通浏览器展示基础名片。

---

## 建议加入 v0.4 的最小修复包

不建议一次把所有 P1/P2 都塞进主文档。v0.4 最小修复包建议只改这些：

1. 增加全局 `public_id`，修复公开名片定位问题。
2. 增加 `card_shares` 与 `share_id`，修复分享归因与内部 ID 暴露。
3. 拆分 MVP-A / MVP-B，修复排期边界。
4. 补充联系我配置策略，禁止默认动态创建 contact_way。
5. 补充欢迎语 20 秒 / 一次性 / 无 welcome_code 分支。
6. 补充 tenant_admins、account_openid_bindings、visitor_accounts 唯一约束。
7. 修改 privacy_json 默认值与字段规则优先级。
8. 把接口配额管理从“待实现”提前到 M3/M4 前置条件。

---

## 修复优先级建议

### 立即修文档

- A2-P0-1 公共名片唯一定位。
- A2-P0-2 share_id 替换内部 ID。
- A2-P0-3 联系我配置策略。
- A2-P0-4 MVP 边界拆分。
- A2-P1-5 隐私默认值与字段规则优先级。

### M1 开发前

- public_id。
- card_shares。
- action 埋点 token。
- 统计口径。
- 海报生成方案。

### M2 开发前

- account_openid_bindings。
- visitor_accounts 去重。
- account merge 流程。
- account_preferences 默认身份。
- tenant_admins。

### M3/M4 开发前

- suite_ticket 持久化。
- API quota guard。
- contact_way 策略。
- welcome_code 快速调度。
- 客户继承模型。
- 企业微信权限预检页面。

---

## 结论

v0.3 已经具备研发启动价值，但不能直接作为最终执行版。最需要警惕的不是“功能不够多”，而是公共 ID、分享归因、联系我配额、MVP 边界这几个会在真实上线时突然爆雷的问题。

建议把 v0.4 定位为“落地版开发文档”，先吸收本审计的 P0 和关键 P1，再进入 M1/M2。这样修复不是为了挑刺，而是为了避免研发过程中返工和上线后数据/权限事故。
