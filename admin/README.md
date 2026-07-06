# Admin Workbench

M1 静态后台工作台，无构建步骤，可直接由 Nginx / COS 静态托管。

## 本地打开

直接用浏览器打开 `admin/index.html`，或把 `admin/` 目录托管到任意静态服务。

默认 API 地址为 `http://localhost:3000/api/v1`。部署后可在页面右上角修改 API Base，或在控制台写入：

```js
localStorage.setItem("bc_api_base", "https://api.example.com/api/v1")
```

## 当前覆盖

- API 健康检查
- demo `qy-login`
- Admin token 保存与 `admin/session/me`
- 后台概览、成员列表、成员名片读取/配置
- 字段规则、企业资料、模板配置联调入口
- 当前员工名片读取/更新
- 员工分享 `share_id` 签发
- 公开名片预览
- visit / derive share 联调入口

demo 登录只用于本地联调；后端必须显式设置 `DEMO_AUTH_ENABLED=1` 才会接受 `demo-qy-code`，生产环境不可启用。
