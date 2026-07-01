# 微信小程序 + 企业微信第三方应用 + 多租户企业名片 SaaS 开发文档

版本：v0.4（落地版）  
日期：2026-07-01  
文档定位：产品技术方案 / 架构设计草案 / 研发启动文档  
适用对象：产品负责人、技术负责人、后端、前端、小程序、测试、运维、企业微信服务商配置人员

> v0.3 变更说明：依据设计审计（`docs/audits/audit_01_dev-doc.md`）补充平台前置条件、企业微信第三方应用回调架构、PIPL 合规、DDL 补全、可观测性与 API 规范。审计对照见第 26 章。
>
> v0.4 变更说明：吸收落地性深度审计（`docs/audits/audit_02_dev-doc-v0.3-landability.md`）及交叉复核补充。核心修复：公开名片全局 `public_id`、分享归因 `share_id`（不再暴露内部 ID）、联系我配置策略（禁止动态爆量）、隐私默认收紧（升 P0）、欢迎语调度、若干唯一约束与租户管理员/客户归属/配额表、缓存失效与分享矩阵。审计对照见第 29 章，落地补充见第 30–32 章。
>
> v0.4.3 变更说明：**技术栈全面选定并去歧义**。后端选定 Node.js 20 LTS + TypeScript + NestJS；对象存储腾讯云 COS、队列 BullMQ、加密腾讯云 KMS 等散落多选项一律收敛为单一选定；新增 **§33 技术栈与工程决策（单一事实源）**，实现期不再重新选型。见 §3.1、§17.1、§33。
>
> v0.4.2 变更说明：**数据库选定 PostgreSQL（面向企业级）**。全部 DDL 转 PostgreSQL 方言（`BIGSERIAL` / `TIMESTAMPTZ` / `JSONB` / `BOOLEAN`、可空列部分唯一索引、独立 `CREATE INDEX`、RLS 租户隔离），DDL 约定见 §15.0；顺带修正 `contact_ways` 静态唯一约束缺 `channel` 列的隐患。见 §3.1。
>
> v0.4.1 变更说明：**开发策略改为“垂直切片优先（walking skeleton）”**——MVP（M1）一次打通“微信级别名片 + 首个企业微信第三方应用对接”并 demo 成功，多租户地基一次到位；企业微信授权作为价值前提与最高风险项不再后置；平台接入作为前置并行轨（M0）。原 MVP-A/MVP-B 分层后置方案作废。见 §1.2、§19、§23、§25。

---

## 0. 一句话结论

本项目建议定义为：

> 一个以微信小程序为主要名片分发载体、以企业微信第三方应用为企业授权与员工身份增强层、以多租户后台为企业管理平台的企业名片 SaaS。

核心判断：

1. **微信小程序是主入口和主分享载体**：员工可以用微信分享名片，客户可以在微信中直接打开。
2. **企业微信是增强层，不是唯一闭环**：企业微信负责企业授权、员工身份识别、客户联系、欢迎语、客户关系映射、接口许可管理。
3. **客户不强制添加企业微信**：客户可以直接保存电话、拨打电话、查看案例、保存海报；“添加企业微信”只是可选增强动作。
4. **自然人账号与企业员工身份分离**：一个人可以属于多家企业，每个企业身份拥有独立名片。
5. **所有企业数据必须多租户隔离**：企业管理员只能看到自己企业的数据，即使系统内部知道同一自然人绑定了多家企业，也不得跨企业展示。

---

## 1. 产品目标

### 1.1 要解决的问题

企业员工需要一种轻量、统一、可管理的电子名片工具，用于在微信、企业微信、微信群、客户沟通场景中分发个人联系方式与企业信息。

传统纸质名片存在以下问题：

- 更新成本高，职位、电话、公司资料变更后难以同步。
- 传播路径弱，无法统计客户是否查看、保存、拨打、加企微。
- 品牌统一性差，员工个人制作名片容易视觉不一致。
- 客户动作单一，纸质名片无法直接跳转案例、官网、地图、预约、企业微信。

本系统要提供：

- 企业统一配置品牌模板。
- 员工拥有自己的电子名片。
- 员工可以在微信和企业微信中分享。
- 客户可以直接保存电话、拨打电话、查看资料。
- 客户可选添加企业微信。
- 企业可选打通客户联系、欢迎语、external_userid 映射和 CRM 追踪。

### 1.2 产品边界

第一阶段重点做“企业电子名片分发”，不是一开始就做完整 CRM。

**开发策略：分步开发，垂直切片优先（v0.4.1 修订）**

MVP **不是**“先做微信、把企业微信往后拖”，而是**一次打通最小闭环并 demo 成功**：微信小程序名片达到可用级别 **+ 首个企业微信第三方应用对接跑通**。企业授权是整个价值主张的前提，也是最高技术风险与最长审核周期项，必须尽早验证、不能后置。功能的广度与深度再按阶段叠加。原“MVP-A / MVP-B 分层后置”方案作废。

**MVP（闭环骨架）= 微信级别名片 + 首个企业微信对接并展示成功**

数据地基（一次到位，不后补）：

- 多租户数据模型，全表 tenant_id，隔离中间件 + 数据层强制（§16.1）。
- account / member_identity / card / binding 全套模型，名片挂在企业身份上（§5）。

微信小程序名片（达到“微信级别”）：

- 名片详情页、保存到通讯录、拨打电话。
- 小程序分享（会话 / 群 / 海报小程序码）、名片海报。
- 企业品牌模板、基础访问统计（带 public_id / share_id）。

企业微信第三方应用（首个对接闭环）：

- 首个企业授权跑通：suite_ticket → permanent_code → 创建 tenant。
- wx.qy.login 识别员工（open_userid）、自动生成默认名片。
- 从企业微信工作台打开小程序并**展示成功**。

**MVP 达成判据（单条闭环）**：一个真实企业完成授权 → 一名员工被识别 → 一张名片生成 → 微信内分享 → 客户打开并保存电话，全链路 demo 通过。验收见 §23。

**⚠️ 前置并行轨（日历时间约束，第一天启动）**

企业微信服务商注册、第三方应用创建、小程序与应用关联、指令/数据回调与权限申请均有**审核周期**，非写完代码即可用。此轨与编码并行推进，否则 MVP 的企业微信部分会被行政流程卡住。清单见 §31.1。

**阶段细化（MVP 之后按阶段叠加）**

- 阶段一 身份与后台：一人多企业身份切换、企业后台完善、字段规则、模板管理。
- 阶段二 客户联系：见下方“第二阶段增强”清单。
- 阶段三 商业化与增强：见下方“第三阶段”清单。

第二阶段增强：

- 企业微信客户联系“联系我”。
- 新客户欢迎语。
- unionid / external_userid 映射。
- pending_id 后续关联。
- 客户来源追踪。
- 接口调用许可管理。

第三阶段再考虑：

- 纸质名片 OCR。
- 客户名片夹。
- 跟进记录。
- 客户标签。
- CRM 对接。
- 销售线索分配。

---

## 2. 角色定义

### 2.1 平台方 / 服务商

即本系统运营方。负责：

- 维护微信小程序主体。
- 维护企业微信第三方应用。
- 维护多租户 SaaS 后台。
- 接收企业授权。
- 管理接口调用许可。
- 保障租户数据隔离。

### 2.2 企业租户

即购买或授权使用本系统的企业。每个企业租户对应一条 tenant 数据。

企业租户可以：

- 授权第三方应用。
- 设置应用可见范围。
- 配置名片字段规则。
- 配置品牌模板。
- 管理员工名片。
- 查看本企业统计数据。

### 2.3 企业管理员

企业管理员负责本企业配置与审核。

可操作：

- 查看本企业员工。
- 启用或停用员工名片。
- 设置模板。
- 设置哪些字段允许员工编辑。
- 设置手机号、邮箱、个人微信、企业微信二维码等字段的展示规则。
- 查看访问统计。
- 配置客户联系能力。

### 2.4 员工

员工是名片拥有者。一个自然人可能拥有多个企业员工身份。

例如：

- 张三 / A 公司 / 品牌顾问。
- 张三 / B 公司 / 合伙人。
- 张三 / C 协会 / 理事。

员工可以：

- 打开自己的名片。
- 编辑允许编辑的字段。
- 选择当前企业身份。
- 分享指定企业名片。
- 生成名片海报。
- 查看自己的访问数据。

### 2.5 客户 / 访客

客户可能只是微信用户，不一定是企业微信客户。

客户可以：

- 查看名片。
- 保存到通讯录。
- 拨打电话。
- 复制电话或邮箱。
- 查看公司官网、案例、地图、预约链接。
- 可选添加企业微信。
- 可选授权微信身份，用于更准确的客户追踪。
- 可选表达“我也想要名片”意向：**不直接建卡**，而是留资并引导其企业接入（引流留资，见 §7.4）。

---

## 3. 总体架构

```text
微信小程序
  ├─ 员工端
  ├─ 客户端
  └─ 企业微信环境兼容层 wx.qy.*

企业微信第三方应用
  ├─ 企业授权
  ├─ 成员身份识别
  ├─ 客户联系权限
  ├─ 欢迎语能力
  ├─ external_userid 映射
  └─ 接口调用许可

SaaS 后端
  ├─ Auth Service
  ├─ Tenant Service
  ├─ Member Identity Service
  ├─ Card Service
  ├─ Template Service
  ├─ Contact Way Service
  ├─ Customer Mapping Service
  ├─ Stats Service
  ├─ License Service
  ├─ Callback Service
  └─ Admin API

基础设施
  ├─ PostgreSQL（企业级，见 §3.1）
  ├─ Redis
  ├─ 对象存储（腾讯云 COS）
  ├─ 消息队列（BullMQ / Redis）
  ├─ 日志系统
  ├─ 监控告警
  └─ CDN
```

### 3.1 技术栈（已选定，单一事实源见 §33）

后端：**Node.js 20 LTS + TypeScript + NestJS（选定）**。

- 选型理由：与微信小程序 / 管理后台同语言，**跨端共享 TypeScript 类型**（§24 `packages/shared-types` 成立）；异步 I/O 契合大量企业微信 API / 回调 / token / 队列的 I/O 密集负载；NestJS 模块化天然映射 §3 的 11 个逻辑模块。
- **不采用** Java / Go（团队不熟、无全栈类型共享优势）、Python（后端与前端语言割裂、无法共享类型；OCR 等走云 API 与后端语言无关，不构成理由）。
- 完整工程决策（ORM、队列、存储、鉴权、测试、部署等）见 §33，开发细节文档与进度以 §33 为准，**不再在实现期重新选型**。

> ⚠️ 架构粒度（审计补充 A3-2）：§3 列出的 11 个 Service 是**逻辑模块**，M1–M4 以**模块化单体（modular monolith）单部署**落地，不在 MVP 阶段拆成 11 个可独立部署的微服务。待流量与团队规模上来后，再按 Callback / Stats 等高吞吐模块优先拆分。过早微服务化会拖垮并行小组的交付节奏。

数据库：**PostgreSQL 14+（选定，面向企业级）**。

- 选型理由：原生**行级安全（RLS）**天然支撑多租户隔离（§16.1）；`JSONB` 高效存储与索引；可空列**部分唯一索引**（`WHERE col IS NOT NULL`）干净解决 unionid/open_userid 等“允许多空、非空唯一”的约束；`TIMESTAMPTZ` 统一 UTC 时区；强约束与事务能力更适合企业数据。
- 版本建议 PostgreSQL 14+。
- 强烈建议所有业务表带 tenant_id，并对租户数据启用 RLS。
- 本文档所有 DDL 以 PostgreSQL 方言为准，约定见 §15.0。

缓存：**Redis（选定，客户端 ioredis）**。

- 用于缓存 suite_access_token、provider_access_token、企业 access_token、jsapi_ticket、短期登录态、限流计数、token 刷新分布式锁。

对象存储：**腾讯云 COS（选定）**。

- 存储头像、Logo、模板背景、名片海报、分享封面图。
- 与微信生态同厂、便于合规与 CDN；接入统一封装，不直连多云 SDK。

消息队列：**BullMQ（基于 Redis，选定）**。

- 处理通讯录同步、海报生成、统计聚合、客户映射重试、回调异步任务、欢迎语高优先级投递。
- MVP 阶段复用 Redis，不额外引入 RabbitMQ / Kafka；高吞吐再评估拆分。

---

## 4. 核心设计原则

### 4.1 微信优先，企业微信增强

不要把客户体验绑死在企业微信上。

正确体验：

```text
客户微信收到名片
→ 打开小程序
→ 查看名片
→ 保存电话 / 拨打电话
→ 可选添加企业微信
```

不要设计成：

```text
客户打开名片
→ 必须授权
→ 必须加企业微信
→ 才能看联系方式
```

这样会降低转化。

### 4.2 人可以打通，企业身份必须隔离

同一个自然人可以拥有多家企业身份，但每个企业身份独立。

```text
account：自然人账号
  ├─ member_identity：A 企业身份
  │    └─ card：A 企业名片
  ├─ member_identity：B 企业身份
  │    └─ card：B 企业名片
  └─ member_identity：C 组织身份
       └─ card：C 组织名片
```

不要把名片直接挂在自然人账号上。名片必须挂在企业身份上。

### 4.3 所有客户关系按企业隔离

同一个微信客户可能同时是 A 企业客户和 B 企业客户。

```text
visitor_account：微信访客
  ├─ A 企业 external_userid
  └─ B 企业 external_userid
```

A 企业不能看到客户在 B 企业的关系数据。

### 4.4 不自动合并身份

禁止仅凭姓名、手机号、邮箱自动合并自然人身份。

允许：

- 同一微信 unionid 主动确认绑定。
- 手机号短信验证后主动确认绑定。

不允许：

- 姓名相同自动合并。
- 邮箱相同自动合并。
- 通讯录字段相似自动合并。

---

## 5. 身份模型

### 5.1 身份类型

系统需要同时处理五种身份：

1. 平台自然人账号 account。
2. 企业租户 tenant。
3. 企业员工身份 member_identity。
4. 企业名片 card。
5. 客户访客 visitor_account / tenant_external_customer。

### 5.2 自然人账号 account

代表平台中“这个人”。通常由微信 unionid 识别。

```text
accounts
- id
- wx_unionid
- primary_wx_openid
- nickname
- avatar
- phone_hash
- status
- created_at
- updated_at
```

**⚠️ unionid 获取前置条件（审计 D-P0-1）**

`wx.login` → code2session 只保证返回 `openid` 与 `session_key`；`unionid` 仅在以下条件满足时才返回：

- 小程序已绑定到微信开放平台（open.weixin.qq.com）账号下，且
- 该用户曾在同一开放平台主体下的任一小程序 / 公众号有过授权 / 关注记录。

因此 `wx_unionid` 允许为空，account 识别必须有 **openid-only 降级路径**：

- 若拿不到 unionid，先以 `primary_wx_openid` 建立临时 account。
- 后续该用户在同主体下产生 unionid 时，再做 openid → unionid 归并（主动确认，不自动合并，见 §4.4）。
- 一人多企业身份绑定（§5.5）在 openid-only 状态下降级为「单端可用」，待 unionid 到位后补全跨端。

**⚠️ 昵称 / 头像 / 手机号获取方式（审计 D-P1-6）**

- `getUserProfile` 自 2022 年起不再返回真实昵称 / 头像；应改用「头像昵称填写能力」（`open-type="chooseAvatar"` + `type="nickname"` 的 input）让用户主动填写，`nickname` / `avatar` 由用户输入而非接口获取。
- `getPhoneNumber` 为**付费能力**，且必须由 `button open-type="getPhoneNumber"` 触发；`phone_hash` 仅在用户主动授权手机号后写入。基础名片体验不得强依赖手机号授权。

### 5.3 企业租户 tenant

代表一个授权企业。

```text
tenants
- id
- open_corpid
- corp_name
- suite_id
- permanent_code_encrypted
- auth_status
- auth_time
- cancel_auth_time
- created_at
- updated_at
```

注意：

- permanent_code 必须加密存储。
- open_corpid / corp_id 以企业微信第三方应用实际返回为准。
- 不同企业的数据必须完全隔离。

### 5.4 企业员工身份 member_identity

代表某人在某企业里的员工身份。

```text
member_identities
- id
- tenant_id
- open_corpid
- userid
- open_userid
- name
- avatar
- department_json
- position
- mobile_encrypted
- email_encrypted
- status
- license_type
- created_at
- updated_at
```

唯一键建议：

```text
UNIQUE(tenant_id, userid)
UNIQUE(tenant_id, open_userid)
```

**⚠️ 主键选择（审计 D-P1-3）**：第三方应用在多数权限组合下**只能拿到 `open_userid`**，明文 `userid` 需要企业授予通讯录权限（自建应用场景）。因此：

- 以 `open_userid` 作为成员在本系统的**主稳定标识**，`UNIQUE(tenant_id, open_userid)` 为强约束。
- `userid` 允许为空，仅在有通讯录权限时补齐；唯一性用 PostgreSQL 部分唯一索引 `... WHERE userid IS NOT NULL`，天然允许多个 NULL（DDL 见 §15）。
- 回调、登录态、绑定关系一律以 `open_userid` 关联，避免因 `userid` 缺失断链。

### 5.5 自然人与企业身份绑定

这是“一人多企业”的关键。

```text
account_identity_bindings
- id
- account_id
- tenant_id
- member_identity_id
- bind_method
- verified_at
- is_default
- last_used_at
- created_at
```

一个 account 可以绑定多个 member_identity。

### 5.6 名片 card

名片属于企业身份，不直接属于自然人。

```text
cards
- id
- tenant_id
- member_identity_id
- public_id          -- 全局唯一公开 ID，用于所有公网分享（审计 A2-P0-1）
- slug               -- 企业内自定义短名，仅租户内唯一
- card_type          -- primary / recruiting / event / sales，MVP 仅 primary（审计 A2-P1-8）
- display_name
- title
- phone_encrypted
- email_encrypted
- wechat_id_encrypted
- intro
- tags_json
- links_json         -- 仅允许 https，入库审核，见 §11.4（审计 A2-P1-12）
- template_id
- privacy_json
- contact_way_config_id
- status
- created_at
- updated_at
```

唯一键建议：

```text
UNIQUE(public_id)                       -- 全局唯一，公网定位
UNIQUE(tenant_id, slug)                 -- 租户内短名
UNIQUE(member_identity_id, card_type)   -- 一身份每类型一张，MVP 即一张 primary
```

**⚠️ 为什么需要 public_id（审计 A2-P0-1）**：`slug` 仅在租户内唯一，但公开接口 `GET /api/public/cards/{...}` 与分享链接在打开时**没有 tenant 上下文**，若只用 slug 会跨租户撞名、查错或被迫全表扫描破坏隔离。因此所有公网分享一律用全局唯一、不可枚举的 `public_id`（如 `pub_8k3h29x2`，非自增），`slug` 只留企业内部使用。

### 5.7 客户访客 visitor_account

代表微信侧访客。

```text
visitor_accounts
- id
- wx_openid
- wx_unionid
- nickname
- avatar
- created_at
- updated_at
```

### 5.8 企业外部联系人映射

代表某个微信访客在某个企业下对应的 external_userid 或 pending_id。

```text
tenant_external_customers
- id
- tenant_id
- visitor_account_id
- external_userid
- pending_id
- source_card_id
- source_member_identity_id
- status
- mapped_at
- created_at
- updated_at
```

唯一键建议：

```text
UNIQUE(tenant_id, external_userid)
UNIQUE(tenant_id, pending_id)
```

---

## 6. 员工使用流程

### 6.1 员工从企业微信打开

```text
员工在企业微信工作台打开小程序
→ 小程序判断当前环境为企业微信
→ 调用 wx.qy.login
→ 后端换取企业成员身份
→ 定位 tenant + member_identity
→ 若没有名片则自动创建默认名片
→ 若没有绑定 account，则提示绑定微信账号
→ 进入“我的名片”
```

默认身份规则：

- 从 A 企业微信打开，就默认 A 企业身份。
- 即使用户在微信侧默认身份是 B 企业，也不能覆盖企业微信当前上下文。

### 6.2 员工从普通微信打开

```text
员工在微信打开小程序
→ 调用 wx.login
→ 后端 code2session 获取 openid（unionid 可能为空，见 §5.2）
→ 优先用 unionid 查找 account；unionid 为空时用 openid 查找
→ 查询绑定的所有 member_identity
→ 如果只有一个身份，直接进入该身份名片
→ 如果有多个身份，显示身份选择器
→ 若 openid 尚未绑定任何 member_identity，引导绑定（§6.1 末步）
```

注意：unionid 缺失时只能看到「当前 openid 已绑定」的身份；跨端完整身份列表需 unionid 到位后补全。

身份选择体验（审计补充 A3-6）：多身份时默认进入 `account_preferences.last_member_identity_id`（无则 `default_member_identity_id`），选择器仅在用户主动切换时展示，不每次强弹。默认身份唯一性由 `account_preferences` 表保证，见 §15.3。

身份选择器示例：

```text
请选择要使用的名片：

[桂林某某品牌设计有限公司]
张三｜品牌顾问

[深圳某某科技有限公司]
张三｜联合创始人

[某某行业协会]
张三｜理事
```

### 6.3 员工分享名片

分享必须指向具体 card，且**只暴露全局 public_id 与不可枚举的 share_id**，不暴露任何内部自增 ID（审计 A2-P0-2）。

正确：

```text
/pages/card/detail?card=pub_8k3h29x2&share=shr_a9K2mQ
```

错误：

```text
/pages/card/detail?account=1001
/pages/card/detail?card=8k3h29&from=identity_1024&channel=wx_session
```

原因：

- 一个自然人可能有多张名片，客户打开后不能猜 → 必须带 `public_id`。
- `from=identity_1024` 这类参数**暴露内部 member_identity_id、可枚举**，且客户端可随意篡改 `from` / `channel`，会污染来源统计、误导销售归因（与 §17.3「不暴露自增 ID」自相矛盾）。
- 正确做法：来源由服务端签发 `share_id`（见 §15.3 `card_shares` 表），服务端凭 `share` 反查真实来源身份与渠道；客户端提交的 `channel` 仅作辅助，不作可信来源。

**⚠️ 分享矩阵（审计补充 A3-7 / A3-8）**：小程序卡片**不能直接分享到朋友圈**，需覆盖多渠道：

| 渠道 | 机制 | 备注 |
|------|------|------|
| 微信会话 / 群 | `onShareAppMessage`，携带 `card` + `share` | 标题/封面按名片个性化（姓名+公司） |
| 朋友圈 | 小程序码海报图片 | 小程序不能直接转发朋友圈，只能发海报 |
| 复制链接 / 短信 / 邮件 | H5 兜底页 `https://card.example.com/c/{public_id}` | 见 §30；微信内引导打开小程序 |
| 线下 / 展会 | 海报小程序码 | scene 见下 |

海报小程序码的 `scene` 参数**上限 32 字符**，不能塞 `card:{id}:member:{id}:channel:{}:nonce:{}` 长串；`scene` 只放短 `share_id`，服务端反查完整上下文。

二次转发（A3-9）：客户再转发时生成派生 `share_id`（记录 `parent_share_id`），保持归因链完整，避免来源丢失。

---

## 7. 客户访问流程

### 7.1 匿名访问

```text
客户打开小程序名片
→ 不强制登录
→ 展示公开字段
→ 记录匿名访问
```

可用动作：

- 保存到通讯录。
- 拨打电话。
- 复制电话。
- 复制邮箱。
- 查看官网。
- 查看案例。
- 导航。
- 保存海报。
- 分享名片。

### 7.2 授权微信身份后访问

```text
客户点击需要身份的动作，例如收藏、留言、预约
→ 请求微信授权
→ 获取 openid / unionid
→ 创建 visitor_account
→ 记录访问与动作
```

注意：

- 查看名片和保存电话不应强制授权。
- 访客昵称 / 头像若需展示，须走「头像昵称填写能力」由访客主动填写，不再依赖 `getUserProfile`（审计 D-P1-6）。
- 任何身份授权动作前必须弹出**个人信息处理告知**（用途、范围、留存期限），见 §26 合规章。

### 7.3 可选添加企业微信

```text
客户点击“添加企业微信”
→ 显示该员工对应的联系我二维码或按钮
→ 客户主动添加
→ 企业微信推送添加客户事件（add_external_contact，含 welcome_code）
→ 后端回调同步阶段仅快速返回，welcome_code 投递高优先级队列
→ 欢迎语 worker 尽快发送（见下时间约束）
→ 尝试建立 external_userid 映射
```

**⚠️ 欢迎语 welcome_code 约束（审计 A2-P1-1）**：

- `welcome_code` 有效期约 **20 秒**且**一次性**，必须走高优先级队列，worker 目标 < 3s 完成，> 10s 告警。
- 若企业**管理端已配置欢迎语**，回调不返回 welcome_code——此时不发，记录原因，不报错。
- 无 welcome_code 的其它原因（权限不足 / 非本应用可见范围）分别记录。
- 发送必须幂等：同一 welcome_code 只尝试一次，失败记 errcode，不在有效窗口外重试。

### 7.4 引流留资（“我也想要名片”，增长漏斗）

客户看到别人的名片时，可能希望自己也拥有。**本产品是 B2B 企业名片 SaaS，不支持路人自助建卡**（避免破坏 §4.2 企业身份绑定与 UGC 审核成本）。因此该入口做成**引流留资**，而非直接生成名片。

```text
客户在名片页点“我也想要名片”
→ 记录意向，按 share_id 归因到来源名片 / 员工（转介绍归因）
→ 可选留资：企业名、联系人、联系方式（须走 §26 告知同意）
→ 写入平台增长漏斗 growth_leads（平台级，见 §15.3）
→ 平台 / 销售跟进，引导其企业走 M0 企业微信授权成为租户
→ 不直接建卡，不创建租户，不产生个人名片
```

隔离要求：`growth_leads` 是**平台级**数据，仅记录来源归因（referrer_tenant_id / referrer_card_id）用于转介绍统计，**不得**作为来源企业的客户数据展示给其它租户；来源员工可见“我带来了 N 个意向”这类聚合，不见对方隐私明细。

定位：该功能不进 MVP（M1 专注企微闭环），列为**阶段二+ 增长功能**，实现轻量、零架构冲击。若未来改做“个人名片双形态平台”，再另行评估（当前不做）。

---

## 8. 企业微信第三方应用接入

### 8.1 服务商侧准备

需要准备：

- 企业微信服务商账号。
- 第三方应用。
- 微信小程序主体。
- 小程序与第三方应用关联。
- **两个独立回调 URL**（审计 D-P0-3）：
  - **指令回调 URL**：接收 suite_ticket 推送、企业授权 / 变更 / 取消授权等**套件级**事件。
  - **数据回调 URL**：接收各授权企业的通讯录变更、客户添加 / 删除、欢迎语等**企业级**消息。
  - 两者各有独立的 Token 与 EncodingAESKey，验签 / 解密不可混用。
- SuiteID。
- SuiteSecret。
- 权限范围配置。

> ⚠️ 小程序与企业微信第三方应用建议置于**同一微信开放平台主体**下，否则 §10 的 unionid → external_userid 映射无法打通（审计 D-P0-5）。

### 8.2 企业授权流程

```text
企业管理员进入授权链接
→ 确认授权第三方应用
→ 选择可见范围
→ 企业微信回调授权事件
→ 平台获取 auth_code
→ 平台换取 permanent_code
→ 创建 tenant
→ 保存授权应用信息
→ 初始化企业配置
```

保存内容：

- open_corpid。
- corp_name。
- permanent_code_encrypted。
- agent_id。
- 权限范围。
- 可见成员 / 部门。
- 授权状态。

### 8.3 suite_ticket 与 Token 缓存

**⚠️ suite_ticket 是第三方应用一切 token 的起点（审计 D-P0-2）**

- 企业微信每约 10 分钟向**指令回调 URL** 推送一次 `suite_ticket`。
- 收到后立即解密并写入 Redis（如 `wecom:suite_ticket`，TTL 略大于 30 分钟做兜底）。
- `suite_access_token` = f(suite_id, suite_secret, **suite_ticket**)；没有最新 suite_ticket 就换不到 suite_access_token，第三方应用授权链路整体不可用。
- 服务冷启动若 Redis 无 suite_ticket，需等待下一次推送或走「主动触发」预案，并对该状态告警。

需要缓存：

- suite_ticket（来源：指令回调推送）。
- suite_access_token（依赖 suite_ticket）。
- provider_access_token。
- 企业 access_token（每个 tenant 一份，依赖 permanent_code + suite_access_token）。
- jsapi_ticket。
- agent_jsapi_ticket。

缓存策略：

- Redis 保存，key 按 tenant / 类型分离。
- 过期前提前刷新（如剩余 1/5 有效期触发）。
- 刷新失败时保留旧 token 短时间兜底。
- 不允许把 access_token 返回给小程序前端。

**⚠️ 刷新并发控制（审计 D-P1-4）**：token 刷新必须加**分布式锁 / 单飞（singleflight）**，避免多实例同时刷新导致互相失效：

- 刷新前 `SET lock NX PX <ttl>` 抢锁；抢不到的实例读旧值或短暂等待重试。
- 刷新成功后统一写回并释放锁。
- 企业微信侧 token 有并发失效风险，务必串行化每个 (tenant, token 类型) 的刷新。

### 8.4 回调事件

**指令回调 URL**（套件级）处理：

- suite_ticket 推送。
- 授权成功（create_auth）。
- 授权变更（change_auth）。
- 取消授权（cancel_auth）。

**数据回调 URL**（企业级）处理：

- 通讯录成员变更（change_contact：create_user / update_user / delete_user / 部门变更）。
- 客户添加事件（add_external_contact）。
- 客户删除事件（del_external_contact）。
- 欢迎语相关事件。

回调安全要求：

- 校验签名（各回调用各自 Token / EncodingAESKey）。
- 解密消息。
- **幂等处理**：以事件唯一标识去重，落地去重表（见下）。
- 快速返回（同步阶段仅验签 + 入库 + 返回 success，5s 内）。
- 耗时逻辑放入队列异步处理。

**⚠️ 幂等落地设计（审计 D-P1-2）**：企业微信会重推回调，必须有去重表。

```text
callback_events
- id
- source            -- command | data
- event_key         -- 幂等键：优先 msg_id；无则 hash(corpid+event+changetype+时间戳+关键字段)
- tenant_id         -- 套件级事件可为空
- event_type
- change_type
- payload_encrypted
- status            -- received | processing | done | failed
- retry_count
- received_at
- processed_at
UNIQUE(event_key)
```

处理流程：先按 `event_key` 尝试插入（冲突即视为重复，直接返回 success），再投递队列；消费端按 `status` 推进并支持重试。

---

## 9. 客户联系能力设计

### 9.1 联系我配置

每个员工可以有一个或多个联系我配置。

**⚠️ 配置策略：禁止「每次访问动态创建」（审计 A2-P0-3）**

企业微信「联系我」config 有**数量上限**，config_id 需持久保存（丢失可能无法编辑/删除），临时会话模式还有**每日数量限制**。若为每次分享/每张海报/每次点击动态建 config，会迅速撑爆配额并造成运维灾难。策略如下：

```text
默认 per_member_static：每个员工每个渠道最多一个长期 contact_way（名片页“添加企业微信”按钮用）。
活动 per_campaign_static：每个活动/海报/展会渠道一个 contact_way（线下物料、投放用）。
临时 temp_session：仅强来源追踪/短期活动/单人接待，必须经过配额检查（§15.3 api_quota_counters）。
```

对应约束：`UNIQUE(tenant_id, member_identity_id, strategy, channel)` 保证静态配置不重复生成（DDL 见 §15.3）。

```text
contact_ways
- id
- tenant_id
- member_identity_id
- config_id
- qr_code
- state
- type
- scene
- is_temp
- expires_at
- status
- created_at
- updated_at
```

使用场景：

- 名片详情页添加企业微信。
- 名片海报二维码。
- 客户添加后欢迎语来源追踪。

### 9.2 state 设计

state 用于追踪来源。

**⚠️ state 必须是短 opaque token，不能是结构化长串（审计 A2-P0-3 / A3-8）**：

```text
state = cwst_x7K2pQ9a        -- 不透明短 token
```

不要把 `card:{card_id}:member:{member_identity_id}:...` 这类明文结构直接传给企业微信——它会**暴露内部 ID**，且海报小程序码 `scene` 上限 32 字符也放不下。服务端用短 token 反查下表：

存储映射：

```text
contact_way_states
- id
- tenant_id
- state
- card_id
- member_identity_id
- channel
- scene
- expires_at
- created_at
```

### 9.3 没有客户联系权限时

如果企业未授权客户联系权限，或员工没有互通许可：

- 隐藏“添加企业微信”按钮。
- 保留保存电话、拨打电话、复制邮箱、查看官网等基础动作。
- 后台提示企业管理员开通增强能力。

---

## 10. unionid / external_userid 映射

### 10.1 映射目标

当客户在微信小程序打开名片，并且系统获取到客户 unionid 后，可以尝试在当前企业租户下映射 external_userid。

结果可能有三种：

1. 返回 external_userid：说明客户已经是该企业的外部联系人。
2. 返回 pending_id：说明暂时不是客户，后续添加企业微信后可关联。
3. 无法映射：缺少权限、缺少 unionid、企业未认证、未授权客户联系能力等。

### 10.2 映射原则

- external_userid 必须按 tenant_id 存储。
- 不允许跨企业复用 external_userid。
- pending_id 也必须按 tenant_id 存储。
- 映射失败不影响客户查看名片。

**⚠️ 映射前置条件矩阵（审计 D-P0-5）**：unionid → external_userid 接口对以下条件**缺一即恒失败**，M4 排期前必须逐项确认：

| 前置条件 | 缺失后果 | 降级 |
|----------|----------|------|
| 企业已完成企业微信认证 | 接口无权限 | 隐藏加企微入口，仅走基础名片 |
| 企业已开通 / 授权客户联系能力 | 接口无权限 | 同上 |
| 小程序与第三方应用在同一微信开放平台主体绑定 | 拿不到可用 unionid | 只记 visitor_account，不做映射 |
| 成功获取到访客 unionid | 无入参 | 记 openid，待 unionid 到位重试 |
| 员工具备互通 / 接口调用许可 | 接口无权限 | 隐藏该员工加企微入口 |

任一不满足时，映射流程静默降级并记日志，**绝不阻塞客户查看名片与保存电话**。

### 10.3 映射流程

```text
客户打开 A 企业员工名片
→ 小程序获取客户 openid / unionid
→ 后端创建 visitor_account
→ 判断 A 企业是否具备客户联系权限
→ 调用 unionid 转 external_userid 接口
→ 如果返回 external_userid，保存到 tenant_external_customers
→ 如果返回 pending_id，保存 pending 状态
→ 如果失败，仅记录日志
```

### 10.4 同一客户访问多个企业名片

```text
visitor_account_9001
  ├─ tenant_A external_userid_A
  └─ tenant_B external_userid_B
```

平台可在内部知道是同一个微信访客，但企业后台只能看到本企业下的数据。

---

## 11. 名片详情页设计

### 11.1 信息结构

第一屏：

- 头像。
- 姓名。
- 职位。
- 公司名。
- 部门。
- 品牌背景。
- 核心标签。

主操作：

- 保存到通讯录。
- 拨打电话。

辅助操作：

- 复制电话。
- 复制邮箱。
- 查看官网。
- 查看案例。
- 导航到公司。
- 添加企业微信。
- 保存海报。
- 转发名片。

### 11.2 按钮优先级

推荐顺序：

```text
[保存到通讯录] [拨打电话]
添加企业微信
查看案例 / 官网 / 导航 / 保存海报
```

原因：

- 客户收到名片时，最自然的动作是保存联系方式。
- 不要把“加企业微信”做成唯一目标。
- 先满足客户的轻量需求，再温和引导建立企业微信关系。

### 11.3 字段隐私

每张名片有 privacy_json。**⚠️ 默认保守（审计 A2-P1-5，升 P0）**：手机号等高敏字段默认**不**展示，避免试用期投诉与合规问题。

```json
{
  "show_mobile": false,
  "show_email": true,
  "show_wechat_id": false,
  "show_wecom_contact": false,
  "show_address": true
}
```

企业管理员可以设置全局规则：

- 是否允许展示手机号。
- 是否允许展示个人微信。
- 是否允许员工自定义头像。
- 是否需要审核后发布。
- 是否允许外部访问名片。

**⚠️ 展示优先级（审计 A2-P1-5）**——企业规则是硬边界，员工不能自行放开企业禁用的字段：

```text
最终展示 = 企业字段规则允许
        AND 员工名片 privacy_json 允许
        AND 字段本身存在
        AND 名片状态 active
```

企业禁用某字段时，员工端只显示“企业不允许展示”，无法自行打开。任何返回该字段的接口（含 §14.3 `/vcard`）都必须走同一套判定。

### 11.4 链接字段安全（审计 A2-P1-12）

`links_json`（官网、案例、预约等）是员工可填内容，属品牌与平台审核风险面，必须约束：

- 只允许 `https://`，入库时解析协议，拒绝 `javascript:`、`data:`、明文 `http`。
- 后台维护企业级**允许域名白名单**；小程序内跳转外部网页需符合业务域名配置。
- 禁止未展开的短链域名，或要求展开后审核。
- `links_json` 每条增加 `review_status`（pending / approved / rejected），未通过不对外展示。

---

## 12. 小程序页面规划

### 12.1 员工端页面

```text
/pages/employee/index
我的名片首页

/pages/employee/identity-switch
身份切换

/pages/employee/edit
编辑名片

/pages/employee/share
分享名片

/pages/employee/poster
名片海报

/pages/employee/stats
访问统计

/pages/employee/bind
绑定微信账号
```

### 12.2 客户端页面

```text
/pages/card/detail
名片详情

/pages/card/poster
名片海报

/pages/card/company
公司介绍

/pages/card/cases
案例列表

/pages/card/contact
添加企业微信 / 联系我
```

### 12.3 管理端页面

管理端建议使用 Web 后台，而不是强行塞进小程序。

```text
/admin/login
管理员登录

/admin/dashboard
数据看板

/admin/tenants
租户管理，平台方可见

/admin/members
员工管理

/admin/cards
名片管理

/admin/templates
模板管理

/admin/fields
字段规则

/admin/contact-way
客户联系配置

/admin/licenses
接口许可管理

/admin/audit-logs
操作日志
```

---

## 13. 后端模块设计

### 13.1 Auth Service

负责：

- 微信小程序 wx.login 登录。
- 企业微信 wx.qy.login 登录。
- session_key 处理。
- account 创建与绑定。
- 登录态签发。
- 身份切换。

### 13.2 Tenant Service

负责：

- 企业授权。
- permanent_code 加密保存。
- 企业状态管理。
- 企业配置初始化。
- 授权变更处理。

### 13.3 Member Identity Service

负责：

- 成员身份识别。
- 通讯录同步。
- 一人多企业身份绑定。
- 离职状态处理。
- 员工许可状态维护。

通讯录同步细节（审计 D-P1-7）：

- **权限依赖**：需企业授权通讯录读取范围；无权限时仅能拿到登录换取的 open_userid，做「按需建档」。
- **全量 + 增量**：授权成功后拉一次全量；之后由数据回调 `change_contact` 事件驱动增量。
- **change_type 分支**：`create_user` 建档并生成默认名片；`update_user` 更新资料（尊重字段编辑权限）；`delete_user` 置员工为离职、停用其名片但保留历史统计。
- **部门变更**：`create_party` / `update_party` / `delete_party` 更新 `department_json`。
- **离职处理**：离职后名片停用、加企微入口隐藏，external_userid 归属按平台规则处理（可迁移 / 冻结），不得跨租户外泄。

### 13.4 Card Service

负责：

- 创建默认名片。
- 编辑名片。
- 字段权限校验。
- 名片公开访问。
- slug 生成。
- 名片状态管理。

### 13.5 Template Service

负责：

- 企业品牌模板。
- 部门模板。
- 默认模板。
- Logo / 色彩 / 背景图。

### 13.6 Contact Way Service

负责：

- 生成联系我配置。
- 保存 config_id。
- 维护二维码。
- 处理 state。
- 判断客户联系权限。

### 13.7 Customer Mapping Service

负责：

- visitor_account 创建。
- unionid / external_userid 映射。
- pending_id 保存。
- 客户添加后关联。
- 客户来源追踪。

### 13.8 Stats Service

负责：

- 访问记录。
- 动作记录。
- 分享记录。
- 员工统计。
- 企业统计。
- 数据聚合。

### 13.9 License Service

负责：

- 基础账号。
- 互通账号。
- 员工许可状态。
- 套餐能力判断。
- 到期提醒。

### 13.10 Callback Service

负责：

- 企业微信回调验签。
- 消息解密。
- 事件路由。
- 幂等处理。
- 异步队列投递。

---

## 14. API 草案

### 14.1 登录相关

```text
POST /api/auth/wx-login
普通微信小程序登录

POST /api/auth/qy-login
企业微信小程序登录

POST /api/auth/bind-account
绑定自然人账号与企业员工身份

GET /api/auth/identities
获取当前 account 绑定的企业身份列表

POST /api/auth/switch-identity
切换当前企业身份
```

### 14.2 员工名片

```text
GET /api/employee/cards/current
获取当前身份名片

PUT /api/employee/cards/current
更新当前身份名片

POST /api/employee/cards/current/poster
生成名片海报

GET /api/employee/cards/current/stats
查看当前名片统计
```

### 14.3 客户访问

```text
GET /api/public/cards/{public_id}
公开读取名片；仅返回按 §11.3 隐私判定后的公开字段
首次加载同时下发 visit_token（短期有效，服务端签发）

POST /api/public/cards/{public_id}/visit
记录访问；请求携带 share（来源归因由服务端反查，见 §6.3）

POST /api/public/cards/{public_id}/actions
记录动作（save_phone/call_phone/copy_email/add_wecom）
必须携带 visit_token；按 visit_id + action_type 短时幂等

GET /api/public/cards/{public_id}/vcard
生成通讯录 vCard；⚠️ 只输出隐私开关允许的字段，
show_mobile=false 时 vCard 不得包含手机号（审计 A3-3）
```

**⚠️ 埋点可信度（审计 A2-P1-10）**：公开接口无登录，客户端可伪造动作刷统计。所有公开路由改用 `public_id`（非租户内 slug，见 §5.6），并：

- 详情页首次加载下发服务端签发的 `visit_token`，动作上报必须携带。
- 统计标注 `trust_level`：`anonymous_client` / `session_verified` / `wecom_callback_verified`。
- 只有企业微信回调产生的“客户添加成功”才计入**强可信转化**。统计口径见 §32。

### 14.4 客户联系

```text
GET /api/contact-way/cards/{card_id}
获取该名片的联系我配置

POST /api/contact-way/cards/{card_id}/refresh
刷新联系我二维码

POST /api/customer-mapping/map
尝试 unionid / external_userid 映射
```

### 14.5 企业后台

```text
GET /api/admin/members
员工列表

GET /api/admin/cards
名片列表

PUT /api/admin/cards/{id}/status
启用 / 停用名片

GET /api/admin/templates
模板列表

POST /api/admin/templates
创建模板

PUT /api/admin/settings/fields
更新字段规则

GET /api/admin/stats/overview
企业统计概览
```

---

## 15. 数据库核心表 DDL 草案

以下为草案（**PostgreSQL 方言**），实际开发时按迁移工具细化。

### 15.0 PostgreSQL 约定

- 主键：`BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY`（草案中用 `BIGSERIAL` 简写，生产按 IDENTITY 落地）。
- 时间：一律 `TIMESTAMPTZ`，以 **UTC** 存储（呼应 §15.2）。
- 结构化字段：`JSONB`（非 `JSON`）。
- 布尔：`BOOLEAN`（非 `TINYINT`）。
- 唯一约束：表内 `CONSTRAINT uk_x UNIQUE (...)`；**可空列的唯一性**用部分唯一索引 `CREATE UNIQUE INDEX uk_x ON t (col) WHERE col IS NOT NULL`，天然允许多个 NULL 且非空唯一。
- 普通索引：单独 `CREATE INDEX idx_x ON t (...)`（PG 不支持 MySQL 的内联 `KEY`）。
- 多租户：对含 `tenant_id` 的表启用 RLS（§16.1），策略 `USING (tenant_id = current_setting('app.tenant_id')::bigint)`。
- 加密字段 `*_encrypted` 用 `BYTEA` 或 `TEXT`（信封加密密文），可检索副本用 `*_hash`（§15.2）。

```sql
CREATE TABLE accounts (
  id BIGSERIAL PRIMARY KEY,
  wx_unionid VARCHAR(128),
  primary_wx_openid VARCHAR(128),
  nickname VARCHAR(128),
  avatar TEXT,
  phone_hash VARCHAR(128),
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
-- unionid 允许多空、非空唯一
CREATE UNIQUE INDEX uk_accounts_unionid ON accounts (wx_unionid) WHERE wx_unionid IS NOT NULL;
```

```sql
CREATE TABLE tenants (
  id BIGSERIAL PRIMARY KEY,
  open_corpid VARCHAR(128) NOT NULL,
  corp_name VARCHAR(255),
  suite_id VARCHAR(128) NOT NULL,
  permanent_code_encrypted TEXT NOT NULL,
  auth_status VARCHAR(32) NOT NULL DEFAULT 'active',
  auth_time TIMESTAMPTZ,
  cancel_auth_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT uk_tenants_open_corpid UNIQUE (open_corpid)
);
```

```sql
CREATE TABLE member_identities (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  open_corpid VARCHAR(128) NOT NULL,
  userid VARCHAR(128),
  open_userid VARCHAR(128),
  name VARCHAR(128),
  avatar TEXT,
  department_json JSONB,
  position VARCHAR(128),
  mobile_encrypted TEXT,
  email_encrypted TEXT,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  license_type VARCHAR(32),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_member_tenant ON member_identities (tenant_id);
-- userid / open_userid 允许多空、非空唯一（第三方应用常仅有 open_userid，见 §5.4）
CREATE UNIQUE INDEX uk_member_userid ON member_identities (tenant_id, userid) WHERE userid IS NOT NULL;
CREATE UNIQUE INDEX uk_member_open_userid ON member_identities (tenant_id, open_userid) WHERE open_userid IS NOT NULL;
```

```sql
CREATE TABLE account_identity_bindings (
  id BIGSERIAL PRIMARY KEY,
  account_id BIGINT NOT NULL,
  tenant_id BIGINT NOT NULL,
  member_identity_id BIGINT NOT NULL,
  bind_method VARCHAR(32) NOT NULL,
  verified_at TIMESTAMPTZ,
  is_default BOOLEAN NOT NULL DEFAULT false,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT uk_account_identity UNIQUE (account_id, member_identity_id)
);
CREATE INDEX idx_binding_account ON account_identity_bindings (account_id);
CREATE INDEX idx_binding_tenant ON account_identity_bindings (tenant_id);
```

```sql
CREATE TABLE cards (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  member_identity_id BIGINT NOT NULL,
  slug VARCHAR(64) NOT NULL,
  display_name VARCHAR(128),
  title VARCHAR(128),
  phone_encrypted TEXT,
  email_encrypted TEXT,
  wechat_id_encrypted TEXT,
  intro TEXT,
  tags_json JSONB,
  links_json JSONB,
  template_id BIGINT,
  privacy_json JSONB,
  contact_way_config_id VARCHAR(128),
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT uk_cards_slug UNIQUE (tenant_id, slug),
  CONSTRAINT uk_cards_identity UNIQUE (member_identity_id)
);
CREATE INDEX idx_cards_tenant ON cards (tenant_id);
-- 注：public_id / card_type 由 §15.3 迁移追加
```

```sql
CREATE TABLE visitor_accounts (
  id BIGSERIAL PRIMARY KEY,
  wx_openid VARCHAR(128),
  wx_unionid VARCHAR(128),
  nickname VARCHAR(128),
  avatar TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_visitor_unionid ON visitor_accounts (wx_unionid);
CREATE INDEX idx_visitor_openid ON visitor_accounts (wx_openid);
-- 注：appid 与去重唯一约束由 §15.3 迁移追加
```

```sql
CREATE TABLE tenant_external_customers (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  visitor_account_id BIGINT,
  external_userid VARCHAR(128),
  pending_id VARCHAR(128),
  source_card_id BIGINT,
  source_member_identity_id BIGINT,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  mapped_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
-- external_userid / pending_id 允许多空、按租户非空唯一
CREATE UNIQUE INDEX uk_external_user ON tenant_external_customers (tenant_id, external_userid) WHERE external_userid IS NOT NULL;
CREATE UNIQUE INDEX uk_pending_id ON tenant_external_customers (tenant_id, pending_id) WHERE pending_id IS NOT NULL;
CREATE INDEX idx_external_visitor ON tenant_external_customers (visitor_account_id);
```

```sql
CREATE TABLE card_visits (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  card_id BIGINT NOT NULL,
  member_identity_id BIGINT NOT NULL,
  visitor_account_id BIGINT,
  external_userid VARCHAR(128),
  pending_id VARCHAR(128),
  channel VARCHAR(64),
  scene VARCHAR(64),
  user_agent TEXT,
  ip_hash VARCHAR(128),
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_visit_card ON card_visits (tenant_id, card_id);
CREATE INDEX idx_visit_member ON card_visits (tenant_id, member_identity_id);
CREATE INDEX idx_visit_created ON card_visits (created_at);
```

```sql
CREATE TABLE card_actions (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  card_id BIGINT NOT NULL,
  member_identity_id BIGINT NOT NULL,
  visitor_account_id BIGINT,
  action_type VARCHAR(64) NOT NULL,
  external_userid VARCHAR(128),
  pending_id VARCHAR(128),
  channel VARCHAR(64),
  scene VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_action_card ON card_actions (tenant_id, card_id);
CREATE INDEX idx_action_type ON card_actions (tenant_id, action_type);
CREATE INDEX idx_action_created ON card_actions (created_at);
-- 注：share_id / visit_id / trust_level 由 §15.3 迁移追加
```

### 15.1 补全表（审计 D-P1-1）

以下表在正文中被引用（§9 客户联系、§12.3 后台、§13 服务）但原 DDL 缺失，现补齐。

```sql
CREATE TABLE contact_ways (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  member_identity_id BIGINT NOT NULL,
  config_id VARCHAR(128),            -- 企业微信返回的 config_id
  qr_code TEXT,
  state VARCHAR(128),
  type VARCHAR(32),                  -- single / multi
  scene VARCHAR(32),                 -- 1 小程序 / 2 二维码
  is_temp BOOLEAN NOT NULL DEFAULT false,
  expires_at TIMESTAMPTZ,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_cw_tenant ON contact_ways (tenant_id);
CREATE INDEX idx_cw_member ON contact_ways (tenant_id, member_identity_id);
-- 注：strategy / campaign_id / quota_policy_json 与静态唯一约束由 §15.3 迁移追加
```

```sql
CREATE TABLE contact_way_states (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  state VARCHAR(128) NOT NULL,
  card_id BIGINT NOT NULL,
  member_identity_id BIGINT NOT NULL,
  channel VARCHAR(64),
  scene VARCHAR(64),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT uk_cws_state UNIQUE (tenant_id, state)
);
CREATE INDEX idx_cws_card ON contact_way_states (tenant_id, card_id);
```

```sql
CREATE TABLE templates (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  name VARCHAR(128) NOT NULL,
  scope VARCHAR(32) NOT NULL DEFAULT 'tenant',  -- tenant / department / default
  department_id VARCHAR(64),
  logo_url TEXT,
  color_scheme_json JSONB,
  background_url TEXT,
  layout_json JSONB,
  is_default BOOLEAN NOT NULL DEFAULT false,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_tpl_tenant ON templates (tenant_id);
```

```sql
CREATE TABLE licenses (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  member_identity_id BIGINT,           -- 空表示企业级套餐
  license_type VARCHAR(32) NOT NULL,   -- base / interflow / plan_basic / plan_wecom / plan_contact
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  activated_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_lic_tenant ON licenses (tenant_id);
CREATE INDEX idx_lic_member ON licenses (tenant_id, member_identity_id);
CREATE INDEX idx_lic_expire ON licenses (expires_at);
```

```sql
CREATE TABLE audit_logs (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT,                    -- 平台级操作可为空
  actor_type VARCHAR(32) NOT NULL,     -- platform_admin / tenant_admin / member / system
  actor_id BIGINT,
  action VARCHAR(64) NOT NULL,
  target_type VARCHAR(64),
  target_id VARCHAR(64),
  detail_json JSONB,
  ip_hash VARCHAR(128),
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_audit_tenant ON audit_logs (tenant_id, created_at);
CREATE INDEX idx_audit_action ON audit_logs (action);
```

`callback_events`（回调幂等去重表）DDL 见 §8.4。

### 15.2 通用字段规范（审计 D-P1-5）

所有业务表统一追加以下字段与约定，本节 DDL 为简洁未逐一展开：

- `deleted_at TIMESTAMPTZ`（可空）：软删除；所有查询默认 `WHERE deleted_at IS NULL`。PIPL 删除权（§26）与误删恢复都依赖软删除。
- `created_by` / `updated_by BIGINT`（可空）：操作人留痕，配合 `audit_logs`。
- 时间统一用 `TIMESTAMPTZ` 以 **UTC** 存储，展示层按企业时区转换。
- 所有含 PII 的加密字段（`*_encrypted`）采用信封加密（KMS 数据密钥），并**额外保留可检索的 `*_hash`（HMAC）列**用于去重 / 精确匹配查询，避免「加密后无法查询」的矛盾（见 §17.1）。

### 15.3 v0.4 落地表与字段变更（审计 #02）

**cards 字段变更（A2-P0-1 / A2-P1-8）：**

```sql
ALTER TABLE cards
  ADD COLUMN public_id VARCHAR(32) NOT NULL,
  ADD COLUMN card_type VARCHAR(32) NOT NULL DEFAULT 'primary',
  ADD CONSTRAINT uk_cards_public_id UNIQUE (public_id),
  DROP CONSTRAINT uk_cards_identity,
  ADD CONSTRAINT uk_cards_identity_type UNIQUE (member_identity_id, card_type);
```

**分享归因表（A2-P0-2）：**

```sql
CREATE TABLE card_shares (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  card_id BIGINT NOT NULL,
  member_identity_id BIGINT NOT NULL,
  public_share_id VARCHAR(64) NOT NULL,   -- shr_xxx，对外
  parent_share_id VARCHAR(64),            -- 二次转发归因链（A3-9）
  channel VARCHAR(64),                    -- 服务端记录的可信渠道
  scene VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT uk_public_share_id UNIQUE (public_share_id)
);
CREATE INDEX idx_share_card ON card_shares (tenant_id, card_id);
CREATE INDEX idx_share_member ON card_shares (tenant_id, member_identity_id);
```

**联系我策略字段（A2-P0-3）：**

```sql
ALTER TABLE contact_ways
  ADD COLUMN strategy VARCHAR(32) NOT NULL DEFAULT 'per_member_static',
  ADD COLUMN channel VARCHAR(64),          -- 渠道，配合静态策略唯一约束（原基表无此列，此处补齐）
  ADD COLUMN campaign_id BIGINT,
  ADD COLUMN quota_policy_json JSONB,
  ADD CONSTRAINT uk_cw_static_member_channel UNIQUE (tenant_id, member_identity_id, strategy, channel);
```

**account openid 绑定与去重（A2-P1-2）：**

```sql
CREATE TABLE account_openid_bindings (
  id BIGSERIAL PRIMARY KEY,
  account_id BIGINT NOT NULL,
  appid VARCHAR(64) NOT NULL,
  openid VARCHAR(128) NOT NULL,
  unionid VARCHAR(128),
  bind_source VARCHAR(32) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT uk_app_openid UNIQUE (appid, openid)
);
CREATE INDEX idx_unionid ON account_openid_bindings (unionid);
```

account 合并规则：自动合并仅允许同一 `appid + openid`；unionid 冲突进入待合并队列，由用户确认或客服审核；合并需迁移 `account_identity_bindings`、登录态、偏好并留 audit log。

**visitor 去重（A2-P1-3）：**

```sql
ALTER TABLE visitor_accounts
  ADD COLUMN appid VARCHAR(64) NOT NULL,
  ADD CONSTRAINT uk_visitor_app_openid UNIQUE (appid, wx_openid);
-- unionid 允许多空、非空唯一
CREATE UNIQUE INDEX uk_visitor_unionid ON visitor_accounts (wx_unionid) WHERE wx_unionid IS NOT NULL;
```

**默认身份唯一性（A2-P1-4）：**

```sql
CREATE TABLE account_preferences (
  account_id BIGINT PRIMARY KEY,
  default_member_identity_id BIGINT,
  last_member_identity_id BIGINT,
  updated_at TIMESTAMPTZ NOT NULL
);
```

**租户管理员（A2-P1-6）：**

```sql
CREATE TABLE tenant_admins (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  member_identity_id BIGINT,
  open_userid VARCHAR(128),
  role VARCHAR(32) NOT NULL,          -- owner / admin / operator / auditor
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE UNIQUE INDEX uk_tenant_admin_user ON tenant_admins (tenant_id, open_userid) WHERE open_userid IS NOT NULL;
```

管理端登录：企业管理员优先企业微信扫码 / OAuth 登录；平台管理员独立后台账号 + MFA；第一版不做纯密码式企业管理员登录。

**客户归属（A2-P1-7）：**

```sql
CREATE TABLE tenant_customer_owners (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  tenant_external_customer_id BIGINT NOT NULL,
  owner_member_identity_id BIGINT,
  source_member_identity_id BIGINT,
  status VARCHAR(32) NOT NULL DEFAULT 'active',  -- active / pending_transfer
  assigned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_owner_member ON tenant_customer_owners (tenant_id, owner_member_identity_id);
```

员工离职：名片停用、contact_way 停用、历史统计保留、客户所有权进入 `pending_transfer` 等待企业管理员或企业微信继承结果，**不自动跨企业迁移客户**。

**接口配额计数（A2-P1-9，提前到 M3 前置）：**

```sql
CREATE TABLE api_quota_counters (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL DEFAULT 0,   -- 0 = 平台级，避免 NULL 破坏唯一去重
  api_name VARCHAR(128) NOT NULL,
  window_type VARCHAR(32) NOT NULL,      -- minute / hour / day / month
  window_start TIMESTAMPTZ NOT NULL,
  count_used BIGINT NOT NULL DEFAULT 0,
  limit_value BIGINT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT uk_quota_window UNIQUE (tenant_id, api_name, window_type, window_start)
);
```

企业微信 API 调用前先走本地 quota guard；接近阈值降级，不让客户链路报错；429 / 限频类 errcode 走指数退避。

**suite 状态持久化（A2-P1-11）：**

```sql
CREATE TABLE wecom_suite_state (
  suite_id VARCHAR(128) PRIMARY KEY,
  suite_ticket_encrypted TEXT,
  suite_ticket_updated_at TIMESTAMPTZ,
  suite_access_token_encrypted TEXT,
  suite_access_token_expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL
);
```

冷启动先读 DB 中未过期 suite_ticket 加载到 Redis，过期才进入等待并告警（改进 §8.3 纯 Redis 方案）。

**card_actions 字段变更（A2-P1-10）：**

```sql
ALTER TABLE card_actions
  ADD COLUMN share_id VARCHAR(64),
  ADD COLUMN visit_id VARCHAR(64),
  ADD COLUMN trust_level VARCHAR(32) NOT NULL DEFAULT 'anonymous_client';
-- visit_id 存在时按 (visit_id, action_type) 幂等
CREATE UNIQUE INDEX uk_action_idem ON card_actions (visit_id, action_type) WHERE visit_id IS NOT NULL;
```

**引流留资（§7.4，平台级增长漏斗）：**

```sql
CREATE TABLE growth_leads (
  id BIGSERIAL PRIMARY KEY,
  source_type VARCHAR(32) NOT NULL DEFAULT 'card_referral',
  referrer_tenant_id BIGINT,                 -- 来源名片所属企业，仅平台可见
  referrer_card_id BIGINT,
  referrer_member_identity_id BIGINT,
  share_id VARCHAR(64),                       -- 转介绍归因
  visitor_account_id BIGINT,
  contact_name VARCHAR(128),
  contact_phone_encrypted TEXT,
  contact_company VARCHAR(255),
  intent VARCHAR(64) DEFAULT 'want_own_card',
  status VARCHAR(32) NOT NULL DEFAULT 'new', -- new / contacted / converted / dropped
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_lead_referrer ON growth_leads (referrer_tenant_id, referrer_card_id);
CREATE INDEX idx_lead_status ON growth_leads (status);
```

> `growth_leads` 属平台方，不进任何租户的客户数据视图；来源员工只见聚合转介绍数，不见他人隐私明细。

---

## 16. 权限与数据隔离

### 16.1 多租户访问控制

所有后台查询必须带 tenant_id。

```text
WHERE tenant_id = 当前管理员所属企业
```

**⚠️ 隔离必须在数据层强制，不能靠开发自觉（审计补充 A3-4）**：仅靠人工在每条 SQL 写 `WHERE tenant_id` 迟早会漏。要求：

- ORM 层注入**全局租户 scope**（如请求上下文自动追加 tenant 条件），默认拒绝无 tenant 上下文的业务查询。
- 启用 PostgreSQL **行级安全（RLS）** 作为第二道防线（策略见 §15.0），应用连接注入 `app.tenant_id`。
- 编写自动化越权测试（§20.3）在 CI 常态运行，任何跨租户读写立即失败并告警。

禁止：

- 通过 account_id 查询跨企业身份后展示给企业管理员。
- 给企业管理员显示员工绑定了哪些其他企业。
- 给企业管理员显示同一客户在其他企业的访问数据。

### 16.2 平台管理员权限

平台管理员可以查看租户列表和系统运维信息，但也应分级：

- 超级管理员。
- 客服运营。
- 技术运维。
- 只读审计。

敏感数据默认脱敏。

### 16.3 员工权限

员工只能管理自己绑定的企业身份名片。

员工在 A 企业身份下不能编辑 B 企业名片。

### 16.4 客户隐私

客户不登录也能查看公开名片。

客户授权后记录 openid / unionid，但需要：

- 明示授权用途。
- 可删除或匿名化数据。
- 不把客户跨企业关系暴露给任一企业。

---

## 17. 安全设计

### 17.1 密钥管理

必须加密保存：

- permanent_code。
- suite_secret。
- 企业 access_token 不落库，只缓存。
- 手机号。
- 邮箱。
- 个人微信号。

方案（选定）：

- **腾讯云 KMS 信封加密**：KMS 托管主密钥（CMK），数据密钥加密字段，密文与 `*_hash`（HMAC 可检索）落库（§15.2）。
- 主密钥不导出明文，密钥分环境（dev/staging/prod）管理。
- 应用层只做信封封装，不自建密钥体系；密钥、密文严禁提交到 GitHub。

### 17.2 回调安全

企业微信回调必须：

- 校验 msg_signature。
- 校验 timestamp / nonce。
- 解密消息。
- 幂等处理。
- 记录回调日志。
- 异常告警。

### 17.3 接口安全

- 后端接口统一鉴权。
- 管理后台接口校验 tenant_id。
- 公共名片接口只返回公开字段。
- 限流防刷。
- 分享 slug 不使用自增 ID。
- 上传文件校验类型和大小。
- 海报生成防止 SSRF。

### 17.4 日志脱敏

日志不得明文输出：

- access_token。
- permanent_code。
- 手机号。
- 邮箱。
- 微信号。
- external_userid 全量值。

---

## 18. 接口调用许可与套餐分层

建议产品套餐拆成三层。

### 18.1 名片基础版

能力：

- 小程序名片。
- 分享名片。
- 保存电话。
- 拨打电话。
- 名片海报。
- 基础访问统计。

不依赖客户联系权限。

### 18.2 企业微信员工版

能力：

- 企业授权。
- 企业微信工作台入口。
- 企业微信员工身份识别。
- 员工资料同步。
- 企业后台管理。

需要关注基础账号 / 接口调用许可。

### 18.3 客户联系增强版

能力：

- 添加企业微信。
- 联系我二维码。
- 新客户欢迎语。
- unionid / external_userid 映射。
- pending_id 追踪。
- 客户来源统计。

需要关注互通账号 / 客户联系权限。

---

里程碑遵循 §1.2 的“垂直切片优先”：M1 就是打通闭环并 demo 成功的 MVP（含首个企业微信对接），M2 起在已打通的骨架上按阶段做深做宽。

### M0（前置并行轨）：企业微信 / 小程序平台接入

目标：解除日历时间卡点，与 M1 编码并行。

包含：

- 企业微信服务商注册、第三方应用创建。
- 小程序主体认证、类目、与第三方应用关联。
- 指令回调 / 数据回调 URL、Token、EncodingAESKey、权限范围申请。
- 找到一家试点企业作为首个授权对象。

判据：具备可授权的第三方应用与可用回调环境（清单见 §31.1）。

### M1：闭环骨架 MVP（微信级别 + 首个企业微信对接并展示成功）

目标：一次打通最小闭环并 demo 成功；同时把多租户地基一次到位，杜绝后期返工。

包含：

- 多租户数据地基：tenant / account / member_identity / card / binding，全表 tenant_id + 隔离中间件与数据层强制（§16.1）。
- 微信小程序名片：详情页、编辑、模板、保存通讯录、拨打、分享（会话/群/海报小程序码）、海报、基础统计（public_id / share_id）。
- 企业微信首个对接：suite_ticket → permanent_code → 建 tenant；wx.qy.login 识别 open_userid；自动建默认名片；工作台打开展示成功。

验收（见 §23 单条闭环判据）：

- 一家真实企业完成授权并成为 tenant。
- 员工从企业微信工作台打开，自动识别并生成默认名片。
- 员工在微信内分享名片，客户打开并保存电话。
- 跨租户隔离测试通过（A 企业看不到 B 企业数据）。

### M2：身份与后台细化

目标：完善 SaaS 管理面与多身份体验。

包含：

- 一人多企业身份切换、身份选择器默认（§6.2）。
- 企业后台完善、字段规则、模板管理。
- 通讯录增量同步、授权变更 / 取消授权处理（§13.3）。
- 租户管理员与角色（§15.3 tenant_admins）。

### M3：客户联系增强

目标：打通企业微信客户链路。

包含：

- 联系我配置（策略见 §9.1）、添加企业微信按钮。
- 客户添加回调、欢迎语 welcome_code 调度（§7.3）。
- unionid / external_userid 映射、pending_id 关联、客户来源统计。
- 接口配额 guard（§15.3 api_quota_counters）。

验收：

- 客户可从名片添加企业微信并收到欢迎语。
- 系统记录客户来源名片，区分 external_userid 与 pending_id。

### M4：CRM 增强

目标：向名片全能王 / 轻 CRM 靠近。

包含：

- 客户名片夹、纸质名片 OCR、客户标签、跟进记录、线索导出、销售看板。
- 多场景名片（§5.6 card_type：recruiting / event / sales）。

---

## 20. 测试计划

### 20.1 功能测试

- 员工创建名片。
- 员工编辑字段。
- 企业字段规则限制。
- 小程序分享。
- 保存到通讯录。
- 拨打电话。
- 名片海报生成。
- 多身份切换。
- 企业后台启用 / 停用名片。

### 20.2 企业微信测试

- 企业授权成功。
- 企业取消授权。
- wx.qy.login 成功。
- 员工不在可见范围内。
- access_token 过期刷新。
- 通讯录同步。
- 客户联系权限缺失。
- 接口调用许可缺失。

### 20.3 多租户测试

- A 企业管理员不能访问 B 企业员工。
- A 企业名片不能使用 B 企业模板。
- 同一自然人绑定多企业身份。
- 同一客户访问多个企业名片。
- external_userid 按 tenant 隔离。

### 20.4 安全测试

- slug 枚举防护。
- 越权访问测试。
- 回调签名伪造测试。
- 上传文件安全测试。
- 敏感字段脱敏测试。
- 日志敏感信息泄露测试。

### 20.5 性能测试

- 名片详情页高并发访问。
- 海报生成并发。
- 回调队列堆积。
- 统计写入压力。
- token 刷新竞争。

---

## 21. GitHub Issue 拆分建议

### Epic 1：小程序名片基础能力

- [ ] 搭建小程序项目结构。
- [ ] 实现名片详情页。
- [ ] 实现保存通讯录。
- [ ] 实现拨打电话。
- [ ] 实现小程序分享参数。
- [ ] 实现名片海报生成。
- [ ] 实现访问与动作埋点。

### Epic 2：多租户与身份模型

- [ ] 设计 tenant 表。
- [ ] 设计 account 表。
- [ ] 设计 member_identity 表。
- [ ] 设计 account_identity_binding 表。
- [ ] 实现身份选择器。
- [ ] 实现 tenant_id 权限中间件。
- [ ] 编写越权访问测试。

### Epic 3：企业微信第三方应用

- [ ] 配置服务商第三方应用。
- [ ] 实现授权回调。
- [ ] 实现 permanent_code 加密保存。
- [ ] 实现企业 access_token 缓存。
- [ ] 实现 wx.qy.login 后端换取身份。
- [ ] 实现通讯录同步任务。
- [ ] 实现取消授权处理。

### Epic 4：客户联系增强

- [ ] 实现联系我配置生成。
- [ ] 实现名片添加企业微信按钮。
- [ ] 实现客户添加回调。
- [ ] 实现欢迎语发送。
- [ ] 实现 unionid / external_userid 映射。
- [ ] 实现 pending_id 保存和后续关联。
- [ ] 实现客户来源统计。

### Epic 5：后台管理

- [ ] 实现企业后台登录。
- [ ] 实现员工列表。
- [ ] 实现名片列表。
- [ ] 实现模板管理。
- [ ] 实现字段规则管理。
- [ ] 实现统计看板。
- [ ] 实现接口许可状态展示。

---

## 22. 风险清单

### 22.1 权限风险

企业微信权限复杂，不同企业的认证状态、客户联系权限、接口调用许可不同。

应对：

- 能力分层。
- 缺权限时降级。
- 基础名片功能不依赖客户联系。

### 22.2 客户体验风险

如果强制客户授权或添加企业微信，会降低使用率。

应对：

- 查看名片不强制授权。
- 保存电话为主按钮。
- 添加企业微信作为可选动作。

### 22.3 多身份混乱风险

一个人多个企业身份，如果设计不清晰，会导致分享错名片。

应对：

- 分享路径必须携带 card_id。
- 小程序首页提供身份选择器。
- 企业微信上下文优先当前企业身份。

### 22.4 数据串租户风险

多租户 SaaS 最大风险是数据串租户。

应对：

- 所有业务表带 tenant_id。
- 所有管理端查询强制 tenant_id。
- 编写自动化越权测试。
- 日志审计。

### 22.5 敏感信息风险

手机号、邮箱、微信号、客户 external_userid 都属于敏感数据。

应对：

- 加密存储。
- 展示开关。
- 日志脱敏。
- 员工确认后展示。

---

## 23. MVP 验收清单

MVP（M1 闭环骨架）达成时，应满足**单条端到端闭环全部打通**（对应 §1.2 / §19 M1）：

**企业微信对接（首个闭环，MVP 必含）**

- [ ] 一家真实企业完成第三方应用授权并成为 tenant（suite_ticket → permanent_code）。
- [ ] 员工从企业微信工作台打开小程序，经 wx.qy.login 自动识别（open_userid）。
- [ ] 新员工自动生成默认名片，工作台打开展示成功。

**微信名片（微信级别）**

- [ ] 名片有全局唯一 public_id，公网可唯一定位。
- [ ] 员工可在微信内分享名片，来源由 share_id 归因。
- [ ] 客户可微信打开名片（小程序卡片 / 海报小程序码），不登录也能看公开字段。
- [ ] 客户可保存电话到通讯录、拨打电话。
- [ ] 名片海报可生成；基础访问统计带 visit_token 与 trust_level。
- [ ] 敏感字段有展示开关，手机号默认不展示。

**多租户地基（一次到位）**

- [ ] 全表带 tenant_id，管理端查询数据层强制隔离。
- [ ] A 企业看不到 B 企业数据（越权测试通过）。

> 一人多企业身份切换、企业后台完善、客户联系 / 欢迎语 / 映射、CRM 等按 §19 M2–M4 分阶段验收，不纳入 MVP 判据。

---

## 24. 推荐仓库结构

```text
business-card-saas/
  README.md
  docs/
    wecom-business-card-saas-dev-doc.md
    api.md
    database.md
    wecom-integration.md
    mini-program-pages.md
  apps/
    mini-program/
    admin-web/
    api-server/
  packages/
    shared-types/
    ui/
  infra/
    docker/
    k8s/
  scripts/
  tests/
```

---

## 25. 研发启动建议

采用“垂直切片优先”：所有小组共同瞄准 M1 闭环骨架，而不是各做各的横向层。四条并行线：

0. **平台接入线（前置并行轨，第一天启动）**：企业微信服务商 / 第三方应用 / 回调 / 权限申请、小程序认证与关联（§31.1）。有审核周期，最先动。
1. **小程序体验组**：名片详情页、保存通讯录、分享（会话/群/海报小程序码）、海报。
2. **平台架构组**：多租户地基、account、member_identity、card、public_id/share_id、权限中间件与数据层隔离。
3. **企业微信对接组**：第三方应用授权、suite_ticket、wx.qy.login、工作台入口——目标是**首个企业授权 + 员工识别 + 展示成功**这条闭环，而非一次做全客户联系与许可。

关键：**M1 就把企业微信首个对接打通并 demo 成功**（企业授权是价值前提与最高风险项，必须早验证），多租户地基一次到位杜绝返工；一人多企业、客户联系、欢迎语、映射、CRM 等广度/深度按 §19 M2–M4 分阶段叠加。这样既尽早暴露企业微信集成风险，也能让领导看到一个“真企业授权 → 员工名片 → 微信分享 → 客户保存”的完整闭环原型。

---

## 26. 合规与个人信息保护（PIPL）（审计 D-P0-4）

本系统处理手机号、邮箱、微信号、客户 external_userid、访客行为埋点等个人信息，面向中国境内企业运营，**必须满足《个人信息保护法》(PIPL) 与微信 / 企业微信平台规范**，否则不可上线。

### 26.1 告知与同意

- 首次收集前弹出**个人信息处理告知**：处理者、目的、种类、留存期限、对外提供情况、拒绝的影响。
- 敏感个人信息（手机号等）需**单独、明确**同意，不得默认勾选。
- 平台方（服务商）与企业租户的角色需在协议中界定：多数场景平台为**受托处理方**，企业为个人信息处理者。

### 26.2 数据主体权利

- 提供**查询 / 更正 / 删除 / 导出**入口（访客与员工）。
- 删除依赖 §15.2 软删除 + 定期物理清理 / 匿名化。
- 员工离职、企业取消授权后，按约定时限清理或匿名化对应个人信息。

### 26.3 留存与最小化

- 定义各类数据留存期限（如访问日志 N 个月、埋点聚合后清明细）。
- 只收集名片分发所必需字段，非必要不收集。
- 跨企业隔离在合规上等同「不同处理者」，严禁跨租户画像（呼应 §4.3 / §16）。

### 26.4 出境与第三方

- 若使用境外云 / SDK，需评估数据出境合规。
- 第三方 SDK 清单与其收集的个人信息需登记并在隐私政策披露。

### 26.5 合规验收清单

- [ ] 隐私政策 / 用户协议已上线并可在小程序内查看。
- [ ] 敏感信息单独同意弹窗。
- [ ] 数据主体删除 / 导出功能可用。
- [ ] 留存期限策略与自动清理任务落地。
- [ ] 第三方 SDK 与数据出境登记完成。

---

## 27. 可观测性与 SLO（审计 D-P2-2）

原 §3 仅列「监控告警」一行，此处细化。

### 27.1 三大信号

- **指标（Metrics）**：QPS、P95/P99 延迟、错误率、队列积压、token 刷新成功率、回调处理时延、映射成功率。
- **日志（Logging）**：结构化日志，脱敏（见 §17.4），带 trace_id / tenant_id。
- **链路（Tracing）**：小程序 → 网关 → 服务 → 企业微信接口全链路串联。

### 27.2 关键 SLO（建议初值）

- 名片详情页公开读取可用性 ≥ 99.9%，P95 < 300ms。
- 回调同步返回 < 3s（企业微信要求 5s 内）。
- token 刷新失败率 < 0.1%，失败即告警。

### 27.3 关键告警

- suite_ticket 超过 20 分钟未更新。
- 任一 tenant 的 access_token 连续刷新失败。
- 回调队列积压超阈值。
- 越权 / 跨租户访问被拦截（安全告警）。

---

## 28. API 规范补充（审计 D-P2-1）

§14 为接口草案，补充统一规范。

### 28.1 版本与路径

- 统一前缀 `/api/v1`，破坏性变更升 `/api/v2`。

### 28.2 统一响应与错误码

```json
{
  "code": 0,
  "message": "ok",
  "data": {},
  "trace_id": "..."
}
```

- `code = 0` 成功，非 0 为业务错误码；HTTP 状态码同时正确使用。
- 错误码分段：`1xxxx` 鉴权、`2xxxx` 参数、`3xxxx` 权限/租户、`4xxxx` 企业微信侧、`5xxxx` 系统。

### 28.3 分页与鉴权

- 列表接口统一 `page` / `page_size`（或 cursor），返回 `total`。
- 管理端接口一律经租户中间件注入并强制 `tenant_id`（§16.1）。
- 公开名片接口只返回公开字段并限流（§17.3）。

---

## 29. 审计对照表

本文档 v0.3 依据设计审计（`docs/audits/audit_01_dev-doc.md`）修订，逐条对照：

| 审计 ID | 级别 | 处理位置 | 状态 |
|---------|------|----------|------|
| D-P0-1 unionid 前置/降级 | P0 | §5.2, §6.2 | 已补 |
| D-P0-2 suite_ticket | P0 | §8.3 | 已补 |
| D-P0-3 指令/数据双回调 | P0 | §8.1, §8.4 | 已补 |
| D-P0-4 PIPL 合规 | P0 | §26 | 已补 |
| D-P0-5 映射前置条件 | P0 | §8.1, §10.2 | 已补 |
| D-P1-1 DDL 缺表 | P1 | §15.1 | 已补 |
| D-P1-2 回调幂等 | P1 | §8.4 | 已补 |
| D-P1-3 member 主键 | P1 | §5.4 | 已补 |
| D-P1-4 token 刷新锁 | P1 | §8.3 | 已补 |
| D-P1-5 软删除/审计字段 | P1 | §15.2 | 已补 |
| D-P1-6 昵称/手机号获取 | P1 | §5.2, §7.2 | 已补 |
| D-P1-7 通讯录同步 | P1 | §13.3 | 已补 |
| D-P2-1 API 规范 | P2 | §28 | 已补 |
| D-P2-2 可观测性 | P2 | §27 | 已补 |
| D-P2-3 备份/灾备 | P2 | — | 待实现阶段细化 |
| D-P2-4 海报生成/SSRF | P2 | §17.3 | 待实现阶段细化 |
| D-P2-5 接口配额管理 | P2 | §13.9 | 待实现阶段细化 |
| D-P2-6 测试 CI/覆盖率 | P2 | §20 | 待实现阶段细化 |
| D-P2-7 一身份一名片张力 | P2 | §5.6, §15.3 | 已补 card_type |

### 29.1 v0.4 对照（落地性审计 audit_02 + 交叉复核）

| 审计 ID | 级别 | 处理位置 | 状态 |
|---------|------|----------|------|
| A2-P0-1 public_id 唯一定位 | P0 | §5.6, §14.3, §15.3 | 已补 |
| A2-P0-2 share_id 归因/不暴露内部 ID | P0 | §6.3, §15.3 | 已补 |
| A2-P0-3 联系我配置策略/opaque token | P0 | §9.1, §9.2, §15.3 | 已补 |
| A2-P0-4 MVP 边界一致性 | P0 | §1.2, §19, §23, §25 | 已补（v0.4.1 改为垂直切片，MVP 含首个企微对接） |
| A2-P1-1 欢迎语 welcome_code 调度 | P1 | §7.3 | 已补 |
| A2-P1-2 account openid 唯一/合并 | P1 | §15.3 | 已补 |
| A2-P1-3 visitor 去重约束 | P1 | §15.3 | 已补 |
| A2-P1-4 默认身份唯一性 | P1 | §6.2, §15.3 | 已补 |
| A2-P1-5 隐私默认收紧+优先级（升 P0） | P0 | §11.3 | 已补 |
| A2-P1-6 tenant_admins | P1 | §15.3 | 已补 |
| A2-P1-7 客户归属模型 | P1 | §13.3, §15.3 | 已补 |
| A2-P1-8 card_type | P1 | §5.6, §15.3 | 已补 |
| A2-P1-9 配额前置到 M3 | P1 | §15.3 | 已补 |
| A2-P1-10 埋点 visit_token/trust_level | P1 | §14.3, §15.3 | 已补 |
| A2-P1-11 suite_ticket 落库 | P1 | §8.3, §15.3 | 已补 |
| A2-P1-12 links_json URL 安全 | P1 | §11.4 | 已补 |
| A2-P2-1 备份/灾备 RPO/RTO | P2 | §31 | 已补 |
| A2-P2-2 海报生成方案 | P2 | §31 | 已补 |
| A2-P2-3 上线前置清单 | P2 | §31 | 已补 |
| A2-P2-4 audit_logs 结构化 | P2 | §31 | 已补 |
| A2-P2-5 统计口径 | P2 | §32 | 已补 |
| A2-P2-6 环境与发布策略 | P2 | §31 | 已补 |
| A2-P2-7 H5 兜底页 | P2 | §30 | 已补 |
| A3-1 缓存/CDN 失效 | P1 | §32 | 已补 |
| A3-2 架构粒度（模块化单体） | P2 | §3 | 已补 |
| A3-3 vcard 隐私一致 | P1 | §14.3 | 已补 |
| A3-4 隔离数据层强制/RLS | P1 | §16.1 | 已补 |
| A3-5 授权失效/离职降级 UX | P1 | §30 | 已补 |
| A3-6 身份选择器默认 | P2 | §6.2 | 已补 |
| A3-7 分享矩阵（朋友圈/群） | P1 | §6.3, §30 | 已补 |
| A3-8 小程序码 scene 32 限制 | P1 | §6.3, §9.2 | 已补 |
| A3-9 二次转发归因 | P2 | §6.3, §15.3 | 已补 |

---

## 30. 分享与公开访问模型（审计 A2-P0-1/2、A3-5/7）

### 30.1 标识分层

- `public_id`：全局唯一、不可枚举，所有公网分享与公开接口的唯一入口。
- `slug`：仅租户内唯一，企业内部自定义短名，不用于公网定位。
- `share_id`：服务端签发的来源归因票据，客户端不可伪造；支持 `parent_share_id` 派生链。
- 内部自增 `id`、`member_identity_id` **绝不出现在任何对外 URL / state / scene**。

### 30.2 分享渠道矩阵

见 §6.3 表格：会话/群走 `onShareAppMessage`，朋友圈走海报小程序码，短信/邮件/浏览器走 H5 兜底页，线下走海报小程序码（scene 仅放短 share_id）。

### 30.3 H5 兜底页

```text
https://card.example.com/c/{public_id}
```

- 微信内打开：引导跳转小程序（主路径）。
- 普通浏览器打开：展示基础名片（公开字段 + 保存 vCard + 拨打），不含需授权动作。
- 遵守同一套隐私判定（§11.3）。

### 30.4 异常态与降级 UX（审计 A3-5）

客户打开旧分享链接时，服务端可能遇到名片停用 / 员工离职 / 企业取消授权，必须有友好态而非报错：

| 情况 | 展示 |
|------|------|
| 名片已停用 | “该名片已停用”，可选跳企业公开主页 |
| 员工离职 | “该员工已离开，可联系企业”，隐藏加企微入口 |
| 企业取消授权 | 保留基础名片只读，隐藏企业微信增强动作 |
| public_id 不存在 | 统一“名片不存在或已删除” |

---

## 31. 上线前置、发布与灾备（审计 A2-P2-1/2/3/4/6）

### 31.1 上线前置清单

- 小程序主体认证；类目适配（企业服务 / 效率 / 商业服务等需确认）。
- 服务器域名、业务域名、downloadFile 域名配置；HTTPS、ICP 备案、公安备案按域名要求处理。
- 隐私协议与用户协议上线（呼应 §26）。
- 企业微信服务商账号、第三方应用、指令/数据回调 URL、客户联系权限申请。
- 若用「联系我」按钮而非二维码，确认小程序插件接入要求。

### 31.2 环境与发布

- dev / staging / production 三套环境，企业微信回调 URL 分环境。
- 小程序体验版 / 预览版 / 正式版分离。
- 数据库迁移工具管理 schema 变更。
- 灰度发布与回滚；Feature flag 独立开关：`contact_way`、`welcome_msg`、`external_mapping`。

### 31.3 备份与灾备

```text
RPO：≤ 15 分钟        RTO：≤ 4 小时
数据库：每日全量 + 15 分钟增量 binlog
对象存储：版本控制 + 生命周期
密钥：KMS 托管，不导出明文
```

定期灾难恢复演练；版本回滚流程文档化。

### 31.4 海报生成

- M1 优先小程序端 Canvas 生成，减少服务端 SSRF 面。
- 服务端生成时只读对象存储白名单资源。
- 图片上传统一转码、压缩、去 EXIF。
- 生成任务幂等键 `card_id + template_id + version_hash`；配失败重试与死信队列。

### 31.5 审计日志结构化

`audit_logs.detail_json` 标准化，敏感字段只记 hash / 掩码：

```json
{ "before": {}, "after": {}, "reason": "", "request_id": "", "operator_ip_hash": "" }
```

---

## 32. 统计口径与缓存一致性（审计 A2-P2-5、A3-1）

### 32.1 统计口径定义

无统一口径，数据看板必然产生争议。定义：

```text
PV：每次名片页展示。
UV：同 openid / unionid / anonymous_fingerprint 去重访客。
保存电话：wx.addPhoneContact 成功回调才计 strong action。
拨打电话：点击拨号按钮，仅算意向动作。
添加企微：仅企业微信 add_external_contact 回调才算成功转化。
trust_level：anonymous_client < session_verified < wecom_callback_verified，看板按可信度分层展示。
```

### 32.2 缓存与 CDN 一致性（审计 A3-1）

名片公开读是最热路径，必须定义失效策略，避免员工改名片后 CDN 仍返回旧数据：

- `cards` 增加内容版本号 / `updated_at` 参与缓存 key 或 ETag。
- 名片编辑、停用、模板变更后**主动失效** CDN / 应用缓存对应 public_id。
- 公开读缓存设合理 TTL + 主动失效双保险；强一致字段（如停用状态）不长缓存。
- 海报等派生资源随 `version_hash` 变更失效。

---

## 33. 技术栈与工程决策（单一事实源）

**本章是技术选型的唯一事实源。** 每一项均为**已选定**，备选项已明确不采用。开发细节文档与进度排期以本表为准，**实现期不再重新选型、不再讨论备选**。若确需变更，走正式变更并更新本章版本号，不得在代码里各行其是。

### 33.1 决策表

| 关注点 | 选定 | 版本 / 说明 | 不采用（原因） |
|--------|------|-------------|----------------|
| 后端语言/运行时 | **Node.js + TypeScript** | Node 20 LTS，`strict` | Java/Go（团队不熟）、Python（前后端语言割裂、无共享类型） |
| 后端框架 | **NestJS** | 模块化映射 §3 逻辑模块 | Express 裸写、Koa（结构约束弱） |
| ORM / 迁移 | **Prisma** | 迁移用 Prisma Migrate；RLS 见 §33.2 | TypeORM、Drizzle |
| 数据校验 | **Zod**（`nestjs-zod`） | 与前端/小程序共享 schema，enum 作硬边界 | class-validator（不利跨端共享） |
| 数据库 | **PostgreSQL** | 14+，RLS 隔离（§16.1） | MySQL |
| 缓存 / 分布式锁 | **Redis** | 客户端 ioredis | Memcached |
| 消息队列 | **BullMQ**（基于 Redis） | 复用 Redis | RabbitMQ、Kafka（MVP 过重） |
| 对象存储 | **腾讯云 COS** | 统一封装接入 | 阿里云 OSS、AWS S3 |
| 密钥 / 加密 | **腾讯云 KMS 信封加密** | 见 §17.1 / §15.2 | 自建密钥体系 |
| 管理后台 | **React + TypeScript + Vite + Ant Design** | 后台组件生态成熟 | Vue、Angular |
| 小程序 | **原生微信小程序 + TypeScript** | 需兼容 `wx.qy.*`，避免跨端编译风险 | Taro、uni-app |
| 鉴权 / 会话 | **JWT 接入令牌 + Redis 登录态** | 平台管理员额外 MFA（§15.3） | 纯 session cookie |
| 可观测性 | **OpenTelemetry + Prometheus + Grafana**；日志 **pino** | 落云日志 / ELK，脱敏（§17.4） | 自研埋点 |
| 测试 | **Jest + Supertest**（后端）、**Playwright**（后台 E2E） | 覆盖率门槛见 §20 | Mocha、Vitest（后端） |
| 包管理 / Monorepo | **pnpm workspaces + Turborepo** | 对齐 §24 结构 | npm/yarn、Nx |
| 容器 / 编排 | **Docker**（dev/staging）→ **Kubernetes**（prod） | 灰度与回滚见 §31.2 | 裸机部署 |
| CI/CD | **GitHub Actions** | 越权测试常态化（§16.1） | Jenkins |
| 代码规范 | **ESLint + Prettier + commitlint + husky** | 提交前钩子 | 无 |
| 后端形态 / 托管 | **自建服务（NestJS）+ PostgreSQL**；低运维可选**腾讯云 云托管(CloudRun) + 云数据库 PostgreSQL** | 不改技术栈、不锁 BaaS | **不采用微信云开发**（云函数+文档型云数据库）：对企业微信服务端/多租户关系型核心/管理后台无加成，且厂商锁定、按读写次数计费在名片裂变热读场景下成本不可控 |

### 33.2 关键实现约定（消除歧义）

- **RLS 与 Prisma**：每个请求在事务内 `SET LOCAL app.tenant_id = <当前租户>`，RLS 策略 `USING (tenant_id = current_setting('app.tenant_id')::bigint)`（§15.0）。租户上下文由鉴权中间件注入，禁止业务代码手写 `WHERE tenant_id`。
- **企业微信加解密**：统一封装 `wecom-crypto`（AES-256-CBC + PKCS7 + msg_signature 校验），指令/数据回调各用各自 Token/AESKey（§8.1）。
- **ID 生成**：内部主键 `BIGSERIAL`；对外 `public_id` / `share_id` / `state` 用不可枚举短 token（如 nanoid，带前缀 `pub_` / `shr_` / `cwst_`），绝不暴露自增 ID（§30.1）。
- **配置与密钥**：`.env` 分环境，密钥走 KMS / 密钥管理服务注入，不入库不入仓。
- **时间**：全链路 UTC（`TIMESTAMPTZ`），展示层转企业时区。

### 33.3 版本

- 决策版本：v1（随文档 v0.4.3）。变更需在此登记。
