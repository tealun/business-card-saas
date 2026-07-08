# Audit #07 — 九维度开发文档复审

日期：2026-07-02
审计对象：`docs/` 文档体系 v0.4.7（Audit #06 修复落地后）
审计维度：**项目开发架构 / 平台对接 / 安全防护 / 代码高效 / 运行流畅 / 信息隔离 / 数据准确 / 参数传递 / 用户体验**
审计范围：`00_01` / `00_02` / `01_01`–`01_04` / `02_00` / `02_01` / `03_01` / 两级 README / 最新审计报告。
结论先行：未发现新的 P0。#06 的关键修复总体有效；本轮发现 **4 个 P1、5 个 P2**，并已全部修入文档事实源。核心修复集中在 RLS 上下文、访客身份边界、匿名 UV 参数契约、阶段门槛拆分。

---

## 1. 发现清单

### A7-P1-1（信息隔离 × 安全防护）：`visitor_accounts` 存 PII，但既不在 RLS 说明中，也不在平台表访问策略中

**位置**：`00_01` §5.7 / §15（`visitor_accounts` 含 `wx_openid`、`wx_unionid`、昵称、头像）、`00_02` §2。

**证据**：

- `00_01` §5.7 定义 `visitor_accounts` 代表微信侧访客，并包含 `wx_openid` / `wx_unionid` / `nickname` / `avatar`。
- `00_02` §2 只写“所有含 `tenant_id` 的表启用 RLS”，平台/跨租户表清单列了 `audit_logs`、`api_quota_counters`、`growth_leads`、`callback_events`、`wecom_suite_state`、`accounts`、`admin_claim_tokens`，但没有 `visitor_accounts`。
- `visitor_accounts` 本身不含 `tenant_id`，因此不会被“所有含 tenant_id 的表”覆盖；又不是无 PII 的公开目录表。

**影响**：实现者可能把 `visitor_accounts` 当普通平台表随手查，导致一个微信访客跨企业访问轨迹、openid/unionid、头像昵称被企业后台或排障接口串出。这和 §4.3“客户关系按企业隔离”、§16.4“客户隐私”冲突。

**建议**：在 `00_02` §2 单独增加“访客身份平台敏感表”策略：`visitor_accounts` 不按租户 RLS，但只能在“当前访客上下文”或平台脱敏运维中访问；租户侧只能经 `tenant_external_customers` / `card_visits` 的本租户关联视图看必要投影，不能直接查全局访客主档。

---

### A7-P1-2（信息隔离）：`account_preferences` 的 `current_setting('app.account_id')` 缺 `missing_ok=true`

**位置**：`00_01` §15.4，`00_02` §2。

**证据**：

- #06 已把 tenant RLS 统一为 `current_setting('app.tenant_id', true)`，无上下文时默认拒绝。
- 但 `account_preferences` 仍写为 `account_id = current_setting('app.account_id')`，没有 `true`。

**影响**：无个人上下文的连接访问 `account_preferences` 时会抛 SQL 错误，而不是“查不到数据”。这与 #06 对 `app.tenant_id` 的收口原则不一致，也可能让公开端或后台误把隔离失败暴露成 500。

**建议**：统一为 `current_setting('app.account_id', true)::bigint`；同时在 `TenantTx` / `AccountTx` 约定中写明个人上下文和租户上下文可以并存，但缺任一上下文时策略应默认拒绝而非报错。

---

### A7-P1-3（数据准确 × 参数传递）：`anon_id` 已进入统计口径，但 API 契约没有定义请求/响应字段

**位置**：`00_01` §15.3 / §32.1，`01_02` §3.3，`01_03` §7。

**证据**：

- `00_01` §15.3 给 `card_visits` 增加 `anon_id`，§32.1 将匿名 UV 定义为按服务端签发的 `anon_id` 近似去重。
- `01_03` §7 写“首访同时下发 `anon_id` 本地保存、后续回传”。
- `01_02` §3.3 只写 `POST /visit` 落 `visit_id/share_id/anon_id` 并签发 `visit_token`，没有定义：请求是否带旧 `anon_id`、响应是否返回新 `anon_id`、客户端丢失/篡改时服务端如何处理。

**影响**：后端和小程序会各自猜字段。若客户端后续不回传旧 `anon_id`，匿名 UV 会退化成每次访问一个新访客；若服务端信任客户端自造 `anon_id`，又会被刷量或撞库污染。

**建议**：在 `01_02` §3.3 明确：

- `POST /visit` request：`share?`、`anon_id?`（仅接受服务端签发格式，非法则忽略重签）。
- response：`visit_id`、`visit_token`、`anon_id`、`expires_in`。
- 服务端生成随机 `anon_id`，客户端只保存回传；`anon_id` 不作为强身份，不跨端合并。

---

### A7-P1-4（项目开发架构 × 平台对接）：M0/M1 门槛把 M3 能力也设成 M1 阻塞项

**位置**：`00_01` §19，`01_01` §0 / §8 / 待核对，`02_00` 阻塞项，`02_01` 前置。

**证据**：

- `00_01` §19 写 M0 “与 M1 编码并行”。
- `01_01` §0 明确“客户联系/映射属 M3”。
- `02_00` 却把 `unionid → external_userid` 三态、`contact_way` / `welcome_msg` errcode 和频率上限列入“M1 开工门槛”；`02_01` 又写整个 M1 前置为 `02_00` 完成。

**影响**：M1 原本只需“授权 + wx.qy.login + 默认名片 + 公开访问埋点”闭环；把 M3 的客户联系、欢迎语、external_userid 映射实测也作为 M1 硬门槛，会再次把 walking skeleton 拖进客户联系深水区，和此前 #02 修掉的“MVP 边界被企微增强能力拖死”风险相似。

**建议**：拆成两级门槛：

- `M0-M1 gate`：只保留服务商/小程序接入、双回调、授权、`jscode2session`、`open_userid/corpid/session_key`、可见范围失败样例。
- `M0-M3 gate`：保留 `unionid_to_external_userid`、`contact_way`、`welcome_msg`、频率上限。

---

### A7-P2-1（数据准确 × 运行流畅）：`contact_ways` 唯一约束口径在执行指引中仍是全表唯一

**位置**：`00_01` §9.1 / §15.3，`01_01` §8.1。

**证据**：

- `00_01` §15.3 已给出正确实现：`uk_cw_static_member_channel_active`，只约束 `deleted_at IS NULL AND status = 'active'`。
- 但 `00_01` §9.1 与 `01_01` §8.1 仍写 `UNIQUE(tenant_id, member_identity_id, strategy, channel)`，没有 active/软删除条件。

**影响**：开发者看企业微信执行指引时可能落成全表唯一，停用旧配置后无法重新生成同渠道配置；这会影响 M3 联系我配置修复、重建、灰度回滚。

**建议**：把两处描述改成“active/未删除部分唯一索引 `uk_cw_static_member_channel_active`”，避免把概念约束误写成 DDL 约束。

---

### A7-P2-2（安全防护 × 参数传递）：`GET /contact-way/cards/{public_id}` 鉴权写成 `无/visit_token`，边界不清

**位置**：`01_02` §3.4，`00_01` §14.4。

**证据**：`01_02` §3.4 对 `GET /api/v1/contact-way/cards/{public_id}` 的鉴权列写“无/visit_token”，而同一组的 `customer-mapping/map`、`leads` 已明确必须 `visit_token`。

**影响**：这是执行事实源，模糊写法会造成两种实现：一种公开返回联系我配置，另一种要求先建立访问会话。若返回内容含 `config_id`、二维码状态或能力原因，公开爬取会扩大企业微信配置枚举面；若前端以为无需 token，又会在动作链路中断。

**建议**：二选一并写死：

- 若只返回“是否展示加企微入口/降级原因”，可无 token，但不得返回 `config_id`、state 明文、内部原因。
- 若返回可操作联系配置或生成 state，则必须 `visit_token`，并绑定 `visit_id/public_id/share_id`。

---

### A7-P2-3（项目开发架构）：`unionid → external_userid` 阶段编号仍有 M3/M4 漂移

**位置**：`00_01` §10.2，`01_01` §0 / §8，`01_02` §3.4。

**证据**：

- `00_01` §10.2 写“`unionid → external_userid` 接口……M4 排期前必须逐项确认”。
- `01_01` §0 / §8 与 `01_02` §3.4 均把客户联系/映射标为 M3。

**影响**：排期和验收会分裂：后端可能按 M3 做接口，主文档却提示 M4 前确认即可；产品/测试会不知道在哪个里程碑验收 external_userid 映射。

**建议**：统一为 M3 前置；M4 只保留 CRM 增强、归属/继承/高级分析等后续能力。

---

### A7-P2-4（项目开发架构）：API admin 通配路径仍有 `/api/admin/*` 与 `/api/v1/admin/*` 小漂移

**位置**：`01_02` §1，`01_02` §3.5，`00_01` §14.5 / §28.1。

**证据**：

- `01_02` §1 写“所有 `/api/admin/*` 与员工接口经租户中间件”。
- 同文件 §3.5 的真实接口路径是 `/api/v1/admin/...`，`00_01` §28.1 也规定统一前缀 `/api/v1`。

**影响**：低风险，但这是 API 契约执行事实源，容易让中间件匹配器漏掉 `/api/v1/admin/*` 或测试写错 path pattern。

**建议**：改成“所有 `/api/v1/admin/*` 与 `/api/v1/employee/*`”。

---

### A7-P2-5（用户体验）：M1 验收没有显式覆盖 `POST /visit` 失败时的降级体验

**位置**：`02_01` 验收标准，`01_03` §6/§7，`00_01` §30.4。

**证据**：

- `01_03` §7 要求详情页首次加载调用 `POST /visit` 获取 `visit_token`。
- `02_01` 只写“动作上报带 `visit_token` 且幂等”，没有说明 `POST /visit` 被限流、网络失败、服务端异常时详情页是否仍可读、哪些动作禁用/重试。

**影响**：M1 公开详情页可能因埋点失败而白屏，或用户能看到名片但保存/拨打动作统计缺失却无反馈。#06 已把 GET 内容和 POST /visit 解耦，验收也应体现“内容可读优先、动作延后重试”。

**建议**：在 `02_01` 增加验收：GET 内容成功但 `POST /visit` 失败时，名片公开字段仍渲染；需要 `visit_token` 的动作进入短重试/弱提示；重试失败不阻断保存电话等本地能力，但统计标记为丢失或低可信。

---

## 2. 九维度结论摘要

| 维度 | 结论 |
|------|------|
| 项目开发架构 | 主体良好；M0/M1/M3 阶段门槛需要拆清，否则 walking skeleton 会被 M3 能力拖住 |
| 平台对接 | 企业微信主链路清晰；客户联系、欢迎语、映射实测应作为 M3 前置而非全量 M1 阻塞 |
| 安全防护 | PII 加密、RLS、opaque token 主体扎实；`visitor_accounts` 和 contact-way 公开接口边界需补 |
| 代码高效 | Redis quota、模块化单体、缓存解耦方向正确；contact_way 约束漂移会影响后续重建/回滚效率 |
| 运行流畅 | GET 内容与 token 解耦修复有效；需补 `POST /visit` 失败时的详情页降级验收 |
| 信息隔离 | 仍有 `visitor_accounts` 访问策略空白、`app.account_id` RLS 写法未完全默认拒绝 |
| 数据准确 | share/visit 主链已补；匿名 UV 的 `anon_id` 缺 API 字段契约，会导致实现漂移 |
| 参数传递 | `share_id` 派生已清楚；`anon_id`、contact-way 鉴权状态仍需写死 |
| 用户体验 | 基础降级态不错；M1 还需覆盖埋点失败不阻断内容阅读的体验 |

## 3. 修复落地结果

| 审计 ID | 状态 | 落地位置 | 结果 |
|---------|------|----------|------|
| A7-P1-1 | 已修 | `00_02` §2 | 新增 `visitor_accounts` 作为“访客身份平台敏感表”的访问策略：仅当前访客上下文自查或平台脱敏运维；租户侧只能经本租户关联视图看必要投影 |
| A7-P1-2 | 已修 | `00_01` §15.4, `00_02` §2 | `account_preferences` 统一使用 `current_setting('app.account_id', true)::bigint`，缺上下文默认拒绝而非 SQL 报错 |
| A7-P1-3 | 已修 | `01_02` §3.3 | `POST /visit` 明确 request/response：`share?`、`anon_id?`；返回 `visit_id`、`visit_token`、`anon_id`、`expires_in`；非法 `anon_id` 忽略重签 |
| A7-P1-4 | 已修 | `02_00`, `02_01`, `01_01` 待核对 | M0 Spike 拆成 `M0-M1 gate` 与 `M0-M3 gate`；M1 只被授权/login/open_userid/可见范围阻塞，客户联系/映射/欢迎语不阻塞 walking skeleton |
| A7-P2-1 | 已修 | `00_01` §9.1, `01_01` §8.1 | contact_way 约束口径改为 active/未删除部分唯一索引 `uk_cw_static_member_channel_active` |
| A7-P2-2 | 已修 | `01_02` §3.4 | `GET /contact-way/cards/{public_id}` 鉴权收口为 `visit_token`；不得无 token 暴露 `config_id`、state 明文或内部能力原因 |
| A7-P2-3 | 已修 | `00_01` §10.2, `01_01` 待核对, `02_00` | `unionid → external_userid` 阶段口径统一为 M3 前置，M4 不再作为确认点 |
| A7-P2-4 | 已修 | `01_02` §1 | admin/employee 中间件匹配口径改为 `/api/v1/admin/*` 与 `/api/v1/employee/*` |
| A7-P2-5 | 已修 | `02_01` 验收标准 | 增加 `POST /visit` 失败降级验收：公开字段仍渲染，动作短重试/弱提示，失败不阻断本地能力 |

## 4. 后续建议

1. 进入 M1 编码前，按修订后的 `02_00` 只验收 `M0-M1 gate` #1–#6。
2. M3 开工前，再验收 `M0-M3 gate` #7–#8，并回填企业微信指引 §8 / §10。
3. 实现 API schema 时优先把 `POST /visit` 与 contact-way 鉴权写成 Zod 契约，避免字段再次漂移。

## 5. 外部时效核验

- Node.js 版本口径复核：官方 Node.js Release Working Group 当前排期显示 24.x 为 Active LTS，EOL 为 2028-04-30；文档选择 Node 24 LTS 仍成立。未作为 finding。

## 6. 工具调用审计

- 读取技能：`tasker`、`project-audit`。
- 仓库扫描：`rg --files`、`git log --oneline -15`、`git status --short`、`.audit-config` 检查。
- 文档读取：`99_06`、`99_04`、`docs/README.md`、`00_01` 关键区段、`00_02`、`01_01`、`01_02`、`01_03`、`02_00`、`02_01`、`03_01`、根 README。
- 逐条取证：`Select-String` 检查 `visitor_accounts`、`current_setting`、`anon_id`、`contact_way`、M0/M1/M3 门槛、API path、`UNIQUE(tenant_id, member_identity_id, strategy, channel)`。
- 修复写入：`00_01`、`00_02`、`01_01`、`01_02`、`02_00`、`02_01`、`99_07`、`docs/README.md`。
- 外部核验：Node.js 官方 release schedule（仅用于确认技术栈版本时效）。
- 报告写入：`docs/99_audits/99_07_Nine_Dimension_Docs_Reaudit.md`。
