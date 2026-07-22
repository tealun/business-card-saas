const { ensureSession } = require("../../utils/auth");
const { request } = require("../../utils/api");

Page({
  data: { token: "", displayName: "", submitting: false, result: "", error: "" },
  onLoad(options) {
    this.setData({ token: normalizeClaimToken(options && (options.token || options.scene)) });
  },
  onNameInput(event) {
    this.setData({ displayName: event.detail.value });
  },
  async submit() {
    const displayName = String(this.data.displayName || "").trim();
    if (!this.data.token) {
      this.setData({ error: "认领码缺失或已失效，请联系平台管理员重新获取。" });
      return;
    }
    if (!displayName) {
      this.setData({ error: "请输入真实姓名，将作为企业管理员显示。" });
      return;
    }
    this.setData({ submitting: true, error: "" });
    try {
      await ensureSession();
      const res = await request("/local-enterprises/claim", {
        method: "POST",
        data: { claim_token: this.data.token, display_name: displayName }
      });
      this.setData({ result: "认领成功，您已成为「" + (res && res.tenant_name ? res.tenant_name : "该企业") + "」的管理员。" });
    } catch (error) {
      this.setData({ error: error && error.message ? error.message : "认领失败，请稍后重试。" });
    } finally {
      this.setData({ submitting: false });
    }
  }
});

function normalizeClaimToken(value) {
  const token = String(value || "").trim();
  if (/^[A-Za-z0-9_-]{24}$/.test(token)) {
    return "admclaim_" + token;
  }
  return token;
}
