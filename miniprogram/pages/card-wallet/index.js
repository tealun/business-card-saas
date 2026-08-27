const app = getApp();
const { showRestriction } = require("../../utils/feedback");
const { request } = require("../../utils/api");
const { buildVisitedCardLabel, mapRecentVisitors } = require("../../utils/format");
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
    companyFilter: "",
    notificationTemplateId: "",
    exchangeRequests: [],
    visitorItems: [],
    visitorCount: 0,
    acceptedCount: 0,
    nextExchangeOffset: null,
    exchangeLoadingMore: false,
    groups: demoVisitors,
    tabGroups: {
      visitors: demoVisitors,
      viewed: demoViewed,
      friends: demoFriends,
      offline: []
    },
    selectedRequest: null,
    requestSheetVisible: false,
    responding: false
  },

  /**
   * 名片夹页展示时刷新主题、tabBar 选中态和统计数据。
   */
  onShow() {
    setPageTheme(this);
    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
      this.getTabBar().applyTheme();
    }
    this.loadStats();
  },

  /**
   * 登录成功后重新加载真实名片夹统计。
   */
  async onLoginSuccess() {
    await this.loadStats();
  },

  /**
   * 根据会话状态加载名片夹数据。
   * 未登录展示演示数据，已登录时只读取当前名片访客统计，其他分组保持待上线空态。
   */
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
      groups: [],
      exchangeRequests: [],
      visitorItems: [],
      visitorCount: 0,
      acceptedCount: 0,
      nextExchangeOffset: null
    });

    try {
      const [stats, exchangeData] = await Promise.all([
        request("/employee/cards/current/stats"),
        request("/employee/card-exchanges?limit=50&offset=0")
      ]);
      const cardLabel = buildVisitedCardLabel(app.globalData.currentCard, app.globalData.currentIdentity);
      const visitors = mapRecentVisitors(stats.recent_visitors, { cardLabel });
      this.setData({
        exchangeRequests: exchangeData.requests || [],
        visitorItems: visitors,
        visitorCount: stats.visitor_count,
        acceptedCount: exchangeData.accepted_count || 0,
        nextExchangeOffset: exchangeData.next_offset,
        notificationTemplateId: exchangeData.notification_template_id || ""
      });
      this.rebuildWalletGroups();
      if (exchangeData.unread_count) {
        request("/employee/card-exchanges/read", { method: "POST", data: {} }).catch(() => {});
      }
    } catch (_error) {
      this.refreshActiveGroups();
    }
  },

  rebuildWalletGroups() {
    const exchangeItems = (this.data.exchangeRequests || []).map(mapExchangeItem);
    const pending = exchangeItems.filter((item) => item.direction === "incoming" && item.state === "pending");
    const outgoingPending = exchangeItems.filter((item) => item.direction === "outgoing" && item.state === "pending");
    const accepted = exchangeItems.filter((item) => item.state === "exchanged");
    const visitorGroups = [];
    if (pending.length) visitorGroups.push({ title: "待处理请求", items: pending });
    if (outgoingPending.length) visitorGroups.push({ title: "已发出的请求", items: outgoingPending });
    if (this.data.visitorItems.length) visitorGroups.push({ title: "最近访客", items: this.data.visitorItems });
    const tabGroups = {
      visitors: visitorGroups,
      viewed: [],
      friends: accepted.length ? [{ title: "已交换名片", items: accepted }] : [],
      offline: []
    };
    this.setData({
      tabs: [
        { key: "visitors", label: "我的访客", count: this.data.visitorCount },
        { key: "viewed", label: "我看过的", count: 0 },
        { key: "friends", label: "好友名片", count: this.data.acceptedCount },
        { key: "offline", label: "线下名片", count: 0 }
      ],
      tabGroups
    });
    this.refreshActiveGroups();
  },

  async onReachBottom() {
    const offset = this.data.nextExchangeOffset;
    if (offset === null || this.data.exchangeLoadingMore || !this.data.loggedIn) return;
    this.setData({ exchangeLoadingMore: true });
    try {
      const exchangeData = await request(`/employee/card-exchanges?limit=50&offset=${offset}`);
      const byId = new Map((this.data.exchangeRequests || []).map((item) => [item.request_id, item]));
      (exchangeData.requests || []).forEach((item) => byId.set(item.request_id, item));
      this.setData({
        exchangeRequests: Array.from(byId.values()),
        acceptedCount: typeof exchangeData.accepted_count === "number" ? exchangeData.accepted_count : this.data.acceptedCount,
        nextExchangeOffset: exchangeData.next_offset
      });
      this.rebuildWalletGroups();
    } catch (error) {
      wx.showToast({ title: error.message || "更多名片加载失败", icon: "none" });
    } finally {
      this.setData({ exchangeLoadingMore: false });
    }
  },

  /**
   * 切换名片夹分组，并刷新当前列表。
   */
  switchTab(event) {
    this.setData({ activeTab: event.currentTarget.dataset.key });
    this.refreshActiveGroups();
  },

  /**
   * 根据 activeTab 从分组映射中刷新当前展示列表。
   */
  refreshActiveGroups() {
    const tabGroups = this.data.tabGroups || {};
    const keyword = String(this.data.keyword || "").trim().toLowerCase();
    const company = this.data.companyFilter || "";
    const groups = (tabGroups[this.data.activeTab] || []).map((group) => ({
      ...group,
      items: (group.items || []).filter((item) => {
        const haystack = [item.name, item.title, item.company].join(" ").toLowerCase();
        return (!keyword || haystack.includes(keyword)) && (!company || item.company === company);
      })
    })).filter((group) => group.items.length);
    this.setData({ groups });
  },

  /**
   * 更新搜索关键词。
   */
  onSearch(event) {
    this.setData({ keyword: event.detail.value });
    this.refreshActiveGroups();
  },

  chooseCompanyFilter() {
    const companySet = new Set();
    const tabGroups = this.data.tabGroups || {};
    Object.keys(tabGroups).forEach((key) => {
      (tabGroups[key] || []).forEach((group) => {
        (group.items || []).forEach((item) => {
          if (item.company) companySet.add(item.company);
        });
      });
    });
    const companies = Array.from(companySet);
    if (!companies.length) {
      wx.showToast({ title: "暂无可筛选的公司", icon: "none" });
      return;
    }
    const itemList = ["全部公司", ...companies];
    wx.showActionSheet({
      itemList,
      success: ({ tapIndex }) => {
        this.setData({ companyFilter: tapIndex === 0 ? "" : companies[tapIndex - 1] });
        this.refreshActiveGroups();
      }
    });
  },

  async enableExchangeNotifications() {
    const templateId = this.data.notificationTemplateId;
    if (!templateId || typeof wx.requestSubscribeMessage !== "function") {
      wx.showToast({ title: "交换通知暂未配置", icon: "none" });
      return;
    }
    try {
      const result = await new Promise((resolve, reject) => wx.requestSubscribeMessage({ tmplIds: [templateId], success: resolve, fail: reject }));
      if (!result || result[templateId] !== "accept") return;
      await request("/employee/card-exchanges/notifications/subscribe", {
        method: "POST",
        data: { event_type: "request_received", template_id: templateId }
      });
      wx.showToast({ title: "已开启下一次交换提醒", icon: "success" });
    } catch (error) {
      wx.showToast({ title: error.message || "通知开启失败", icon: "none" });
    }
  },

  /**
   * 处理名片交换动作。
   * 匿名访客或不可交换条目会直接忽略，避免展示无效操作反馈。
   */
  async exchange(event) {
    const item = findItem(this.data.groups, event.currentTarget.dataset.id);
    if (!item || item.isAnonymous || item.canExchange === false) {
      return;
    }
    if (item.requestId) {
      this.setData({ selectedRequest: item, requestSheetVisible: true });
      return;
    }
    if (!item.publicId) return;
    wx.navigateTo({ url: `/pages/public/card?card=${item.publicId}` });
  },

  openCardDetails(event) {
    const item = findItem(this.data.groups, event.currentTarget.dataset.id);
    if (!item || item.isAnonymous) return;
    if (item.requestId && (item.state === "pending" || item.state === "exchanged")) {
      this.setData({ selectedRequest: item, requestSheetVisible: true });
    }
  },

  closeRequestSheet() {
    if (!this.data.responding) this.setData({ requestSheetVisible: false, selectedRequest: null });
  },

  async respondToRequest(event) {
    const item = this.data.selectedRequest;
    const action = event.currentTarget.dataset.action;
    if (!item || this.data.responding || !["accept", "ignore", "withdraw"].includes(action)) return;
    this.setData({ responding: true });
    try {
      await request(`/employee/card-exchanges/${item.requestId}/${action}`, { method: "POST", data: {} });
      wx.showToast({ title: action === "accept" ? "已接受交换" : (action === "withdraw" ? "已撤回请求" : "已忽略请求"), icon: "success" });
      this.setData({ requestSheetVisible: false, selectedRequest: null });
      await this.loadStats();
    } catch (error) {
      wx.showToast({ title: error.message || "请求处理失败", icon: "none" });
    } finally {
      this.setData({ responding: false });
    }
  },

  openSelectedCard() {
    const item = this.data.selectedRequest;
    if (item && item.publicId) wx.navigateTo({ url: `/pages/public/card?card=${item.publicId}` });
  },

  /**
   * 选择或拍摄线下纸质名片图片。
   * 当前只做入口占位，不上传或持久化图片。
   */
  captureOfflineCard() {
    if (typeof wx.chooseMedia !== "function") {
      showRestriction("当前微信版本暂不支持拍照识别，请升级微信后重试");
      return;
    }
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sourceType: ["camera", "album"],
      success: () => wx.showToast({ title: "已选择图片，识别保存即将上线", icon: "none" })
    });
  },

  /**
   * 兼容模板绑定命名，复用线下名片采集流程。
   */
  bindOfflineImage() {
    this.captureOfflineCard();
  },

  /**
   * 回到发名片首页。
   */
  goSendCard() {
    wx.switchTab({ url: "/pages/employee/index" });
  }
});

/**
 * 在分组列表中查找指定名片项。
 */
function findItem(groups, id) {
  for (const group of groups || []) {
    const found = (group.items || []).find((item) => item.id === id);
    if (found) {
      return found;
    }
  }
  return null;
}

function mapExchangeItem(item) {
  const card = item.counterpart || {};
  const incomingPending = item.direction === "incoming" && item.status === "pending";
  return {
    id: `exchange:${item.request_id}`,
    requestId: item.request_id,
    direction: item.direction,
    name: card.display_name || "微信用户",
    title: [card.title, card.company].filter(Boolean).join(" · "),
    company: card.company || "",
    meta: incomingPending ? "对方希望与你交换名片" : (item.direction === "outgoing" && item.status === "pending" ? "等待对方接受" : "双方已交换名片"),
    state: item.status === "accepted" ? "exchanged" : item.status,
    time: formatExchangeTime(item.created_at),
    avatarUrl: card.avatar_url || "",
    publicId: card.public_id || "",
    canExchange: incomingPending,
    actionLabel: incomingPending ? "查看请求" : ""
  };
}

function formatExchangeTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
