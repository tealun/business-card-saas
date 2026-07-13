const app = getApp();
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
    if (this.data.routed) {
      this.setData({ routed: false });
      return;
    }
    this.openCardHome();
  },

  openCardHome() {
    const identities = app.globalData.identities || [];
    const currentIdentity = app.globalData.currentIdentity || {};
    const enterpriseIdentity = currentIdentity.identity_type && currentIdentity.identity_type !== "personal"
      ? currentIdentity
      : identities.find((identity) => identity.identity_type !== "personal");
    const publicId = enterpriseIdentity && enterpriseIdentity.public_id;

    this.setData({ routed: true });
    wx.navigateTo({
      url: publicId ? `/pages/public/card?card=${publicId}` : "/pages/public/card",
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
