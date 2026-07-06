const app = getApp();
const { request, qyLoginCode } = require("../../utils/api");

Page({
  data: {
    loading: true,
    card: { fields: {}, status: "active" },
    themeBrand: "#2b6cff",
    sheetVisible: false,
    // M1 无对应接口，以下为设计还原用的演示数据，接口就绪后替换
    requests: [
      { id: "req1", name: "周琳", title: "采购经理 · 华宇集团", avatar: "" }
    ],
    stats: { visitors: 328, viewed: 56, friends: 4 },
    recentVisitors: [
      { id: "v1", name: "李明哲", title: "产品总监 · 星河科技", meta: "访问 3 次", state: "exchanged", time: "10:24" },
      { id: "v2", name: "王思远", title: "商务拓展 · 云图数据", meta: "访问 1 次", state: "pending", time: "昨天" },
      { id: "v3", name: "陈可欣", title: "市场经理 · 万联传媒", meta: "访问 2 次", state: "none", time: "周一" }
    ]
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
      this.setData({ loading: false });
      wx.showToast({ title: error.message || "登录失败", icon: "none" });
    }
  },

  async loadPreview() {
    try {
      const preview = await request("/employee/cards/current/preview");
      app.globalData.currentCard = preview.card;
      const brand = (preview.template && preview.template.color_scheme && preview.template.color_scheme.primary) || "#2b6cff";
      this.setData({
        card: Object.assign({ status: preview.status }, preview.card),
        themeBrand: brand,
        loading: false
      });
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({ title: error.message || "读取失败", icon: "none" });
    }
  },

  goEdit() {
    wx.navigateTo({ url: "/pages/employee/edit" });
  },

  goStyle() {
    wx.navigateTo({ url: "/pages/employee/style" });
  },

  goWallet() {
    wx.switchTab({ url: "/pages/card-wallet/index" });
  },

  noop() {},

  openSheet() {
    this.setData({ sheetVisible: true });
  },

  closeSheet() {
    this.setData({ sheetVisible: false });
  },

  async createShare() {
    try {
      const share = await request("/employee/cards/current/share", { method: "POST" });
      app.globalData.shareId = share.share_id;
      this.setData({ sheetVisible: false });
      wx.navigateTo({
        url: `/pages/public/card?card=${share.public_id}&share=${share.share_id}`
      });
    } catch (error) {
      wx.showToast({ title: error.message || "分享失败", icon: "none" });
    }
  },

  async copyLink() {
    try {
      const share = await request("/employee/cards/current/share", { method: "POST" });
      wx.setClipboardData({ data: share.path || `pages/public/card?card=${share.public_id}` });
    } catch (error) {
      wx.showToast({ title: error.message || "复制失败", icon: "none" });
    }
  },

  acceptRequest(event) {
    const id = event.currentTarget.dataset.id;
    this.setData({ requests: this.data.requests.filter((item) => item.id !== id) });
    wx.showToast({ title: "已同意", icon: "success" });
  },

  ignoreRequest(event) {
    const id = event.currentTarget.dataset.id;
    this.setData({ requests: this.data.requests.filter((item) => item.id !== id) });
  },

  onShareAppMessage() {
    const card = this.data.card;
    return { title: `${card.display_name || "我的名片"}的数字名片` };
  }
});
