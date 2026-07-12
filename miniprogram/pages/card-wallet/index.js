const app = getApp();
const { request } = require("../../utils/api");
const { mapRecentVisitors } = require("../../utils/format");
const { setPageTheme } = require("../../utils/theme");

const demoTabs = [
  { key: "visitors", label: "我的访客", count: 328 },
  { key: "viewed", label: "我看过的", count: 56 },
  { key: "friends", label: "好友名片", count: 4 },
  { key: "offline", label: "线下名片", count: 0 }
];
const demoVisitors = [
  {
    title: "今天",
    items: [
      { id: "v1", name: "李明浩", title: "产品总监 · 星河科技", meta: "访问 3 次", state: "exchanged", time: "10:24", canExchange: true },
      { id: "v2", name: "王思远", title: "商务拓展 · 云图数据", meta: "访问 1 次", state: "pending", time: "09:12", canExchange: true }
    ]
  }
];
const demoViewed = [
  {
    title: "本周",
    items: [{ id: "seen1", name: "陈可欣", title: "市场经理 · 万联传媒", meta: "查看 2 次", state: "none", time: "周一", canExchange: true }]
  }
];
const demoFriends = [
  {
    title: "好友",
    items: [{ id: "friend1", name: "赵启航", title: "技术负责人 · 智造科技", meta: "已保存", state: "exchanged", time: "周日", canExchange: false }]
  }
];

Page({
  data: {
    demoMode: true,
    loggedIn: false,
    themeStyle: "",
    activeTab: "visitors",
    tabs: demoTabs,
    keyword: "",
    groups: demoVisitors,
    tabGroups: {
      visitors: demoVisitors,
      viewed: demoViewed,
      friends: demoFriends,
      offline: []
    }
  },

  onShow() {
    setPageTheme(this);
    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
      this.getTabBar().applyTheme();
    }
    this.loadStats();
  },

  async onLoginSuccess() {
    await this.loadStats();
  },

  async loadStats() {
    const hasSession = Boolean(app.globalData.token && app.globalData.currentIdentity);
    if (!hasSession) {
      this.setData({
        demoMode: true,
        loggedIn: false,
        tabs: demoTabs,
        tabGroups: { visitors: demoVisitors, viewed: demoViewed, friends: demoFriends, offline: [] }
      });
      this.refreshActiveGroups();
      return;
    }

    const emptyGroups = { visitors: [], viewed: [], friends: [], offline: [] };
    this.setData({
      demoMode: false,
      loggedIn: true,
      tabs: [
        { key: "visitors", label: "我的访客", count: 0 },
        { key: "viewed", label: "我看过的", count: 0 },
        { key: "friends", label: "好友名片", count: 0 },
        { key: "offline", label: "线下名片", count: 0 }
      ],
      tabGroups: emptyGroups,
      groups: []
    });

    try {
      const stats = await request("/employee/cards/current/stats");
      const cardName = (app.globalData.currentCard && app.globalData.currentCard.display_name) || "名片";
      const visitors = mapRecentVisitors(stats.recent_visitors, { cardName });
      const tabGroups = {
        visitors: visitors.length ? [{ title: "最近访客", items: visitors }] : [],
        viewed: [],
        friends: [],
        offline: []
      };
      this.setData({
        tabs: [
          { key: "visitors", label: "我的访客", count: stats.visitor_count },
          { key: "viewed", label: "我看过的", count: 0 },
          { key: "friends", label: "好友名片", count: 0 },
          { key: "offline", label: "线下名片", count: 0 }
        ],
        tabGroups
      });
      this.refreshActiveGroups();
    } catch (_error) {
      this.refreshActiveGroups();
    }
  },

  switchTab(event) {
    this.setData({ activeTab: event.currentTarget.dataset.key });
    this.refreshActiveGroups();
  },

  refreshActiveGroups() {
    const tabGroups = this.data.tabGroups || {};
    this.setData({ groups: tabGroups[this.data.activeTab] || [] });
  },

  onSearch(event) {
    this.setData({ keyword: event.detail.value });
  },

  exchange(event) {
    const item = findItem(this.data.groups, event.currentTarget.dataset.id);
    if (!item || item.isAnonymous || item.canExchange === false) {
      return;
    }
    wx.showToast({ title: "名片交换功能即将上线", icon: "none" });
  },

  captureOfflineCard() {
    if (typeof wx.chooseMedia !== "function") {
      wx.showToast({ title: "当前微信版本暂不支持拍照识别", icon: "none" });
      return;
    }
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sourceType: ["camera", "album"],
      success: () => wx.showToast({ title: "已选择图片，识别保存即将上线", icon: "none" })
    });
  },

  bindOfflineImage() {
    this.captureOfflineCard();
  },

  goSendCard() {
    wx.switchTab({ url: "/pages/employee/index" });
  }
});

function findItem(groups, id) {
  for (const group of groups || []) {
    const found = (group.items || []).find((item) => item.id === id);
    if (found) {
      return found;
    }
  }
  return null;
}
