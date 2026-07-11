// 小程序运行时配置模板。
// 新同事复制本文件为 miniprogram/config.js，然后在 config.js 里填写本机配置。
// config.js 已加入 .gitignore，不能提交。
//
// 注意：AppID 不属于这里。
// 微信开发者工具会在 JS 运行前读取 project.config.json / project.private.config.json，
// 不会从 config.js 读取 AppID。

module.exports = {
  // 后端 API 根地址，必须带 /api/v1。
  // 生产 / 体验版示例：https://api.example.com/api/v1
  // 开发者工具本机示例：http://127.0.0.1:3030/api/v1
  // 真机局域网调试示例：http://192.168.1.10:3030/api/v1
  apiBase: "",

  // 仅本地开发可设为 true；体验版 / 正式版必须保持 false。
  demoAuthEnabled: false
};
