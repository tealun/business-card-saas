# Admin Console

M1 静态企业管理后台，无构建步骤，可直接由 Nginx / COS 静态托管。

## 本地打开

直接用浏览器打开 `admin/index.html`，或把 `admin/` 目录托管到任意静态服务。

默认 API 地址为 `http://localhost:3000/api/v1`。部署后可在页面右上角修改 API Base，或在控制台写入：

```js
localStorage.setItem("bc_api_base", "https://api.example.com/api/v1")
```

## 当前覆盖

- API 健康检查
- 分区式后台导航：概览、员工、企业资料、字段与模板、同步、授权与联调
- demo `qy-login`
- 企业微信授权链接生成（需要 `x-wecom-launch-token`）
- Admin 企业微信 code 登录，可选 owner claim token 认领首个企业 owner
- Admin token 保存与 `admin/session/me`
- 后台概览、成员列表、成员名片读取/配置，核心数据以指标/表格呈现
- 字段规则读取/保存、企业资料、模板配置入口
- 当前员工名片读取/更新
- 员工分享 `share_id` 签发
- 公开名片预览
- visit / derive share 联调入口

demo 登录只用于本地联调；后端必须显式设置 `DEMO_AUTH_ENABLED=1` 才会接受 `demo-qy-code`，生产环境不可启用。
