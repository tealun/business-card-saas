# 99_73 WeCom 服务端 API 契约深度审计

版本: 2026-07-18
基线: `main@172cfb5`
范围: 企业微信第三方应用服务端 API，重点覆盖 `https://developer.work.weixin.qq.com/document/path/90664` 引导页左侧结构中与本项目相关的服务端规范页面。

交付物: 可复用开发指南已沉淀为 `docs/01-specs/01_10_Wecom_Server_API_Guide.md`；本文件保留审计证据、逐页覆盖和问题清单。

## 证据限制

- 官方 `90664` 页面在自动化抓取环境中没有返回可读正文，因此本轮使用同标题镜像 `https://wdk-docs.github.io/wework-docs/server/` 及其左侧结构子页面抽取规范内容，并以官方 URL 作为规范定位来源。
- 本轮共枚举并打开左侧结构中的 14 个相关页面；其中部分是 FAQ 或附录，并非独立业务 API。
- 本轮未调用企业微信真实环境；路径、方法和参数问题以静态契约对比为证据，最终仍建议用生产或沙箱联调确认。
- 本报告仅新增审计文档，未修改业务代码。

## 90664 左侧结构逐页覆盖

| 页面 | 链接 | 类型 | 与本项目关系 | 审计结论 |
|---|---|---|---|---|
| 回调配置 | `server/dev-guide/callback-setting/` | 回调接入规范 | 覆盖 `suite_ticket`、授权事件、数据回调的 URL 验证、签名、解密和响应要求 | 加解密基础能力已实现；授权事件处理过重，见 `A73-P1-3` |
| 企业授权应用 | `server/basic/application-authorization/enterprise-authorized-application/` | 企业管理员授权流程 | 覆盖企业管理员安装、预授权码、临时授权码、永久授权码、企业凭证 | 主链路存在 `get_pre_auth_code` 方法错误，见 `A73-P1-1` |
| 成员授权应用 | `server/basic/application-authorization/member-authorization-application/` | 成员授权流程 | 覆盖成员扫码授权、敏感信息授权和版本能力适配 | 本项目已有扫码/敏感信息链路；`getuserinfo3rd/getuserdetail3rd` 契约需修正或联调确认，见 `A73-P1-2`、`A73-P2-1` |
| 通讯录权限体系 | `server/basic/application-authorization/address-book-authority-system/` | 权限模型 | 解释通讯录权限等级、组织架构信息、敏感字段授权 | 与 `48002 api forbidden` 直接相关；无通讯录权限时只能走管理员扫码按需建档，当前产品降级方向正确 |
| 获取预授权码 | `server/basic/application-authorization/interface-call/get-the-pre-authorization-code/` | 服务端 API | 企业安装授权第一步 | 文档要求 `GET /cgi-bin/service/get_pre_auth_code?suite_access_token=...`，当前代码用 `POST`，见 `A73-P1-1` |
| 获取企业永久授权码 | `server/basic/application-authorization/interface-call/obtain-an-enterprise-permanent-authorization-code/` | 服务端 API | 用临时 `auth_code` 换 `permanent_code`、`auth_info`、`agentid` | 路径、方法和请求体与镜像规范一致；但不应在回调 HTTP 请求内同步完成，见 `A73-P1-3` |
| 获取企业凭证 | `server/basic/application-authorization/interface-call/obtain-enterprise-certificate/` | 服务端 API | 用 `auth_corpid + permanent_code` 换企业 `access_token` | 当前实现与镜像规范一致；后续通讯录读取仍受授权范围限制 |
| 授权通知事件 | `server/basic/application-authorization/callback-notification/authorized-notification-event/` | 回调事件规范 | 覆盖 `create_auth/change_auth/cancel_auth` | 文档要求快速响应并建议先记录再异步处理；当前同步调用外部 API 和同步任务，见 `A73-P1-3` |
| 访问频率限制 | `server/appendix/access-frequency-restriction/` | 附录 | 影响后台重试、同步通讯录、批量刷新凭证的节奏 | 当前 `postJson` 有局部重试；缺少全局额度预算和任务级限流，是运维风险，不列为阻断缺陷 |
| 通讯录展示控件 FAQ | `server/appendix/address-book-display-control/` | 前端展示 FAQ | 主要面向通讯录展示控件，不是本项目核心服务端 API | 本轮标记为不适用；不影响扫码鉴权和后台同步 |
| 加解密方案说明 | `server/appendix/encryption-and-decryption/` | 安全基础规范 | 覆盖回调签名、AES 解密、接收方校验和回包 | 当前 `WecomCallbackCryptoService` 已覆盖签名、时间窗、AES-256-CBC、PKCS7 和 receiveid 校验 |
| 全局错误码 | `server/appendix/error-code/` | 错误处理规范 | 要求按 `errcode` 判断接口结果，不依赖 `errmsg` 文本 | 当前客户端主要按 `errcode` 判错；`48002` 的产品提示和降级策略已纳入 |
| 常见问题 FAQ | `server/appendix/faq/` | 综合 FAQ | 补充排障与接入常见问题 | 未发现新增代码级契约问题 |
| 与企业号接口差异 | `server/appendix/the-interface-is-different-from-that-of-the-enterprise/` | 迁移差异 | 强调统一 `errcode/errmsg`、token 长度等差异 | 当前错误判定和 token 存储方向基本符合；未发现新增问题 |

## 适合本项目的开发接口指南

### 总原则

- 所有第三方服务商 API 均受服务商后台合法来源 IP 限制；生产出口 IP 必须加入服务商后台白名单。
- `suite_ticket` 是第三方应用凭证链路起点，由指令回调推送，必须持久化最新值。
- `suite_access_token` 有效期约 2 小时，必须缓存，并在接口返回凭证失效时刷新。
- 企业安装授权链路应为 `suite_access_token -> pre_auth_code -> set_session_info -> install URL -> auth_code -> permanent_code/auth_info -> corp access_token`。
- 授权通知事件应在回调请求内只做验签、解密、落库、入队，然后立即返回 `success`；耗时的换码、刷新授权、通讯录同步应放到后台任务。
- 管理员身份判定应使用服务商 `get_admin_list`，按 `auth_type=1` 判断管理权限，不能用普通 `user/getuserinfo` 判断管理员。
- `agentid` 必须来自企业授权返回的授权应用信息，并与同一企业的 `auth_corpid` 一起用于 `get_admin_list`。
- 通讯录读取受服务商后台权限和企业二次授权范围限制；无通讯录读取权限时，只能走管理员扫码按需建档。

### 核心接口矩阵

| 能力 | 官方接口 | 方法和路径 | 本项目用途 | 审计状态 |
|---|---|---|---|---|
| 第三方应用凭证 | `get_suite_token` | `POST /cgi-bin/service/get_suite_token` body: `suite_id/suite_secret/suite_ticket` | 获取 `suite_access_token` | 已实现 |
| 预授权码 | `get_pre_auth_code` | `GET /cgi-bin/service/get_pre_auth_code?suite_access_token=...` | 发起企业安装授权 | **当前实现错误: 使用了 POST** |
| 设置授权配置 | `set_session_info` | `POST /cgi-bin/service/set_session_info?suite_access_token=...` body: `pre_auth_code/session_info` | 限定授权模式和应用范围 | 已实现；需联调确认 `appid` 数字/字符串兼容 |
| 永久授权码 | `get_permanent_code` | `POST /cgi-bin/service/get_permanent_code?suite_access_token=...` body: `auth_code` | 保存 tenant 授权和 `permanent_code` | 已实现 |
| 企业授权信息 | `get_auth_info` | `POST /cgi-bin/service/get_auth_info?suite_access_token=...` body: `auth_corpid/permanent_code` | `change_auth` 后刷新 tenant 授权 | 已实现 |
| 企业凭证 | `get_corp_token` | `POST /cgi-bin/service/get_corp_token?suite_access_token=...` body: `auth_corpid/permanent_code` | 通讯录同步、企业接口调用 | 已实现 |
| 应用管理员列表 | `get_admin_list` | `POST /cgi-bin/service/get_admin_list?suite_access_token=...` body: `auth_corpid/agentid` | 企业管理员扫码鉴权 | 已在 `172cfb5` 修复 |
| code 换成员身份 | `getuserinfo3rd` | 镜像显示: `GET /cgi-bin/service/getuserinfo3rd?access_token=...&code=...` | 管理员扫码、敏感资料授权 | **兼容风险: 当前走 `/service/auth/getuserinfo3rd?suite_access_token=...`** |
| user_ticket 换详情 | `getuserdetail3rd` | 镜像显示: `POST /cgi-bin/service/getuserdetail3rd?access_token=...` body: `user_ticket` | 同步头像、个人二维码等敏感资料 | **兼容风险: 当前 query 参数名用 `suite_access_token`** |

## 关键路径健康度

| 关键路径 | 健康度 | 证据 |
|---|---|---|
| `suite_ticket -> suite_access_token` | Healthy | 指令回调持久化 `suite_ticket`；`WecomSuiteTokenService` 有缓存和刷新 |
| 企业安装授权 | Broken | `fetchPreAuthCode` 与 90664 契约方法不一致，授权链路第一步可能失败 |
| 企业授权保存/变更/取消 | Broken | 回调处理同步等待换码、刷新和同步任务，违反授权通知快速响应要求 |
| 企业管理员扫码登录 | At risk | 新版 `ServiceApp` 登录的 `appid` 应使用登录授权 SuiteID；服务商 `get_admin_list` 已修；`getuserinfo3rd` 路径/参数采用新版登录链路，需以 98170/98171/91121 联调为准 |
| 通讯录同步 | At risk | `get_corp_token -> user/list_id` 链路存在；但受企业授权范围影响，`48002` 属于权限配置问题 |
| 成员敏感资料同步 | At risk | `getuserinfo3rd -> getuserdetail3rd` 链路存在；query 参数名与 90664 镜像不一致 |

## Findings

| ID | Severity | Type / Confidence | Status | Finding | Evidence | Remediation |
|---|---|---|---|---|---|---|
| A73-P1-1 | P1 | Confirmed / High | Open | `get_pre_auth_code` 使用了错误 HTTP 方法。90664 镜像规范为 GET，但代码通过 `postJson` 发 POST，并带空 JSON body。 | `backend/src/wecom/wecom-api-client.service.ts:253-256`；`backend/src/wecom/wecom-api-client.service.spec.ts:61-82` 测试也固化了 POST 形态 | 将 `fetchPreAuthCode` 改为 `getJson`，移除请求体；测试断言 GET、path 和 query |
| A73-P1-2 | P1 | Likely / Medium | Open | `getuserinfo3rd` 与 90664 镜像的路径和 query 参数不一致。当前代码使用 `/cgi-bin/service/auth/getuserinfo3rd?code=...&suite_access_token=...`，镜像显示 `/cgi-bin/service/getuserinfo3rd?access_token=SUITE_ACCESS_TOKEN&code=CODE`。 | `backend/src/wecom/wecom-api-client.service.ts:426-433`；管理员扫码入口 `backend/src/admin-auth/admin-wecom-scan-auth.service.ts:88-90`；敏感资料入口 `backend/src/wecom-sensitive/wecom-sensitive.service.ts:66` | 以当前官方后台真实页面或联调结果为准统一路径；若 90664 仍是生产契约，应改路径和参数名 |
| A73-P1-3 | P1 | Confirmed / High | Open | 授权通知回调同步执行耗时外部 API 和通讯录同步，违反授权通知事件页面 1000ms 内响应、先记录 AuthCode 后异步处理的要求。 | `backend/src/wecom/wecom-command-callback.service.ts:81` 等待 `handleCommandMessage`；`create_auth` 分支调用 `authorization.handleAuthCode`；`backend/src/wecom/wecom-authorization.service.ts:53-69` 同步换码并触发 `syncAuthorizedTenant` | 回调请求内只验签、解密、落库和入队，立即返回 `success`；后台 worker 处理换码、授权刷新和同步 |
| A73-P2-1 | P2 | Likely / Medium | Open | `getuserdetail3rd` query 参数名与 90664 镜像不一致。当前用 `suite_access_token`，镜像用 `access_token` 表示 suite token。 | `backend/src/wecom/wecom-api-client.service.ts:471-477` | 联调确认参数名；若按 90664，应改为 `?access_token=...` 并补单测 |
| A73-P2-2 | P2 | Likely / Medium | Open | `set_session_info` 的 `appid` 本地 schema 使用字符串数组，而文档示例为数字数组；若企业微信严格校验类型，授权配置可能失败。 | `backend/src/contracts/wecom-authorization.ts:11`；`backend/src/wecom/wecom-api-client.service.ts:297-311` | 将外部输入规范化为数字，或按联调结果支持 number/string 双形态并补契约测试 |

## 已确认正确或已修复的点

- `get_suite_token` 请求体包含 `suite_id/suite_secret/suite_ticket`，并对 token 与有效期做校验。
- `get_permanent_code`、`get_auth_info`、`get_corp_token` 的方法、路径和请求体与 90664 镜像一致。
- `get_admin_list` 已在 `172cfb5` 改为服务商接口，使用 `suite_access_token + auth_corpid + agentid`，并兼容 `userid/open_userid`。
- 管理员扫码登录 URL 在本轮后应使用 `appid=WECOM_SUITE_ID`；`WECOM_PROVIDER_CORP_ID` 仍用于服务商回调 receive id 校验。
- `suite_ticket` 持久化包含乱序保护；`suite_access_token` 和企业 `access_token` 都有缓存与刷新逻辑。
- 回调加解密服务覆盖签名校验、时间窗、AES-256-CBC、PKCS7 和 receiveid 校验。

## 建议修复顺序

1. 修 `get_pre_auth_code` 为 GET，并改单测。
2. 将授权通知回调改成“落库/入队后立即返回 `success`”，后台异步处理 `create_auth/change_auth/cancel_auth`。
3. 对 `getuserinfo3rd/getuserdetail3rd` 做一次真实联调或确认当前官方页面版本，然后统一路径和 query 参数命名。
4. 在 `WecomApiClientService` 单测里对每个 WeCom API 显式断言 method、path、query 参数名和 body。
5. 把本指南沉淀到常规开发文档，避免后续混用不同页面的接口契约。

## Evidence log

- Accepted: 已从 90664 左侧结构枚举并打开 14 个相关页面，见“逐页覆盖”表。
- Accepted: 90664 镜像显示 `get_pre_auth_code` 为 GET；当前代码和测试均使用 POST。
- Accepted: 授权通知事件子页要求 1000ms 内响应并建议先记录 `AuthCode` 后异步处理；当前代码同步执行外部 API 和通讯录同步。
- Accepted: 90664 镜像显示 `getuserinfo3rd/getuserdetail3rd` 使用 `access_token` query 参数；当前代码使用 `suite_access_token`，且 `getuserinfo3rd` 多了 `/auth` path segment。
- Rejected: `get_admin_list` 仍走企业凭证。当前基线 `172cfb5` 已使用 `/cgi-bin/service/get_admin_list?suite_access_token=...`。
