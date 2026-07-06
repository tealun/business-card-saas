const app = getApp();
const { request } = require("../../utils/api");

Page({
  data: {
    form: {
      display_name: "",
      title: "",
      department: "",
      bio: "",
      mobile: "",
      phone: "",
      email: "",
      wechat_id: "",
      address: "",
      website: ""
    },
    tags: ["资深顾问", "10年经验"],
    privacy: {
      show_mobile: false,
      show_email: true,
      show_wechat: false,
      show_wecom: true
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
          display_name: card.display_name,
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
        privacy: Object.assign({ show_wecom: true }, card.privacy)
      });
    } catch (error) {
      wx.showToast({ title: error.message || "读取失败", icon: "none" });
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
    }
  }
});
