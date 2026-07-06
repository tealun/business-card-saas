const app = getApp();
const { request } = require("../../utils/api");

Page({
  data: {
    form: {},
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
          display_name: card.display_name,
          title: card.title || "",
          mobile: card.fields.mobile || "",
          phone: card.fields.phone || "",
          email: card.fields.email || "",
          wechat_id: card.fields.wechat_id || "",
          address: card.fields.address || ""
        },
        privacy: card.privacy
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
          privacy: this.data.privacy
        }
      });
      app.globalData.currentCard = card;
      wx.showToast({ title: "已保存", icon: "success" });
      wx.navigateBack();
    } catch (error) {
      wx.showToast({ title: error.message || "保存失败", icon: "none" });
    }
  }
});
