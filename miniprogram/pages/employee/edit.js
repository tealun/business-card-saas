const app = getApp();
const { ensureSession } = require("../../utils/auth");
const { request } = require("../../utils/api");

Page({
  data: {
    form: {
      display_name: "李明",
      title: "销售总监",
      department: "市场部",
      mobile: "138 0013 8000",
      phone: "0755-8888 0000",
      email: "liming@zhiyun.tech",
      wechat_id: "liming-zy",
      address: "深圳市南山区科技园",
      website: "www.zhiyun.tech"
    },
    tags: ["企业数字化", "SaaS 解决方案", "制造业"],
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
      wx.showToast({ title: error.message || "登录失败，已展示演示资料", icon: "none" });
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
      wx.showToast({ title: error.message || "读取失败，已展示演示资料", icon: "none" });
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
