# 01_02 API 契约（执行指引）

版本：v1.1 · 日期：2026-07-02 · 归属：后端
关联主文档：[`../00-core/00_01_Dev_Doc.md`](../00-core/00_01_Dev_Doc.md) 的 §14（接口草案）、§28（API 规范）、§16（隔离）、§14.3/§32（埋点与口径）
职责：本文件是**接口契约的执行事实源**（路径、鉴权、请求/响应、错误码、分页）；主文档 §14/§28 保留规范要点。

---

## 1. 通用约定

- 前缀 `/api/v1`；破坏性变更升 `/api/v2`（§28.1）。
- 统一响应：`{ code, message, data, trace_id }`，`code=0` 成功；HTTP 状态码同时正确使用。
- 校验：请求/响应用 **Zod**（`nestjs-zod`），枚举用 `z.enum` 作硬边界（§33.2）。
- 鉴权：员工/后台走 **JWT**；公开名片接口无登录但动作上报需 **visit_token**（§14.3）。
- 隔离：所有 `/api/v1/admin/*` 与 `/api/v1/employee/*` 接口经租户中间件注入 `tenant_id` + RLS（§16.1）；**禁止**接受前端传入 tenant_id。
- 分页：`page` / `page_size`（或 cursor），返回 `total`。
- 限流：公开接口按 IP/`public_id` 限流防刷（§17.3）。

## 2. 错误码分段（§28.2）

| 段 | 含义 | 示例 |
|----|------|------|
| `1xxxx` | 鉴权 | `10001` 未登录、`10002` 登录态过期 |
| `2xxxx` | 参数 | `20001` 校验失败 |
| `3xxxx` | 权限/租户 | `30001` 越权、`30002` 无该能力/许可 |
| `4xxxx` | 企业微信侧 | `40001` 映射前置不满足、`40002` 接口限频 |
| `5xxxx` | 系统 | `50001` 内部错误 |

## 3. 接口清单（契约）

> R=请求关键字段，S=响应关键字段。完整 schema 由 Zod 定义并生成类型至 `packages/shared-types`。

### 3.1 登录 / 身份（Auth）

| 方法 路径 | 鉴权 | R | S |
|-----------|------|---|---|
| POST `/api/v1/auth/wx-login` | 无 | `code` | 登录态、身份列表或单身份 |
| POST `/api/v1/auth/qy-login` | 无 | `code` | 同上（企业微信，open_userid） |
| POST `/api/v1/auth/bind-account` | JWT | `member_identity_id`、验证信息 | 绑定结果 |
| GET `/api/v1/auth/identities` | JWT | — | 已绑定企业身份列表 |
| POST `/api/v1/auth/switch-identity` | JWT | `member_identity_id` | 新登录态；更新 `account_preferences.last` |

登录降级：unionid 可能为空，openid-only 时仅返回当前 openid 绑定的身份（§5.2/§6.2）。

### 3.2 员工名片（Employee）

| 方法 路径 | 鉴权 | 说明 |
|-----------|------|------|
| GET `/api/v1/employee/cards/current` | JWT | 当前身份名片 |
| PUT `/api/v1/employee/cards/current` | JWT | 更新（字段权限校验；触发缓存失效 §32） |
| POST `/api/v1/employee/cards/current/poster` | JWT | 生成海报（含小程序码，scene 放 share_id） |
| GET `/api/v1/employee/cards/current/stats` | JWT | 本名片统计（按 trust_level 分层 §32） |
| POST `/api/v1/employee/cards/current/share` | JWT | 签发 `share_id`（写 `card_shares`，§6.3） |

### 3.3 公开访问（Public，无登录）

| 方法 路径 | 鉴权 | 说明 |
|-----------|------|------|
| GET `/api/v1/public/cards/{public_id}` | 无 | 仅返回隐私判定后的公开字段（§11.3）；**纯内容读取，可缓存（CDN/ETag），不下发 token（A6-P0-1）** |
| POST `/api/v1/public/cards/{public_id}/visit` | 无（IP/public_id 限流） | R=`share?`、`anon_id?`；记访问（落 card_visits：visit_id/share_id/anon_id）；`share` 由服务端反查归因；客户端回传的 `anon_id` 仅接受服务端签发格式，非法则忽略并重签；S=`visit_id`、`visit_token`、`anon_id`、`expires_in`；**响应签发 `visit_token`（§14.6）**，不缓存（A7-P1-3） |
| POST `/api/v1/public/cards/{public_id}/actions` | visit_token | 记动作；`(visit_id, action_type)` 幂等 |
| POST `/api/v1/public/cards/{public_id}/shares/derive` | visit_token | 二次转发派生 `share_id`：R=`parent_share_id`；校验父 share 归属本名片，深度上限 3，超限返回父 share（§6.3 / A6-P1-2）；限流 |
| GET `/api/v1/public/cards/{public_id}/vcard` | 无 | vCard；⚠️ 遵守隐私开关，`show_mobile=false` 不含手机号（A3-3） |

**只用 `public_id`，不暴露内部自增 ID / slug（§30.1）。**

### 3.4 客户联系（Contact / Mapping，M3）

| 方法 路径 | 鉴权 | 说明 |
|-----------|------|------|
| GET `/api/v1/contact-way/cards/{public_id}` | visit_token | 返回可操作联系配置 / state 时必须绑定本次访问会话；不得无 token 暴露 `config_id`、state 明文或内部能力原因（按能力降级 §9.3，A7-P2-2） |
| POST `/api/v1/customer-mapping/map` | visit_token | unionid→external_userid；⚠️ **unionid 一律取服务端会话（code2session 结果），不接受客户端上送**——客户端可伪造 unionid 污染他人映射（A6-P1-6）；前置矩阵不满足则降级返回 `4xxxx`（§10） |
| POST `/api/v1/leads` | **visit_token（必须）** | 引流留资"我也想要名片"，写 `growth_leads`（§7.4，阶段二+）；限流 + 蜜罐字段防机器人刷 PII 垃圾数据（A6-P1-5） |

### 3.5 企业后台（Admin，JWT + 租户中间件）

| 方法 路径 | 说明 |
|-----------|------|
| GET `/api/v1/admin/members` | 员工列表（分页） |
| GET `/api/v1/admin/cards` | 名片列表 |
| PUT `/api/v1/admin/cards/{id}/status` | 启用/停用（触发缓存失效） |
| GET/POST `/api/v1/admin/templates` | 模板 |
| PUT `/api/v1/admin/settings/fields` | 字段规则（企业硬边界，§11.3） |
| GET `/api/v1/admin/stats/overview` | 统计概览（口径见 §32） |
| GET `/api/v1/admin/audit-logs` | 操作日志 |

## 4. 待核对

- 各接口完整 Zod schema 落地在 `packages/shared-types` 后回链本文件。
- 分页统一 offset 还是 cursor（热表建议 cursor），实现前定稿。
