const app = getApp();
const { request } = require("../../utils/api");

Page({
  data: {
    form: {
      display_name: "李明",
      title: "销售总监",
      department: "市场部",
      bio: "专注企业数字化名片与客户转化。",
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
    }
  },

  onLoad() {
    this.loadCard();
  },

  async loadCard() {
    try {
      const card = await request("/employee/cards/current");
      this.setData({
        form: {
          display_name: card.display_name || "",
          title: card.title || "",
          department: card.department || "",
          bio: card.bio || "",
          mobile: card.fields.mobile || "",
          phone: card.fields.phone || "",
          email: card.fields.email || "",
          wechat_id: card.fields.wechat_id || "",
          address: card.fields.address || "",
          website: card.fields.website || ""
        },
        privacy: Object.assign({}, this.data.privacy, card.privacy || {})
      });
    } catch (error) {
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
    const form = this.data.form;
    try {
      const card = await request("/employee/cards/current", {
        method: "PUT",
        data: {
          display_name: form.display_name,
          title: form.title,
          bio: form.bio,
          fields: {
            mobile: form.mobile || null,
            phone: form.phone || null,
            email: form.email || null,
            wechat_id: form.wechat_id || null,
            address: form.address || null,
            website: form.website || null
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
    }
  }
});
