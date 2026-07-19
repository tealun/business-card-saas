const app = getApp();
const { ensureSession, switchIdentity } = require("../../utils/auth");
const { request, isWeComRuntime } = require("../../utils/api");
const { buildVisitedCardLabel, mapRecentVisitors } = require("../../utils/format");
const { DEFAULT_BRAND, setPageTheme } = require("../../utils/theme");
const { DEMO_CARD_ID, DEMO_CARD_ROUTE, demoIdentity } = require("../../utils/demo-card");

const demoCard = {
  display_name: "李明",
  title: "销售总监 · 市场部",
  company: "智云科技（深圳）有限公司",
  company_short_name: "智云科技",
  show_avatar: true,
  fields: {
    mobile: "138 0013 8000",
    email: "liming@zhiyun.tech"
  },
  status: "active"
};

// 未登录演示数据：配合顶部“演示数据”横幅展示产品能力。
// 登录后一律替换为当前身份的真实数据（statistics 来自 /employee/cards/current/stats）。
const demoRequests = [{ id: "req1", name: "周琳", title: "采购经理 · 华宇集团" }];
const demoStats = { visitors: 328, viewed: 56, friends: 4 };
const demoRecentVisitors = [
  { id: "v1", name: "李明浩", title: "产品总监 · 星河科技", meta: "访问 3 次", state: "exchanged", time: "10:24" },
  { id: "v2", name: "王思远", title: "商务拓展 · 云图数据", meta: "访问 1 次", state: "pending", time: "昨天" },
  { id: "v3", name: "陈可欣", title: "市场经理 · 万联传媒", meta: "访问 2 次", state: "none", time: "周一" }
];

const TEMPLATE_BACKGROUNDS = {
  tpl_horizontal_business: "/assets/card-backgrounds/bg-light-wave.webp",
  tpl_minimal: "/assets/card-backgrounds/bg-light-geometry.webp",
  tpl_brand_image: "/assets/card-backgrounds/bg-blue-dot.webp",
  tpl_dark: "/assets/card-backgrounds/bg-dark-dot.webp",
  tpl_campaign: ""
};
const PRESET_BACKGROUNDS = {
  "light-wave": "/assets/card-backgrounds/bg-light-wave.webp",
  "light-geometry": "/assets/card-backgrounds/bg-light-geometry.webp",
  "light-cubes": "/assets/card-backgrounds/bg-light-cubes.webp",
  "blue-dot": "/assets/card-backgrounds/bg-blue-dot.webp",
  "dark-dot": "/assets/card-backgrounds/bg-dark-dot.webp"
};

Page({
  data: {
    loading: true,
    error: false,
    demoMode: true,
    authState: "guest",
    loggedIn: false,
    card: demoCard,
    cardLogoUrl: "/assets/logo/color-nobg.png",
    showCardHead: true,
    cardBackgroundStyle: cardBackgroundStyle("", 100, "tpl_horizontal_business"),
    cardTemplateClass: "biz-card--horizontal",
    themeBrand: DEFAULT_BRAND,
    themeStyle: "",
    sheetVisible: false,
    identitySheetVisible: false,
    previewSheetVisible: false,
    previewMode: "",
    previewTitle: "",
    previewPath: "",
    previewQrUrl: "",
    previewFullscreen: false,
    shareImageUrl: "",
    personalWechatQr: "",
    selfService: {
      allow_privacy_edit: true,
      allow_share_edit: true,
      allow_wecom_qrcode_upload: true,
      qrcode_source: "enterprise_first"
    },
    wecomSensitive: defaultWecomSensitiveStatus(),
    wecomSensitiveChecking: false,
    wecomSensitiveSyncing: false,
    submitting: false,
    switchingIdentity: false,
    refreshingIdentities: false,
    currentIdentity: null,
    identities: [],
    // 初始为未登录演示态；bootstrap/登录成功后按登录态切换。
    requests: demoRequests,
    stats: demoStats,
    recentVisitors: demoRecentVisitors
  },

  onLoad() {
    setPageTheme(this);
    this.bootstrap();
  },

  async onShow() {
    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
      this.getTabBar().applyTheme();
      this.setTabBarHidden(this.data.sheetVisible || this.data.previewSheetVisible || this.data.identitySheetVisible);
    }
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
        wecomSensitive: defaultWecomSensitiveStatus(),
        currentIdentity: demoIdentity(true),
        identities: [demoIdentity(true)],
        card: demoCard,
        cardTemplateClass: "biz-card--horizontal",
        cardBackgroundStyle: cardBackgroundStyle("", 100, "tpl_horizontal_business"),
        requests: demoRequests,
        stats: demoStats,
        recentVisitors: demoRecentVisitors
      });
      return;
    }
    this.syncIdentityState({
      currentIdentity: app.globalData.currentIdentity,
      identities: app.globalData.identities || []
    });
    this.setData({
      authState: "logged",
      loggedIn: true,
      demoMode: false,
      loading: true,
      card: fallbackCardFromIdentity(app.globalData.currentIdentity),
      requests: [],
      stats: { visitors: 0, viewed: 0, friends: 0 },
      recentVisitors: []
    });
    await this.loadPreview();
  },

  async onLoginSuccess(event) {
    this.syncIdentityState(event.detail);
    this.setData({
      authState: "logged",
      loggedIn: true,
      demoMode: false,
      loading: true,
      card: fallbackCardFromIdentity(event.detail && event.detail.currentIdentity),
      requests: [],
      stats: { visitors: 0, viewed: 0, friends: 0 },
      recentVisitors: []
    });
    await this.loadPreview();
  },

  onLoginFail() {
    this.setData({
      loading: false,
      error: true,
      demoMode: true,
      authState: "failed",
      loggedIn: false,
      card: demoCard,
      cardTemplateClass: "biz-card--horizontal",
      cardBackgroundStyle: cardBackgroundStyle("", 100, "tpl_horizontal_business"),
      requests: demoRequests,
      stats: demoStats,
      recentVisitors: demoRecentVisitors
    });
  },

  syncIdentityState(session) {
    const currentIdentity = session.currentIdentity || app.globalData.currentIdentity;
    const currentId = currentIdentity && currentIdentity.member_identity_id;
    const identities = (session.identities || app.globalData.identities || []).map((identity) => {
      const isPersonal = identity.identity_type === "personal";
      return Object.assign({}, identity, {
        optionName: isPersonal
          ? (identity.display_name || "我的名片")
          : (identity.tenant_short_name || identity.short_name || identity.tenant_name || "企业名片"),
        selected: identity.member_identity_id === currentId
      });
    });
    identities.push(demoIdentity(false));
    this.setData({ currentIdentity, identities });
  },

  async loadPreview() {
    try {
      const [current, preview] = await Promise.all([
        request("/employee/cards/current"),
        request("/employee/cards/current/preview")
      ]);
      const selfService = Object.assign({}, this.data.selfService, current.employee_self_service || {});
      app.globalData.currentCard = Object.assign({}, current, preview.card, {
        public_id: preview.public_id,
        fields: Object.assign({}, current.fields || {}, (preview.card && preview.card.fields) || {}),
        employee_self_service: selfService
      });
      const layout = (preview.template && preview.template.layout) || {};
      const brand = (preview.template && preview.template.color_scheme && preview.template.color_scheme.primary) || DEFAULT_BRAND;
      setPageTheme(this, brand);
      if (typeof this.getTabBar === "function" && this.getTabBar()) {
        this.getTabBar().applyTheme();
      }
      this.setData({
        card: Object.assign({ status: preview.status, fields: {} }, preview.card, {
          show_avatar: preview.show_avatar !== false,
          share_title: preview.share_title || ""
        }),
        cardLogoUrl: (preview.template && preview.template.logo_url) || "",
        showCardHead: Boolean((preview.template && preview.template.logo_url) || (preview.card && preview.card.company_short_name)),
        cardTemplateClass: cardTemplateClass(preview.template && preview.template.template_id),
        cardBackgroundStyle: cardBackgroundStyle(
          preview.template && preview.template.background_url,
          layout.background_opacity,
          preview.template && preview.template.template_id,
          layout.background_preset_id
        ),
        loading: false,
        error: false,
        demoMode: false,
        authState: "logged",
        loggedIn: true,
        selfService,
        wecomSensitive: defaultWecomSensitiveStatus(),
        // 登录后先清掉演示数据，再拉取当前身份的真实统计
        requests: [],
        stats: { visitors: 0, viewed: 0, friends: 0 },
        recentVisitors: []
      });
      this.prepareShareImage();
      this.loadStats();
      this.checkWecomSensitiveAuthorization({ auto: true });
    } catch (error) {
      // 读取失败不等于登录失效：token 还在时保持登录态，只提示错误，
      // 避免把已登录用户误降级成“未登录 + 演示名片”。
      if (app.globalData.token && app.globalData.currentIdentity) {
        this.setData({
          loading: false,
          error: true,
          demoMode: false,
          authState: "logged",
          loggedIn: true,
          card: fallbackCardFromIdentity(app.globalData.currentIdentity),
          wecomSensitive: defaultWecomSensitiveStatus(),
          requests: [],
          stats: { visitors: 0, viewed: 0, friends: 0 },
          recentVisitors: []
        });
        wx.showToast({ title: error.message || "名片读取失败，请下拉重试", icon: "none" });
        return;
      }
      this.setData({
        loading: false,
        error: true,
        demoMode: true,
        authState: "failed",
        loggedIn: false,
        requests: demoRequests,
        stats: demoStats,
        recentVisitors: demoRecentVisitors
      });
      wx.showToast({ title: error.message || "读取失败，已展示演示名片", icon: "none" });
    }
  },

  // 真实的按身份访客统计（个人/各企业名片各自独立）；
  // 「我看过/好友名片」后端功能未上线，保持 0。
  async loadStats() {
    try {
      const stats = await request("/employee/cards/current/stats");
      this.setData({
        stats: { visitors: stats.visitor_count, viewed: 0, friends: 0 },
        recentVisitors: mapRecentVisitors(stats.recent_visitors, {
          cardLabel: buildVisitedCardLabel(this.data.card, this.data.currentIdentity)
        })
      });
    } catch (_error) {
      // 统计失败不打扰主流程，保持当前数值
    }
  },

  async checkWecomSensitiveAuthorization(options = {}) {
    const currentIdentity = this.data.currentIdentity || {};
    if (!this.data.loggedIn || currentIdentity.identity_type !== "wecom_member") {
      this.setData({ wecomSensitive: defaultWecomSensitiveStatus(), wecomSensitiveChecking: false });
      return;
    }
    if (this.data.wecomSensitiveChecking) {
      return;
    }
    this.setData({ wecomSensitiveChecking: true });
    try {
      const status = await request("/wecom/member-sensitive/status");
      this.setData({ wecomSensitive: Object.assign(defaultWecomSensitiveStatus(), status) });
      if (
        options.auto &&
        status.should_authorize &&
        status.can_authorize &&
        isWeComRuntime() &&
        !hasAutoPromptedWecomSensitive(currentIdentity.member_identity_id)
      ) {
        markAutoPromptedWecomSensitive(currentIdentity.member_identity_id);
        this.startWecomSensitiveAuthorization({ auto: true });
      }
    } catch (_error) {
      this.setData({ wecomSensitive: defaultWecomSensitiveStatus() });
    } finally {
      this.setData({ wecomSensitiveChecking: false });
    }
  },

  startWecomSensitiveAuthorization(options = {}) {
    if (!this.ensureLoggedIn("请先登录后同步企业微信资料")) {
      return;
    }
    const currentIdentity = this.data.currentIdentity || {};
    if (currentIdentity.identity_type !== "wecom_member") {
      wx.showToast({ title: "当前不是企业名片", icon: "none" });
      return;
    }
    if (!isWeComRuntime()) {
      wx.showToast({ title: "请在企业微信中打开小程序授权", icon: "none" });
      return;
    }
    if (!options.auto) {
      markAutoPromptedWecomSensitive(currentIdentity.member_identity_id);
    }
    this.setData({ wecomSensitiveSyncing: true });
    wx.navigateTo({
      url: "/pages/wecom-sensitive/index",
      complete: () => {
        this.setData({ wecomSensitiveSyncing: false });
      }
    });
  },

  openIdentitySheet() {
    if (!this.data.identities.length) {
      wx.showToast({ title: "暂无可切换身份", icon: "none" });
      return;
    }
    this.setData({ identitySheetVisible: true });
    this.setTabBarHidden(true);
  },

  closeIdentitySheet() {
    this.setData({ identitySheetVisible: false });
    this.setTabBarHidden(false);
  },

  async chooseIdentity(event) {
    const memberIdentityId = event.currentTarget.dataset.id;
    if (!memberIdentityId || this.data.switchingIdentity) {
      return;
    }
    if (memberIdentityId === DEMO_CARD_ID) {
      this.closeIdentitySheet();
      wx.navigateTo({ url: DEMO_CARD_ROUTE });
      return;
    }
    if (!this.ensureLoggedIn("请先登录后切换真实身份")) {
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
      this.setTabBarHidden(false);
      wx.showToast({ title: "已切换名片", icon: "success" });
    } catch (error) {
      wx.showToast({ title: error.message || "切换失败", icon: "none" });
    } finally {
      this.setData({ switchingIdentity: false });
    }
  },

  // 重新走一次登录（企业微信内为 qy-login），把最新的企业授权/成员绑定拉回身份列表。
  // 用于修复“企业已接入但本地还留着旧会话，看不到企业身份”的场景。
  async refreshIdentities() {
    if (this.data.refreshingIdentities || this.data.switchingIdentity) {
      return;
    }
    if (!this.ensureLoggedIn("请先登录后刷新身份")) {
      return;
    }
    this.setData({ refreshingIdentities: true });
    try {
      const session = await ensureSession({ force: true });
      this.syncIdentityState(session);
      await this.loadPreview();
      wx.showToast({ title: "身份已刷新", icon: "success" });
    } catch (error) {
      wx.showToast({ title: (error && error.message) || "刷新失败，请稍后重试", icon: "none" });
    } finally {
      this.setData({ refreshingIdentities: false });
    }
  },

  goEdit() {
    if (!this.ensureLoggedIn("请先登录后编辑资料")) {
      return;
    }
    wx.navigateTo({ url: "/pages/employee/edit" });
  },

  openIdentityInfo() {
    const identity = this.data.currentIdentity || {};
    const isDemo = Boolean(identity.isDemo);
    const isPersonal = identity.identity_type === "personal";
    wx.showModal({
      title: isDemo ? "企业名片 · 样例" : (isPersonal ? "个人名片" : "企业名片"),
      content: isDemo
        ? "这是智云科技（深圳）有限公司的企业名片样例。点击“切换名片”可选择真实身份或继续查看样例。"
        : (isPersonal ? "这是你的微信个人名片，资料由你本人维护。" : "这是你的企业身份名片，企业字段由管理员统一维护。"),
      showCancel: false,
      confirmText: "知道了"
    });
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
    this.setTabBarHidden(true);
  },

  closeSheet() {
    this.setData({ sheetVisible: false });
    this.setTabBarHidden(false);
  },

  closePreviewSheet() {
    this.setData({ previewSheetVisible: false, previewMode: "", previewTitle: "", previewPath: "", previewQrUrl: "", previewFullscreen: false });
    this.setTabBarHidden(false);
  },

  choosePaperCardImage() {
    if (!this.ensureLoggedIn("请先登录后上传纸质名片")) {
      return;
    }
    if (typeof wx.chooseMedia !== "function") {
      wx.showToast({ title: "当前微信版本暂不支持拍照上传", icon: "none" });
      return;
    }
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sourceType: ["camera", "album"],
      success: () => {
        wx.showToast({ title: "纸质名片已选择，识别保存即将上线", icon: "none" });
      }
    });
  },

  handleWechatTool() {
    const currentIdentity = this.data.currentIdentity || {};
    if (currentIdentity.identity_type === "wecom_member") {
      this.startWecomSensitiveAuthorization();
      return;
    }
    this.openWechatQr();
  },

  async openWechatQr() {
    if (!this.ensureLoggedIn("请先登录后设置微信二维码")) {
      return;
    }
    const currentIdentity = this.data.currentIdentity || {};
    if (currentIdentity.identity_type === "personal") {
      this.choosePersonalWechatQr();
      return;
    }
    const selfService = this.data.selfService || {};
    const cachedQrUrl = enterpriseWechatQrUrl(selfService);
    const hasEnterpriseAvatar = Boolean(this.data.card && this.data.card.avatar_url);
    if (cachedQrUrl && hasEnterpriseAvatar) {
      this.showPreview({ mode: "wechat", title: "企业微信二维码", qrUrl: cachedQrUrl, path: "长按识别加微信" });
      return;
    }
    if (selfService.qrcode_source === "employee_upload_only") {
      if (selfService.allow_wecom_qrcode_upload === false) {
        wx.showToast({ title: "企业统一维护二维码", icon: "none" });
        return;
      }
      this.choosePersonalWechatQr("wecom_member");
      return;
    }
    if (!hasEnterpriseAvatar) {
      wx.navigateTo({ url: "/pages/wecom-sensitive/index" });
      return;
    }
    try {
      const result = await request("/employee/cards/current/wechat-qrcode");
      const qrUrl = result.qr_url || "";
      if (!qrUrl) {
        wx.navigateTo({ url: "/pages/wecom-sensitive/index" });
        return;
      }
      cacheCurrentWechatQr(qrUrl, currentIdentity.identity_type, result.source);
      this.showPreview({ mode: "wechat", title: "企业微信二维码", qrUrl, path: "长按识别加微信" });
    } catch (error) {
      wx.showToast({ title: error.message || "二维码读取失败", icon: "none" });
    }
  },

  choosePersonalWechatQr(identityType = "personal") {
    if (identityType !== "personal" && this.data.selfService.allow_wecom_qrcode_upload === false) {
      wx.showToast({ title: "企业统一维护二维码", icon: "none" });
      return;
    }
    if (typeof wx.chooseMedia !== "function") {
      wx.showToast({ title: "当前微信版本暂不支持上传二维码", icon: "none" });
      return;
    }
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sourceType: ["album", "camera"],
      success: async (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        const tempPath = file && file.tempFilePath ? file.tempFilePath : "";
        if (!tempPath) {
          return;
        }
        try {
          const dataUrl = await pathToDataUrl(tempPath);
          const result = await request("/employee/cards/current/wechat-qrcode", {
            method: "PUT",
            data: { qrcode_url: dataUrl }
          });
          const qrUrl = result.qr_url || "";
          cacheCurrentWechatQr(qrUrl, identityType, result.source);
          if (identityType === "personal") {
            this.setData({ personalWechatQr: qrUrl });
          }
          this.showPreview({ mode: "wechat", title: identityType === "personal" ? "个人微信二维码" : "企业微信二维码", qrUrl, path: "长按识别加微信" });
        } catch (error) {
          wx.showToast({ title: error.message || "二维码上传失败", icon: "none" });
        }
      }
    });
  },

  async showPoster() {
    await this.showSharePreview("poster", "名片海报");
  },

  async showCardCode() {
    await this.showSharePreview("code", "名片码");
  },

  async showSharePreview(mode, title) {
    if (!this.ensureLoggedIn("请先登录后发名片")) {
      return;
    }
    if (this.data.submitting) {
      return;
    }
    this.setData({ submitting: true });
    try {
      const share = await request("/employee/cards/current/share", { method: "POST", data: {} });
      app.globalData.shareId = share.share_id;
      this.showPreview({
        mode,
        title,
        path: share.path || `pages/public/card?card=${share.public_id}`,
        qrUrl: share.qrcode_url || share.mini_program_code_url || ""
      });
    } catch (error) {
      wx.showToast({ title: error.message || "生成失败", icon: "none" });
    } finally {
      this.setData({ submitting: false });
    }
  },

  showPreview({ mode, title, path, qrUrl }) {
    this.setData({
      sheetVisible: false,
      previewSheetVisible: true,
      previewMode: mode,
      previewTitle: title,
      previewPath: path || "",
      previewQrUrl: qrUrl || "",
      previewFullscreen: mode === "poster" || mode === "code"
    });
    this.setTabBarHidden(true);
  },

  prepareShareImage() {
    const nextTick = wx.nextTick || ((callback) => setTimeout(callback, 0));
    nextTick(async () => {
      try {
        const { buildShareCardImage } = require("../../utils/share-card-image");
        const imageUrl = await buildShareCardImage(this, {
          card: Object.assign({}, this.data.card, {
            avatar_url: this.data.card.show_avatar === false ? "" : this.data.card.avatar_url
          }),
          templateClass: this.data.cardTemplateClass,
          theme: {
            brand: this.data.themeBrand,
            brandDeep: this.data.themeBrandDeep,
            brandSoft: this.data.themeBrandSoft
          },
          meta: {
            companyName: this.data.card && this.data.card.company,
            companyShortName: this.data.card && this.data.card.company_short_name
          }
        });
        if (imageUrl) {
          this.setData({ shareImageUrl: imageUrl });
        }
      } catch (_error) {
        this.setData({ shareImageUrl: "" });
      }
    });
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
      const share = await request("/employee/cards/current/share", { method: "POST", data: {} });
      app.globalData.shareId = share.share_id;
      this.setData({ sheetVisible: false });
      this.setTabBarHidden(false);
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
      const share = await request("/employee/cards/current/share", { method: "POST", data: {} });
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
    const message = { title: card.share_title || `${card.display_name || "我的"}的数字名片` };
    if (this.data.shareImageUrl) {
      message.imageUrl = this.data.shareImageUrl;
    }
    return message;
  },

  ensureLoggedIn(message) {
    if (this.data.loggedIn && app.globalData.token) {
      return true;
    }
    wx.showToast({ title: message || "请先登录", icon: "none" });
    return false;
  },

  setTabBarHidden(hidden) {
    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ hidden: Boolean(hidden) });
    }
  }
});

function fallbackCardFromIdentity(identity) {
  const isPersonal = identity && identity.identity_type === "personal";
  return {
    display_name: identity && identity.display_name ? identity.display_name : "我的名片",
    title: null,
    company: isPersonal ? "" : (identity && identity.tenant_name ? identity.tenant_name : "企业名片"),
    company_short_name: isPersonal ? "" : ((identity && (identity.tenant_short_name || identity.short_name)) || ""),
    avatar_url: "",
    show_avatar: true,
    share_title: "",
    fields: {},
    status: "active"
  };
}

function defaultWecomSensitiveStatus() {
  return {
    eligible: false,
    authorized: false,
    should_authorize: false,
    can_authorize: false,
    synced_fields: [],
    message: ""
  };
}

function hasAutoPromptedWecomSensitive(memberIdentityId) {
  const key = String(memberIdentityId || "");
  return Boolean(key && app.globalData.wecomSensitiveAutoPrompted && app.globalData.wecomSensitiveAutoPrompted[key]);
}

function markAutoPromptedWecomSensitive(memberIdentityId) {
  const key = String(memberIdentityId || "");
  if (!key) {
    return;
  }
  app.globalData.wecomSensitiveAutoPrompted = Object.assign({}, app.globalData.wecomSensitiveAutoPrompted, { [key]: true });
}

function enterpriseWechatQrUrl(selfService = {}) {
  const current = app.globalData.currentCard || {};
  const fields = current.fields || {};
  const identity = app.globalData.currentIdentity || {};
  if (selfService.qrcode_source === "enterprise_only") {
    return fields.wecom_qrcode_url || identity.wecom_qrcode_url || "";
  }
  if (selfService.qrcode_source === "employee_upload_only") {
    return fields.wechat_qrcode_url || identity.wechat_qrcode_url || "";
  }
  return fields.wecom_qrcode_url || fields.wechat_qrcode_url || identity.wecom_qrcode_url || identity.wechat_qrcode_url || "";
}

function cacheCurrentWechatQr(qrUrl, identityType, source) {
  if (!qrUrl) {
    return;
  }
  const currentCard = app.globalData.currentCard || {};
  const fields = Object.assign({}, currentCard.fields || {});
  if (identityType === "personal" || source === "personal_upload") {
    fields.wechat_qrcode_url = qrUrl;
  } else {
    fields.wecom_qrcode_url = qrUrl;
  }
  app.globalData.currentCard = Object.assign({}, currentCard, { fields });
}

function pathToDataUrl(path) {
  if (/^data:image\//.test(path) || /^https?:\/\//.test(path)) {
    return Promise.resolve(path);
  }
  return new Promise((resolve, reject) => {
    const fs = wx.getFileSystemManager && wx.getFileSystemManager();
    if (!fs || typeof fs.readFile !== "function") {
      reject(new Error("file system unavailable"));
      return;
    }
    fs.readFile({
      filePath: path,
      encoding: "base64",
      success(result) {
        resolve(`data:image/jpeg;base64,${result.data}`);
      },
      fail: reject
    });
  });
}

function cardBackgroundStyle(url, opacity = 100, templateId = "", presetId = "") {
  const normalizedTemplateId = normalizeTemplateId(templateId);
  const backgroundUrl = url || PRESET_BACKGROUNDS[presetId] || TEMPLATE_BACKGROUNDS[normalizedTemplateId] || "";
  if (!backgroundUrl) {
    return "";
  }
  const alpha = 1 - normalizeOpacity(opacity) / 100;
  const overlay = normalizedTemplateId === "tpl_brand_image" || normalizedTemplateId === "tpl_dark"
    ? `rgba(0,0,0,${(alpha * 0.48).toFixed(2)})`
    : `rgba(255,255,255,${alpha.toFixed(2)})`;
  return `background: linear-gradient(${overlay}, ${overlay}), url("${backgroundUrl}") center / cover no-repeat;`;
}

function cardTemplateClass(templateId) {
  const map = {
    tpl_horizontal_business: "biz-card--horizontal",
    tpl_minimal: "biz-card--minimal",
    tpl_brand_image: "biz-card--brand-image",
    tpl_dark: "biz-card--dark",
    tpl_campaign: "biz-card--campaign"
  };
  return map[normalizeTemplateId(templateId)] || map.tpl_horizontal_business;
}

function normalizeTemplateId(templateId) {
  if (templateId === "tpl_demo_business" || templateId === "horizontal-business") {
    return "tpl_horizontal_business";
  }
  return templateId || "tpl_horizontal_business";
}

function normalizeOpacity(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 100;
  }
  return Math.max(0, Math.min(100, Math.round(number)));
}
