let localConfig = {};
try {
  localConfig = require("./config.local");
} catch (error) {
  localConfig = {};
}

App({
  globalData: {
    apiBase: localConfig.apiBase || "",
    token: "",
    currentCard: null,
    shareId: "",
    visitToken: "",
    anonId: "",
    demoAuthEnabled: Boolean(localConfig.demoAuthEnabled)
  }
});
