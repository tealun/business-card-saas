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
      if (index === this.data.selected) {
        return;
      }
      wx.switchTab({ url: path });
    }
  }
});
