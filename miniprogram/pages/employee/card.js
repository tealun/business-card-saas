const app = getApp();
const { ensureSession } = require("../../utils/auth");
const { request } = require("../../utils/api");
const { setPageTheme } = require("../../utils/theme");
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
    // 表单初始为空：读取失败时绝不能让占位演示数据被“保存”成真实名片。
    card: { fields: {}, show_avatar: true },
    form: {
      display_name: "",
      title: "",
      mobile: "",
      email: "",
      wechat_id: ""
    },
    themeStyle: "",
    logoUrl: "",
    cardBackgroundStyle: "",
    cardTemplateClass: "biz-card--horizontal",
    sharePath: "",
    loading: true,
    error: false,
    submitting: false
  },

  onLoad() {
    setPageTheme(this);
    this.login();
  },

  async login() {
    try {
      await ensureSession();
      await this.loadCard();
    } catch (error) {
      this.setData({ loading: false, error: true });
      wx.showToast({ title: error.message || "登录失败，请稍后重试", icon: "none" });
    }
  },

  async loadCard() {
    try {
      const preview = await request("/employee/cards/current/preview");
      const card = Object.assign({ fields: {}, show_avatar: preview.show_avatar !== false }, preview.card || {});
      const template = preview.template || {};
      const brand = template.color_scheme && template.color_scheme.primary;
      if (brand) {
        setPageTheme(this, brand);
      }
      app.globalData.currentCard = card;
      this.setData({
        card,
        logoUrl: template.logo_url || "",
        cardTemplateClass: cardTemplateClass(template.template_id),
        cardBackgroundStyle: cardBackgroundStyle(
          template.background_url,
          template.layout && template.layout.background_opacity,
          template.template_id,
          template.layout && template.layout.background_preset_id
        ),
        form: {
          display_name: card.display_name,
          title: card.title || "",
          mobile: card.fields.mobile || "",
          email: card.fields.email || "",
          wechat_id: card.fields.wechat_id || ""
        },
        loading: false,
        error: false
      });
    } catch (error) {
      this.setData({ loading: false, error: true });
      wx.showToast({ title: error.message || "读取失败", icon: "none" });
    }
  },

  onInput(event) {
    const key = event.currentTarget.dataset.key;
    this.setData({ [`form.${key}`]: event.detail.value });
  },

  async saveCard() {
    if (this.data.submitting) {
      return;
    }
    if (this.data.error) {
      wx.showToast({ title: "名片资料未加载成功，请稍后重试", icon: "none" });
      return;
    }
    this.setData({ submitting: true });
    const form = this.data.form;
    try {
      validateCardForm(form);
      const card = await request("/employee/cards/current", {
        method: "PUT",
        data: {
          display_name: form.display_name,
          title: form.title,
          fields: {
            mobile: form.mobile || null,
            email: form.email || null,
            wechat_id: form.wechat_id || null
          }
        }
      });
      app.globalData.currentCard = card;
      this.setData({ card });
      await this.loadCard();
      wx.showToast({ title: "已保存", icon: "success" });
    } catch (error) {
      wx.showToast({ title: error.message || "保存失败", icon: "none" });
    } finally {
      this.setData({ submitting: false });
    }
  },

  async createShare() {
    if (this.data.submitting) {
      return;
    }
    this.setData({ submitting: true });
    try {
      const share = await request("/employee/cards/current/share", { method: "POST", data: {} });
      app.globalData.shareId = share.share_id;
      this.setData({ sharePath: share.path });
      wx.navigateTo({
        url: `/pages/public/card?card=${share.public_id}&share=${share.share_id}`
      });
    } catch (error) {
      wx.showToast({ title: error.message || "分享失败", icon: "none" });
    } finally {
      this.setData({ submitting: false });
    }
  }
});

function validateCardForm(form) {
  if (!String(form.display_name || "").trim()) {
    throw new Error("姓名不能为空");
  }
  const email = String(form.email || "").trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("邮箱格式不正确");
  }
  const phone = String(form.mobile || "").trim();
  if (phone && !/^[0-9+\-\s()]{5,32}$/.test(phone)) {
    throw new Error("手机号格式不正确");
  }
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
