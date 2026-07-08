const app = getApp();
const { ensureSession, switchIdentity } = require("../../utils/auth");
const { request } = require("../../utils/api");

const demoCard = {
  display_name: "李明",
  title: "销售总监 · 市场部",
  company: "智云科技",
  fields: {
    mobile: "138 0013 8000",
    email: "liming@zhiyun.tech"
  },
  status: "active"
};

Page({
  data: {
    loading: true,
    error: false,
    demoMode: true,
    card: demoCard,
    themeBrand: "#2b6cff",
    sheetVisible: false,
    identitySheetVisible: false,
    submitting: false,
    switchingIdentity: false,
    currentIdentity: null,
    identities: [],
    requests: [
      { id: "req1", name: "周琳", title: "采购经理 · 华宇集团" }
    ],
    stats: { visitors: 328, viewed: 56, friends: 4 },
    recentVisitors: [
      { id: "v1", name: "李明浩", title: "产品总监 · 星河科技", meta: "访问 3 次", state: "exchanged", time: "10:24" },
      { id: "v2", name: "王思远", title: "商务拓展 · 云图数据", meta: "访问 1 次", state: "pending", time: "昨天" },
      { id: "v3", name: "陈可欣", title: "市场经理 · 万联传媒", meta: "访问 2 次", state: "none", time: "周一" }
    ]
  },

  onLoad() {
    this.loginPromise = this.login();
  },

  async onShow() {
    await this.loginPromise;
    if (app.globalData.token) {
      this.loadPreview();
    }
  },

  async login() {
    try {
      const session = await ensureSession({ force: true });
      this.syncIdentityState(session);
      await this.loadPreview();
    } catch (error) {
      this.setData({ loading: false, error: true });
      wx.showToast({ title: error.message || "登录失败，已展示演示名片", icon: "none" });
    }
  },

  syncIdentityState(session) {
    const currentIdentity = session.currentIdentity || app.globalData.currentIdentity;
    const currentId = currentIdentity && currentIdentity.member_identity_id;
    const identities = (session.identities || app.globalData.identities || []).map((identity) =>
      Object.assign({}, identity, { selected: identity.member_identity_id === currentId })
    );
    this.setData({ currentIdentity, identities });
  },

  async loadPreview() {
    try {
      const preview = await request("/employee/cards/current/preview");
      app.globalData.currentCard = preview.card;
      const brand = (preview.template && preview.template.color_scheme && preview.template.color_scheme.primary) || "#2b6cff";
      this.setData({
        card: Object.assign({ status: preview.status, fields: {} }, preview.card),
        themeBrand: brand,
        loading: false,
        error: false,
        demoMode: false
      });
    } catch (error) {
      this.setData({ loading: false, error: true });
      wx.showToast({ title: error.message || "读取失败，已展示演示名片", icon: "none" });
    }
  },

  openIdentitySheet() {
    if (!this.data.identities.length) {
      wx.showToast({ title: "暂无可切换身份", icon: "none" });
      return;
    }
    this.setData({ identitySheetVisible: true });
  },

  closeIdentitySheet() {
    this.setData({ identitySheetVisible: false });
  },

  async chooseIdentity(event) {
    const memberIdentityId = event.currentTarget.dataset.id;
    if (!memberIdentityId || this.data.switchingIdentity) {
      return;
    }
    if (this.data.currentIdentity && memberIdentityId === this.data.currentIdentity.member_identity_id) {
      this.closeIdentitySheet();
      return;
    }
    this.setData({ switchingIdentity: true });
    try {
      const session = await switchIdentity(memberIdentityId);
      this.syncIdentityState(session);
      await this.loadPreview();
      this.setData({ identitySheetVisible: false });
      wx.showToast({ title: "已切换名片", icon: "success" });
    } catch (error) {
      wx.showToast({ title: error.message || "切换失败", icon: "none" });
    } finally {
      this.setData({ switchingIdentity: false });
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

  openSheet() {
    if (this.data.card.status === "disabled") {
      wx.showToast({ title: "名片已停用，暂不可分发", icon: "none" });
      return;
    }
    this.setData({ sheetVisible: true });
  },

  closeSheet() {
    this.setData({ sheetVisible: false });
  },

  async createShare() {
    if (this.data.submitting) {
      return;
    }
    this.setData({ submitting: true });
    try {
      const share = await request("/employee/cards/current/share", { method: "POST" });
      app.globalData.shareId = share.share_id;
      this.setData({ sheetVisible: false });
      wx.navigateTo({
        url: `/pages/public/card?card=${share.public_id}&share=${share.share_id}`
      });
    } catch (error) {
      wx.showToast({ title: error.message || "分享失败", icon: "none" });
    } finally {
      this.setData({ submitting: false });
    }
  },

  async copyLink() {
    if (this.data.submitting) {
      return;
    }
    this.setData({ submitting: true });
    try {
      const share = await request("/employee/cards/current/share", { method: "POST" });
      wx.setClipboardData({ data: share.path || `pages/public/card?card=${share.public_id}` });
    } catch (error) {
      wx.showToast({ title: error.message || "复制失败", icon: "none" });
    } finally {
      this.setData({ submitting: false });
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
    return { title: `${card.display_name || "我的"}的数字名片` };
  }
});
