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
    demoAuthEnabled: Boolean(config.demoAuthEnabled)
  }
});

function isMissingConfigError(error) {
  const message = error && error.message ? String(error.message) : "";
  return /Cannot find module|module .*config(\.js)?.*not (found|defined)|not found/.test(message);
}
