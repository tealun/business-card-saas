# 小程序

M1 原生微信小程序，用于企业微信工作台打开、员工名片维护、访客公开访问和埋点联调。

## 本地配置

这里有两类本地配置，不能合并到同一个文件，因为读取它们的是两个不同系统。

| 文件 | 谁读取 | 用途 | 是否提交 |
| --- | --- | --- | --- |
| `project.config.json` | 微信开发者工具 | 团队共享工程配置；`appid` 固定用 `touristappid` 占位 | 是 |
| `project.private.config.json` | 微信开发者工具 | 本机真实 AppID 和个人开发者工具设置 | 否 |
| `config.js` | 小程序运行时代码 | 本机后端 `apiBase` 和 demo 登录开关 | 否 |

新同事先复制两个模板：

```powershell
Copy-Item miniprogram\project.private.config.example.json miniprogram\project.private.config.json
Copy-Item miniprogram\config.example.js miniprogram\config.js
```

然后只改本地文件：

```json
// miniprogram/project.private.config.json
{
  "appid": "<你的真实小程序 AppID>"
}
```

```js
// miniprogram/config.js
module.exports = {
  apiBase: "https://api.example.com/api/v1",
  demoAuthEnabled: false
};
```

不要把真实 AppID 写进 `project.config.json`。这个文件会提交到仓库，必须保持：

```json
"appid": "touristappid"
```

完整说明见 [CONFIGURATION.md](./CONFIGURATION.md)。

## 页面

- `pages/employee/index`：员工首页工作台。
- `pages/employee/edit`：编辑名片资料和联系方式。
- `pages/employee/style`：名片样式设置。
- `pages/public/card`：访客公开名片页。
- `pages/card-wallet/index`：名片夹。
- `pages/company-card/index`：企业名片入口。
