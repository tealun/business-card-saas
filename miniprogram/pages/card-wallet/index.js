const app = getApp();
const { request } = require("../../utils/api");
const { mapRecentVisitors } = require("../../utils/format");

// 未登录演示数据：配合横幅展示访客/交换能力；登录后替换为真实统计。
const demoTabs = [
  { key: "visitors", label: "我的访客", count: 328 },
  { key: "viewed", label: "我看过的", count: 56 },
  { key: "friends", label: "好友名片", count: 4 }
];
const demoGroups = [
  {
    title: "今天",
    items: [
      { id: "v1", name: "李明浩", title: "产品总监 · 星河科技", meta: "访问 3 次", state: "exchanged", time: "10:24" },
      { id: "v2", name: "王思远", title: "商务拓展 · 云图数据", meta: "访问 1 次", state: "pending", time: "09:12" }
    ]
  },
  {
    title: "本周",
    items: [
      { id: "v3", name: "陈可欣", title: "市场经理 · 万联传媒", meta: "访问 2 次", state: "none", time: "周一" },
      { id: "v4", name: "赵启航", title: "技术负责人 · 智造科技", meta: "访问 5 次", state: "exchanged", time: "周日" }
    ]
  }
];

Page({
  data: {
    // 初始为未登录演示态；onShow 按登录态切换。
    // 「我看过/好友名片」后端功能未上线，登录后计数为 0。
    demoMode: true,
    loggedIn: false,
    activeTab: "visitors",
    tabs: demoTabs,
    keyword: "",
    groups: demoGroups
  },

  onShow() {
    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
    this.loadStats();
  },

  async onLoginSuccess() {
    await this.loadStats();
  },

  async loadStats() {
    const hasSession = Boolean(app.globalData.token && app.globalData.currentIdentity);
    if (!hasSession) {
      this.setData({ demoMode: true, loggedIn: false, tabs: demoTabs, groups: demoGroups });
      return;
    }

    // 先按会话切到已登录态，避免统计接口偶发失败时误显示“未登录”。
    this.setData({
      demoMode: false,
      loggedIn: true,
      tabs: [
        { key: "visitors", label: "我的访客", count: 0 },
        { key: "viewed", label: "我看过的", count: 0 },
        { key: "friends", label: "好友名片", count: 0 }
      ],
      groups: []
    });

    try {
      const stats = await request("/employee/cards/current/stats");
      const items = mapRecentVisitors(stats.recent_visitors);
      this.setData({
        tabs: [
          { key: "visitors", label: "我的访客", count: stats.visitor_count },
          { key: "viewed", label: "我看过的", count: 0 },
          { key: "friends", label: "好友名片", count: 0 }
        ],
        groups: items.length ? [{ title: "最近访客", items }] : []
      });
    } catch (_error) {
      // 统计读取失败保持已登录空态，不误降级成未登录。
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
