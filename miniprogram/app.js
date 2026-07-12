let config = {};
let configError = "";
try {
  config = require("./config");
} catch (error) {
  if (!isMissingConfigError(error)) {
    configError = error && error.message ? error.message : "config.js 加载失败";
  }
  config = {};
}

App({
  globalData: {
    apiBase: config.apiBase || "",
    configError,
    token: "",
    currentIdentity: null,
    identities: [],
    currentCard: null,
    shareId: "",
    visitToken: "",
    anonId: "",
    themeBrand: "",
    themeBrandDeep: "",
    themeBrandTint: "",
    themeBrandSoft: "",
    themeShadowBtn: "",
    demoAuthEnabled: Boolean(config.demoAuthEnabled)
  },

  onLaunch() {
    try {
      const { restoreTheme } = require("./utils/theme");
      restoreTheme(this.globalData);
    } catch (_error) {
      // 主题恢复失败时使用全局 WXSS 默认值。
    }
    try {
      const { restoreSession } = require("./utils/auth");
      restoreSession(this.globalData);
    } catch (_error) {
      // 恢复失败时保持空会话，不影响后续登录流程。
    }
  }
});

function isMissingConfigError(error) {
  const message = error && error.message ? String(error.message) : "";
  return /Cannot find module|module .*config(\.js)?.*not (found|defined)|not found/.test(message);
}
