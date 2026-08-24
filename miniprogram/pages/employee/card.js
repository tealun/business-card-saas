const app = getApp();
const { ensureSession } = require("../../utils/auth");
const { request } = require("../../utils/api");
const { DEFAULT_PORTRAIT_PHOTO_URL } = require("../../utils/card-assets");
const { setPageTheme } = require("../../utils/theme");
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
    cardBackgroundUrl: "",
    cardBackgroundOpacity: 1,
    cardTemplateClass: "biz-card--horizontal",
    portraitPhotoUrl: "",
    defaultPortraitPhotoUrl: DEFAULT_PORTRAIT_PHOTO_URL,
    sharePath: "",
    loading: true,
    error: false,
    submitting: false
  },

  /**
   * 初始化员工名片编辑页主题，并启动登录和名片加载流程。
   */
  onLoad() {
    setPageTheme(this);
    this.login();
  },

  /**
   * 确保用户会话存在后加载当前名片。
   * 登录失败只进入错误态，不写入空名片数据。
   */
  async login() {
    try {
      await ensureSession();
      await this.loadCard();
    } catch (error) {
      this.setData({ loading: false, error: true });
      wx.showToast({ title: error.message || "登录失败，请稍后重试", icon: "none" });
    }
  },

  /**
   * 加载当前名片预览，并将后端模板配置映射为页面可渲染状态。
   */
  async loadCard() {
    try {
      const preview = await request("/employee/cards/current/preview");
      const card = Object.assign({ fields: {}, show_avatar: preview.show_avatar !== false }, preview.card || {});
      const template = preview.template || {};
      const layout = template.layout || {};
      const brand = template.color_scheme && template.color_scheme.primary;
      if (brand) {
        setPageTheme(this, brand);
      }
      app.globalData.currentCard = card;
      const background = activeTemplateBackground(layout, template.template_id, template.background_url);
      this.setData({
        card,
        logoUrl: template.logo_url || "",
        cardTemplateClass: cardTemplateClass(template.template_id),
        portraitPhotoUrl: layoutImageUrl(layout, "portrait_photo_url"),
        cardBackgroundUrl: background.url,
        cardBackgroundOpacity: normalizeOpacity(background.opacity) / 100,
        cardBackgroundStyle: cardBackgroundStyle(
          background.url,
          background.opacity,
          template.template_id,
          background.presetId
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

  /**
   * 按字段 key 更新表单草稿。
   */
  onInput(event) {
    const key = event.currentTarget.dataset.key;
    this.setData({ [`form.${key}`]: event.detail.value });
  },

  /**
   * 校验并保存员工名片基础资料。
   * 只提交当前页面开放的字段，避免覆盖模板、隐私等其他配置。
   */
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

  /**
   * 创建当前名片的分享记录，并跳转到公开名片页预览。
   */
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

/**
 * 校验名片基础表单。
 * 维护姓名必填、邮箱格式和电话长度字符范围这些前端即时约束。
 */
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

/**
 * 生成名片背景样式，兼容自定义 URL、预设 ID 和模板默认背景。
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
  return `background: linear-gradient(${overlay}, ${overlay});`;
}

/**
 * 将模板 ID 映射为名片样式 class。
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
 * 从模板 layout 中安全读取图片地址字段。
 */
function layoutImageUrl(layout, key) {
  const value = layout && layout[key];
  return typeof value === "string" ? value.trim() : "";
}

/**
 * 计算当前模板实际背景配置。
 * 新版模板背景配置优先，旧版 background_url 作为兼容兜底。
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
 * 从 layout.template_backgrounds 中读取指定模板配置。
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
 * 将模板 ID 转成旧版 variant 键。
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
 * 将透明度限制在 0-100 的整数范围。
 */
function normalizeOpacity(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 100;
  }
  return Math.max(0, Math.min(100, Math.round(number)));
}
