const app = getApp();
const { request } = require("../../utils/api");
const { mapRecentVisitors } = require("../../utils/format");

Page({
  data: {
    // 未登录时空态 + 横幅；登录后展示当前身份的真实访客数据。
    // 「我看过/好友名片」后端功能未上线，计数保持 0。
    demoMode: true,
    activeTab: "visitors",
    tabs: [
      { key: "visitors", label: "我的访客", count: 0 },
      { key: "viewed", label: "我看过的", count: 0 },
      { key: "friends", label: "好友名片", count: 0 }
    ],
    keyword: "",
    groups: []
  },

  onShow() {
    this.loadStats();
  },

  async loadStats() {
    if (!app.globalData.token || !app.globalData.currentIdentity) {
      this.setData({
        demoMode: true,
        tabs: this.data.tabs.map((tab) => Object.assign({}, tab, { count: 0 })),
        groups: []
      });
      return;
    }
    try {
      const stats = await request("/employee/cards/current/stats");
      const items = mapRecentVisitors(stats.recent_visitors);
      this.setData({
        demoMode: false,
        tabs: [
          { key: "visitors", label: "我的访客", count: stats.visitor_count },
          { key: "viewed", label: "我看过的", count: 0 },
          { key: "friends", label: "好友名片", count: 0 }
        ],
        groups: items.length ? [{ title: "最近访客", items }] : []
      });
    } catch (_error) {
      // 读取失败保持现状，不打扰
    }
  },

  switchTab(event) {
    this.setData({ activeTab: event.currentTarget.dataset.key });
  },

  onSearch(event) {
    this.setData({ keyword: event.detail.value });
  },

  exchange() {
    wx.showToast({ title: "名片交换功能即将上线", icon: "none" });
  },

  goSendCard() {
    wx.switchTab({ url: "/pages/employee/index" });
  }
});
