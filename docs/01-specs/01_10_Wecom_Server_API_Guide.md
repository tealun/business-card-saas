# 01_10 企业微信服务端 API 开发接口指南

版本: v1.0
日期: 2026-07-18
归属: 企业微信对接组
证据来源: `docs/99_audits/99_73_wecom_server_api_contract_audit.md`

定位: 本文件是本项目调用企业微信服务端 API 的工程基准。写代码和改单测时优先按这里核对 method、path、token 类型、请求体、响应字段和降级策略；审计报告只保留取证过程和问题清单。

## 1. 使用边界

本指南覆盖当前项目已经接入或即将接入的企业微信第三方应用服务商链路:

- 第三方应用凭证: `suite_ticket -> suite_access_token`
- 企业安装授权: `pre_auth_code -> set_session_info -> permanent_code -> corp access_token`
- 企业管理员扫码登录: 新版 `ServiceApp` 登录、`getuserinfo3rd`、`get_admin_list`
- 通讯录同步: `get_corp_token -> user/list_id`
- 成员敏感信息授权: `getuserinfo3rd -> getuserdetail3rd`
- 指令回调: URL 验证、`suite_ticket/create_auth/change_auth/cancel_auth`
- 安全、错误码、限频和授权范围降级

不覆盖客户联系、订单、会话存档、审批等尚未实测接入的企业微信能力。新增这些能力前必须先做单独 M0 取证。

## 2. 凭证和 ID 速查

| 名称 | 来源 | 用途 | 代码读取/存储 |
|---|---|---|---|
| `WECOM_PROVIDER_CORP_ID` | 服务商企业 ID | 指令回调 URL 验证的 receive id；服务商身份边界 | `WecomConfigService.providerCorpId`、`suite.providerCorpId` |
| `WECOM_SUITE_ID` | 第三方应用 SuiteID | `get_suite_token`、新版 `ServiceApp` 登录 `appid`、第三方应用身份 | `WecomConfigService.suiteId` |
| `WECOM_SUITE_SECRET` | 第三方应用 SuiteSecret | 换取 `suite_access_token` | 仅后端环境变量 |
| `suite_ticket` | 企业微信指令回调推送 | 换取 `suite_access_token` | `wecom_suite_state` 持久化 |
| `suite_access_token` | `get_suite_token` 返回 | 调服务商/第三方应用接口 | 缓存并加密持久化 |
| `permanent_code` | 企业授权后返回 | 换企业 `access_token`、刷新授权信息 | tenant 授权记录加密保存 |
| `corp access_token` | `get_corp_token` 返回 | 通讯录、企业级接口 | 按企业缓存 |
| `agentid` | 企业授权 `auth_info.agent[]` | `get_admin_list` 管理员判定 | tenant 授权记录 |
| `open_corpid` | 企业授权或成员登录返回 | 定位租户 | `tenants.open_corpid` |
| `userid/open_userid` | 成员登录或通讯录返回 | 定位企业成员/管理员 | `member_identities`、`tenant_admins` |

关键规则:

- `ServiceApp` 登录地址的 `appid` 使用 `WECOM_SUITE_ID`，不是 `WECOM_PROVIDER_CORP_ID`。
- `WECOM_PROVIDER_CORP_ID` 仍用于服务商回调 receive id 校验，不能删除。
- 管理员身份必须由 `get_admin_list` 判定，不能用普通成员身份接口直接推断。
- 通讯录接口是否可用取决于服务商后台权限和企业授权范围；`48002` 不是代码必然错误，应触发产品降级。

## 3. API 契约矩阵

| 能力 | Method | Path | Token | Body | 当前代码 |
|---|---|---|---|---|---|
| 获取 suite token | `POST` | `/cgi-bin/service/get_suite_token` | 无 | `suite_id`、`suite_secret`、`suite_ticket` | `fetchSuiteAccessToken` |
| 获取预授权码 | `GET` | `/cgi-bin/service/get_pre_auth_code?suite_access_token=...` | `suite_access_token` query | 无 | `fetchPreAuthCode` |
| 设置授权配置 | `POST` | `/cgi-bin/service/set_session_info?suite_access_token=...` | `suite_access_token` query | `pre_auth_code`、`session_info.auth_type`、可选 `session_info.appid` | `setSessionInfo` |
| 获取永久授权码 | `POST` | `/cgi-bin/service/get_permanent_code?suite_access_token=...` | `suite_access_token` query | `auth_code` | `fetchPermanentCode` |
| 获取授权信息 | `POST` | `/cgi-bin/service/get_auth_info?suite_access_token=...` | `suite_access_token` query | `auth_corpid`、`permanent_code` | `fetchAuthorizationInfo` |
| 获取企业凭证 | `POST` | `/cgi-bin/service/get_corp_token?suite_access_token=...` | `suite_access_token` query | `auth_corpid`、`permanent_code` | `fetchCorpAccessToken` |
| 小程序企业微信登录 | `POST` | `/cgi-bin/service/miniprogram/jscode2session?suite_access_token=...` | `suite_access_token` query | `js_code`、`grant_type=authorization_code` | `fetchMiniProgramSession` |
| 通讯录成员 ID 列表 | `POST` | `/cgi-bin/user/list_id?access_token=...` | 企业 `access_token` query | `cursor`、`limit` | `fetchContactUserIds` |
| 新版登录 code 换身份 | `GET` | `/cgi-bin/service/auth/getuserinfo3rd?code=...&suite_access_token=...` | `suite_access_token` query | 无 | `fetchThirdPartyUserInfo` |
| 应用管理员列表 | `POST` | `/cgi-bin/service/get_admin_list?suite_access_token=...` | `suite_access_token` query | `auth_corpid`、`agentid` | `fetchCorpAdminList` |
| 成员敏感信息详情 | `POST` | `/cgi-bin/service/getuserdetail3rd?suite_access_token=...` | `suite_access_token` query | `user_ticket` | `fetchThirdPartyUserDetail` |

注意:

- `90664` 镜像中的旧链路对 `getuserinfo3rd/getuserdetail3rd` 使用 `access_token` 参数名，并且 `getuserinfo3rd` 不含 `/auth` path segment。本项目管理员扫码链路采用 `01_09` 已确认的新版登录链路，暂不回退到旧镜像写法。
- 若真实联调证明当前新版接口参数与官方控制台不一致，必须先更新本指南和单测，再改业务代码。

## 4. 企业安装授权链路

目标: 平台方生成安装链接，企业管理员授权后创建或更新 tenant。

顺序:

1. 指令回调持久化最新 `suite_ticket`。
2. 后端用 `suite_id + suite_secret + suite_ticket` 调 `get_suite_token`。
3. 后端调 `GET get_pre_auth_code`。
4. 后端调 `set_session_info`。
5. 返回 `open.work.weixin.qq.com/3rdapp/install` 授权链接。
6. 企业微信通过 redirect 或 `create_auth` 回调给 `auth_code`。
7. 后台异步调 `get_permanent_code`，保存 `open_corpid/permanent_code/agentid/auth_info`。
8. 必要时调 `get_corp_token` 并尝试通讯录同步。

开发要求:

- `get_pre_auth_code` 不允许 POST。
- `set_session_info.session_info.appid` 中纯数字 app id 应发送为数字。
- `auth_code` 是短期一次性凭证，不应明文长期保存。
- `permanent_code` 必须加密保存。
- `create_auth` 回调不能在 HTTP 请求内同步完成换码和通讯录同步。

## 5. 企业管理员扫码登录链路

目标: 企业管理员默认扫码进入企业后台；平台账号登录只给系统管理员。

顺序:

1. 前端请求 `GET /api/v1/admin/auth/wecom/login-config`。
2. 后端生成一次性 `state`，返回新版服务商登录 URL。
3. 登录 URL 必须包含:
   - `https://login.work.weixin.qq.com/wwlogin/sso/login`
   - `login_type=ServiceApp`
   - `appid=<WECOM_SUITE_ID>`
   - `redirect_uri=<WECOM_ADMIN_LOGIN_REDIRECT_URI>`
   - `state=<one-time-state>`
4. 企业微信回跳 `code/state`。
5. 后端消费 `state`，用 `suite_access_token + code` 调 `getuserinfo3rd`。
6. 用返回的 `open_corpid` 定位 tenant，并读取该 tenant 的 `agentid`。
7. 调 `get_admin_list(suite_access_token, open_corpid, agentid)`。
8. 命中 `userid` 或 `open_userid` 且 `auth_type=1` 后，创建/更新本地 tenant admin session。

失败处理:

| 失败 | 用户提示 | 记录 |
|---|---|---|
| state 无效/过期 | 请重新扫码 | 不调用企业微信 |
| 企业未安装应用 | 企业尚未完成授权 | 记录失败登录 |
| tenant 缺 `agentid` | 授权信息不完整，请联系平台管理员重新授权 | 记录失败登录 |
| 未命中管理员列表 | 你不是该企业管理员 | 记录失败登录 |
| `auth_type=0` | 当前管理员没有管理权限 | 记录失败登录 |
| 本地管理员 disabled | 本地管理员账号已停用 | 记录失败登录 |

常见配置错误:

- `appid 参数错误`: 多数是 `ServiceApp` 登录的 `appid` 填成了服务商 CorpID、企业 CorpID 或小程序 AppID。应填 `WECOM_SUITE_ID`。
- `redirect_uri` 不合法: 检查企业微信后台可信域名、回调域名、HTTPS、路径和 URL 编码。
- 回跳后找不到用户凭据: 检查 `state` 是否复用、前后端域名是否一致、后端是否已部署最新版本。

## 6. 通讯录同步和 48002 降级

通讯录同步入口使用企业 `access_token` 调 `user/list_id`。

硬性规则:

- 企业 `access_token` 必须来自 `get_corp_token(auth_corpid, permanent_code)`。
- `user/list_id` 不是服务商 token 接口，不能传 `suite_access_token`。
- `48002 api forbidden` 表示当前应用未被授权通讯录读取接口或可见范围不足。

产品降级:

- 没有通讯录权限时，不阻断企业管理员扫码登录。
- 系统只支持管理员扫码按需建档。
- 管理页应展示可操作说明: 在服务商后台申请/确认通讯录权限，企业重新授权；没有权限时无法全量同步成员。

## 7. 成员敏感信息授权

用途: 同步企业微信头像和个人二维码。

顺序:

1. 用户主动触发敏感信息授权。
2. 回跳 `code/state`。
3. 后端调 `getuserinfo3rd`，要求返回 `user_ticket`。
4. 后端调 `getuserdetail3rd(user_ticket)`。
5. 校验 `open_corpid/open_userid` 与当前用户身份一致。
6. 将图片转 HTTPS 并缓存到租户存储。

规则:

- 没有 `user_ticket` 时不能调用 `getuserdetail3rd`。
- 用户拒绝授权时不能覆盖现有头像/二维码。
- 返回的图片 URL 必须只接受 HTTPS；HTTP 可升级为 HTTPS，其他协议拒绝。

## 8. 回调处理规范

指令回调分两类:

| InfoType | HTTP 内同步做 | 异步做 |
|---|---|---|
| `suite_ticket` | 验签、解密、校验 SuiteID/receive id、保存 ticket、标记 done | 无 |
| `create_auth` | 验签、解密、幂等落库、读取 AuthCode、立即 ACK | 换永久授权码、保存 tenant、触发同步 |
| `change_auth` | 验签、解密、幂等落库、读取 AuthCorpId、立即 ACK | 刷新授权信息、触发同步 |
| `cancel_auth` | 验签、解密、幂等落库、读取 AuthCorpId、立即 ACK | 取消授权、清理可复用凭证 |

回调 HTTP 响应要求:

- 成功接收后返回 `success`。
- 授权事件不能等待外部 API 或通讯录同步完成。
- 异步任务失败要 `markFailed`，由平台后台重试入口处理。
- 不允许在日志或 webhook 中输出明文 `permanent_code`、原始密文、原始 event key 或外部 hint。

## 9. 错误码和重试

规则:

- 判断企业微信接口结果必须看 `errcode`，不能按 `errmsg` 文案判断。
- 4xx 契约错误不重试，应修参数或配置。
- 429、408、5xx 可重试，但必须有次数上限和退避。
- 权限类错误要转成可操作提示，不向用户暴露 IP、hint、token、密钥或原始响应。

当前约定:

- `postJson` 对可重试状态做最多 3 次指数退避。
- `getJson` 用于短链路 GET；如后续接入高频 GET，应补同等重试策略。
- `48002` 映射为通讯录授权不足的业务错误。

## 10. 测试要求

每新增或修改一个企业微信 API 方法，必须补单测断言:

- method
- path
- query 参数名和 token 类型
- body 字段名和类型
- `errcode != 0` 的错误映射
- 缺失关键响应字段时的失败行为

已覆盖的关键测试:

- `backend/src/wecom/wecom-api-client.service.spec.ts`
- `backend/src/admin-auth/admin-wecom-scan-auth.service.spec.ts`
- `backend/src/wecom/wecom-command-callback.service.spec.ts`

发布前至少运行:

```bash
cd backend
npm test -- admin-wecom-scan-auth wecom-api-client wecom-command-callback
npm run typecheck
npm run build
npm run lint
```

## 11. 上线配置检查清单

- `WECOM_PROVIDER_CORP_ID` 是服务商企业 ID。
- `WECOM_SUITE_ID` 是第三方应用 SuiteID，且用于 `ServiceApp` 登录 `appid`。
- `WECOM_SUITE_SECRET` 与 SuiteID 属于同一个第三方应用。
- 指令回调 URL、Token、EncodingAESKey 配置正确。
- 数据回调 URL、Token、EncodingAESKey 与指令回调分开配置。
- `WECOM_ADMIN_LOGIN_REDIRECT_URI` 已加入可信域名/回调域名，且与部署域名一致。
- `WECOM_INSTALL_REDIRECT_URI` 可公网 HTTPS 访问。
- 服务商后台合法来源 IP 包含生产出口 IP。
- 通讯录权限和可见范围已申请，并让试点企业重新授权。
- 成员敏感信息权限按需要勾选头像、二维码等字段。

## 12. 变更纪律

- 发现官方文档或真实联调与本指南冲突时，先更新本指南和测试，再改业务实现。
- 不同官方页面存在新旧链路差异时，要在文档中标明采用哪条链路和原因。
- 不能把审计报告当作唯一开发依据；审计报告负责证据，本文负责日常开发契约。
