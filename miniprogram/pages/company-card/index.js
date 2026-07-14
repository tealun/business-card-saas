const app = getApp();
const { ensureSession } = require("../../utils/auth");
const { DEMO_CARD_ROUTE } = require("../../utils/demo-card");
const { setPageTheme } = require("../../utils/theme");

Page({
  data: {
    themeStyle: "",
    routed: false
  },

  onShow() {
    setPageTheme(this);
    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
      this.getTabBar().applyTheme();
    }
    this.setData({ routed: false });
    this.openCardHome();
  },

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
        wx.showToast({ title: "名片主页打开失败", icon: "none" });
      }
    });
  },

  goHome() {
    wx.switchTab({ url: "/pages/employee/index" });
  }
});
