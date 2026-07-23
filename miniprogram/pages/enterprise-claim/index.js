const { ensureSession } = require("../../utils/auth");
const { request } = require("../../utils/api");
const ADMIN_BOOTSTRAP_STORAGE_KEY = "wecomcard.admin.bootstrap.v1";

Page({
  data: {
    token: "",
    claimCode: "",
    inputFocused: false,
    inputPlaceholder: "请输入 8 位认领码",
    submitting: false,
    result: null,
    error: ""
  },
  onLoad(options) {
    const rawToken = String(options && (options.token || options.scene || "") || "");
    const token = normalizeClaimToken(rawToken);
    const isShortCode = /^[A-Za-z0-9]{8}$/.test(token);
    this.setData({
      token: isShortCode ? "" : token,
      claimCode: isShortCode ? token : "",
      inputPlaceholder: token && !isShortCode ? "已通过扫码获取认领凭据" : "请输入 8 位认领码"
    });
  },
  onClaimInput(event) {
    this.setData({ claimCode: normalizeInput(event.detail.value), error: "" });
  },
  onInputFocus() {
    this.setData({ inputFocused: true });
  },
  onInputBlur() {
    this.setData({ inputFocused: false });
  },
  clearClaimCode() {
    this.setData({ claimCode: "", error: "" });
  },
  async submit() {
    const claimToken = this.data.token || normalizeClaimToken(this.data.claimCode);
    if (!claimToken) {
      this.setData({ error: "请输入平台管理员提供的 8 位认领码。" });
      return;
    }
    this.setData({ submitting: true, error: "" });
    try {
      await ensureSession();
      const res = await request("/local-enterprises/claim", {
        method: "POST",
        data: { claim_token: claimToken }
      });
      const tenantName = res && res.tenant_name ? res.tenant_name : "该企业";
      this.setData({
        result: {
          tenantId: res && res.tenant_id ? res.tenant_id : "",
          tenantName,
          adminToken: res && res.admin_access_token ? res.admin_access_token : "",
          initial: tenantName.slice(0, 1) || "企"
        }
      });
    } catch (error) {
      this.setData({ error: error && error.message ? error.message : "认领失败，请稍后重试。" });
    } finally {
      this.setData({ submitting: false });
    }
  },
  goManage() {
    const result = this.data.result || {};
    const tenantId = result.tenantId;
    const tenantName = result.tenantName || "";
    const adminToken = result.adminToken || "";
    if (adminToken && typeof wx.setStorageSync === "function") {
      wx.setStorageSync(ADMIN_BOOTSTRAP_STORAGE_KEY, {
        tenant_id: tenantId,
        tenant_name: tenantName,
        admin_access_token: adminToken
      });
    }
    wx.navigateTo({
      url: `/pages/enterprise-admin/index${tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}&tenant_name=${encodeURIComponent(tenantName)}` : ""}`
    });
  },
  goHome() {
    wx.switchTab({ url: "/pages/employee/index" });
  }
});

function normalizeClaimToken(value) {
  const token = normalizeInput(value);
  if (/^[A-Za-z0-9]{8}$/.test(token)) {
    return token;
  }
  if (/^[A-Za-z0-9_-]{24,32}$/.test(token)) {
    return "admclaim_" + token;
  }
  return token;
}

function normalizeInput(value) {
  return String(value || "").replace(/\s+/g, "").trim();
}
