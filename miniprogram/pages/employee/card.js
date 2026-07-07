const app = getApp();
const { request, qyLoginCode } = require("../../utils/api");

Page({
  data: {
    card: { company: "智云科技" },
    form: {
      display_name: "李明",
      title: "销售总监",
      mobile: "138 0013 8000",
      email: "liming@zhiyun.tech",
      wechat_id: "liming-zy"
    },
    sharePath: "",
    submitting: false
  },

  onLoad() {
    this.login();
  },

  async login() {
    try {
      const code = await qyLoginCode();
      const session = await request("/auth/qy-login", {
        method: "POST",
        auth: false,
        data: { code }
      });
      app.globalData.token = session.access_token;
      await this.loadCard();
    } catch (error) {
      wx.showToast({ title: error.message || "登录失败，已展示演示名片", icon: "none" });
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
        }
      });
    } catch (error) {
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
    this.setData({ submitting: true });
    const form = this.data.form;
    try {
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
