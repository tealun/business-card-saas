# 02_04 管理后台账号登录系统 M0/M1 门禁

版本: v2 · 日期: 2026-07-17 · 归属: admin/auth
关联: `01_09_Admin_Account_Auth_System_Spec.md`、`99_72_admin_account_auth_readiness.md`、`01_08_Admin_Backoffice_Architecture_Guide.md`、`02_02_First_Enterprise_Wecom_Admin_Plan.md`、`99_21_wecom_admin_auth.md`、`99_36_owner_claim_admin_login.md`

目的: 企业微信扫码鉴权是身份级外部依赖，未验证即编码 = 返工风险。本文件把全部未知隔离为可验收的 M0 证据项，并定义 M1 walking skeleton 的 Done/Fail。规划契约：done = M0 证据回填 + M1 S1–S6 全过；验证 = 每项证据落档；fail = 任一 P0 事实与假设冲突即停。

> v2 变更：M0 文档/代码取证已于 2026-07-17 完成，链路选型更正（新版登录组件 + 企业凭证 get_admin_list），01_09 已同步修订为 v2。真实回调样例与服务端配置截图转为**部署联调门槛**（需用户配合，见文末）。

## M0 Checklist（文档与代码取证 ✅ / 真实环境样例 = 部署联调门槛）

| # | Item | Owner | Status | Evidence |
|---|------|-------|--------|----------|
| M0-1 | 扫码链路选型与构造方式 | — | ☑ 文档取证 | 官方 98170《单点登录》：**新版企业微信登录组件**（内嵌 / 新窗口登录页），回调 `redirect_uri?code=xxx`；"新版是对原扫码登录的能力升级，建议升级接入"——旧 `3rd_qrConnect` + `get_login_info` 不采用。组件嵌入参数在 M1 前端联调按 98170 子页面定稿 |
| M0-2 | `getuserinfo3rd` 换取身份 | — | ☑ 文档+代码取证 | 官方 91121：`GET /cgi-bin/service/auth/getuserinfo3rd?suite_access_token&code`，返回 `corpid / userid / open_userid`（`user_ticket` 仅 snsapi_privateinfo）；code 一次性、5 分钟过期；跳转域名不匹配报 50001。仓库 `wecom-api-client.service.ts:390` 已实现同路径（现强依赖 user_ticket，扫码链路需宽松变体） |
| M0-3 | `get_admin_list` 判定管理员 | — | ☑ 文档取证 | 官方 100073：`POST /cgi-bin/agent/get_admin_list?access_token=ACCESS_TOKEN`，token = **第三方应用企业凭证**（`get_corp_token`，复用 `wecom-corp-token.service.ts`）；返回 `admin:[{userid, auth_type}]`（0=发消息/1=管理）；**成员授权模式下不返回**；旧 suite_access_token 方式已不再维护。匹配字段 = `userid`（与 M0-2 同 corp 同应用取值一致） |
| M0-4 | redirect 域名与服务商后台配置 | 用户（ops） | ☑ 文档取证 / ☐ 配置截图 | 官方 98170「开启网页授权登录」：服务商后台配置**登录授权** + 品牌名称；91121：回调域名须与第三方应用**可信域名**完全一致。配置执行与截图 = 用户侧 ops 项 |
| M0-5 | 复用点走查 | — | ☑ 代码走查（2026-07-17） | `wecom-api-client.service.ts`：`:288 fetchPermanentCode`、`:316 fetchCorpAccessToken`、`:390 fetchThirdPartyUserInfo`（`/auth/` 变体，已核实）；`wecom-corp-token.service.ts` 企业凭证加密缓存；`wecom-suite-token.service.ts` singleflight 刷新 |

### M0 Done（已达成：文档+代码层面）

- 上表 5 项文档/代码取证全部完成并回填；链路选型更正已同步修订 01_09（v2）。
- **部署联调门槛**（转为 M1 收尾条件，需用户配合）：
  - D-1 服务商后台完成「登录授权」配置 + 可信域名（M0-4），截图回填；
  - D-2 首个真实企业扫码联调：「扫码 → 取身份 → 管理员判定」三段跑通一次，脱敏响应样例回填（核实字段大小写与 userid 明文/密文策略）。

### M0 Fail（部署联调中触发即执行）

- `get_admin_list` 无法覆盖判定（如目标企业均为**成员授权模式**，100073 不返回列表）→ 启用降级：claim-token + 平台侧代录管理员，回修 01_09 §4.2。
- 真实回调字段与 91121 文档不符 → 回修 01_09 §4.2 与客户端解析。

## M1 Checklist（walking skeleton：一个企业、一名管理员、一条完整链路）

| # | Item | Owner | Status | Evidence |
|---|------|-------|--------|----------|
| M1-S1 | 扫码全链路：管理员扫码 → 实时 `get_admin_list` 命中 → 自动建档 → 进入后台首页（`session/me` 返回 `account_type=tenant`） | | ☐ | 录屏或端到端日志（依赖 D-1/D-2） |
| M1-S2 | 非管理员扫码 → 403 中文提示，不建档不发会话 | | ☐ | 测试记录 |
| M1-S3 | 本地 `disabled` 管理员扫码被拒（本地管控优先） | | ☐ | 测试记录 |
| M1-S4 | owner 创建/改角色/禁用/删除平台账号；禁止操作自己与内建 owner | | ☐ | API 测试记录 |
| M1-S5 | 登录成功/失败 + 账号管理操作全部落 `admin_operation_logs` | | ☐ | 日志查询截图 |
| M1-S6 | 隔离回归：tenant 会话访问 platform 端点 403；反之亦然 | | ☐ | 测试记录 |
| M1-S7 | 禁用/删除后存量会话行为明确：`AdminAuthGuard` 每次查库校验 status，或接受 8h 窗口并记录决策 | | ☐ | `admin-auth.guard.ts` 行为确认 + 决策记录 |

说明：M1-S4 不依赖任何外部事实，先行实现；S2/S3/S6/S7 可用 mock 企微客户端的单测先行验证，S1 完整链路以 D-1/D-2 联调收尾。

### M1 Done

- S1–S6 全过；`migrate_v1_14` 前滚执行成功；审计日志可查；01_09 验收标准 AC1–AC8 满足。

### M1 Fail

- 任一 S 项失败 → 对应切片修复后重测；S1 失败且根因在企微侧 → 按 M0 Fail 降级路径处理。

## M2+ Deferred（落地后转入 `99_9999_deferred.md`）

- 多企业管理员的选择/切换页。
- 企微管理员周期对账任务（企微无管理员撤销回调）。
- `getuserdetail3rd` 同步姓名/头像。
- 会话撤销（会话表/Redis）、MFA。
- `01_08` 细粒度能力点全量落地、platform 其余角色开放。
- `qy-login` 手动 jscode 通道退役。
