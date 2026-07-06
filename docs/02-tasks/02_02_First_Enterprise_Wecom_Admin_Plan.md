# 02_02 首个真实企业微信接入与企业配置后台计划

版本：v1 · 日期：2026-07-06 · 归属：后端 / 平台 / 后台 / 小程序
关联：[`02_00_M0_Platform_Verification.md`](02_00_M0_Platform_Verification.md)、[`02_01_M1_Walking_Skeleton.md`](02_01_M1_Walking_Skeleton.md)、[`../01-specs/01_01_Wecom_Integration.md`](../01-specs/01_01_Wecom_Integration.md)、[`../01-specs/01_04_Admin_Web_Guide.md`](../01-specs/01_04_Admin_Web_Guide.md)

> 目标：从当前 demo walking skeleton 推进到「1 家真实企业完成企业微信第三方应用授权，员工可从企业微信工作台打开小程序，企业管理员可为员工和企业名片做基础配置」。

## 当前基线

- 小程序端已完成设计系统统一落地：员工首页、编辑资料、名片样式、访客详情、名片夹、企业名片、兼容名片页。
- 后端已有 demo `POST /api/v1/auth/qy-login`、员工名片读写、分享签发、公开名片读取、visit/action/derive share demo 闭环。
- 数据库已有 `tenants`、`member_identities`、`cards`、`templates`、`tenant_admins`、`admin_claim_tokens`、`company_profiles`、`company_videos`、`company_honors` 等基础表。
- 当前企业微信员工登录链路已从 demo skeleton 推进到可单测真实路径：第三方应用回调、`suite_ticket`、`permanent_code`、`jscode2session` 适配、真实 `POST /api/v1/auth/qy-login` 接入、`member_identity` upsert 与默认名片初始化已落地；后台管理员登录后端最小闭环已落地，真实 Web OAuth/扫码 UI 与通讯录同步尚未落地。
- 当前 `admin/` 是静态联调工作台，不是企业管理员可用的正式配置后台。

## 当前开发进度

- 2026-07-06：阶段 1.1-1.2 已落地：`backend/src/wecom` 新增企业微信第三方应用配置、`msg_signature` 校验、AES-256-CBC 解密、receiveId 校验与失败拒绝单测。
- 2026-07-06：阶段 1.3 已落地：新增 `/api/v1/wecom/callbacks/command` 指令回调 GET/POST，支持企业微信 URL 验证、接收 `suite_ticket`、返回纯文本 `success`，并将 ticket 以 AES-GCM 加密写入 `wecom_suite_state`；本地无 `DATABASE_URL` 时用内存仓库保障开发与单测。
- 2026-07-06：阶段 1.4 已落地：新增 `WecomSuiteTokenService`，支持复用未过期 `suite_access_token`、缺 `suite_ticket` 明确 503、并发刷新 singleflight、刷新后 AES-GCM 加密保存 token 与过期时间。
- 2026-07-06：阶段 1.5 已落地：指令回调 `create_auth/change_auth` 可读取 `AuthCode`，通过 `suite_access_token` 调用 `get_permanent_code`，并将 `permanent_code`、agent、授权摘要加密保存到 `tenants`。
- 2026-07-06：阶段 1.6 已落地：新增 `WecomCorpTokenService`，按 `open_corpid` 读取授权、用 `permanent_code` 获取企业 access_token，并加密缓存到 `tenants`。
- 2026-07-06：阶段 2.1-2.2 适配层已落地：新增第三方小程序 `service/miniprogram/jscode2session` API client 与 `WecomMiniProgramLoginService`，可解析 `open_corpid/open_userid/session_key` 并拒绝未授权企业；最终字段仍需 M0-M1 gate 实测确认。
- 2026-07-06：阶段 2.3-2.4 已落地：真实 `POST /api/v1/auth/qy-login` 调用 `WecomMiniProgramLoginService`，按授权 `open_corpid` 定位 tenant，首次登录 upsert `member_identity`/账号绑定/默认名片/公开目录；无 `DATABASE_URL` 时使用内存供给，本地 demo code 仍只在非生产 `DEMO_AUTH_ENABLED=1` 时可用。
- 2026-07-06：阶段 3 后端最小闭环已落地：新增 `POST /api/v1/admin/auth/qy-login`、`GET /api/v1/admin/session/me`、后台 session token、admin guard、`tenant_admins` active admin 定位与 owner/admin/operator/auditor RBAC helper；真实 Web OAuth/扫码 UI 仍待接入。
- 2026-07-06：阶段 4.1-4.4 后端 MVP 已起步：新增 `GET /api/v1/admin/overview`、`GET /api/v1/admin/members`、`GET/PUT /api/v1/admin/members/{id}/card`，复用员工名片服务完成当前已识别成员的名片读取/配置与公开页同步；全员列表依赖阶段 5 通讯录同步扩展。
- 2026-07-06：阶段 4.5-4.7 后端 MVP 已落地：新增 `GET/PUT /api/v1/admin/settings/fields`、`GET/PUT /api/v1/admin/company-profile`、`GET/POST/PUT /api/v1/admin/templates` 与 `PUT /api/v1/admin/templates/{id}/default`，写操作要求 admin/owner，读操作允许 auditor。
- 下一步：后台静态工作台接入登录态与配置 API；阶段 5 通讯录同步扩展全员列表与企业员工配置。
- 外部阻塞仍存在：阶段 0 的服务商账号、公开 HTTPS 回调 URL、试点企业授权与 M0-M1 gate 实测需要真实企业微信后台配合。

## 阶段 0：外部准备与 M0 实测

| # | 任务 | 产物 | 验收 |
|---|------|------|------|
| 0.1 | 注册/确认企业微信服务商账号、主体认证、第三方应用 | 服务商后台截图、应用凭据清单（不入库明文） | 具备可授权第三方应用 |
| 0.2 | 准备公网 HTTPS 回调环境 | dev/staging 回调域名、指令回调 URL、数据回调 URL | 企业微信后台可保存回调配置 |
| 0.3 | 锁定 1 家试点企业 | 试点企业 corpid/管理员联系人（脱敏记录） | 企业管理员可配合授权 |
| 0.4 | 完成 `02_00` M0-M1 gate #1-#6 | 脱敏请求/返回样例、字段结论 | `open_userid`、`corpid`、可见范围和失败 errcode 有事实记录 |

阻塞规则：0.4 未完成前，可以接入可单测的真实登录路径，但正式对外启用、删除 demo 降级、承诺字段语义前，必须完成真实企业微信 M0-M1 gate 实测。

## 阶段 1：企业微信平台适配层

| # | 任务 | 代码范围 | 验收 |
|---|------|----------|------|
| 1.1 | 配置与密钥加载（已实现） | `backend/src/wecom/*`、环境变量文档 | 支持 suite_id、suite_secret、token、encoding_aes_key 分环境配置 |
| 1.2 | 企业微信回调加解密与签名校验（已实现） | wecom crypto service | 单测覆盖 msg_signature 校验、AES 解密、明文解析、失败拒绝 |
| 1.3 | 指令回调：接收 `suite_ticket`（已实现） | callback controller/repository | 能落库或缓存最近 ticket，重复/乱序安全 |
| 1.4 | `suite_access_token` singleflight 刷新（已实现） | token service + Redis/DB fallback | 并发刷新不互相踩；过期前可复用 |
| 1.5 | 授权回调：`auth_code -> permanent_code`（已实现） | auth callback service | 授权成功后创建/更新 `tenant`，加密保存 permanent_code |
| 1.6 | 企业 access_token 获取（已实现） | corp token service | 可按 tenant 获取企业级 token，错误码归一 |

阶段验收：试点企业授权后，系统内出现 active tenant，保存企业授权状态、open_corpid、corp_name、agent_id、可见范围摘要。

## 阶段 2：真实员工登录与默认名片

| # | 任务 | 代码范围 | 验收 |
|---|------|----------|------|
| 2.1 | 替换 demo `AuthRepository.resolveQyCode` 为真实 `jscode2session` adapter（已实现） | `backend/src/auth` + `backend/src/wecom` | 企业微信工作台打开后拿到 `open_userid` / `corpid` |
| 2.2 | 按 `corpid` 定位 tenant（已实现） | auth repository | 未授权企业返回明确错误，不创建脏数据 |
| 2.3 | upsert `member_identity`（已实现） | auth repository | 首次登录创建成员身份；再次登录复用 |
| 2.4 | 首次登录生成默认名片与 `public_id`（已实现） | employee/card service | 员工第一次进入即看到默认名片 |
| 2.5 | 保留本地 demo 降级开关 | config/test | `DEMO_AUTH_ENABLED=1` 仅非生产可用，生产不可启用 |

阶段验收：真实员工从企业微信工作台进入小程序，自动识别身份，看到自己的默认名片，可编辑并分享公开名片。

## 阶段 3：企业管理员登录与 owner bootstrap

| # | 任务 | 代码范围 | 验收 |
|---|------|----------|------|
| 3.1 | 企业管理员 OAuth/扫码登录入口（后端已实现，Web OAuth/扫码 UI 待接入） | backend admin auth + admin UI | 管理员可从企业微信完成登录跳转 |
| 3.2 | `corpid + open_userid` 定位 tenant admin（已实现） | admin auth repository | 非管理员拒绝；管理员进入所属租户 |
| 3.3 | 首次授权 owner bootstrap（服务骨架已实现） | owner bootstrap service | 无 owner 时创建首个 owner 或生成一次性 claim token |
| 3.4 | 后台 JWT/session 与 admin guard（已实现） | backend common/admin | `/api/v1/admin/*` 注入 tenant 上下文 |
| 3.5 | 基础 RBAC（已实现 helper） | tenant_admins.role | owner/admin/operator/auditor 最小权限可判断 |

阶段验收：试点企业 owner 可登录后台；非本企业或非管理员不可访问租户后台接口。

## 阶段 4：企业员工配置后台 MVP

| # | 任务 | 后端 API | 前端页面 | 验收 |
|---|------|----------|----------|------|
| 4.1 | 管理后台框架升级（后端登录态已实现） | admin session/me | 登录态、导航、错误态 | 不再只是静态联调页 |
| 4.2 | 企业概览（后端 MVP 已实现） | `GET /admin/overview` | `/admin/dashboard` | 显示成员数、名片数、访问概览 |
| 4.3 | 员工列表（后端 MVP 已实现当前成员） | `GET /admin/members` | `/admin/members` | 分页、搜索、状态筛选 |
| 4.4 | 员工名片配置（后端 MVP 已实现当前成员） | `GET/PUT /admin/members/{id}/card` | 员工详情/名片编辑 | 管理员可维护员工姓名、职位、部门、联系方式、启停状态 |
| 4.5 | 字段规则（后端 MVP 已实现） | `GET/PUT /admin/settings/fields` | `/admin/fields` | 可配置字段是否企业锁定、是否允许员工编辑、默认公开策略 |
| 4.6 | 企业资料（后端 MVP 已实现） | `GET/PUT /admin/company-profile` | `/admin/company` | 企业简介、地址、电话、官网、资质标签可配置 |
| 4.7 | 模板/品牌色（后端 MVP 已实现） | `GET/POST/PUT /admin/templates` | `/admin/templates` | 可配置默认模板、品牌色、布局 JSON |

阶段验收：企业管理员能在后台完成「配置企业资料 + 配置员工名片 + 配置字段规则 + 设置默认模板」，员工端和访客页能读取这些配置。

## 阶段 5：通讯录同步最小版

| # | 任务 | 产物 | 验收 |
|---|------|------|------|
| 5.1 | 首次授权全量同步可见范围成员 | sync service/job | 试点企业成员进入 `member_identities` |
| 5.2 | 通讯录变更回调处理 | data callback route | 新增/更新/离职能影响成员与名片状态 |
| 5.3 | 离职/停用降级 | card status/public page | 离职员工公开页展示友好失效态，隐藏增强动作 |
| 5.4 | 同步失败重试与告警 | job log | 失败可重试，不阻塞已登录员工使用 |

阶段验收：试点企业成员变更能反映到系统员工列表和名片状态。

## 阶段 6：端到端验收

| 场景 | 验收 |
|------|------|
| 企业授权 | 试点企业授权后创建 tenant，owner 可登录后台 |
| 员工进入 | 员工从企业微信工作台进入小程序，自动识别并看到默认名片 |
| 管理员配置员工 | 后台修改员工字段/启停状态，员工端和访客页同步体现 |
| 企业资料配置 | 后台修改企业简介/官网/品牌色，企业名片和访客详情同步体现 |
| 分享闭环 | 员工分享名片，访客无需授权可查看、保存电话、拨打电话，visit/action 有记录 |
| 隔离验证 | A 企业管理员不能访问 B 企业数据；员工不能越权读取其他企业名片 |

## 不纳入本计划的能力

- 客户联系增强真实闭环：`contact_way`、欢迎语、`external_userid` 映射，进入 M3。
- 平台管理员完整 MFA、审计后台、跨租户运营后台，进入平台管理阶段。
- 海报图片真实生成、COS 上传、图片/视频审核，进入内容增强阶段。
- 名片 OCR、批量导出、CRM 同步，进入增长与运营阶段。

## 推荐执行顺序

1. 阶段 0 与阶段 1 并行推进：外部凭据准备时先实现可单测的回调/加解密/token 适配层。
2. 阶段 2 紧跟阶段 1：先让真实员工登录成功，替换 demo 登录。
3. 阶段 3 再做企业管理员登录：保证配置后台有真实租户上下文。
4. 阶段 4 先做企业资料、员工列表、员工名片编辑、字段规则四个最小页面，模板管理可用默认模板兜底。
5. 阶段 5 做最小通讯录同步，最后用阶段 6 跑真实试点企业验收。
