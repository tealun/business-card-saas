const app = getApp();
const { ensureSession } = require("../../utils/auth");
const { request } = require("../../utils/api");

Page({
  data: {
    // 表单初始为空：读取失败时绝不能让占位演示数据被“保存”成真实名片。
    card: { fields: {} },
    form: {
      display_name: "",
      title: "",
      mobile: "",
      email: "",
      wechat_id: ""
    },
    sharePath: "",
    loading: true,
    error: false,
    submitting: false
  },

  onLoad() {
    this.login();
  },

  async login() {
    try {
      await ensureSession();
      await this.loadCard();
    } catch (error) {
      this.setData({ loading: false, error: true });
      wx.showToast({ title: error.message || "登录失败，请稍后重试", icon: "none" });
    }
  },

  async loadCard() {
    try {
      const card = await request("/employee/cards/current");
      app.globalData.currentCard = card;
      this.setData({
        card,
        form: {
          display_name: card.display_name,
          title: card.title || "",
          mobile: card.fields.mobile || "",
          email: card.fields.email || "",
          wechat_id: card.fields.wechat_id || ""
        },
        loading: false,
        error: false
      });
    } catch (error) {
      this.setData({ loading: false, error: true });
      wx.showToast({ title: error.message || "读取失败", icon: "none" });
    }
  },

  onInput(event) {
    const key = event.currentTarget.dataset.key;
    this.setData({ [`form.${key}`]: event.detail.value });
  },

  async saveCard() {
    if (this.data.submitting) {
      return;
    }
    if (this.data.error) {
      wx.showToast({ title: "名片资料未加载成功，请稍后重试", icon: "none" });
      return;
    }
    this.setData({ submitting: true });
    const form = this.data.form;
    try {
      validateCardForm(form);
      const card = await request("/employee/cards/current", {
        method: "PUT",
        data: {
          display_name: form.display_name,
          title: form.title,
          fields: {
            mobile: form.mobile || null,
            email: form.email || null,
            wechat_id: form.wechat_id || null
          }
        }
      });
      app.globalData.currentCard = card;
      this.setData({ card });
      wx.showToast({ title: "已保存", icon: "success" });
    } catch (error) {
      wx.showToast({ title: error.message || "保存失败", icon: "none" });
    } finally {
      this.setData({ submitting: false });
    }
  },

  async createShare() {
    if (this.data.submitting) {
      return;
    }
    this.setData({ submitting: true });
    try {
      const share = await request("/employee/cards/current/share", { method: "POST" });
      app.globalData.shareId = share.share_id;
      this.setData({ sharePath: share.path });
      wx.navigateTo({
        url: `/pages/public/card?card=${share.public_id}&share=${share.share_id}`
      });
    } catch (error) {
      wx.showToast({ title: error.message || "分享失败", icon: "none" });
    } finally {
      this.setData({ submitting: false });
    }
  }
});

function validateCardForm(form) {
  if (!String(form.display_name || "").trim()) {
    throw new Error("姓名不能为空");
  }
  const email = String(form.email || "").trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("邮箱格式不正确");
  }
  const phone = String(form.mobile || "").trim();
  if (phone && !/^[0-9+\-\s()]{5,32}$/.test(phone)) {
    throw new Error("手机号格式不正确");
  }
}
