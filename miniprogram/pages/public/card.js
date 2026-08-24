const app = getApp();
const { request } = require("../../utils/api");
const { buildShareCardImage } = require("../../utils/share-card-image");
const { DEFAULT_PORTRAIT_PHOTO_URL } = require("../../utils/card-assets");
const { DEFAULT_BRAND, buildTheme, themeStyle } = require("../../utils/theme");
const config = require("../../config");
const { showRestriction, showError } = require("../../utils/feedback");

const VISITOR_ANON_STORAGE_KEY = "wecomcard.public_anon_id.v1";
const VISITOR_ANON_TTL_MS = 24 * 60 * 60 * 1000;
const DEMO_ASSET_BASE = `${String(config.apiBase || "").replace(/\/$/, "")}/demo-assets/company`;
const DEMO_ASSET_VERSION = "20260715-photo4";

/**
 * 拼出演示企业素材地址。
 * 演示数据不依赖真实租户资产，版本号用于强制刷新小程序缓存。
 */
function demoAsset(name) {
  return `${DEMO_ASSET_BASE}/${name}?v=${DEMO_ASSET_VERSION}`;
}

const demoServiceItems = [
  { id: "demo_service_identity", title: "企业数字名片", desc: "统一员工名片、企业资料与品牌视觉", image_url: demoAsset("service-identity.png") },
  { id: "demo_service_leads", title: "客户留资", desc: "访客行为追踪与销售跟进", image_url: demoAsset("service-leads.png") },
  { id: "demo_service_brand", title: "企业官网式展示", desc: "模块化呈现产品、简介、视频和荣誉", image_url: demoAsset("service-brand.png") },
  { id: "demo_service_analytics", title: "数据分析", desc: "访问效果统计和线索判断", image_url: demoAsset("service-analytics.png") },
  { id: "demo_service_wecom", title: "企微身份集成", desc: "对接企业微信身份与组织架构", image_url: demoAsset("service-integration.png") }
];

const demoPublicCard = {
  public_id: "pub_demo0001",
  status: "active",
  allow_forward: true,
  show_avatar: true,
  share_title: "",
  card: {
    display_name: "李明",
    title: "销售总监 · 市场部",
    company: "智云科技（深圳）有限公司",
    company_short_name: "智云科技",
    avatar_url: "",
    fields: {
      mobile: "138 0013 8000",
      phone: "",
      email: "liming@zhiyun.tech",
      wechat_id: "liming-zy",
      address: "深圳市南山区科技园"
    }
  },
  template: {
    color_scheme: { primary: DEFAULT_BRAND },
    layout: {}
  },
  company_profile: {
    name: "智云科技（深圳）有限公司",
    short_name: "智云科技",
    address: "深圳市南山区科技园",
    service_items: demoServiceItems.map((item, index) => ({
      id: item.id,
      title: item.title,
      description: item.desc,
      image_url: item.image_url,
      visible: true,
      sort_order: (index + 1) * 10
    })),
    display_modules: [
      { key: "services", title: "产品与服务", visible: true, sort_order: 10, layout: "graphic" },
      { key: "profile", title: "企业简介", visible: true, sort_order: 20, layout: "carousel" },
      { key: "videos", title: "企业视频", visible: true, sort_order: 30, layout: "carousel" },
      { key: "honors", title: "荣誉资质", visible: true, sort_order: 40, layout: "carousel" }
    ],
    intro_blocks: [
      { type: "heading", text: "智云科技企业展示样例" },
      {
        type: "paragraph",
        text: "智云科技专注企业数字化名片与获客解决方案，为企业提供统一对外形象、员工名片管理、客户转化追踪与企业官网式展示能力。我们把原本分散在员工微信、纸质名片、官网页面和销售资料里的信息整合到一张可分享、可追踪、可持续运营的企业名片中。"
      },
      {
        type: "quote",
        text: "我们的目标不是把名片做得更花，而是让每一次客户打开名片时，都能更快理解企业是谁、能提供什么价值，以及下一步应该如何联系。"
      },
      { type: "list", items: ["统一企业品牌形象", "员工名片集中管理", "访客行为与转化追踪"] },
      { type: "image", url: demoAsset("profile-office.png"), caption: "开放协作办公区" },
      {
        type: "gallery",
        images: [
          { url: demoAsset("profile-team.png"), caption: "客户共创会议" },
          { url: demoAsset("profile-office.png"), caption: "企业服务团队" },
          { url: demoAsset("profile-product.png"), caption: "产品研发现场" }
        ]
      },
      {
        type: "paragraph",
        text: "在销售、招聘、渠道合作和客户服务场景中，企业名片会作为轻量入口承接外部流量。管理员可以按模块维护产品服务、企业简介、荣誉资质和视频内容；员工转发自己的名片时，访客看到的不只是个人联系方式，也能顺手了解企业能力、查看案例素材、保存联系方式或继续转发给决策人。"
      },
      { type: "video", video_id: "123" }
    ]
  },
  videos: [
    {
      video_id: "123",
      title: "企业介绍视频",
      video_url: demoAsset("company-intro.mp4"),
      cover_url: demoAsset("profile-office.png")
    }
  ],
  honors: [
    {
      honor_id: "honor_demo_001",
      title: "年度数字化服务创新奖",
      body: "展示荣誉资质模块的多图轮播与大图预览能力。",
      images: [
        { image_url: demoAsset("honor-award.png"), title: "创新奖证书", caption: "行业协会颁发" },
        { image_url: demoAsset("honor-ceremony.png"), title: "颁奖现场", caption: "年度服务创新论坛" }
      ]
    },
    {
      honor_id: "honor_demo_002",
      title: "ISO 质量管理体系认证",
      body: "展示同一荣誉下多张图片、图片标题与说明。",
      images: [
        { image_url: demoAsset("honor-audit.png"), title: "认证证书", caption: "质量管理体系认证" },
        { image_url: demoAsset("profile-team.png"), title: "审核会议", caption: "标准流程复核" }
      ]
    }
  ]
};
const TEMPLATE_BACKGROUNDS = {
  tpl_horizontal_business: "/assets/card-backgrounds/bg-light-wave.png",
  tpl_minimal: "/assets/card-backgrounds/bg-light-geometry.png",
  tpl_brand_image: "/assets/card-backgrounds/bg-blue-dot.png",
  tpl_portrait_photo: "/assets/card-backgrounds/bg-light-cubes.png",
  tpl_dark: "/assets/card-backgrounds/bg-dark-dot.png",
  tpl_campaign: "/assets/card-backgrounds/bg-light-cubes.png"
};
const PRESET_BACKGROUNDS = {
  "light-wave": "/assets/card-backgrounds/bg-light-wave.png",
  "light-geometry": "/assets/card-backgrounds/bg-light-geometry.png",
  "light-cubes": "/assets/card-backgrounds/bg-light-cubes.png",
  "blue-dot": "/assets/card-backgrounds/bg-blue-dot.png",
  "dark-dot": "/assets/card-backgrounds/bg-dark-dot.png"
};

Page({
  data: {
    uiState: "loading",
    publicId: "",
    shareId: "",
    nextShareId: "",
    visitId: "",
    themeBrand: DEFAULT_BRAND,
    themeStyle: themeStyle(buildTheme(DEFAULT_BRAND)),
    navTitle: "",
    isDisabled: false,
    isOwnCard: false,
    isDemo: false,
    canShare: true,
    loggedIn: false,
    viewCount: 269,
    visitCount: 269,
    likeCount: 136,
    likedByMe: false,
    pendingExchange: false,
    visitorAvatarSlots: [{ avatarUrl: "" }],
    wechatSheetVisible: false,
    wechatQrUrl: "",
    serviceItems: demoServiceItems,
    introBlocks: demoPublicCard.company_profile.intro_blocks,
    displayModules: [],
    cardLogoUrl: "",
    cardCompanyName: "",
    cardCompanyShortName: "",
    showCardHead: false,
    shareImageUrl: "",
    cardBackgroundStyle: "",
    cardBackgroundUrl: "",
    cardBackgroundOpacity: 1,
    cardTemplateClass: "biz-card--horizontal",
    portraitPhotoUrl: "",
    defaultPortraitPhotoUrl: DEFAULT_PORTRAIT_PHOTO_URL,
    card: demoPublicCard
  },

  /**
   * 解析公域名片入口参数并加载名片。
   * 支持直接 card/share 参数和扫码 scene 参数；缺少真实 publicId 时展示演示名片。
   */
  async onLoad(query) {
    const isDemoRoute = query.demo === "1";
    const scene = decodeSceneParam(query.scene);
    const publicId = query.card || query.public_id || scene.card || "";
    const shareId = query.share || scene.share || "";
    this.setData({ publicId, shareId, loggedIn: Boolean(app.globalData.token) });
    if (isDemoRoute || !publicId) {
      this.applyPublicCard(demoPublicCard, true);
      wx.showToast({ title: "当前展示演示名片", icon: "none" });
      return;
    }
    try {
      await this.loadPublicCard();
      await this.createVisit();
    } catch (_error) {
      this.setData({ uiState: "error" });
    }
  },

  /**
   * 页面回到前台时刷新分享封面。
   * 只在名片已就绪或停用态执行，避免 loading 阶段重复渲染 canvas。
   */
  onShow() {
    if (this.data.uiState === "ready" || this.data.uiState === "disabled") {
      this.prepareShareImage();
    }
  },

  /**
   * 拉取公开名片详情。
   * 公域页面允许匿名访问，因此请求显式关闭 auth。
   */
  async loadPublicCard() {
    try {
      const card = await request(`/public/cards/${this.data.publicId}`, { auth: false });
      this.applyPublicCard(card, false);
    } catch (error) {
      this.setData({ uiState: "error" });
      wx.showToast({ title: error.message || "名片加载失败", icon: "none" });
    }
  },

  /**
   * 规范化公开名片数据并同步页面展示状态。
   * 这里集中处理停用态、分享权限、企业模块、模板背景和主题色，避免模板层分散判断。
   */
  applyPublicCard(rawCard, isDemo) {
    const card = normalizePublicCard(rawCard);
    const disabled = card.status && card.status !== "active";
    const layout = (card.template && card.template.layout) || {};
    const brand = (card.template && card.template.color_scheme && card.template.color_scheme.primary) || DEFAULT_BRAND;
    const theme = buildTheme(brand);
    const cardMeta = publicCardMeta(card);
    const isOwnCard = this.isOwnPublicCard(card);
    const canShare = isOwnCard || card.allow_forward !== false;
    const templateId = card.template && card.template.template_id;
    const background = activeTemplateBackground(layout, templateId, card.template && card.template.background_url);
    this.setData({
      card,
      ...theme,
      themeStyle: themeStyle(theme),
      navTitle: publicNavTitle(card, cardMeta),
      cardLogoUrl: cardMeta.logoUrl,
      cardCompanyName: cardMeta.companyName,
      cardCompanyShortName: cardMeta.companyShortName,
      showCardHead: Boolean(cardMeta.logoUrl || cardMeta.companyShortName),
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
      isDisabled: disabled,
      isOwnCard,
      isDemo: Boolean(isDemo),
      canShare,
      serviceItems: resolveServiceItems(card, isDemo),
      introBlocks: resolveIntroBlocks(card),
      displayModules: resolveDisplayModules(card, isDemo),
      viewCount: isDemo ? 269 : 0,
      visitCount: isDemo ? 269 : 0,
      likeCount: isDemo ? 136 : 0,
      likedByMe: false,
      uiState: disabled ? "disabled" : "ready"
    });
    this.updateShareMenu(canShare && !disabled);
    this.prepareShareImage(cardMeta);
    this.applyStats(card.stats);
  },

  /**
   * 判断当前访问者是否为这张公开名片的拥有者。
   * 会同时参考全局当前身份、身份列表和后端返回的 owner 标记。
   */
  isOwnPublicCard(card) {
    const currentIdentity = app.globalData.currentIdentity || {};
    const identities = app.globalData.identities || [];
    return Boolean(
      (this.data.publicId && currentIdentity.public_id === this.data.publicId) ||
      (this.data.publicId && identities.some((identity) => identity.public_id === this.data.publicId)) ||
      (card && (card.is_owner || card.is_own))
    );
  },

  /**
   * 根据名片分享权限控制微信右上角分享菜单。
   */
  updateShareMenu(visible) {
    const method = visible ? wx.showShareMenu : wx.hideShareMenu;
    if (typeof method === "function") {
      method.call(wx, visible ? { menus: ["shareAppMessage"] } : {});
    }
  },

  /**
   * 从错误态重新加载公开名片，并重新创建访问记录。
   */
  reload() {
    this.setData({ uiState: "loading" });
    this.loadPublicCard()
      .then(() => this.createVisit())
      .catch(() => this.setData({ uiState: "error" }));
  },

  /**
   * 返回上一页；没有页面栈时回到员工首页，适配扫码直达场景。
   */
  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
    } else {
      wx.switchTab({ url: "/pages/employee/index", fail() {} });
    }
  },

  /**
   * 回到员工首页 tab。
   */
  goHome() {
    wx.switchTab({ url: "/pages/employee/index", fail() {} });
  },

  /**
   * 创建公开名片访问记录，并保存后续行为上报所需的 visitToken。
   * 自己访问自己的名片不计入访客，匿名访问会携带本地 anonId 和设备指纹。
   */
  async createVisit() {
    if (!this.data.publicId) {
      return;
    }
    if (this.data.isOwnCard) {
      app.globalData.visitToken = "";
      this.setData({ visitId: "" });
      return;
    }
    try {
      const data = {
        anon_id: currentAnonId() || undefined,
        fingerprint: visitorFingerprint() || undefined
      };
      if (this.data.shareId) {
        data.share = this.data.shareId;
      }
      const options = {
        method: "POST",
        data
      };
      if (!this.data.loggedIn) {
        options.auth = false;
      }
      const visit = await request(`/public/cards/${this.data.publicId}/visit`, options);
      app.globalData.visitToken = visit.visit_token;
      app.globalData.anonId = visit.anon_id;
      storeAnonId(visit.anon_id);
      this.setData({ visitId: visit.visit_id });
      if (visit.stats) {
        this.applyStats(visit.stats);
      } else {
        this.setData({
          viewCount: Math.max(1, this.data.viewCount),
          visitCount: Math.max(1, this.data.visitCount + 1)
        });
      }
      await this.prepareDerivedShare();
    } catch (error) {
      console.error("create visit failed", error);
      wx.showToast({ title: "访问记录未上报", icon: "none" });
    }
  },

  /**
   * 基于当前访问令牌派生下一跳分享 ID。
   * 这样访客二次转发时仍能保留来源链路，失败则退回原分享 ID。
   */
  async prepareDerivedShare() {
    if (!this.data.canShare || !app.globalData.visitToken || !this.data.shareId) {
      return;
    }
    try {
      const derived = await request(`/public/cards/${this.data.publicId}/shares/derive`, {
        method: "POST",
        auth: false,
        header: { authorization: `Bearer ${app.globalData.visitToken}` },
        data: { parent_share_id: this.data.shareId }
      });
      this.setData({ nextShareId: derived.share_id });
    } catch (error) {
      console.error("derive share failed", error);
      this.setData({ nextShareId: this.data.shareId });
    }
  },

  /**
   * 记录访客行为事件，例如拨号、点赞、复制邮箱等。
   * 只有非本人访问且 visitToken 已建立时上报，失败不影响用户动作。
   */
  async recordAction(actionType) {
    if (this.data.isOwnCard) {
      return;
    }
    if (!app.globalData.visitToken || !this.data.publicId) {
      return;
    }
    try {
      await request(`/public/cards/${this.data.publicId}/actions`, {
        method: "POST",
        auth: false,
        header: { authorization: `Bearer ${app.globalData.visitToken}` },
        data: { action_type: actionType }
      });
    } catch (error) {
      console.error(`record action ${actionType} failed`, error);
    }
  },

  /**
   * 拨打名片联系电话，并记录拨号行为。
   */
  callPhone() {
    const fields = this.data.card.card.fields || {};
    const number = fields.mobile || fields.phone;
    if (!number) {
      wx.showToast({ title: "暂无可拨打电话", icon: "none" });
      return;
    }
    this.recordAction("call_phone");
    wx.makePhoneCall({ phoneNumber: number, fail() {} });
  },

  /**
   * 调用微信联系人 API 保存名片资料。
   * 字段来自公开名片 card.fields，不额外请求隐私数据。
   */
  saveContact() {
    const c = this.data.card.card;
    const fields = c.fields || {};
    this.recordAction("save_phone");
    wx.addPhoneContact({
      firstName: c.display_name || "联系人",
      mobilePhoneNumber: fields.mobile || "",
      workPhoneNumber: fields.phone || "",
      email: fields.email || "",
      organization: c.company || "",
      title: c.title || "",
      fail() {}
    });
  },

  /**
   * 收藏名片的前端反馈入口。
   * 当前只记录行为和提示，真正名片夹持久化由后续功能承接。
   */
  collectCard() {
    this.recordAction("view_paper_card");
    wx.showToast({ title: "已收下名片", icon: "success" });
  },

  /**
   * 对公开名片点赞，并按后端返回统计刷新计数。
   * 使用 visitToken 做访客级幂等，避免重复点击刷高点赞数。
   */
  async likeCard() {
    if (this.data.isOwnCard) {
      return;
    }
    if (this.data.likedByMe) {
      return;
    }
    if (!app.globalData.visitToken) {
      wx.showToast({ title: "访问记录准备中", icon: "none" });
      return;
    }
    try {
      const result = await request(`/public/cards/${this.data.publicId}/actions`, {
        method: "POST",
        auth: false,
        header: { authorization: `Bearer ${app.globalData.visitToken}` },
        data: { action_type: "like_card" }
      });
      this.setData({
        likedByMe: true,
        likeCount: result.stats && typeof result.stats.like_count === "number"
          ? result.stats.like_count
          : this.data.likeCount + (result.idempotent ? 0 : 1)
      });
    } catch (error) {
      console.error("like card failed", error);
      wx.showToast({ title: "操作失败，请稍后重试", icon: "none" });
    }
  },

  /**
   * 引导访客回到首页创建或查看自己的名片。
   */
  makeMyCard() {
    wx.switchTab({ url: "/pages/employee/index" });
  },

  /**
   * 名片拥有者进入编辑页。
   */
  editMyCard() {
    wx.navigateTo({ url: "/pages/employee/edit" });
  },

  /**
   * 弹出当前公开名片的身份说明。
   * 演示、企业、个人三种语义分别展示，降低访客理解成本。
   */
  openIdentityInfo() {
    const company = this.data.cardCompanyShortName || this.data.cardCompanyName;
    const isEnterprise = Boolean(company);
    wx.showModal({
      title: this.data.isDemo ? "企业名片 · 样例" : (isEnterprise ? "企业名片" : "个人名片"),
      content: this.data.isDemo
        ? "这是智云科技（深圳）有限公司的企业名片样例，用于体验访客看到的最终展示效果。"
        : (isEnterprise
          ? `这张名片来自${company}的企业身份，企业信息由企业统一维护。`
          : "这是一张个人名片，资料由名片本人维护。"),
      showCancel: false,
      confirmText: "知道了"
    });
  },

  /**
   * 打开企业名片开通说明，并记录升级意向事件。
   */
  openUpgradeEnterprise() {
    if (typeof wx.reportEvent === "function") {
      wx.reportEvent("upgrade_enterprise", { source: "demo_company_card" });
    }
    this.recordAction("upgrade_enterprise");
    wx.showModal({
      title: "企业名片开通流程",
      content: "企业管理员授权安装后，即可统一企业形象、管理员工名片并查看访客转化数据。正式接入开放后，我们会协助完成配置。",
      showCancel: false,
      confirmText: "我知道了"
    });
  },

  /**
   * 打开联系客服占位说明。
   * 后续接入真实客服页时只需替换这里的跳转逻辑。
   */
  openContactService() {
    // 后续接入系统客服页面时，只需在这里替换为客服跳转能力。
    wx.showModal({
      title: "联系开通",
      content: "系统客服页面正在接入中，开放后可在这里联系开通企业名片。",
      showCancel: false,
      confirmText: "我知道了"
    });
  },

  /**
   * 发起交换名片的前端反馈入口，并记录交换意向。
   */
  async exchangeCard() {
    if (!this.data.loggedIn) {
      this.setData({ pendingExchange: true });
      const login = this.selectComponent("#exchangeLogin");
      if (login && typeof login.openDialog === "function") {
        login.openDialog();
      }
      return;
    }
    await this.recordAction("exchange_card");
    wx.showToast({ title: "交换名片请求已发起", icon: "success" });
  },

  async onExchangeLoginSuccess() {
    this.setData({ loggedIn: true });
    await this.createVisit();
    if (this.data.pendingExchange) {
      this.setData({ pendingExchange: false });
      await this.exchangeCard();
    }
  },

  onExchangeLoginFail() {
    this.setData({ pendingExchange: false });
  },

  /**
   * 将后端统计结构映射到页面展示字段。
   */
  applyStats(stats) {
    if (!stats) {
      return;
    }
    this.setData({
      viewCount: Number(stats.visitor_count || 0),
      visitCount: Number(stats.visit_count || 0),
      likeCount: Number(stats.like_count || 0),
      likedByMe: Boolean(stats.liked_by_current_visitor),
      visitorAvatarSlots: visitorAvatarSlots(stats)
    });
  },

  /**
   * 复制名片邮箱到剪贴板，并记录复制行为。
   */
  sendEmail() {
    const email = this.data.card.card.fields && this.data.card.card.fields.email;
    if (!email) {
      showRestriction("对方暂未设置邮箱");
      return;
    }
    this.recordAction("copy_email");
    if (typeof wx.openUrl === "function") {
      wx.openUrl({ url: `mailto:${encodeURIComponent(email)}`, fail: (error) => showError(error, "无法调起邮件程序") });
      return;
    }
    showRestriction("当前微信版本不支持直接调起邮件程序，请升级微信后重试");
  },

  /**
   * 复制企业或个人地址，作为地图入口的轻量替代。
   */
  openMap() {
    const fields = this.data.card.card.fields || {};
    const profile = this.data.card.company_profile || {};
    const address = profile.address || fields.address;
    if (!address) {
      showRestriction("对方暂未设置地址");
      return;
    }
    const latitude = Number(profile.latitude ?? fields.latitude);
    const longitude = Number(profile.longitude ?? fields.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      showRestriction("该地址尚未设置地图位置，请联系企业管理员完善经纬度后再导航");
      return;
    }
    this.recordAction("open_map");
    wx.openLocation({ latitude, longitude, name: profile.name || this.data.card.card.company || "目的地", address, scale: 16, fail: (error) => showError(error, "地图导航打开失败") });
  },

  /**
   * 打开微信二维码弹层，并记录复制/查看微信行为。
   */
  copyWechat() {
    const qrUrl = publicWechatQrUrl(this.data.card);
    if (!qrUrl) {
      showRestriction("对方暂未设置微信二维码");
      return;
    }
    this.recordAction("copy_wechat");
    this.setData({ wechatSheetVisible: true, wechatQrUrl: qrUrl });
  },

  onCompanyMediaError(event) {
    const now = Date.now();
    if (now - Number(this._lastMediaErrorAt || 0) < 1500) return;
    this._lastMediaErrorAt = now;
    showError(event.detail, "媒体资源加载失败，请检查网络后重试");
  },

  /**
   * 关闭微信二维码弹层。
   */
  closeWechatSheet() {
    this.setData({ wechatSheetVisible: false });
  },

  /**
   * 查看纸质名片信息的行为入口。
   */
  viewPaperCard() {
    this.recordAction("view_paper_card");
    wx.showToast({ title: "纸质名片信息已记录", icon: "none" });
  },

  /**
   * 预览企业介绍正文中的单张图片。
   */
  previewIntroImage(event) {
    const url = event.currentTarget.dataset.url;
    if (url) {
      wx.previewImage({ urls: [url], current: url });
    }
  },

  /**
   * 预览企业模块组件回传的一组图片。
   */
  previewModuleImage(event) {
    const detail = event.detail || {};
    const urls = detail.urls || event.currentTarget.dataset.urls || [];
    const current = detail.url || event.currentTarget.dataset.url || urls[0];
    if (current) wx.previewImage({ urls: Array.isArray(urls) ? urls : [current], current });
  },

  /**
   * 生成微信原生转发配置。
   * 优先使用派生 shareId，确保访客二次转发仍能被追踪。
   */
  onShareAppMessage() {
    const shareId = this.data.nextShareId || this.data.shareId;
    this.recordAction("view_site");
    const shareParam = shareId ? `&share=${shareId}` : "";
    const cardParam = this.data.publicId ? `?card=${this.data.publicId}${shareParam}` : "";
    const message = {
      title: this.data.card.share_title || `${this.data.card.card.display_name || "名片"}的名片`,
      path: `/pages/public/card${cardParam}`
    };
    if (this.data.shareImageUrl) {
      message.imageUrl = this.data.shareImageUrl;
    }
    return message;
  },

  /**
   * 手动刷新分享封面图。
   */
  refreshShareImage() {
    this.prepareShareImage();
  },

  /**
   * 生成公开名片分享封面图。
   * 名片元信息可由加载阶段传入，未传时从当前页面状态兜底读取。
   */
  prepareShareImage(cardMeta) {
    const nextTick = wx.nextTick || ((callback) => setTimeout(callback, 0));
    nextTick(async () => {
      const imageUrl = await buildShareCardImage(this, {
        card: Object.assign(
          { show_avatar: this.data.card && this.data.card.show_avatar !== false },
          this.data.card && this.data.card.card
        ),
        templateClass: this.data.cardTemplateClass,
        portraitPhotoUrl: this.data.portraitPhotoUrl || this.data.defaultPortraitPhotoUrl,
        theme: {
          brand: this.data.themeBrand,
          brandDeep: this.data.themeBrandDeep,
          brandSoft: this.data.themeBrandSoft
        },
        meta: cardMeta || {
          companyName: this.data.cardCompanyName,
          companyShortName: this.data.cardCompanyShortName
        }
      });
      if (imageUrl) {
        this.setData({ shareImageUrl: imageUrl });
      }
    });
  }
});

/**
 * 生成公开名片背景样式。
 * 会按模板类型选择浅色或深色遮罩，并兼容预设背景 ID。
 */
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
  const fallbackColor = normalizedTemplateId === "tpl_dark"
    ? "#161b22"
    : normalizedTemplateId === "tpl_brand_image"
      ? "var(--brand)"
      : "#ffffff";
  return [
    `background-color: ${fallbackColor}`,
    `background-image: linear-gradient(${overlay}, ${overlay})`
  ].join(";") + ";";
}

/**
 * 解析小程序扫码 scene 参数。
 * 支持直接 pub_/shr_ 标识，也支持 querystring 形式的 card/share 参数。
 */
function decodeSceneParam(value) {
  const raw = String(value || "").trim();
  if (!raw) return { card: "", share: "" };
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch (_error) {
    decoded = raw;
  }
  if (decoded.startsWith("pub_")) return { card: decoded, share: "" };
  if (decoded.startsWith("shr_")) return { card: "", share: decoded };
  const params = new URLSearchParams(decoded.replace(/^\?/, ""));
  return {
    card: params.get("card") || params.get("public_id") || "",
    share: params.get("share") || ""
  };
}

/**
 * 将模板 ID 映射到公开名片卡片样式类。
 */
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

/**
 * 从模板 layout 中安全读取图片 URL。
 */
function layoutImageUrl(layout, key) {
  const value = layout && layout[key];
  return typeof value === "string" ? value.trim() : "";
}

/**
 * 计算当前模板实际使用的背景配置。
 * 新版 template_backgrounds 优先，旧字段作为兼容兜底。
 */
function activeTemplateBackground(layout, templateId, fallbackUrl) {
  const config = templateBackgroundConfig(layout, templateId);
  if (config) {
    const presetId = config.background_preset_id || "";
    return {
      url: config.background_url || PRESET_BACKGROUNDS[presetId] || fallbackUrl || "",
      presetId,
      opacity: config.background_opacity
    };
  }
  const presetId = layout && typeof layout.background_preset_id === "string" ? layout.background_preset_id : "";
  return {
    url: fallbackUrl || PRESET_BACKGROUNDS[presetId] || TEMPLATE_BACKGROUNDS[normalizeTemplateId(templateId)] || "",
    presetId,
    opacity: layout && layout.background_opacity
  };
}

/**
 * 从 layout.template_backgrounds 中提取指定模板背景配置。
 */
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

/**
 * 将模板 ID 转成旧版 variant 键，兼容历史保存结构。
 */
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

/**
 * 统一历史模板别名和当前模板 ID。
 */
function normalizeTemplateId(templateId) {
  if (templateId === "tpl_demo_business" || templateId === "horizontal-business") {
    return "tpl_horizontal_business";
  }
  if (templateId === "tpl_portrait_photo" || templateId === "tpl_photo_portrait" || templateId === "portrait-photo" || templateId === "photo-portrait") {
    return "tpl_portrait_photo";
  }
  return templateId || "tpl_horizontal_business";
}

/**
 * 将背景透明度限制在 0-100 的整数范围内。
 */
function normalizeOpacity(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 100;
  }
  return Math.max(0, Math.min(100, Math.round(number)));
}

/**
 * 规范化后端公开名片结构，给页面提供稳定默认值。
 */
function normalizePublicCard(card) {
  return {
    public_id: card.public_id || "",
    status: card.status || "active",
    allow_forward: card.allow_forward !== false,
    show_avatar: card.show_avatar !== false,
    share_title: typeof card.share_title === "string" ? card.share_title.trim() : "",
    card: Object.assign(
      { display_name: "", title: "", company: "", company_short_name: "", avatar_url: "", fields: {} },
      card.card || {}
    ),
    template: card.template || { color_scheme: {}, layout: {} },
    company_profile: card.company_profile || { name: "", intro_blocks: [], address: "" },
    videos: card.videos || [],
    honors: card.honors || [],
    stats: card.stats || { visitor_count: 0, visit_count: 0, like_count: 0, liked_by_current_visitor: false },
    is_owner: card.is_owner,
    is_own: card.is_own
  };
}

/**
 * 根据访客统计生成头像占位槽。
 */
function visitorAvatarSlots(stats) {
  const count = Math.max(0, Number((stats && stats.visitor_count) || 0));
  const slotCount = count >= 4 ? 4 : Math.max(1, count);
  const avatars = Array.isArray(stats && stats.recent_visitor_avatars) ? stats.recent_visitor_avatars : [];
  return Array.from({ length: slotCount }).map((_, index) => ({ avatarUrl: avatars[index] || "" }));
}

/**
 * 按企业/个人语义选择公开展示的微信二维码地址。
 * 企业名片优先企业微信二维码，个人名片优先个人微信二维码。
 */
function publicWechatQrUrl(card) {
  const fields = (card && card.card && card.card.fields) || {};
  const layout = (card && card.template && card.template.layout) || {};
  const profile = (card && card.company_profile) || {};
  const hasCompany = Boolean((card && card.card && card.card.company) || profile.name);
  if (hasCompany) {
    return fields.wecom_qrcode_url || fields.wechat_qrcode_url || layout.wecom_qrcode_url || layout.wechat_qrcode_url || profile.wecom_qrcode_url || profile.wechat_qrcode_url || "";
  }
  return fields.wechat_qrcode_url || fields.wecom_qrcode_url || layout.wechat_qrcode_url || layout.wecom_qrcode_url || profile.wechat_qrcode_url || profile.wecom_qrcode_url || "";
}

/**
 * 生成公开名片导航标题。
 */
function publicNavTitle(card, meta = publicCardMeta(card)) {
  const name = ((card.card && card.card.display_name) || "").trim();
  const company = meta.companyName;
  if (!company) {
    return name || "名片";
  }
  return name ? `${name} | ${company}` : company;
}

/**
 * 提取公开名片的企业展示元信息。
 * 个人名片会隐藏公司头部，避免把个人身份当作企业展示。
 */
function publicCardMeta(card) {
  const rawCompany = ((card.card && card.card.company) || (card.company_profile && card.company_profile.name) || "").trim();
  const rawShortName = ((card.card && card.card.company_short_name) || (card.company_profile && card.company_profile.short_name) || "").trim();
  const personal = isPersonalCompanyName(rawCompany) || isCurrentPersonalCard(card);
  const companyName = personal ? "" : rawCompany;
  const companyShortName = personal ? "" : rawShortName;
  const logoUrl = ((card.template && card.template.logo_url) || "").trim();
  return { companyName, companyShortName, logoUrl };
}

/**
 * 判断公开名片是否为当前登录用户的个人名片。
 */
function isCurrentPersonalCard(card) {
  const currentIdentity = app.globalData.currentIdentity || {};
  return Boolean(
    currentIdentity.identity_type === "personal" &&
    card &&
    card.public_id &&
    currentIdentity.public_id === card.public_id
  );
}

/**
 * 识别历史数据中表示个人身份的公司占位名称。
 */
function isPersonalCompanyName(company) {
  return company === "微信个人身份" || company === "个人名片" || company === "Demo Tenant";
}

/**
 * 汇总企业服务项目，兼容 layout 和 company_profile 两种来源。
 * 会过滤不可见/空内容并按 sort_order 排序。
 */
function resolveServiceItems(card, isDemo) {
  const layout = (card.template && card.template.layout) || {};
  const profile = card.company_profile || {};
  const source =
    layout.service_items ||
    layout.services ||
    profile.service_items ||
    profile.services ||
    [];
  const items = Array.isArray(source)
    ? source
        .map((item, index) => ({
          id: String(item.id || item.title || `service_${index}`).replace(/\s+/g, "_"),
          title: String(item.title || item.name || "").trim(),
          desc: String(item.desc || item.description || "").trim(),
          image_url: String(item.image_url || "").trim(),
          visible: item.visible !== false,
          sort_order: Number.isFinite(Number(item.sort_order)) ? Number(item.sort_order) : index * 10
        }))
        .filter((item) => item.visible && (item.title || item.image_url))
        .sort((a, b) => a.sort_order - b.sort_order)
        .slice(0, 30)
    : [];
  return items.length ? items : isDemo ? demoServiceItems.map((item, index) => ({ ...item, id: `demo_service_${index}` })) : [];
}

/**
 * 规范化企业介绍正文块。
 * 会将视频块关联到 videos 列表，并计算折叠状态和预览图片集合。
 */
function resolveIntroBlocks(card) {
  const videosById = new Map((card.videos || []).map((video) => [String(video.video_id), video]));
  const blocks = ((card.company_profile || {}).intro_blocks || []).map((item) => {
    const type = item.type || (item.image_url ? "image" : "paragraph");
    const video = type === "video" ? videosById.get(String(item.video_id || "")) : null;
    return {
      type,
      text: item.text || item.content || "",
      items: Array.isArray(item.items) ? item.items.filter(Boolean) : [],
      image_url: item.image_url || item.url || "",
      caption: item.caption || "",
      images: (item.images || []).map((image) => ({ url: image.url || "", caption: image.caption || "" })).filter((image) => image.url),
      video_id: item.video_id || "",
      video_url: video ? video.video_url : "",
      cover_url: video ? video.cover_url : "",
      title: video ? video.title : ""
    };
  });
  let visibleWeight = 0;
  return blocks
    .map((item, index) => {
      const textLength = String(item.text || "").length + item.items.join("").length;
      const blockWeight = item.type === "paragraph" ? Math.max(1, Math.ceil(textLength / 160)) : item.type === "gallery" || item.type === "video" ? 2 : 1;
      visibleWeight += blockWeight;
      const foldedExtra = visibleWeight > 6;
      return {
        ...item,
        kicker: index === 0 ? "ABOUT COMPANY" : "",
        tone: (index % 3) + 1,
        video_key: item.type === "video" ? videoKey("profile", item.video_id || index) : "",
        long_text: textLength > 220,
        folded_extra: foldedExtra,
        preview_urls: item.type === "gallery" ? item.images.map((image) => image.url) : item.image_url ? [item.image_url] : []
      };
    })
    .filter((item) => item.text || item.items.length || item.image_url || item.images.length || item.video_url);
}

/**
 * 组装公开名片可展示的企业模块。
 * 按管理端配置排序，并过滤没有内容的模块。
 */
function resolveDisplayModules(card, isDemo) {
  const profile = card.company_profile || {};
  const defaults = [
    { key: "services", title: "产品与服务", visible: true, sort_order: 10, layout: "graphic" },
    { key: "profile", title: "企业简介", visible: true, sort_order: 20, layout: "carousel" },
    { key: "videos", title: "企业视频", visible: false, sort_order: 30, layout: "carousel" },
    { key: "honors", title: "荣誉资质", visible: true, sort_order: 40, layout: "carousel" }
  ];
  const services = resolveServiceItems(card, isDemo);
  const intro = resolveIntroBlocks(card);
  const honors = (card.honors || []).map((honor) => {
    const imageUrls = (honor.images || []).map((image) => image.image_url).filter(Boolean);
    return { ...honor, image_urls: imageUrls, primary_image_url: imageUrls[0] || "" };
  });
  const videos = (card.videos || []).map((video, index) => ({ ...video, video_key: videoKey("module", video.video_id || index) }));
  const content = { services, profile: intro, videos, honors };
  return (Array.isArray(profile.display_modules) && profile.display_modules.length ? profile.display_modules : defaults)
    .filter((module) => module.visible !== false)
    .sort((a, b) => Number(a.sort_order) - Number(b.sort_order))
    .map((module) => ({
      ...module,
      title: module.title || defaultModuleTitle(defaults, module.key),
      content: content[module.key] || [],
      has_more: module.key === "profile" ? intro.some((block) => block.folded_extra || block.long_text) : false
    }))
    .filter((module) => module.content.length > 0);
}

/**
 * 从默认模块配置中读取标题。
 */
function defaultModuleTitle(defaults, key) {
  const found = defaults.find((item) => item.key === key);
  return found ? found.title : "";
}

/**
 * 生成视频组件稳定 key，避免特殊字符破坏渲染标识。
 */
function videoKey(scope, value) {
  return `${scope}-${String(value || "video").replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

/**
 * 读取本地匿名访客 ID，并在过期或结构异常时清理。
 */
function readStoredAnonId() {
  try {
    const stored = wx.getStorageSync(VISITOR_ANON_STORAGE_KEY);
    if (!stored || typeof stored !== "object") {
      wx.removeStorageSync(VISITOR_ANON_STORAGE_KEY);
      return "";
    }
    if (!stored.value || !stored.expires_at || stored.expires_at <= Date.now()) {
      wx.removeStorageSync(VISITOR_ANON_STORAGE_KEY);
      app.globalData.anonId = "";
      return "";
    }
    return stored.value;
  } catch (_error) {
    return "";
  }
}

/**
 * 获取当前匿名访客 ID，优先使用本地有效缓存。
 */
function currentAnonId() {
  const stored = readStoredAnonId();
  if (stored) {
    app.globalData.anonId = stored;
    return stored;
  }
  app.globalData.anonId = "";
  return "";
}

function storeAnonId(anonId) {
  if (!anonId) {
    return;
  }
  try {
    wx.setStorageSync(VISITOR_ANON_STORAGE_KEY, {
      value: anonId,
      expires_at: Date.now() + VISITOR_ANON_TTL_MS
    });
  } catch (_error) {}
}

function visitorFingerprint() {
  try {
    const info = wx.getSystemInfoSync ? wx.getSystemInfoSync() : {};
    return [
      info.brand,
      info.model,
      info.platform,
      info.system,
      info.language,
      info.version,
      info.SDKVersion,
      info.screenWidth,
      info.screenHeight,
      info.pixelRatio
    ]
      .filter((item) => item !== undefined && item !== null && item !== "")
      .join("|")
      .slice(0, 256);
  } catch (_error) {
    return "";
  }
}
