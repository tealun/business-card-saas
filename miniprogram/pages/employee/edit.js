const app = getApp();
const { ensureSession } = require("../../utils/auth");
const { request } = require("../../utils/api");

Page({
  data: {
    // 表单初始为空：读取失败时绝不能让占位演示数据被“保存”成真实名片。
    form: {
      display_name: "",
      title: "",
      department: "",
      mobile: "",
      phone: "",
      email: "",
      wechat_id: "",
      address: "",
      website: ""
    },
    tags: [],
    privacy: {
      show_mobile: false,
      show_email: true,
      show_wechat: false
    },
    loading: true,
    error: false,
    submitting: false
  },

  async onLoad() {
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
      this.setData({
        form: {
          display_name: card.display_name || "",
          title: card.title || "",
          department: card.department || "",
          mobile: card.fields.mobile || "",
          phone: card.fields.phone || "",
          email: card.fields.email || "",
          wechat_id: card.fields.wechat_id || "",
          address: card.fields.address || "",
          website: card.fields.website || ""
        },
        privacy: Object.assign({}, this.data.privacy, card.privacy || {}),
        loading: false,
        error: false
      });
    } catch (error) {
      this.setData({ loading: false, error: true });
      wx.showToast({ title: error.message || "名片读取失败，请稍后重试", icon: "none" });
    }
  },

  onInput(event) {
    this.setData({ [`form.${event.currentTarget.dataset.key}`]: event.detail.value });
  },

  onPrivacy(event) {
    this.setData({ [`privacy.${event.currentTarget.dataset.key}`]: event.detail.value });
  },

  lockedTip() {
    wx.showToast({ title: "该字段由企业统一维护", icon: "none" });
  },

  async saveCard() {
    if (this.data.submitting) {
      return;
    }
    if (this.data.error) {
      wx.showToast({ title: "名片资料未加载成功，请返回重进后再保存", icon: "none" });
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
            phone: form.phone || null,
            email: form.email || null,
            wechat_id: form.wechat_id || null,
            address: form.address || null
          },
          privacy: {
            show_mobile: this.data.privacy.show_mobile,
            show_email: this.data.privacy.show_email,
            show_wechat: this.data.privacy.show_wechat
          }
        }
      });
      app.globalData.currentCard = card;
      wx.showToast({ title: "已保存", icon: "success" });
      setTimeout(() => wx.navigateBack(), 600);
    } catch (error) {
      wx.showToast({ title: error.message || "保存失败", icon: "none" });
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
  const phoneFields = [form.mobile, form.phone].filter(Boolean);
  if (phoneFields.some((value) => !/^[0-9+\-\s()]{5,32}$/.test(String(value)))) {
    throw new Error("电话格式不正确");
  }
}
