const app = getApp();
const { request } = require("../../utils/api");
const { DEFAULT_BRAND, buildTheme, themeStyle } = require("../../utils/theme");

const demoServiceItems = [
  { title: "数字名片", desc: "员工对外名片展示" },
  { title: "客户留资", desc: "访客行为追踪" },
  { title: "企业形象", desc: "统一品牌展示" },
  { title: "销售获客", desc: "分享链路转化" },
  { title: "内容展示", desc: "图文介绍产品" },
  { title: "数据分析", desc: "访问效果统计" }
];

const demoPublicCard = {
  public_id: "pub_demo0001",
  status: "active",
  card: {
    display_name: "李明",
    title: "销售总监 · 市场部",
    company: "智云科技",
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
    name: "智云科技",
    address: "深圳市南山区科技园",
    intro_blocks: [
      { type: "paragraph", text: "智云科技专注企业数字化名片与获客解决方案，为企业提供统一对外形象、员工名片管理与客户转化追踪。" },
      { type: "image", image_url: "", caption: "业务介绍图片" }
    ]
  },
  videos: [],
  honors: []
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
    loggedIn: false,
    viewCount: 269,
    visitCount: 269,
    likeCount: 136,
    likedByMe: false,
    serviceItems: demoServiceItems,
    introBlocks: demoPublicCard.company_profile.intro_blocks,
    cardBackgroundStyle: "",
    cardTemplateClass: "biz-card--horizontal",
    card: demoPublicCard
  },

  async onLoad(query) {
    const publicId = query.card || query.public_id || "";
    const shareId = query.share || "";
    this.setData({ publicId, shareId, loggedIn: Boolean(app.globalData.token) });
    if (!publicId) {
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
    this.setData({
      card,
      ...theme,
      themeStyle: themeStyle(theme),
      navTitle: publicNavTitle(card),
      cardTemplateClass: cardTemplateClass(card.template && card.template.template_id),
      cardBackgroundStyle: cardBackgroundStyle(
        card.template && card.template.background_url,
        layout.background_opacity,
        card.template && card.template.template_id,
        layout.background_preset_id
      ),
      isDisabled: disabled,
      isOwnCard: this.isOwnPublicCard(card),
      serviceItems: resolveServiceItems(card, isDemo),
      introBlocks: resolveIntroBlocks(card),
      viewCount: isDemo ? 269 : 0,
      visitCount: isDemo ? 269 : 0,
      likeCount: isDemo ? 136 : 0,
      likedByMe: false,
      uiState: disabled ? "disabled" : "ready"
    });
    this.applyStats(card.stats);
  },

  isOwnPublicCard(card) {
    const currentIdentity = app.globalData.currentIdentity || {};
    return Boolean(
      (this.data.publicId && currentIdentity.public_id === this.data.publicId) ||
      (card && (card.is_owner || card.is_own))
    );
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

  async createVisit() {
    if (!this.data.publicId) {
      return;
    }
    try {
      const data = { anon_id: app.globalData.anonId || undefined };
      if (this.data.shareId) {
        data.share = this.data.shareId;
      }
      const visit = await request(`/public/cards/${this.data.publicId}/visit`, {
        method: "POST",
        auth: false,
        data
      });
      app.globalData.visitToken = visit.visit_token;
      app.globalData.anonId = visit.anon_id;
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
    if (!app.globalData.visitToken || !this.data.shareId) {
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
      likedByMe: Boolean(stats.liked_by_current_visitor)
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
    const wechat = this.data.card.card.fields && this.data.card.card.fields.wechat_id;
    if (!wechat) {
      wx.showToast({ title: "暂无微信", icon: "none" });
      return;
    }
    wx.setClipboardData({ data: wechat, success() { wx.showToast({ title: "微信号已复制", icon: "none" }); } });
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

  onShareAppMessage() {
    const shareId = this.data.nextShareId || this.data.shareId;
    this.recordAction("view_site");
    const shareParam = shareId ? `&share=${shareId}` : "";
    return {
      title: `${this.data.card.card.display_name || "名片"}的名片`,
      path: `/pages/public/card?card=${this.data.publicId}${shareParam}`
    };
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
    card: Object.assign(
      { display_name: "", title: "", company: "", avatar_url: "", fields: {} },
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

function publicNavTitle(card) {
  const name = ((card.card && card.card.display_name) || "").trim();
  const company = ((card.card && card.card.company) || (card.company_profile && card.company_profile.name) || "").trim();
  if (!company || isPersonalCompanyName(company)) {
    return name || "名片";
  }
  return name ? `${name} | ${company}` : company;
}

function isPersonalCompanyName(company) {
  return company === "微信个人身份" || company === "个人名片";
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
        .map((item) => ({
          title: String(item.title || item.name || "").trim(),
          desc: String(item.desc || item.description || "").trim()
        }))
        .filter((item) => item.title)
        .slice(0, 6)
    : [];
  return items.length ? items : isDemo ? demoServiceItems : [];
}

function resolveIntroBlocks(card) {
  const blocks = ((card.company_profile || {}).intro_blocks || []).map((item) => {
    const type = item.type || (item.image_url ? "image" : "paragraph");
    return {
      type,
      text: item.text || item.content || "",
      image_url: item.image_url || item.url || "",
      caption: item.caption || ""
    };
  });
  return blocks.filter((item) => item.text || item.image_url);
}
