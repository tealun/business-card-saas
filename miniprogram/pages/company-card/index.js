const app = getApp();
const { ensureSession } = require("../../utils/auth");
const { DEMO_CARD_ROUTE } = require("../../utils/demo-card");
const { setPageTheme } = require("../../utils/theme");

Page({
  data: {
    themeStyle: "",
    routed: false
  },

  /**
   * 企业名片 tab 展示时同步主题和 tabBar，然后自动打开当前身份公开名片。
   */
  onShow() {
    setPageTheme(this);
    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
      this.getTabBar().applyTheme();
    }
    this.setData({ routed: false });
    this.openCardHome();
  },

  /**
   * 根据当前身份打开企业/个人公开名片。
   * 未登录或演示身份跳转演示名片，缺少 publicId 时尝试刷新会话补齐。
   */
  async openCardHome() {
    let currentIdentity = app.globalData.currentIdentity || {};
    if (currentIdentity.isDemo || !app.globalData.token) {
      this.setData({ routed: true });
      wx.navigateTo({ url: DEMO_CARD_ROUTE });
      return;
    }
    if (!currentIdentity.public_id) {
      try {
        const session = await ensureSession();
        currentIdentity = session.currentIdentity || {};
      } catch (_error) {
        this.setData({ routed: false });
        wx.showToast({ title: "请先登录并选择名片", icon: "none" });
        return;
      }
    }
    const publicId = currentIdentity.public_id;

    if (!publicId) {
      this.setData({ routed: false });
      wx.showToast({ title: "请先在首页选择名片", icon: "none" });
      return;
    }

    this.setData({ routed: true });
    wx.navigateTo({
      url: `/pages/public/card?card=${publicId}`,
      fail: () => {
        this.setData({ routed: false });
        wx.showToast({ title: "企业名片打开失败", icon: "none" });
      }
    });
  },

  /**
   * 返回员工首页。
   */
  goHome() {
    wx.switchTab({ url: "/pages/employee/index" });
  }
});
