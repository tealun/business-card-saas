# 01_02 API 契约（执行指引）

版本：v1.2 · 日期：2026-07-06 · 归属：后端
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

> R=请求关键字段，S=响应关键字段。完整 schema 由 Zod 定义；M1 阶段先落在 `backend/src/contracts`，小程序 / 后台需要复用时再按实际边界抽出共享包。

### 3.1 登录 / 身份（Auth）

| 方法 路径 | 鉴权 | R | S |
|-----------|------|---|---|
| POST `/api/v1/auth/wx-login` | 无 | `code` | 登录态、身份列表或单身份 |
| POST `/api/v1/auth/qy-login` | 无 | `code` | 同上（企业微信，open_userid） |
| POST `/api/v1/auth/bind-account` | JWT | `member_identity_id`、验证信息 | 绑定结果 |
| GET `/api/v1/auth/identities` | JWT | — | 已绑定企业身份列表 |
| POST `/api/v1/auth/switch-identity` | JWT | `member_identity_id` | 新登录态；更新 `account_preferences.last` |

登录降级：unionid 可能为空，openid-only 时仅返回当前 openid 绑定的身份（§5.2/§6.2）。

### 3.1.1 企业微信授权发起（Platform / WeCom）

| 方法 路径 | 鉴权 | R | S |
|-----------|------|---|---|
| POST `/api/v1/wecom/authorization-links` | Header `x-wecom-launch-token`（匹配 `WECOM_AUTH_LAUNCH_TOKEN`） | `redirect_uri?`、`state?`、`auth_type=official\|test?`、`app_ids?` | `authorization_url`、`suite_id`、`pre_auth_code_expires_in`、`redirect_uri`、`state`、`auth_type` |
| GET `/api/v1/wecom/authorization-complete` | 企业微信回跳 | `auth_code`、`state?` | `handled=true`、`tenant_id`、`open_corpid`、`corp_name`、`auth_status`、`state?` |

说明：`authorization-links` 用于平台方发起企业授权，调用前必须已有可用 `suite_ticket → suite_access_token`。服务端会先调用 `service/get_pre_auth_code`，再调用 `service/set_session_info`，最后生成 `open.work.weixin.qq.com/3rdapp/install` 授权链接。它不走租户 JWT，因为此时 tenant 可能尚未创建；生产环境必须配置高熵 `WECOM_AUTH_LAUNCH_TOKEN`。授权完成后若企业微信把 `auth_code` 附在 `redirect_uri` 回跳，`authorization-complete` 会复用授权服务换取 `permanent_code` 并创建/更新 tenant；若通过指令回调推送 `create_auth`，仍由 command callback 处理。

### 3.2 员工名片（Employee）

| 方法 路径 | 鉴权 | 说明 |
|-----------|------|------|
| GET `/api/v1/employee/cards/current` | JWT | 当前身份名片 |
| PUT `/api/v1/employee/cards/current` | JWT | 更新（字段权限校验；触发缓存失效 §32） |
| GET `/api/v1/employee/cards/current/preview` | JWT | 当前名片访客视角预览，含模板、公司内容、隐私判定后的公开字段 |
| PUT `/api/v1/employee/cards/current/style` | JWT | 员工选择企业允许的模板、背景、色彩；企业锁定项不可改 |
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

公开名片内容包响应需要支持 M2 内容型详情页：

```json
{
  "public_id": "pub_xxx",
  "status": "active",
  "card": {
    "display_name": "[示例姓名]",
    "title": "平面设计",
    "company": "[示例企业名称]",
    "avatar_url": "https://...",
    "fields": {
      "mobile": null,
      "phone": "021-5566XXXX",
      "email": "[示例邮箱]",
      "wechat_id": null,
      "address": "[示例地址]"
    }
  },
  "template": {
    "template_id": "tpl_xxx",
    "logo_url": "https://...",
    "background_url": "https://...",
    "color_scheme": {},
    "layout": {}
  },
  "company_profile": {
    "name": "[示例企业名称]",
    "intro_blocks": [],
    "website_url": "https://...",
    "address": "..."
  },
  "videos": [],
  "honors": []
}
```

约束：

- `fields` 必须经过企业规则、员工 privacy、字段存在、名片 active 四重判定。
- `template` 与 `company_profile` 只返回本 `tenant_id` 下已发布内容。
- `videos`、`honors` 默认只返回 `status=published` 且 `visible=true` 的内容。
- GET 仍然不返回 `visit_token`。

### 3.4 客户联系（Contact / Mapping，M3）

| 方法 路径 | 鉴权 | 说明 |
|-----------|------|------|
| GET `/api/v1/contact-way/cards/{public_id}` | visit_token | 返回可操作联系配置 / state 时必须绑定本次访问会话；不得无 token 暴露 `config_id`、state 明文或内部能力原因（按能力降级 §9.3，A7-P2-2） |
| POST `/api/v1/customer-mapping/map` | visit_token | unionid→external_userid；⚠️ **unionid 一律取服务端会话（code2session 结果），不接受客户端上送**——客户端可伪造 unionid 污染他人映射（A6-P1-6）；前置矩阵不满足则降级返回 `4xxxx`（§10） |
| POST `/api/v1/leads` | **visit_token（必须）** | 引流留资"我也想要名片"，写 `growth_leads`（§7.4，阶段二+）；限流 + 蜜罐字段防机器人刷 PII 垃圾数据（A6-P1-5） |

### 3.5 企业后台（Admin，JWT + 租户中间件）

| 方法 路径 | 说明 |
|-----------|------|
| POST `/api/v1/admin/auth/qy-login` | 企业微信管理员 code 登录；后端按授权企业与 `tenant_admins.open_userid` 定位管理员，非管理员拒绝；首个 owner 可携带可选 `claim_token` 完成一次性认领 |
| GET `/api/v1/admin/session/me` | 读取当前后台登录态、租户、`open_userid` 与角色 |
| GET `/api/v1/admin/overview` | 企业概览；MVP 返回当前租户成员/名片基础计数 |
| GET `/api/v1/admin/members` | 员工列表（分页） |
| POST `/api/v1/admin/members/sync` | 手动触发企业微信通讯录可见成员全量同步；需要 admin/owner 权限 |
| GET `/api/v1/admin/sync-events` | 最近企业微信同步/回调事件；按当前租户过滤，不返回密文 payload |
| POST `/api/v1/admin/sync-events/retry` | 重试当前租户失败的企业微信 data callback；需要 admin/owner 权限；达到重试上限的事件进入 `dead` 状态 |
| GET `/api/v1/admin/members/{id}/card` | 读取员工名片配置；数据库模式按当前租户读取 `cards`，联系方式字段从 `fields_encrypted` 解密后返回 |
| PUT `/api/v1/admin/members/{id}/card` | 更新员工名片配置与启停状态；需要 operator/admin/owner 权限；数据库模式写入成员姓名、主名片字段、隐私开关、状态和公开目录，联系方式字段加密保存 |
| GET `/api/v1/admin/cards` | 规划：独立名片列表；当前按员工进入 `GET /api/v1/admin/members/{id}/card` |
| PUT `/api/v1/admin/cards/{id}/status` | 规划：独立名片启停；当前用 `PUT /api/v1/admin/members/{id}/card` 的 `status` 字段 |
| GET/POST `/api/v1/admin/templates` | 模板 |
| GET/PUT `/api/v1/admin/settings/fields` | 字段规则（企业硬边界，§11.3） |
| GET `/api/v1/admin/stats/overview` | 统计概览（口径见 §32；后续增强，当前概览先用 `/admin/overview`） |
| GET `/api/v1/admin/audit-logs` | 操作日志 |

### 3.6 企业内容与模板（Admin / M2）

| 方法 路径 | 鉴权 | 说明 |
|-----------|------|------|
| GET `/api/v1/admin/company-profile` | Admin JWT | 读取企业介绍、官网、地址、认证状态、公开展示开关 |
| PUT `/api/v1/admin/company-profile` | Admin JWT | 更新企业介绍；触发关联公开名片缓存失效 |
| GET `/api/v1/admin/company-videos` | Admin JWT | 企业视频列表 |
| POST `/api/v1/admin/company-videos` | Admin JWT | 新增视频，支持封面、排序、展示开关 |
| PUT `/api/v1/admin/company-videos/{id}` | Admin JWT | 更新视频 |
| DELETE `/api/v1/admin/company-videos/{id}` | Admin JWT | 软删除视频 |
| GET `/api/v1/admin/company-honors` | Admin JWT | 公司荣誉列表 |
| POST `/api/v1/admin/company-honors` | Admin JWT | 新增荣誉，支持图文与图片数组 |
| PUT `/api/v1/admin/company-honors/{id}` | Admin JWT | 更新荣誉 |
| DELETE `/api/v1/admin/company-honors/{id}` | Admin JWT | 软删除荣誉 |
| GET `/api/v1/admin/templates` | Admin JWT | 模板列表 |
| POST `/api/v1/admin/templates` | Admin JWT | 新增模板，含背景、颜色、布局 JSON |
| PUT `/api/v1/admin/templates/{id}` | Admin JWT | 更新模板 |
| PUT `/api/v1/admin/templates/{id}/default` | Admin JWT | 设为默认模板；租户内唯一 |

上传与内容安全：

- 图片、视频先上传到对象存储临时区，经类型、大小、扩展名、MIME、图片解码校验后转正。
- 图片去 EXIF；视频限制大小、时长和格式。
- 外链只允许 `https://` 和企业白名单域名；短链需展开审核。
- 所有内容写操作记录 `audit_logs`。

### 3.7 企业微信回调（WeCom）

| 方法 路径 | 鉴权 | 说明 |
|-----------|------|------|
| GET `/api/v1/wecom/callbacks/command` | 企业微信签名 | 指令回调 URL 验证；使用指令回调 Token/AESKey |
| POST `/api/v1/wecom/callbacks/command` | 企业微信签名 | 接收 suite_ticket、create_auth/change_auth 等套件级事件 |
| GET `/api/v1/wecom/callbacks/data` | 企业微信签名 | 数据回调 URL 验证；使用数据回调 Token/AESKey |
| POST `/api/v1/wecom/callbacks/data` | 企业微信签名 | 接收第三方数据回调 `InfoType=change_contact`/`AuthCorpId` 增量同步；兼容内部应用 `Event=change_contact`，当前处理 create/update/delete_user |

数据回调处理前写入 `callback_events` 幂等日志；`done/processing` 重复事件直接返回 `success`，`failed` 事件允许企业微信重推或后台 `POST /api/v1/admin/sync-events/retry` 后重新处理。为避免进程异常导致事件永久卡在 `processing`，`processing` 超过 5 分钟后按重试处理并递增 `retry_count`；超过重试上限后标记为 `dead`，由后台日志展示并进入人工排查。若配置 `WECOM_CALLBACK_ALERT_WEBHOOK_URL`，进入 `dead` 时会发送脱敏 webhook 告警。

## 4. 待核对

- 各接口完整 Zod schema 落地在 `backend/src/contracts` 后回链本文件；若后续小程序 / 后台直接复用，再抽独立共享包。
- 分页统一 offset 还是 cursor（热表建议 cursor），实现前定稿。
