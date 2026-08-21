const app = getApp();
const { showRestriction, showError } = require("../../utils/feedback");
const { ensureSession, refreshSessionIdentities, switchIdentity } = require("../../utils/auth");
const { request, isWeComRuntime } = require("../../utils/api");
const { DEFAULT_PORTRAIT_PHOTO_URL } = require("../../utils/card-assets");
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
  tpl_portrait_photo: "/assets/card-backgrounds/bg-light-cubes.webp",
  tpl_dark: "/assets/card-backgrounds/bg-dark-dot.webp",
  tpl_campaign: "/assets/card-backgrounds/bg-light-cubes.webp"
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
    cardBackgroundUrl: "",
    cardBackgroundOpacity: 1,
    cardTemplateClass: "biz-card--horizontal",
    portraitPhotoUrl: "",
    defaultPortraitPhotoUrl: DEFAULT_PORTRAIT_PHOTO_URL,
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
    previewQrLoading: false,
    previewError: "",
    codeCardInitial: "名",
    codeCardSubtitle: "",
    savingCardCode: false,
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
    creatingEnterprise: false,
    currentIdentity: null,
    identities: [],
    // 初始为未登录演示态；bootstrap/登录成功后按登录态切换。
    requests: demoRequests,
    stats: demoStats,
    recentVisitors: demoRecentVisitors
  },

  /**
   * 初始化员工名片首页主题，并进入登录态/演示态启动流程。
   * 该页面是个人、企业身份和名片预览的入口，后续状态都由 bootstrap 统一收敛。
   */
  onLoad() {
    setPageTheme(this);
    this.bootstrap();
  },

  /**
   * 页面重新展示时同步自定义 tabBar 与当前身份数据。
   * 已登录时只刷新预览，未登录或会话缺失时重新执行启动流程。
   */
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

  /**
   * 根据全局会话决定展示演示数据还是真实员工名片。
   * 企业微信身份会先尝试刷新敏感信息授权，失败时保留当前可见会话，避免首页不可用。
   */
  async bootstrap() {
    if (shouldRefreshWeComSession(app.globalData.currentIdentity)) {
      try {
        await ensureSession({ force: true });
      } catch (_error) {
        // 企业刷新失败时保留既有会话可见，避免首页被清空。
      }
    }
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
        cardBackgroundUrl: "",
        cardBackgroundOpacity: 1,
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

  /**
   * 登录组件回调成功后接管最新身份集合，并加载真实名片预览。
   * 输入来自组件 detail，副作用是切换页面为已登录态并清空演示指标。
   */
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

  /**
   * 登录失败时回退到演示态，保证新用户仍可浏览核心能力。
   * 这里只改变前端展示状态，不写入本地会话。
   */
  onLoginFail() {
    this.setData({
      loading: false,
      error: true,
      demoMode: true,
      authState: "failed",
      loggedIn: false,
      card: demoCard,
      cardTemplateClass: "biz-card--horizontal",
      cardBackgroundUrl: "",
      cardBackgroundOpacity: 1,
      cardBackgroundStyle: cardBackgroundStyle("", 100, "tpl_horizontal_business"),
      requests: demoRequests,
      stats: demoStats,
      recentVisitors: demoRecentVisitors
    });
  },

  /**
   * 将全局或登录返回的身份列表规范成身份切换弹窗可渲染的数据。
   * 会补充演示企业身份入口，方便个人身份用户看到企业版升级路径。
   */
  syncIdentityState(session) {
    const currentIdentity = session.currentIdentity || app.globalData.currentIdentity;
    const currentId = currentIdentity && currentIdentity.member_identity_id;
    const identities = (session.identities || app.globalData.identities || []).map((identity) => {
      const isPersonal = identity.identity_type === "personal";
      const isLocal = identity.identity_type === "local_enterprise";
      return Object.assign({}, identity, {
        optionName: isPersonal
          ? (identity.display_name || "我的名片")
          : (identity.tenant_short_name || identity.short_name || identity.tenant_name || "企业名片"),
        typeLabel: isPersonal ? "个人名片" : (isLocal ? "本地企业" : "企业名片"),
        badgeClass: isPersonal ? "badge--brand" : (isLocal ? "badge--warning" : "badge--success"),
        subtitle: isPersonal ? "微信个人身份" : identity.tenant_name,
        selected: identity.member_identity_id === currentId
      });
    });
    if (!identities.some(isRealEnterpriseIdentity)) {
      identities.push(demoIdentity(false));
    }
    this.setData({ currentIdentity, identities });
  },

  /**
   * 并行拉取当前名片与预览配置，刷新首页名片视觉、统计和授权状态。
   * 失败时保持页面可恢复，由 error/loading 状态驱动重试提示。
   */
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
      const templateId = preview.template && preview.template.template_id;
      const background = activeTemplateBackground(layout, templateId, preview.template && preview.template.background_url);
      this.setData({
        card: Object.assign({ status: preview.status, fields: {} }, preview.card, {
          show_avatar: preview.show_avatar !== false,
          share_title: preview.share_title || ""
        }),
        cardLogoUrl: (preview.template && preview.template.logo_url) || "",
        showCardHead: Boolean((preview.template && preview.template.logo_url) || (preview.card && preview.card.company_short_name)),
        cardTemplateClass: cardTemplateClass(templateId),
        portraitPhotoUrl: layoutImageUrl(layout, "portrait_photo_url"),
        cardBackgroundUrl: background.url,
        cardBackgroundOpacity: normalizeOpacity(background.opacity) / 100,
        cardBackgroundStyle: cardBackgroundStyle(
          background.url,
          background.opacity,
          templateId,
          background.presetId
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
  /**
   * 拉取当前身份名片的访问统计，并转换成首页最近访客列表。
   * 统计失败不阻断名片预览，保留已有数据以避免首页闪退或空白。
   */
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

  /**
   * 检查企业微信敏感资料授权状态，并在企业微信环境中按需自动引导授权。
   * 仅企业成员身份生效，个人或演示身份会重置为不可授权状态。
   */
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

  /**
   * 发起企业微信敏感资料授权页跳转。
   * 进入前校验登录、身份类型和运行环境，防止普通微信场景误触企业能力。
   */
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

  /**
   * 打开身份切换面板，并隐藏底部 tabBar 以避免弹层交互被遮挡。
   */
  openIdentitySheet() {
    if (!this.data.identities.length) {
      wx.showToast({ title: "暂无可切换身份", icon: "none" });
      return;
    }
    this.setData({ identitySheetVisible: true });
    this.setTabBarHidden(true);
  },

  /**
   * 关闭身份切换面板，并恢复底部 tabBar。
   */
  closeIdentitySheet() {
    this.setData({ identitySheetVisible: false });
    this.setTabBarHidden(false);
  },

  /**
   * 根据用户选择切换当前名片身份。
   * 演示身份走独立示例页，真实身份会刷新全局会话和首页预览。
   */
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

  // 企业微信环境下升级到最新企业登录；其他情况下只重新拉当前账号的身份列表，
  // 这样不会把已登录的企业身份意外冲回普通微信态。
  /**
   * 刷新当前账号可用身份列表。
   * 企业微信个人态会强制重取会话，其余场景只刷新身份集合，避免覆盖已选企业身份。
   */
  async refreshIdentities() {
    if (this.data.refreshingIdentities || this.data.switchingIdentity) {
      return;
    }
    if (!this.ensureLoggedIn("请先登录后刷新身份")) {
      return;
    }
    this.setData({ refreshingIdentities: true });
    try {
      const session = shouldRefreshWeComSession(this.data.currentIdentity)
        ? await ensureSession({ force: true })
        : await refreshSessionIdentities();
      this.syncIdentityState(session);
      await this.loadPreview();
      wx.showToast({ title: "身份已刷新", icon: "success" });
    } catch (error) {
      wx.showToast({ title: (error && error.message) || "刷新失败，请稍后重试", icon: "none" });
    } finally {
      this.setData({ refreshingIdentities: false });
    }
  },

  /**
   * 跳转到资料编辑页；未登录时只提示，不创建临时名片。
   */
  goEdit() {
    if (!this.ensureLoggedIn("请先登录后编辑资料")) {
      return;
    }
    wx.navigateTo({ url: "/pages/employee/edit" });
  },

  // 普通微信用户自助创建本地企业：创建成功后自动成为该企业 owner，
  // 刷新身份列表即可在弹层中看到并切换到新企业名片。
  /**
   * 打开本地企业创建弹窗。
   * 输入只接受 2-255 字企业名称，提交后由后端创建 owner 身份。
   */
  createLocalEnterprise() {
    if (this.data.creatingEnterprise) {
      return;
    }
    if (!this.ensureLoggedIn("请先登录后创建企业")) {
      return;
    }
    wx.showModal({
      title: "创建我的企业",
      editable: true,
      placeholderText: "请输入企业名称（2-255 字）",
      confirmText: "创建",
      success: (res) => {
        if (!res.confirm) {
          return;
        }
        const name = String(res.content || "").trim();
        if (name.length < 2 || name.length > 255) {
          wx.showToast({ title: "企业名称需 2-255 个字", icon: "none" });
          return;
        }
        this.submitCreateLocalEnterprise(name);
      }
    });
  },

  /**
   * 提交本地企业创建请求，并刷新身份列表让新企业可立即切换。
   * 该操作会改变服务端租户/成员状态，因此需要 loading 锁避免重复创建。
   */
  async submitCreateLocalEnterprise(name) {
    this.setData({ creatingEnterprise: true });
    wx.showLoading({ title: "正在创建企业", mask: true });
    try {
      await request("/local-enterprises", { method: "POST", data: { name } });
      const session = await ensureSession({ force: true });
      this.syncIdentityState(session);
      await this.loadPreview();
      wx.showToast({ title: "企业已创建，可在下方切换", icon: "none" });
    } catch (error) {
      wx.showToast({ title: (error && error.message) || "创建失败，请稍后重试", icon: "none" });
    } finally {
      wx.hideLoading();
      this.setData({ creatingEnterprise: false });
    }
  },

  /**
   * 展示当前身份说明，帮助用户区分个人名片、企业名片和演示名片。
   */
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

  /**
   * 跳转到样式配置页；企业身份下具体可编辑项由样式页再按权限控制。
   */
  goStyle() {
    if (!this.ensureLoggedIn("请先登录后设置样式")) {
      return;
    }
    wx.navigateTo({ url: "/pages/employee/style" });
  },

  /**
   * 切换到名片夹 tab，用于查看已收藏或线下交换的名片。
   */
  goWallet() {
    wx.switchTab({ url: "/pages/card-wallet/index" });
  },

  /**
   * 打开发名片动作面板。
   * 只有已登录且名片未停用时可打开，避免生成不可访问的分享入口。
   */
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

  /**
   * 关闭发名片面板，并恢复 tabBar。
   */
  closeSheet() {
    this.setData({ sheetVisible: false });
    this.setTabBarHidden(false);
  },

  /**
   * 关闭海报/名片码预览弹层，并清空预览临时状态。
   */
  closePreviewSheet() {
    this.setData({
      previewSheetVisible: false,
      previewMode: "",
      previewTitle: "",
      previewPath: "",
      previewQrUrl: "",
      previewFullscreen: false,
      previewQrLoading: false,
      previewError: ""
    });
    this.setTabBarHidden(false);
  },

  /**
   * 选择纸质名片图片，为后续 OCR 识别入口预留。
   * 当前只做能力提示，不上传文件或写入名片资料。
   */
  choosePaperCardImage() {
    if (!this.ensureLoggedIn("请先登录后上传纸质名片")) {
      return;
    }
    if (typeof wx.chooseMedia !== "function") {
      showRestriction("当前微信版本暂不支持拍照上传，请升级微信后重试");
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

  /**
   * 根据身份类型分流微信工具：企业微信成员走授权，个人名片走二维码上传/查看。
   */
  handleWechatTool() {
    const currentIdentity = this.data.currentIdentity || {};
    if (currentIdentity.identity_type === "wecom_member") {
      this.startWecomSensitiveAuthorization();
      return;
    }
    this.openWechatQr();
  },

  /**
   * 打开或生成微信二维码预览。
   * 企业身份优先使用企业统一资料，必要时跳转授权；个人身份允许用户上传自有二维码。
   */
  async openWechatQr() {
    if (!this.ensureLoggedIn("请先登录后设置微信二维码")) {
      return;
    }
    if (this.data.submitting) {
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
        showRestriction("微信二维码由企业统一维护，当前账号不能修改");
        return;
      }
      this.choosePersonalWechatQr("wecom_member");
      return;
    }
    if (!hasEnterpriseAvatar) {
      wx.navigateTo({ url: "/pages/wecom-sensitive/index" });
      return;
    }
    this.showPreview({ mode: "wechat", title: "企业微信二维码", qrUrl: "", path: "", loading: true, error: "" });
    this.setData({ submitting: true });
    try {
      const result = await request("/employee/cards/current/wechat-qrcode");
      const qrUrl = result.qr_url || "";
      if (!qrUrl) {
        this.closePreviewSheet();
        wx.navigateTo({ url: "/pages/wecom-sensitive/index" });
        return;
      }
      cacheCurrentWechatQr(qrUrl, currentIdentity.identity_type, result.source);
      this.setData({ previewQrUrl: qrUrl, previewPath: "长按识别加微信", previewQrLoading: false, previewError: "" });
    } catch (error) {
      this.setData({ previewQrLoading: false, previewError: error.message || "二维码读取失败" });
    } finally {
      this.setData({ submitting: false });
    }
  },

  /**
   * 选择并保存个人或员工自上传的微信二维码。
   * 上传前会在本地预览，保存时转成 dataURL 交给后端资产管道处理。
   */
  choosePersonalWechatQr(identityType = "personal") {
    if (this.data.submitting) {
      return;
    }
    if (identityType !== "personal" && this.data.selfService.allow_wecom_qrcode_upload === false) {
      showRestriction("微信二维码由企业统一维护，当前账号不能修改");
      return;
    }
    if (typeof wx.chooseMedia !== "function") {
      showRestriction("当前微信版本暂不支持上传二维码，请升级微信后重试");
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
        const title = identityType === "personal" ? "个人微信二维码" : "企业微信二维码";
        this.showPreview({ mode: "wechat", title, qrUrl: tempPath, path: "正在保存二维码", loading: false, error: "" });
        this.setData({ submitting: true });
        try {
          let info = null;
          try {
            info = await getImageInfo(tempPath);
          } catch (_error) {}
          const dataUrl = await pathToDataUrl(tempPath, info ? imageMime(info) : "image/jpeg");
          const result = await request("/employee/cards/current/wechat-qrcode", {
            method: "PUT",
            data: { qrcode_url: dataUrl }
          });
          const qrUrl = result.qr_url || "";
          if (!qrUrl) {
            throw new Error("二维码保存失败");
          }
          cacheCurrentWechatQr(qrUrl, identityType, result.source);
          if (identityType === "personal") {
            this.setData({ personalWechatQr: qrUrl });
          }
          this.setData({ previewQrUrl: qrUrl || tempPath, previewPath: "长按识别加微信", previewQrLoading: false, previewError: "" });
        } catch (error) {
          this.setData({ previewPath: "请重新上传二维码", previewQrLoading: false, previewError: error.message || "二维码上传失败" });
          showError(error, "二维码识别或上传失败");
        } finally {
          this.setData({ submitting: false });
        }
      }
    });
  },

  /**
   * 生成并展示名片海报预览。
   */
  async showPoster() {
    await this.showSharePreview("poster", "名片海报");
  },

  /**
   * 生成并展示适合保存到相册的名片码卡片。
   */
  async showCardCode() {
    await this.showSharePreview("code", "名片码");
  },

  /**
   * 进入企业管理台，具体权限校验在目标页面和后端接口完成。
   */
  goEnterpriseAdmin() {
    wx.navigateTo({ url: "/pages/enterprise-admin/index" });
  },

  /**
   * 创建分享记录并展示指定模式的预览。
   * 预览模式决定海报或名片码形态，后端返回的小程序码是可追踪访问来源的关键输入。
   */
  async showSharePreview(mode, title) {
    if (!this.ensureLoggedIn("请先登录后发名片")) {
      return;
    }
    if (this.data.submitting) {
      return;
    }
    const openImmediately = mode === "code" || mode === "poster";
    if (openImmediately) {
      this.showPreview({ mode, title, path: "", qrUrl: "", loading: true, error: "" });
    }
    this.setData({ submitting: true, previewError: "", previewQrLoading: openImmediately });
    try {
      const share = await request("/employee/cards/current/share", { method: "POST", data: {} });
      app.globalData.shareId = share.share_id;
      const qrUrl = share.qrcode_url || share.mini_program_code_url || "";
      if (!qrUrl) {
        const message = share.qrcode_error || "小程序码生成失败";
        if (openImmediately) {
          this.setData({ previewQrLoading: false, previewError: message });
        } else {
          wx.showToast({ title: message, icon: "none" });
        }
        return;
      }
      const path = share.path || `pages/public/card?card=${share.public_id}`;
      if (openImmediately) {
        this.setData({ previewPath: path, previewQrUrl: qrUrl, previewQrLoading: false, previewError: "" });
      } else {
        this.showPreview({ mode, title, path, qrUrl });
      }
    } catch (error) {
      const message = error.message || "生成失败";
      if (openImmediately) {
        this.setData({ previewQrLoading: false, previewError: message });
      } else {
        wx.showToast({ title: message, icon: "none" });
      }
    } finally {
      this.setData({ submitting: false });
    }
  },

  /**
   * 统一设置预览弹层状态。
   * 调用方传入二维码、路径和加载/错误状态，本方法只负责页面展示编排。
   */
  showPreview({ mode, title, path, qrUrl, loading = false, error = "" }) {
    const codeMeta = codeCardMeta(this.data.card);
    this.setData({
      sheetVisible: false,
      previewSheetVisible: true,
      previewMode: mode,
      previewTitle: title,
      previewPath: path || "",
      previewQrUrl: qrUrl || "",
      previewFullscreen: mode === "poster",
      previewQrLoading: Boolean(loading),
      previewError: error || "",
      codeCardInitial: codeMeta.initial,
      codeCardSubtitle: codeMeta.subtitle
    });
    this.setTabBarHidden(true);
  },

  /**
   * 将当前名片码预览渲染成图片并保存到系统相册。
   * 依赖 canvas 工具生成临时文件，缺少二维码或仍在加载时会提前拦截。
   */
  async saveCardCodeImage() {
    if (this.data.previewQrLoading) {
      wx.showToast({ title: "名片码生成中", icon: "none" });
      return;
    }
    if (!this.data.previewQrUrl) {
      wx.showToast({ title: "名片码尚未生成", icon: "none" });
      return;
    }
    if (this.data.savingCardCode) {
      return;
    }
    this.setData({ savingCardCode: true });
    try {
      const { buildCardCodeImage } = require("../../utils/card-code-image");
      const imagePath = await buildCardCodeImage(this, {
        card: this.data.card,
        qrUrl: this.data.previewQrUrl,
        initial: this.data.codeCardInitial,
        subtitle: this.data.codeCardSubtitle,
        theme: {
          brand: this.data.themeBrand,
          brandDeep: this.data.themeBrandDeep,
          brandSoft: this.data.themeBrandSoft
        }
      });
      if (!imagePath) {
        throw new Error("名片码卡片生成失败");
      }
      await saveImageToAlbum(imagePath);
      wx.showToast({ title: "已保存到相册", icon: "success" });
    } catch (error) {
      wx.showToast({ title: error.message || "保存失败", icon: "none" });
    } finally {
      this.setData({ savingCardCode: false });
    }
  },

  /**
   * 在下一帧生成微信分享封面图。
   * 失败时清空封面，保留系统默认分享行为，不影响页面访问。
   */
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
          portraitPhotoUrl: this.data.portraitPhotoUrl || this.data.defaultPortraitPhotoUrl,
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

  /**
   * 创建一次可追踪分享并跳转到公域名片页预览。
   */
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

  /**
   * 创建分享记录后复制小程序路径，用于用户手动转发或测试访问链路。
   */
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

  /**
   * 本地接受演示换片请求。
   * 当前请求列表为前端演示数据，不调用后端交换接口。
   */
  acceptRequest(event) {
    const id = event.currentTarget.dataset.id;
    this.setData({ requests: this.data.requests.filter((item) => item.id !== id) });
    wx.showToast({ title: "已同意", icon: "success" });
  },

  /**
   * 本地忽略演示换片请求。
   */
  ignoreRequest(event) {
    const id = event.currentTarget.dataset.id;
    this.setData({ requests: this.data.requests.filter((item) => item.id !== id) });
  },

  /**
   * 提供微信原生转发配置，优先使用已生成的分享封面图。
   */
  onShareAppMessage() {
    const card = this.data.card;
    const message = { title: card.share_title || `${card.display_name || "我的"}的数字名片` };
    if (this.data.shareImageUrl) {
      message.imageUrl = this.data.shareImageUrl;
    }
    return message;
  },

  /**
   * 守卫需要登录的交互入口。
   * 返回布尔值供调用方提前退出，避免未登录状态继续发起受保护请求。
   */
  ensureLoggedIn(message) {
    if (this.data.loggedIn && app.globalData.token) {
      return true;
    }
    wx.showToast({ title: message || "请先登录", icon: "none" });
    return false;
  },

  /**
   * 控制自定义 tabBar 显隐，主要用于弹层打开时避免底部导航抢占点击。
   */
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

function shouldRefreshWeComSession(identity) {
  return isWeComRuntime() && identity && identity.identity_type === "personal";
}

function isRealEnterpriseIdentity(identity) {
  return identity && (identity.identity_type === "wecom_member" || identity.identity_type === "local_enterprise");
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

function codeCardMeta(card = {}) {
  const company = String(card.company || card.company_short_name || "").trim();
  const title = String(card.title || "").trim();
  return {
    initial: String(card.display_name || company || "名").trim().slice(0, 1) || "名",
    subtitle: [title, company].filter(Boolean).join(" · ")
  };
}

function saveImageToAlbum(filePath) {
  return new Promise((resolve, reject) => {
    if (typeof wx.saveImageToPhotosAlbum !== "function") {
      reject(new Error("当前微信版本暂不支持保存图片"));
      return;
    }
    wx.saveImageToPhotosAlbum({
      filePath,
      success: resolve,
      fail(error) {
        const message = String((error && error.errMsg) || "");
        if (isPrivacyAgreementError(error)) {
          wx.showModal({
            title: "隐私指引未配置",
            content: "请先在小程序后台声明保存图片到相册用途。",
            showCancel: false
          });
          reject(new Error("隐私指引未配置"));
          return;
        }
        if (/auth deny|authorize/i.test(message) && typeof wx.openSetting === "function") {
          wx.showModal({
            title: "需要相册权限",
            content: "请允许保存图片到相册。",
            confirmText: "去设置",
            success(result) {
              if (result.confirm) {
                wx.openSetting({});
              }
            }
          });
        }
        reject(new Error(message || "保存到相册失败"));
      }
    });
  });
}

function isPrivacyAgreementError(error) {
  return /privacy agreement|scope is not declared|privacy/i.test(String(error && error.errMsg || error && error.message || ""));
}

function pathToDataUrl(path, mime = "image/jpeg") {
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
        resolve(`data:${mime};base64,${result.data}`);
      },
      fail: reject
    });
  });
}

function getImageInfo(src) {
  return new Promise((resolve, reject) => {
    wx.getImageInfo({
      src,
      success: resolve,
      fail: reject
    });
  });
}

function imageMime(info) {
  const type = String(info && info.type || "").toLowerCase();
  if (type === "png") return "image/png";
  if (type === "jpg" || type === "jpeg") return "image/jpeg";
  if (type === "webp") return "image/webp";
  const path = String(info && info.path || "").toLowerCase();
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  if (path.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
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
  return `background: linear-gradient(${overlay}, ${overlay});`;
}

function cardTemplateClass(templateId) {
  const map = {
    tpl_horizontal_business: "biz-card--horizontal",
    tpl_minimal: "biz-card--minimal",
    tpl_brand_image: "biz-card--brand-image",
    tpl_portrait_photo: "biz-card--portrait",
    tpl_dark: "biz-card--dark",
    tpl_campaign: "biz-card--campaign"
  };
  return map[normalizeTemplateId(templateId)] || map.tpl_horizontal_business;
}

function layoutImageUrl(layout, key) {
  const value = layout && layout[key];
  return typeof value === "string" ? value.trim() : "";
}

function activeTemplateBackground(layout, templateId, fallbackUrl) {
  const config = templateBackgroundConfig(layout, templateId);
  if (config) {
    return {
      url: config.background_url || "",
      presetId: config.background_preset_id || "",
      opacity: config.background_opacity
    };
  }
  return {
    url: fallbackUrl || "",
    presetId: layout && typeof layout.background_preset_id === "string" ? layout.background_preset_id : "",
    opacity: layout && layout.background_opacity
  };
}

function templateBackgroundConfig(layout, templateId) {
  const map = layout && layout.template_backgrounds;
  if (!map || typeof map !== "object" || Array.isArray(map)) {
    return null;
  }
  const normalizedTemplateId = normalizeTemplateId(templateId);
  const raw = map[normalizedTemplateId] || map[templateVariantKey(normalizedTemplateId)];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  return {
    background_url: typeof raw.background_url === "string" ? raw.background_url.trim() : "",
    background_preset_id: typeof raw.background_preset_id === "string" ? raw.background_preset_id : "",
    background_opacity: raw.background_opacity
  };
}

function templateVariantKey(templateId) {
  const map = {
    tpl_horizontal_business: "horizontal-business",
    tpl_minimal: "minimal",
    tpl_brand_image: "brand-image",
    tpl_portrait_photo: "portrait-photo",
    tpl_dark: "dark",
    tpl_campaign: "campaign"
  };
  return map[normalizeTemplateId(templateId)] || "horizontal-business";
}

function normalizeTemplateId(templateId) {
  if (templateId === "tpl_demo_business" || templateId === "horizontal-business") {
    return "tpl_horizontal_business";
  }
  if (templateId === "tpl_portrait_photo" || templateId === "tpl_photo_portrait" || templateId === "portrait-photo" || templateId === "photo-portrait") {
    return "tpl_portrait_photo";
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
