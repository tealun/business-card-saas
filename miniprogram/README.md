# Miniprogram

M1 原生微信小程序骨架，用于企业微信工作台打开、员工名片维护、客户公开访问和埋点联调。

## 配置

1. 用微信开发者工具导入 `miniprogram/`。
2. 普通小程序开发先复制一份本地配置文件。`config.example.js` 只是模板说明，运行时不会读取；`config.js` 已加入 `.gitignore`，不会提交到公开仓库：

```powershell
Copy-Item miniprogram\config.example.js miniprogram\config.js
```

3. 打开 `miniprogram/config.js`，按注释填写 `apiBase`。值必须包含后端统一前缀 `/api/v1`；体验版/正式版必须使用 HTTPS，开发版可显式配置 localhost：

```js
module.exports = {
  apiBase: "https://api.example.com/api/v1",
  demoAuthEnabled: false
};
```

4. 只有接入第三方平台 / 代开发模板时，才考虑用 ext config 覆盖 `apiBase`；当前阶段不用去微信后台找这个配置项。
5. 企业微信环境下使用 `wx.qy.login`；普通微信开发者工具里可用 `demoAuthEnabled=true` 降级为 demo code。正式环境必须关闭 demo 并接真实企业微信登录。

完整配置步骤见 [`../docs/01-specs/01_06_Miniprogram_Config_Guide.md`](../docs/01-specs/01_06_Miniprogram_Config_Guide.md)。

## 页面

- `pages/employee/index`：我的名片首页工作台，含名片预览、状态提醒、发名片、快捷入口和数据空状态。
- `pages/employee/edit`：编辑资料，覆盖基础信息、联系方式和隐私设置。
- `pages/employee/style`：名片样式页，M1 支持 demo 模板和品牌色应用。
- `pages/public/card`：访客名片详情，含员工名片首屏、公司介绍、企业视频、公司荣誉、visit、动作埋点和二次转发派生 `share_id`。
- `pages/card-wallet/index`：名片夹空状态，M3 增强。
- `pages/company-card/index`：企业名片入口，M2/M3 增强。
