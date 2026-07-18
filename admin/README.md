# Admin Console

## File Layout

- `index.html`: shared shell, login gate, dialogs, and partial mount points.
- `partials/pages/*.html`: one partial per admin page, named by `data-page`.
- `js/admin-partials.js`: shared page partial loader used before `app.js`.
- `js/admin-login.js`: login UI and login action bindings.
- `app.js`: shared admin state, API helpers, navigation, permissions, and feature page logic.

M1 静态企业管理后台，无构建步骤，可直接由 Nginx / COS 静态托管。

## 本地打开

直接用浏览器打开 `admin/index.html`，或把 `admin/` 目录托管到任意静态服务。

页面不会默认连接 localhost。生产托管时默认使用「当前域名 + `/api/v1`」；**后台与后端不同域名时**，复制 `config.example.js` 为同目录 `config.js` 并设置 `apiBase`（部署工作流不会覆盖服务器上的 config.js），同时把后台域名加入后端 `.env` 的 `CORS_ORIGINS`。

本地联调（`file://`、localhost 或 `?dev=1`）时可在页面右上角填写 API Base，或在控制台写入：

```js
localStorage.setItem("bc_api_base", "https://api.example.com/api/v1")
```

## 当前覆盖

- API 健康检查
- 分区式后台导航：概览、员工、企业资料、字段与模板、同步、授权与联调
- demo `qy-login`
- 企业微信授权链接生成（需要 `x-wecom-launch-token`）
- 企业微信扫码登录：页面请求 `/admin/auth/wecom/login-config` 跳转企微，回到本页后用 `code/state` 换取 Admin token
- Admin 企业微信 code 登录，可选 owner claim token 认领首个企业 owner
- Admin token 保存与 `admin/session/me`
- 后台概览、成员列表筛选/分页、成员名片读取/配置，核心数据以指标/表格呈现
- 字段规则读取/保存、企业资料完整字段保存、模板创建/编辑/设默认
- 当前员工名片读取/更新
- 员工分享 `share_id` 签发
- 公开名片预览
- visit / derive share 联调入口

demo 登录只用于本地联调；后端必须显式设置 `DEMO_AUTH_ENABLED=1` 才会接受 `demo-qy-code`，生产环境不可启用。
