const app = getApp();
const { request, qyLoginCode } = require("../../utils/api");

Page({
  data: {
    statusText: "M1 演示名片，可用于联调分享和公开访问",
    card: {
      fields: {}
    }
  },

  onLoad() {
    this.login();
  },

  onShow() {
    if (app.globalData.token) {
      this.loadPreview();
    }
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
      await this.loadPreview();
    } catch (error) {
      wx.showToast({ title: error.message || "登录失败", icon: "none" });
    }
  },

  async loadPreview() {
    try {
      const preview = await request("/employee/cards/current/preview");
      app.globalData.currentCard = preview.card;
      this.setData({ card: preview.card });
    } catch (error) {
      wx.showToast({ title: error.message || "读取失败", icon: "none" });
    }
  },

  goEdit() {
    wx.navigateTo({ url: "/pages/employee/edit" });
  },

  goStyle() {
    wx.navigateTo({ url: "/pages/employee/style" });
  },

  async createShare() {
    try {
      const share = await request("/employee/cards/current/share", { method: "POST" });
      app.globalData.shareId = share.share_id;
      wx.navigateTo({
        url: `/pages/public/card?card=${share.public_id}&share=${share.share_id}`
      });
    } catch (error) {
      wx.showToast({ title: error.message || "分享失败", icon: "none" });
    }
  }
});
