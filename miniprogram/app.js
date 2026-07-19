let config = {};
let configError = "";
const { demoIdentity } = require("./utils/demo-card");
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
    currentIdentity: demoIdentity(true),
    identities: [demoIdentity(true)],
    currentCard: null,
    shareId: "",
    wecomSensitiveAutoPrompted: {},
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
