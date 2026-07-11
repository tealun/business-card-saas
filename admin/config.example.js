// 管理后台部署配置（可选）。
//
// 使用方法：把本文件复制为同目录下的 config.js 并按需修改。
// 没有 config.js 时，后台默认调用「当前域名 + /api/v1」（与后端同域名托管时无需任何配置）。
//
// 当后台静态页与后端 API 部署在不同域名时，设置 apiBase 指向后端，例如：
//   apiBase: "https://api.example.com/api/v1"
// 同时必须把后台域名加入后端 .env 的 CORS_ORIGINS，例如：
//   CORS_ORIGINS=https://admin.example.com
//
// 部署工作流不会覆盖或删除服务器上的 config.js，改一次即长期生效。
window.BC_ADMIN_CONFIG = {
  apiBase: ""
};
