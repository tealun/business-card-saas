# 01_06 小程序配置与后端对接指南

版本：v1.0 · 日期：2026-07-08 · 归属：小程序 / 企业微信对接组

本文回答两个落地问题：

1. 小程序前端如何接入微信 / 企业微信官方后台。
2. 小程序如何配置到我们的系统后端。

关联文档：

- [`01_01_Wecom_Integration.md`](01_01_Wecom_Integration.md)：企业微信第三方应用、双回调、授权和 `wx.qy.login`。
- [`01_03_Miniprogram_Guide.md`](01_03_Miniprogram_Guide.md)：页面、分享、登录和埋点执行指引。
- [`../88-planning/88_01_Backend_Deployment_Guide.md`](../88-planning/88_01_Backend_Deployment_Guide.md)：后端部署、域名、HTTPS 和生产 `.env`。

---

## 1. 当前代码里的配置入口

小程序请求统一走：

- [`../../miniprogram/utils/api.js`](../../miniprogram/utils/api.js)

后端地址读取优先级：

```text
wx.getExtConfigSync().apiBase
  -> getApp().globalData.apiBase
```

普通小程序开发不要去微信后台找 `apiBase` 配置项，微信后台没有这个表单。当前项目使用“小程序版 env”：

- [`../../miniprogram/config.example.js`](../../miniprogram/config.example.js)：提交到公开仓库的模板说明，运行时不会读取。
- `miniprogram/config.local.js`：本地真实配置，运行时只读这个文件；已加入 `.gitignore`，不要提交。

先复制示例文件：

```powershell
Copy-Item miniprogram\config.example.js miniprogram\config.local.js
```

再打开 `miniprogram/config.local.js`，把 `apiBase` 从空字符串改成你的后端地址：

```js
module.exports = {
  apiBase: "https://api.example.com/api/v1",
  demoAuthEnabled: false
};
```

`app.js` 只会读取 `config.local.js`。如果这个文件不存在或没有填写 `apiBase`，小程序会在发请求时提示 `API Base 未配置`，不会回落读取示例文件。`wx.getExtConfigSync().apiBase` 是第三方平台 / 代开发模板场景才会用的覆盖配置；当前阶段可以先忽略。

示例模板在：

- [`../../miniprogram/config.example.js`](../../miniprogram/config.example.js)

```js
module.exports = {
  apiBase: "",
  demoAuthEnabled: false
};
```

后端统一 API 前缀是：

```text
/api/v1
```

所以小程序侧 `apiBase` 应配置为完整 API 根地址，例如：

```text
https://api.example.com/api/v1
```

不要只填 `https://api.example.com`，否则当前页面里的 `/auth/qy-login`、`/employee/cards/current` 等路径会少 `/api/v1`。

---

## 2. 本地开发配置

### 2.1 微信开发者工具导入

1. 打开微信开发者工具。
2. 选择「导入项目」。
3. 项目目录选择仓库内 `miniprogram/`。
4. AppID 使用真实小程序 AppID；当前 `project.config.json` 已写入：

```json
{
  "appid": "wx9927ec4d4239bb6f"
}
```

本地工具生成的 `project.private.config.json` 属于个人开发者工具配置，通常不作为团队事实源。

### 2.2 开发版后端地址

开发版允许使用本机或局域网 HTTP。为了最快联调，打开 `miniprogram/config.local.js`，把 `apiBase` 改成：

```js
apiBase: "http://127.0.0.1:3030/api/v1"
```

如果需要在手机预览里访问本机后端，`127.0.0.1` 会指向手机自身，需改成电脑局域网 IP，例如：

```js
apiBase: "http://192.168.1.10:3030/api/v1"
```

同时后端 `.env` 保持：

```env
HOST=0.0.0.0
PORT=3030
```

开发者工具里可临时关闭「不校验合法域名、web-view、TLS 版本以及 HTTPS 证书」。体验版和正式版不能依赖这个开关。

### 2.3 Demo 登录

普通微信开发者工具没有 `wx.qy.login`。本项目支持本地 demo code 降级：

```js
demoAuthEnabled: true
```

后端本地 `.env` 对应：

```env
DEMO_AUTH_ENABLED=1
```

生产环境必须关闭：

```env
DEMO_AUTH_ENABLED=0
```

---

## 3. 官方小程序后台配置

入口：微信公众平台 / 小程序后台。

### 3.1 开发管理

需要确认：

- 小程序 AppID 与 `miniprogram/project.config.json` 一致。
- 已添加开发者、体验成员。
- 体验版 / 正式版上传时使用同一个 AppID。

### 3.2 服务器域名

入口通常为：

```text
开发管理 -> 开发设置 -> 服务器域名
```

至少配置：

| 类型 | 域名 |
|------|------|
| request 合法域名 | `https://api.example.com` |
| uploadFile 合法域名 | 后续如有上传能力再填 |
| downloadFile 合法域名 | 后续如有素材下载再填 |
| socket 合法域名 | 当前不用 |

注意：

- 合法域名只填协议 + 域名，不填路径；即填 `https://api.example.com`，不要填 `/api/v1`。
- 体验版 / 正式版请求必须 HTTPS。
- 域名证书必须有效，并且服务公网可访问。

### 3.3 业务域名

当前原生页面不依赖 web-view。若后续使用 H5 兜底页或 web-view，需要在小程序后台配置业务域名，并按官方要求上传校验文件。

### 3.4 上传和发布

发布前检查：

- `app.js` 或 ext config 的 `apiBase` 指向生产后端：

```text
https://api.example.com/api/v1
```

- 开发者工具详情里不要勾选依赖本地调试的域名校验豁免。
- 真机体验版验证：
  - `/api/v1/health/ready` 可访问。
  - 员工端 `wx.qy.login` 可拿到 code。
  - `POST /api/v1/auth/qy-login` 返回 `access_token`。
  - `GET /api/v1/employee/cards/current/preview` 返回当前名片。

---

## 4. 企业微信服务商后台配置

入口：企业微信服务商后台 / 第三方应用。

### 4.1 服务商套件配置

服务商后台拿到的值配置到后端生产 `.env`：

```env
WECOM_SUITE_ID=wwsuite_real_value
WECOM_SUITE_SECRET=real_suite_secret
```

这些是 SaaS 服务商套件级凭据，不是某个客户企业自己的 CorpID、AgentID 或 Secret。

### 4.2 指令回调

后台 URL 配置：

```text
https://api.example.com/api/v1/wecom/callbacks/command
```

后端 `.env` 保持一致：

```env
WECOM_CALLBACK_TOKEN=real_command_callback_token
WECOM_CALLBACK_AES_KEY=real_43_character_command_encoding_aes_key
```

用途：

- 接收 `suite_ticket`
- 接收 `create_auth` / `change_auth` / `cancel_auth`
- 完成 URL 验证 `echostr`

### 4.3 数据回调

后台 URL 配置：

```text
https://api.example.com/api/v1/wecom/callbacks/data
```

后端 `.env` 保持一致：

```env
WECOM_DATA_CALLBACK_TOKEN=real_data_callback_token
WECOM_DATA_CALLBACK_AES_KEY=real_43_character_data_callback_encoding_aes_key
```

用途：

- 通讯录变更
- 客户联系等业务事件

### 4.4 授权完成回调

后台和后端 `.env` 使用同一地址：

```env
WECOM_INSTALL_REDIRECT_URI=https://api.example.com/api/v1/wecom/authorization-complete
```

当前代码入口：

```text
GET /api/v1/wecom/authorization-complete
```

平台方生成授权链接的内部接口：

```text
POST /api/v1/wecom/authorization-links
Header: x-wecom-launch-token: <WECOM_AUTH_LAUNCH_TOKEN>
```

---

## 5. 小程序对接我们系统后端

### 5.1 后端生产环境变量

生产服务器 `.env` 至少确认：

```env
NODE_ENV=production
HOST=0.0.0.0
PORT=3000
CORS_ORIGINS=https://admin.example.com
DATABASE_URL=postgresql://...
JWT_SECRET=...
ADMIN_JWT_SECRET=...
VISIT_TOKEN_SECRET=...
CARD_FIELD_ENCRYPTION_KEY_BASE64=...
WECOM_STATE_ENCRYPTION_KEY_BASE64=...
WECOM_SUITE_ID=...
WECOM_SUITE_SECRET=...
WECOM_CALLBACK_TOKEN=...
WECOM_CALLBACK_AES_KEY=...
WECOM_DATA_CALLBACK_TOKEN=...
WECOM_DATA_CALLBACK_AES_KEY=...
WECOM_AUTH_LAUNCH_TOKEN=...
WECOM_INSTALL_REDIRECT_URI=https://api.example.com/api/v1/wecom/authorization-complete
```

小程序请求不走浏览器 CORS，但管理后台会走 CORS，所以 `CORS_ORIGINS` 至少包含管理后台域名。

### 5.2 反向代理

公网域名：

```text
https://api.example.com
```

Nginx / 宝塔反代到：

```text
http://127.0.0.1:3000
```

验证：

```text
https://api.example.com/api/v1/health/live
https://api.example.com/api/v1/health/ready
```

### 5.3 小程序前端配置值

生产值：

```text
apiBase=https://api.example.com/api/v1
```

可配置在两处：

1. 当前阶段：改本地文件 `miniprogram/config.local.js` 里的 `apiBase`。
2. 后续第三方平台 / 代开发模板场景：用 ext config 提供 `apiBase`，代码会通过 `wx.getExtConfigSync().apiBase` 读取。

当前普通小程序直接开发，建议先用 `app.js` 明确写环境值；进入多租户第三方发布或动态部署时，再改为 ext config / 构建注入。

### 5.4 当前小程序会调用的核心接口

| 场景 | 方法和路径 |
|------|------------|
| 企业微信员工登录 | `POST /api/v1/auth/qy-login` |
| 读取当前员工名片 | `GET /api/v1/employee/cards/current` |
| 读取员工首页预览 | `GET /api/v1/employee/cards/current/preview` |
| 保存名片资料 | `POST /api/v1/employee/cards/current` |
| 保存名片样式 | `POST /api/v1/employee/cards/current/style` |
| 创建分享 | `POST /api/v1/employee/cards/current/share` |
| 访客读取公开名片 | `GET /api/v1/public/cards/{public_id}` |
| 访客访问埋点 | `POST /api/v1/public/cards/{public_id}/visit` |
| 访客动作埋点 | `POST /api/v1/public/cards/{public_id}/actions` |
| 访客二次分享派生 | `POST /api/v1/public/cards/{public_id}/shares/derive` |

---

## 6. 联调顺序

1. 后端部署并确认 `/api/v1/health/ready` 通过。
2. 配置企业微信服务商后台的指令回调和数据回调，完成 URL 验证。
3. 等待或触发 `suite_ticket` 推送，确认后端可换 `suite_access_token`。
4. 用 `POST /api/v1/wecom/authorization-links` 生成试点企业授权链接。
5. 试点企业完成授权，后端创建或更新 tenant。
6. 小程序 `apiBase` 指向该后端。
7. 企业微信工作台打开小程序，调用 `wx.qy.login`。
8. 小程序调用 `POST /api/v1/auth/qy-login`，后端识别 tenant + employee，并签发 JWT。
9. 进入员工首页，读取 `/employee/cards/current/preview`。
10. 发名片，访客打开 `/pages/public/card?card=pub_xxx&share=shr_xxx` 并触发公开接口。

---

## 7. 常见问题

### 7.1 开发者工具能访问，体验版不能访问

通常是以下之一：

- 小程序后台没有配置 request 合法域名。
- `apiBase` 仍是 HTTP 或局域网地址。
- HTTPS 证书不被微信客户端信任。
- 后端路径少了 `/api/v1`。

### 7.2 企业微信里登录失败

检查：

- 小程序是否与企业微信第三方应用关联。
- 试点企业是否已授权该第三方应用。
- 后端是否已收到 `suite_ticket` 并能获取 `suite_access_token`。
- `POST /api/v1/auth/qy-login` 是否命中真实 `jscode2session`，而不是 demo 逻辑。

### 7.3 普通微信打开员工端失败

这是符合预期的阶段行为。员工端依赖 `wx.qy.login`，应在企业微信环境打开；普通微信开发者工具可临时启用 `demoAuthEnabled`。

### 7.4 回调 URL 验证失败

检查：

- URL 是否精确到 `/api/v1/wecom/callbacks/command` 或 `/api/v1/wecom/callbacks/data`。
- 后台 Token / EncodingAESKey 是否与后端 `.env` 完全一致。
- 后端公网 HTTPS 是否可被企业微信访问。
- 反代是否原样透传 query string 和 XML body。

---

## 8. 今日开发建议

优先把“真实后端域名 + 小程序后台 request 合法域名 + 企业微信双回调”跑通。只要这条链路通过，后续名片页面、模板、成员管理都是普通业务迭代；如果这条链没通，页面做得再完整也只能停在 demo。
