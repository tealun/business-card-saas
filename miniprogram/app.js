let localConfig = {};
let localConfigError = "";
try {
  localConfig = require("./config.local");
} catch (error) {
  if (!isMissingLocalConfigError(error)) {
    localConfigError = error && error.message ? error.message : "config.local.js 加载失败";
  }
  localConfig = {};
}

App({
  globalData: {
    apiBase: localConfig.apiBase || "",
    configError: localConfigError,
    token: "",
    currentCard: null,
    shareId: "",
    visitToken: "",
    anonId: "",
    demoAuthEnabled: Boolean(localConfig.demoAuthEnabled)
  }
});

function isMissingLocalConfigError(error) {
  const message = error && error.message ? String(error.message) : "";
  return /Cannot find module|module .*config\.local.*not (found|defined)|not found/.test(message);
}
