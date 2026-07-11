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
    authState: "guest",
    loggedIn: false,
    loginSubmitting: false,
    card: demoCard,
    themeBrand: "#2b6cff",
    sheetVisible: false,
    identitySheetVisible: false,
    submitting: false,
    switchingIdentity: false,
    currentIdentity: null,
    identities: [],
    // 交换请求/访客统计的后端功能尚未上线：保持空数据 + 空态展示，
    // 不再用演示人名占位（见 99_56 整改讨论）。
    requests: [],
    stats: { visitors: 0, viewed: 0, friends: 0 },
    recentVisitors: []
  },

  onLoad() {
    this.bootstrap();
  },

  async onShow() {
    if (this.data.loggedIn && app.globalData.token) {
      await this.loadPreview();
      return;
    }
    await this.bootstrap();
  },

  async bootstrap() {
    const hasSession = Boolean(app.globalData.token && app.globalData.currentIdentity);
    if (!hasSession) {
      this.setData({
        loading: false,
        error: false,
        demoMode: true,
        authState: "guest",
        loggedIn: false,
        currentIdentity: null,
        identities: []
      });
      return;
    }
    this.syncIdentityState({
      currentIdentity: app.globalData.currentIdentity,
      identities: app.globalData.identities || []
    });
    this.setData({ authState: "logged", loggedIn: true });
    await this.loadPreview();
  },

  async triggerLogin() {
    if (this.data.loginSubmitting) {
      return;
    }
    this.setData({ loginSubmitting: true, loading: true });
    try {
      const session = await ensureSession({ force: true });
      this.syncIdentityState(session);
      this.setData({ authState: "logged", loggedIn: true });
      await this.loadPreview();
    } catch (error) {
      this.setData({ loading: false, error: true, demoMode: true, authState: "failed", loggedIn: false });
      wx.showToast({ title: error.message || "登录失败，已展示演示名片", icon: "none" });
    } finally {
      this.setData({ loginSubmitting: false });
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
        demoMode: false,
        authState: "logged",
        loggedIn: true
      });
    } catch (error) {
      // 读取失败不等于登录失效：token 还在时保持登录态，只提示错误，
      // 避免把已登录用户误降级成“未登录 + 演示名片”。
      if (app.globalData.token && app.globalData.currentIdentity) {
        this.setData({ loading: false, error: true });
        wx.showToast({ title: error.message || "名片读取失败，请下拉重试", icon: "none" });
        return;
      }
      this.setData({ loading: false, error: true, demoMode: true, authState: "failed", loggedIn: false });
      wx.showToast({ title: error.message || "读取失败，已展示演示名片", icon: "none" });
    }
  },

  openIdentitySheet() {
    if (!this.ensureLoggedIn("请先登录后切换身份")) {
      return;
    }
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
    if (!this.ensureLoggedIn("请先登录后切换身份")) {
      return;
    }
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
    if (!this.ensureLoggedIn("请先登录后编辑资料")) {
      return;
    }
    wx.navigateTo({ url: "/pages/employee/edit" });
  },

  goStyle() {
    if (!this.ensureLoggedIn("请先登录后设置样式")) {
      return;
    }
    wx.navigateTo({ url: "/pages/employee/style" });
  },

  goWallet() {
    wx.switchTab({ url: "/pages/card-wallet/index" });
  },

  openSheet() {
    if (!this.ensureLoggedIn("请先登录后发名片")) {
      return;
    }
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
    if (!this.ensureLoggedIn("请先登录后发名片")) {
      return;
    }
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
    if (!this.ensureLoggedIn("请先登录后复制链接")) {
      return;
    }
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
  },

  ensureLoggedIn(message) {
    if (this.data.loggedIn && app.globalData.token) {
      return true;
    }
    wx.showToast({ title: message || "请先登录", icon: "none" });
    return false;
  }
});
