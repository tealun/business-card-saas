const app = getApp();
const { request } = require("../../utils/api");
const { buildShareCardImage } = require("../../utils/share-card-image");
const { DEFAULT_BRAND, buildTheme, themeStyle } = require("../../utils/theme");

const VISITOR_ANON_STORAGE_KEY = "wecomcard.public_anon_id.v1";
const VISITOR_ANON_TTL_MS = 24 * 60 * 60 * 1000;

const demoServiceItems = [
  { id: "demo_service_identity", title: "企业数字名片", desc: "统一员工名片、企业资料与品牌视觉", image_url: "https://images.unsplash.com/photo-1556761175-b413da4baf72" },
  { id: "demo_service_leads", title: "客户留资", desc: "访客行为追踪与销售跟进", image_url: "https://images.unsplash.com/photo-1552664730-d307ca884978" },
  { id: "demo_service_brand", title: "企业官网式展示", desc: "模块化呈现产品、简介、视频和荣誉", image_url: "https://images.unsplash.com/photo-1497366216548-37526070297c" },
  { id: "demo_service_analytics", title: "数据分析", desc: "访问效果统计和线索判断", image_url: "https://images.unsplash.com/photo-1551288049-bebda4e38f71" },
  { id: "demo_service_wecom", title: "企微身份集成", desc: "对接企业微信身份与组织架构", image_url: "https://images.unsplash.com/photo-1559136555-9303baea8ebd" }
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
      { type: "paragraph", text: "智云科技专注企业数字化名片与获客解决方案，为企业提供统一对外形象、员工名片管理与客户转化追踪。" },
      { type: "list", items: ["统一企业品牌形象", "员工名片集中管理", "访客行为与转化追踪"] },
      { type: "image", url: "https://images.unsplash.com/photo-1497366754035-f200968a6e72", caption: "开放协作办公区" },
      {
        type: "gallery",
        images: [
          { url: "https://images.unsplash.com/photo-1497366811353-6870744d04b2", caption: "客户共创会议" },
          { url: "https://images.unsplash.com/photo-1556761175-4b46a572b786", caption: "企业服务团队" },
          { url: "https://images.unsplash.com/photo-1551434678-e076c223a692", caption: "产品研发现场" }
        ]
      },
      { type: "video", video_id: "vid_demo_company" }
    ]
  },
  videos: [
    {
      video_id: "vid_demo_company",
      title: "企业介绍视频",
      video_url: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
      cover_url: "https://images.unsplash.com/photo-1497366754035-f200968a6e72"
    }
  ],
  honors: [
    {
      honor_id: "honor_demo_001",
      title: "年度数字化服务创新奖",
      body: "展示荣誉资质模块的多图轮播与大图预览能力。",
      images: [
        { image_url: "https://images.unsplash.com/photo-1567427017947-545c5f8d16ad", title: "创新奖证书", caption: "行业协会颁发" },
        { image_url: "https://images.unsplash.com/photo-1521791136064-7986c2920216", title: "颁奖现场", caption: "年度服务创新论坛" }
      ]
    },
    {
      honor_id: "honor_demo_002",
      title: "ISO 质量管理体系认证",
      body: "展示同一荣誉下多张图片、图片标题与说明。",
      images: [
        { image_url: "https://images.unsplash.com/photo-1450101499163-c8848c66ca85", title: "认证证书", caption: "质量管理体系认证" },
        { image_url: "https://images.unsplash.com/photo-1504384308090-c894fdcc538d", title: "审核会议", caption: "标准流程复核" }
      ]
    }
  ]
};
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
    cardTemplateClass: "biz-card--horizontal",
    card: demoPublicCard
  },

  async onLoad(query) {
    const isDemoRoute = query.demo === "1";
    const publicId = query.card || query.public_id || "";
    const shareId = query.share || "";
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

  onShow() {
    if (this.data.uiState === "ready" || this.data.uiState === "disabled") {
      this.prepareShareImage();
    }
  },

  async loadPublicCard() {
    try {
      const card = await request(`/public/cards/${this.data.publicId}`, { auth: false });
      this.applyPublicCard(card, false);
    } catch (error) {
      this.setData({ uiState: "error" });
      wx.showToast({ title: error.message || "名片加载失败", icon: "none" });
    }
  },

  applyPublicCard(rawCard, isDemo) {
    const card = normalizePublicCard(rawCard);
    const disabled = card.status && card.status !== "active";
    const layout = (card.template && card.template.layout) || {};
    const brand = (card.template && card.template.color_scheme && card.template.color_scheme.primary) || DEFAULT_BRAND;
    const theme = buildTheme(brand);
    const cardMeta = publicCardMeta(card);
    const isOwnCard = this.isOwnPublicCard(card);
    const canShare = isOwnCard || card.allow_forward !== false;
    this.setData({
      card,
      ...theme,
      themeStyle: themeStyle(theme),
      navTitle: publicNavTitle(card, cardMeta),
      cardLogoUrl: cardMeta.logoUrl,
      cardCompanyName: cardMeta.companyName,
      cardCompanyShortName: cardMeta.companyShortName,
      showCardHead: Boolean(cardMeta.logoUrl || cardMeta.companyShortName),
      cardTemplateClass: cardTemplateClass(card.template && card.template.template_id),
      cardBackgroundStyle: cardBackgroundStyle(
        card.template && card.template.background_url,
        layout.background_opacity,
        card.template && card.template.template_id,
        layout.background_preset_id
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

  isOwnPublicCard(card) {
    const currentIdentity = app.globalData.currentIdentity || {};
    const identities = app.globalData.identities || [];
    return Boolean(
      (this.data.publicId && currentIdentity.public_id === this.data.publicId) ||
      (this.data.publicId && identities.some((identity) => identity.public_id === this.data.publicId)) ||
      (card && (card.is_owner || card.is_own))
    );
  },

  updateShareMenu(visible) {
    const method = visible ? wx.showShareMenu : wx.hideShareMenu;
    if (typeof method === "function") {
      method.call(wx, visible ? { menus: ["shareAppMessage"] } : {});
    }
  },

  reload() {
    this.setData({ uiState: "loading" });
    this.loadPublicCard()
      .then(() => this.createVisit())
      .catch(() => this.setData({ uiState: "error" }));
  },

  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
    } else {
      wx.switchTab({ url: "/pages/employee/index", fail() {} });
    }
  },

  goHome() {
    wx.switchTab({ url: "/pages/employee/index", fail() {} });
  },

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

  collectCard() {
    this.recordAction("view_paper_card");
    wx.showToast({ title: "已收下名片", icon: "success" });
  },

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

  makeMyCard() {
    wx.switchTab({ url: "/pages/employee/index" });
  },

  editMyCard() {
    wx.navigateTo({ url: "/pages/employee/edit" });
  },

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

  openContactService() {
    // 后续接入系统客服页面时，只需在这里替换为客服跳转能力。
    wx.showModal({
      title: "联系开通",
      content: "系统客服页面正在接入中，开放后可在这里联系开通企业名片。",
      showCancel: false,
      confirmText: "我知道了"
    });
  },

  exchangeCard() {
    this.recordAction("exchange_card");
    wx.showToast({ title: "交换名片请求已发起", icon: "success" });
  },

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

  copyEmail() {
    const email = this.data.card.card.fields && this.data.card.card.fields.email;
    if (!email) {
      wx.showToast({ title: "暂无邮箱", icon: "none" });
      return;
    }
    this.recordAction("copy_email");
    wx.setClipboardData({ data: email });
  },

  openMap() {
    const fields = this.data.card.card.fields || {};
    const address = (this.data.card.company_profile || {}).address || fields.address;
    if (!address) {
      wx.showToast({ title: "暂无地址", icon: "none" });
      return;
    }
    this.recordAction("open_map");
    wx.setClipboardData({ data: address, success() { wx.showToast({ title: "地址已复制", icon: "none" }); } });
  },

  copyWechat() {
    this.recordAction("copy_wechat");
    this.setData({ wechatSheetVisible: true, wechatQrUrl: publicWechatQrUrl(this.data.card) });
  },

  closeWechatSheet() {
    this.setData({ wechatSheetVisible: false });
  },

  viewPaperCard() {
    this.recordAction("view_paper_card");
    wx.showToast({ title: "纸质名片信息已记录", icon: "none" });
  },

  previewIntroImage(event) {
    const url = event.currentTarget.dataset.url;
    if (url) {
      wx.previewImage({ urls: [url], current: url });
    }
  },

  previewModuleImage(event) {
    const detail = event.detail || {};
    const urls = detail.urls || event.currentTarget.dataset.urls || [];
    const current = detail.url || event.currentTarget.dataset.url || urls[0];
    if (current) wx.previewImage({ urls: Array.isArray(urls) ? urls : [current], current });
  },

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

  refreshShareImage() {
    this.prepareShareImage();
  },

  prepareShareImage(cardMeta) {
    const nextTick = wx.nextTick || ((callback) => setTimeout(callback, 0));
    nextTick(async () => {
      const imageUrl = await buildShareCardImage(this, {
        card: this.data.card && this.data.card.card,
        templateClass: this.data.cardTemplateClass,
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

function visitorAvatarSlots(stats) {
  const count = Math.max(0, Number((stats && stats.visitor_count) || 0));
  const slotCount = count >= 4 ? 4 : Math.max(1, count);
  const avatars = Array.isArray(stats && stats.recent_visitor_avatars) ? stats.recent_visitor_avatars : [];
  return Array.from({ length: slotCount }).map((_, index) => ({ avatarUrl: avatars[index] || "" }));
}

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

function publicNavTitle(card, meta = publicCardMeta(card)) {
  const name = ((card.card && card.card.display_name) || "").trim();
  const company = meta.companyName;
  if (!company) {
    return name || "名片";
  }
  return name ? `${name} | ${company}` : company;
}

function publicCardMeta(card) {
  const rawCompany = ((card.card && card.card.company) || (card.company_profile && card.company_profile.name) || "").trim();
  const rawShortName = ((card.card && card.card.company_short_name) || (card.company_profile && card.company_profile.short_name) || "").trim();
  const personal = isPersonalCompanyName(rawCompany) || isCurrentPersonalCard(card);
  const companyName = personal ? "" : rawCompany;
  const companyShortName = personal ? "" : rawShortName;
  const logoUrl = ((card.template && card.template.logo_url) || "").trim();
  return { companyName, companyShortName, logoUrl };
}

function isCurrentPersonalCard(card) {
  const currentIdentity = app.globalData.currentIdentity || {};
  return Boolean(
    currentIdentity.identity_type === "personal" &&
    card &&
    card.public_id &&
    currentIdentity.public_id === card.public_id
  );
}

function isPersonalCompanyName(company) {
  return company === "微信个人身份" || company === "个人名片" || company === "Demo Tenant";
}

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
          image_url: String(item.image_url || "").trim()
        }))
        .filter((item) => item.title || item.image_url)
        .slice(0, 6)
    : [];
  return items.length ? items : isDemo ? demoServiceItems.map((item, index) => ({ ...item, id: `demo_service_${index}` })) : [];
}

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
  return blocks.map((item) => ({ ...item, preview_urls: item.type === "gallery" ? item.images.map((image) => image.url) : item.image_url ? [item.image_url] : [] })).filter((item) => item.text || item.items.length || item.image_url || item.images.length || item.video_url);
}

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
  const content = { services, profile: intro, videos: card.videos || [], honors };
  return (Array.isArray(profile.display_modules) && profile.display_modules.length ? profile.display_modules : defaults)
    .filter((module) => module.visible !== false)
    .sort((a, b) => Number(a.sort_order) - Number(b.sort_order))
    .map((module) => ({ ...module, title: module.title || defaults.find((item) => item.key === module.key)?.title, content: content[module.key] || [] }))
    .filter((module) => module.content.length > 0);
}

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
