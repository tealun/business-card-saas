# 小程序配置说明

本项目故意保留两个本地配置文件：`project.private.config.json` 和 `config.js`。这不是为了复杂化，而是因为它们被不同系统读取。

## 为什么不能合并

`project.private.config.json` 由微信开发者工具读取，读取时机在小程序代码运行之前。真实 `appid` 必须放在这里，开发者工具才知道当前项目对应哪个小程序。

`config.js` 由小程序运行时代码读取，入口在 `app.js`。它只适合放运行时配置，例如 `apiBase` 和 `demoAuthEnabled`。

微信开发者工具不会读取 `config.js` 来决定项目 AppID，所以把 `appid` 放进 `config.js` 不会生效。

## 文件职责

| 文件 | 状态 | 说明 |
| --- | --- | --- |
| `project.config.json` | 提交 | 团队共享工程文件，`appid` 固定保持 `touristappid`。 |
| `project.private.config.example.json` | 提交 | 每个开发者私有开发者工具配置的模板。 |
| `project.private.config.json` | 忽略 | 本机真实 AppID，不提交。 |
| `config.example.js` | 提交 | 小程序运行时配置模板。 |
| `config.js` | 忽略 | 本机真实运行时配置，不提交。 |

## 新同事配置步骤

复制两个模板：

```powershell
Copy-Item miniprogram\project.private.config.example.json miniprogram\project.private.config.json
Copy-Item miniprogram\config.example.js miniprogram\config.js
```

编辑 `miniprogram/project.private.config.json`，填真实小程序 AppID：

```json
{
  "appid": "<你的真实小程序 AppID>"
}
```

编辑 `miniprogram/config.js`，填后端 API 地址：

```js
module.exports = {
  apiBase: "https://api.example.com/api/v1",
  demoAuthEnabled: false
};
```

`apiBase` 必须带 `/api/v1`。

## 提交规则

- 不提交真实 AppID。
- 不提交 `miniprogram/project.private.config.json`。
- 不提交 `miniprogram/config.js`。
- `miniprogram/project.config.json` 里的 `appid` 必须保持 `touristappid`。
- `demoAuthEnabled: true` 只允许本地开发使用，体验版和正式版必须关闭。
