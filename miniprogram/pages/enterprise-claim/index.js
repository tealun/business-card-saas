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
  /**
   * 初始化企业认领页。
   * 支持扫码 token 和手动 8 位认领码两种入口。
   */
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
  /**
   * 规范化认领码输入，并清空上一条错误。
   */
  onClaimInput(event) {
    this.setData({ claimCode: normalizeInput(event.detail.value), error: "" });
  },
  /**
   * 标记输入框聚焦，用于页面视觉状态。
   */
  onInputFocus() {
    this.setData({ inputFocused: true });
  },
  /**
   * 标记输入框失焦。
   */
  onInputBlur() {
    this.setData({ inputFocused: false });
  },
  /**
   * 清空手动认领码和错误提示。
   */
  clearClaimCode() {
    this.setData({ claimCode: "", error: "" });
  },
  /**
   * 提交企业认领请求。
   * 会先建立用户会话，再用认领 token 换取企业管理员引导令牌。
   */
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
  /**
   * 将认领成功后的管理员引导令牌写入本地，并进入企业管理台。
   */
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
  /**
   * 返回员工首页。
   */
  goHome() {
    wx.switchTab({ url: "/pages/employee/index" });
  }
});

/**
 * 规范化认领凭证。
 * 8 位短码直接使用，长 token 会补齐后端要求的 admclaim_ 前缀。
 */
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

/**
 * 去除用户输入中的空白字符。
 */
function normalizeInput(value) {
  return String(value || "").replace(/\s+/g, "").trim();
}
