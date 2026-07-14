Component({
  data: {
    selected: 0,
    hidden: false,
    themeStyle: "",
    list: [
      { pagePath: "/pages/employee/index", text: "首页", icon: "home" },
      { pagePath: "/pages/card-wallet/index", text: "名片夹", icon: "wallet" },
      { pagePath: "/pages/company-card/index", text: "名片主页", icon: "company" }
    ]
  },

  lifetimes: {
    attached() {
      this.applyTheme();
    }
  },

  methods: {
    applyTheme() {
      const { themeStyle, currentTheme } = require("../utils/theme");
      this.setData({ themeStyle: themeStyle(currentTheme()) });
    },

    switchTab(event) {
      const path = event.currentTarget.dataset.path;
      const index = event.currentTarget.dataset.index;
      if (Number(index) === 2) {
        const app = getApp();
        const { DEMO_CARD_ROUTE } = require("../utils/demo-card");
        const currentIdentity = app.globalData.currentIdentity || {};
        const currentCard = app.globalData.currentCard || {};
        if (currentIdentity.isDemo) {
          wx.navigateTo({ url: DEMO_CARD_ROUTE });
          return;
        }
        const publicId = currentIdentity.public_id || currentCard.public_id;
        if (!publicId) {
          wx.switchTab({ url: path });
          return;
        }
        wx.navigateTo({
          url: `/pages/public/card?card=${publicId}`,
          fail: () => wx.showToast({ title: "名片主页打开失败", icon: "none" })
        });
        return;
      }
      if (index === this.data.selected) {
        return;
      }
      wx.switchTab({ url: path });
    }
  }
});
