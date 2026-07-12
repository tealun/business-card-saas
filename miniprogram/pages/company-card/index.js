const app = getApp();
const { request } = require("../../utils/api");
const { DEFAULT_BRAND, setPageTheme } = require("../../utils/theme");

const demoCard = {
  display_name: "李明",
  title: "销售总监 · 市场部",
  company: "智云科技",
  company_short_name: "智云科技",
  avatar_url: "",
  fields: {
    mobile: "138 0013 8000",
    email: "liming@zhiyun.tech"
  },
  status: "active"
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
    loading: false,
    loggedIn: false,
    demoMode: true,
    themeStyle: "",
    isPersonal: false,
    hasEnterpriseIdentity: false,
    currentIdentity: null,
    stats: {
      visitors: 0,
      viewed: 0,
      friends: 0
    },
    card: demoCard,
    cardLogoUrl: "/assets/logo/color-nobg.png",
    showCardHead: true,
    publicId: "",
    cardTemplateClass: "biz-card--horizontal",
    cardBackgroundStyle: cardBackgroundStyle("", 100, "tpl_horizontal_business"),
    openingVisitorPage: false
  },

  onLoginSuccess() {
    this.onShow();
  },

  onShow() {
    setPageTheme(this);
    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
      this.getTabBar().applyTheme();
    }
    this.bootstrap();
  },

  async bootstrap() {
    const currentIdentity = app.globalData.currentIdentity;
    const identities = app.globalData.identities || [];
    const loggedIn = Boolean(app.globalData.token && currentIdentity);

    if (!loggedIn) {
      this.setData({
        loading: false,
        loggedIn: false,
        demoMode: true,
        isPersonal: false,
        hasEnterpriseIdentity: false,
        currentIdentity: null,
        stats: {
          visitors: 0,
          viewed: 0,
          friends: 0
        },
        card: demoCard,
        cardTemplateClass: "biz-card--horizontal",
        cardBackgroundStyle: cardBackgroundStyle("", 100, "tpl_horizontal_business")
      });
      return;
    }

    const isPersonal = currentIdentity.identity_type === "personal";
    const hasEnterpriseIdentity = identities.some((item) => item.identity_type !== "personal");
    this.setData({
      loading: true,
      loggedIn: true,
      demoMode: false,
      isPersonal,
      hasEnterpriseIdentity,
      currentIdentity
    });

    await Promise.all([
      this.loadCurrentCard(currentIdentity),
      this.loadStats()
    ]);
  },

  async loadCurrentCard(currentIdentity) {
    try {
      const preview = await request("/employee/cards/current/preview");
      const card = Object.assign({ fields: {}, status: preview.status }, preview.card || {});
      const layout = (preview.template && preview.template.layout) || {};
      const brand = preview?.template?.color_scheme?.primary || DEFAULT_BRAND;
      setPageTheme(this, brand);
      if (typeof this.getTabBar === "function" && this.getTabBar()) {
        this.getTabBar().applyTheme();
      }
      app.globalData.currentCard = card;
      this.setData({
        card,
        cardLogoUrl: (preview.template && preview.template.logo_url) || "",
        showCardHead: Boolean((preview.template && preview.template.logo_url) || card.company_short_name),
        publicId: preview.public_id || card.public_id || "",
        cardTemplateClass: cardTemplateClass(preview.template && preview.template.template_id),
        cardBackgroundStyle: cardBackgroundStyle(
          preview.template && preview.template.background_url,
          layout.background_opacity,
          preview.template && preview.template.template_id,
          layout.background_preset_id
        ),
        loading: false
      });
    } catch (error) {
      const fallbackCard = this.cardFromIdentity(currentIdentity);
      this.setData({ card: fallbackCard, cardLogoUrl: "", showCardHead: Boolean(fallbackCard.company_short_name), loading: false });
      wx.showToast({ title: error.message || "名片读取失败", icon: "none" });
    }
  },

  cardFromIdentity(identity) {
    const isPersonal = identity && identity.identity_type === "personal";
    return {
      display_name: identity && identity.display_name ? identity.display_name : "我的名片",
      title: "职位未设置",
      company: isPersonal ? "" : (identity && identity.tenant_name ? identity.tenant_name : "企业名片"),
      company_short_name: isPersonal ? "" : ((identity && (identity.tenant_short_name || identity.short_name)) || ""),
      avatar_url: "",
      fields: {},
      status: "active"
    };
  },

  async loadStats() {
    try {
      const stats = await request("/employee/cards/current/stats");
      this.setData({
        stats: {
          visitors: stats.visitor_count || 0,
          viewed: stats.visit_count || 0,
          friends: 0
        }
      });
    } catch (_error) {
      this.setData({
        stats: {
          visitors: 0,
          viewed: 0,
          friends: 0
        }
      });
    }
  },

  openGuide() {
    wx.showModal({
      title: "企业名片开通说明",
      content: "企业名片由企业微信管理员授权安装应用后生成。完成授权后，员工重新登录小程序即可看到企业名片身份。",
      showCancel: false,
      confirmText: "知道了"
    });
  },

  async openVisitorPage() {
    if (!this.data.loggedIn || !app.globalData.token) {
      wx.showToast({ title: "请先登录后查看访客页", icon: "none" });
      return;
    }
    if (this.data.openingVisitorPage) {
      return;
    }
    this.setData({ openingVisitorPage: true });
    try {
      const share = await request("/employee/cards/current/share", { method: "POST", data: {} });
      app.globalData.shareId = share.share_id;
      wx.navigateTo({
        url: `/pages/public/card?card=${share.public_id}&share=${share.share_id}`
      });
    } catch (error) {
      const publicId = this.data.publicId || (this.data.currentIdentity && this.data.currentIdentity.public_id);
      if (publicId) {
        wx.navigateTo({ url: `/pages/public/card?card=${publicId}` });
        return;
      }
      wx.showToast({ title: error.message || "访客页打开失败", icon: "none" });
    } finally {
      this.setData({ openingVisitorPage: false });
    }
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
