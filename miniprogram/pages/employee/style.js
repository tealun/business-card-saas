const app = getApp();
const { request } = require("../../utils/api");
const { DEFAULT_PORTRAIT_PHOTO_URL } = require("../../utils/card-assets");
const { DEFAULT_BRAND, buildTheme, setPageTheme, themeStyle } = require("../../utils/theme");

const BACKGROUND_LIMIT_BYTES = 2 * 1024 * 1024;
const BACKGROUND_MIN_RATIO = 1.5;
const BACKGROUND_MAX_RATIO = 2;
const DEFAULT_BACKGROUND_OPACITY = 100;
const BACKGROUND_TYPES = {
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp"
};
const BACKGROUND_PRESETS = [
  { id: "light-wave", name: "浅色波纹", url: "/assets/card-backgrounds/bg-light-wave.webp" },
  { id: "light-geometry", name: "浅色几何", url: "/assets/card-backgrounds/bg-light-geometry.webp" },
  { id: "light-cubes", name: "浅色立方", url: "/assets/card-backgrounds/bg-light-cubes.webp" },
  { id: "blue-dot", name: "蓝色点阵", url: "/assets/card-backgrounds/bg-blue-dot.webp" },
  { id: "dark-dot", name: "深色点阵", url: "/assets/card-backgrounds/bg-dark-dot.webp" }
];
const TEMPLATE_BACKGROUND_PRESET_IDS = {
  tpl_horizontal_business: ["light-wave", "light-cubes"],
  tpl_minimal: ["light-geometry", "light-wave"],
  tpl_brand_image: ["blue-dot", "light-cubes"],
  tpl_portrait_photo: ["light-cubes", "light-wave"],
  tpl_dark: ["dark-dot"],
  tpl_campaign: ["light-cubes", "blue-dot"]
};
const TEMPLATE_META = {
  tpl_horizontal_business: { className: "biz-card--horizontal", backgroundId: "light-wave" },
  tpl_minimal: { className: "biz-card--minimal", backgroundId: "light-geometry" },
  tpl_brand_image: { className: "biz-card--brand-image", backgroundId: "blue-dot", opacity: 100 },
  tpl_dark: { className: "biz-card--dark", backgroundId: "dark-dot", opacity: 100 },
  tpl_portrait_photo: { className: "biz-card--portrait", backgroundId: "light-cubes" },
  tpl_campaign: { className: "biz-card--campaign", backgroundId: "light-cubes", opacity: 100 }
};

const stylePage = {
  data: {
    primary: DEFAULT_BRAND,
    accountType: "personal",
    themeStyle: "",
    templateId: "tpl_horizontal_business",
    templateClass: "biz-card--horizontal",
    logoUrl: "",
    card: { display_name: "", title: "", company: "", fields: {}, show_avatar: true },
    templates: [
      { id: "tpl_horizontal_business", name: "横版商务", desc: "企业级默认模板" },
      { id: "tpl_minimal", name: "极简", desc: "信息更克制" },
      { id: "tpl_brand_image", name: "品牌图", desc: "适合强品牌露出" },
      { id: "tpl_portrait_photo", name: "照片版", desc: "形象照 · PNG 500×500 以上" },
      { id: "tpl_dark", name: "深色", desc: "高对比展示" },
      { id: "tpl_campaign", name: "活动版", desc: "短期推广使用" }
    ],
    presets: [DEFAULT_BRAND, "#c1666b", "#8d7ec7", "#4c8868", "#d68a4e", "#3f9999"],
    customColor: DEFAULT_BRAND,
    customHex: DEFAULT_BRAND,
    customHexError: "",
    customColorExpanded: false,
    backgroundUrl: "",
    backgroundPresetId: "",
    templateBackgrounds: {},
    backgroundPresets: backgroundPresetsForTemplate("tpl_horizontal_business"),
    backgroundOpacity: DEFAULT_BACKGROUND_OPACITY,
    backgroundPreviewStyle: "",
    backgroundError: "",
    choosingBackground: false,
    portraitPhotoUrl: "",
    defaultPortraitPhotoUrl: DEFAULT_PORTRAIT_PHOTO_URL,
    canEditTemplates: true,
    canEditColors: true,
    canEditBackground: true,
    canEditPortraitPhoto: true,
    submitting: false
  },

  onLoad() {
    const theme = setPageTheme(this);
    const current = app.globalData.currentCard;
    if (current) {
      this.setData({ card: Object.assign({ fields: {} }, current) });
    }
    const personal = isPersonalIdentity();
    this.setData({
      primary: theme.themeBrand,
      accountType: personal ? "personal" : "enterprise",
      canEditTemplates: true,
      canEditColors: personal,
      canEditBackground: personal,
      canEditPortraitPhoto: true
    });
    this.loadPreview();
  },

  async loadPreview() {
    try {
      const preview = await request("/employee/cards/current/preview");
      const template = preview.template || {};
      const layout = template.layout || {};
      const templateId = normalizeTemplateId(template.template_id || layout.variant || this.data.templateId);
      const previewCard = Object.assign({ fields: {}, status: preview.status, show_avatar: preview.show_avatar !== false }, preview.card);
      const savedPresetId = typeof layout.background_preset_id === "string" ? layout.background_preset_id : "";
      const colorScheme = template.color_scheme || {};
      const primary = colorScheme.primary || DEFAULT_BRAND;
      const templateBackgrounds = templateBackgroundsFromLayout(layout, templateId, {
        backgroundUrl: template.background_url || "",
        backgroundPresetId: savedPresetId,
        backgroundOpacity: normalizeOpacity(layout.background_opacity, templateMeta(templateId).opacity || DEFAULT_BACKGROUND_OPACITY)
      });
      const backgroundState = backgroundStateForTemplate(templateId, templateBackgrounds);
      setPageTheme(this, primary);
      app.globalData.currentCard = preview.card;
      this.setData({
        primary,
        customColor: primary,
        customHex: primary,
        customHexError: "",
        customColorExpanded: !this.data.presets.includes(primary),
        backgroundUrl: backgroundState.backgroundUrl,
        backgroundPresetId: backgroundState.backgroundPresetId,
        templateBackgrounds,
        backgroundPresets: backgroundState.backgroundPresets,
        backgroundOpacity: backgroundState.backgroundOpacity,
        backgroundPreviewStyle: backgroundStyle(backgroundState.backgroundUrl, backgroundState.backgroundOpacity, templateId),
        backgroundError: "",
        templateId,
        templateClass: templateClass(templateId),
        portraitPhotoUrl: layoutImageUrl(layout, "portrait_photo_url"),
        logoUrl: template.logo_url || "",
        card: previewCard
      });
    } catch (_error) {
      wx.showToast({ title: "名片信息加载失败，预览可能不完整", icon: "none" });
    }
  },

  selectTemplate(event) {
    const detail = event.detail || {};
    const dataset = event.currentTarget ? event.currentTarget.dataset : {};
    const templateId = normalizeTemplateId(detail.templateId || dataset.id);
    const meta = templateMeta(templateId);
    const templateBackgrounds = withCurrentTemplateBackground(this.data);
    const backgroundState = backgroundStateForTemplate(templateId, templateBackgrounds);
    this.setData({
      templateId,
      templateClass: meta.className,
      backgroundUrl: backgroundState.backgroundUrl,
      backgroundPresetId: backgroundState.backgroundPresetId,
      templateBackgrounds,
      backgroundPresets: backgroundState.backgroundPresets,
      backgroundOpacity: backgroundState.backgroundOpacity,
      backgroundPreviewStyle: backgroundStyle(backgroundState.backgroundUrl, backgroundState.backgroundOpacity, templateId),
      backgroundError: ""
    });
  },

  selectColor(event) {
    const detail = event.detail || {};
    const dataset = event.currentTarget ? event.currentTarget.dataset : {};
    const primary = detail.color || dataset.color;
    this.previewColor(primary, { customHexError: "", customColorExpanded: false });
  },

  onCustomHexInput(event) {
    const customHex = String(event.detail.value || "").trim();
    const normalized = normalizeHexInput(customHex);
    if (!normalized) {
      this.setData({ customHex, customHexError: customHex ? "请输入 6 位 HEX 色值" : "" });
      return;
    }
    this.previewColor(normalized, {
      customColor: normalized,
      customHex: normalized,
      customHexError: ""
    });
  },

  selectCustomColor() {
    const normalized = normalizeHexInput(this.data.customHex) || this.data.customColor;
    this.previewColor(normalized, {
      customColor: normalized,
      customHex: normalized,
      customHexError: "",
      customColorExpanded: true
    });
  },

  previewColor(primary, extra = {}) {
    const theme = buildTheme(primary);
    this.setData({ primary: theme.themeBrand, ...theme, themeStyle: themeStyle(theme), ...extra });
  },

  onChooseBackgroundImage,
  chooseBackgroundImage,
  onSelectPresetBackground,
  onClearBackgroundImage,
  clearBackgroundImage,
  onBackgroundOpacityChange,
  onPortraitPhotoChange,

  async applyStyle() {
    if (!this.data.canEditTemplates && !this.data.canEditPortraitPhoto) {
      wx.showToast({ title: "企业统一维护", icon: "none" });
      return;
    }
    if (this.data.submitting) {
      return;
    }
    this.setData({ submitting: true });
    try {
      const templateBackgrounds = withCurrentTemplateBackground(this.data);
      const activeBackground = backgroundStateForTemplate(this.data.templateId, templateBackgrounds);
      const backgroundUrl = this.data.canEditBackground ? await backgroundUrlForSave(activeBackground.backgroundUrl) : "";
      const portraitTemplate = isPortraitTemplate(this.data.templateId);
      const data = {
        template_id: this.data.templateId,
        layout: {
          variant: this.data.templateId
        }
      };
      if (portraitTemplate) {
        data.layout.portrait_photo_url = this.data.portraitPhotoUrl || null;
      }
      if (this.data.canEditColors) {
        data.color_scheme = {
          primary: this.data.primary,
          surface: "#ffffff"
        };
      }
      if (this.data.canEditBackground) {
        data.background_url = backgroundUrl || null;
        data.layout.background_opacity = activeBackground.backgroundOpacity;
        data.layout.background_preset_id = activeBackground.backgroundPresetId || null;
        data.layout.template_backgrounds = templateBackgroundsForSave(templateBackgrounds);
      }
      const preview = await request("/employee/cards/current/style", {
        method: "PUT",
        data
      });
      const previewTemplate = preview && preview.template ? preview.template : {};
      const previewColorScheme = previewTemplate.color_scheme || {};
      const primary = previewColorScheme.primary || this.data.primary;
      setPageTheme(this, primary);
      app.globalData.currentCard = preview.card || app.globalData.currentCard;
      const previewLayout = previewTemplate.layout || {};
      const previewTemplateId = normalizeTemplateId(previewTemplate.template_id || previewLayout.variant || this.data.templateId);
      const savedTemplateBackgrounds = templateBackgroundsFromLayout(previewLayout, previewTemplateId, {
        backgroundUrl: previewTemplate.background_url || this.data.backgroundUrl,
        backgroundPresetId: typeof previewLayout.background_preset_id === "string" ? previewLayout.background_preset_id : this.data.backgroundPresetId,
        backgroundOpacity: normalizeOpacity(previewLayout.background_opacity, this.data.backgroundOpacity)
      });
      const savedBackground = backgroundStateForTemplate(previewTemplateId, savedTemplateBackgrounds);
      this.setData({
        card: Object.assign({}, this.data.card, preview.card || {}, { fields: (preview.card && preview.card.fields) || this.data.card.fields || {} }),
        portraitPhotoUrl: isPortraitTemplate(previewTemplateId)
          ? layoutImageUrl(previewLayout, "portrait_photo_url") || this.data.portraitPhotoUrl
          : "",
        templateId: previewTemplateId,
        templateClass: templateClass(previewTemplateId),
        backgroundUrl: savedBackground.backgroundUrl,
        backgroundPresetId: savedBackground.backgroundPresetId,
        templateBackgrounds: savedTemplateBackgrounds,
        backgroundPresets: savedBackground.backgroundPresets,
        backgroundOpacity: savedBackground.backgroundOpacity,
        backgroundPreviewStyle: backgroundStyle(
          savedBackground.backgroundUrl,
          savedBackground.backgroundOpacity,
          previewTemplateId
        )
      });
      wx.showToast({ title: "已应用", icon: "success" });
      setTimeout(() => wx.navigateBack(), 600);
    } catch (error) {
      wx.showToast({ title: error.message || "保存失败", icon: "none" });
    } finally {
      this.setData({ submitting: false });
    }
  }
};

stylePage.methods = {
  onChooseBackgroundImage,
  chooseBackgroundImage,
  onSelectPresetBackground,
  onClearBackgroundImage,
  clearBackgroundImage,
  onBackgroundOpacityChange,
  onPortraitPhotoChange
};

Page(stylePage);

function normalizeHexInput(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }
  const prefixed = raw.startsWith("#") ? raw : `#${raw}`;
  return /^#[0-9a-fA-F]{6}$/.test(prefixed) ? prefixed.toLowerCase() : "";
}

function isPersonalIdentity() {
  const identity = app.globalData.currentIdentity || {};
  return identity.identity_type === "personal" || identity.typeLabel === "涓汉鍚嶇墖";
}

function templateClass(templateId) {
  return templateMeta(templateId).className;
}

function templateMeta(templateId) {
  return TEMPLATE_META[normalizeTemplateId(templateId)] || TEMPLATE_META.tpl_horizontal_business;
}

function layoutImageUrl(layout, key) {
  const value = layout && layout[key];
  return typeof value === "string" ? value.trim() : "";
}

function normalizeTemplateId(templateId) {
  if (templateId === "tpl_demo_business" || templateId === "horizontal-business") {
    return "tpl_horizontal_business";
  }
  if (templateId === "tpl_portrait_photo" || templateId === "tpl_photo_portrait" || templateId === "portrait-photo" || templateId === "photo-portrait") {
    return "tpl_portrait_photo";
  }
  return TEMPLATE_META[templateId] ? templateId : "tpl_horizontal_business";
}

function isPortraitTemplate(templateId) {
  return normalizeTemplateId(templateId) === "tpl_portrait_photo";
}

function backgroundPresetsForTemplate(templateId) {
  const ids = TEMPLATE_BACKGROUND_PRESET_IDS[normalizeTemplateId(templateId)] || TEMPLATE_BACKGROUND_PRESET_IDS.tpl_horizontal_business;
  return ids
    .map((id) => BACKGROUND_PRESETS.find((item) => item.id === id))
    .filter(Boolean);
}

function isPresetAllowedForTemplate(presetId, templateId) {
  return backgroundPresetsForTemplate(templateId).some((item) => item.id === presetId);
}

function defaultBackgroundState(templateId) {
  const normalizedTemplateId = normalizeTemplateId(templateId);
  const meta = templateMeta(normalizedTemplateId);
  const backgroundPresets = backgroundPresetsForTemplate(normalizedTemplateId);
  const preset = backgroundPresets.find((item) => item.id === meta.backgroundId) || backgroundPresets[0] || null;
  const backgroundOpacity = normalizeOpacity(meta.opacity, DEFAULT_BACKGROUND_OPACITY);
  return {
    backgroundUrl: preset ? preset.url : "",
    backgroundPresetId: preset ? preset.id : "",
    backgroundPresets,
    backgroundOpacity
  };
}

function backgroundStateForTemplate(templateId, templateBackgrounds) {
  const normalizedTemplateId = normalizeTemplateId(templateId);
  const saved = normalizeTemplateBackgroundConfig(normalizedTemplateId, templateBackgrounds && templateBackgrounds[normalizedTemplateId]);
  const defaults = defaultBackgroundState(normalizedTemplateId);
  if (!saved) {
    return defaults;
  }
  const customUrl = isBundledBackground(saved.background_url) ? "" : saved.background_url;
  if (customUrl) {
    return {
      ...defaults,
      backgroundUrl: customUrl,
      backgroundPresetId: "",
      backgroundOpacity: normalizeOpacity(saved.background_opacity, defaults.backgroundOpacity)
    };
  }
  const preset = backgroundPresetsForTemplate(normalizedTemplateId).find((item) => item.id === saved.background_preset_id)
    || presetFromUrl(saved.background_url)
    || backgroundPresetsForTemplate(normalizedTemplateId).find((item) => item.id === defaults.backgroundPresetId)
    || null;
  return {
    ...defaults,
    backgroundUrl: preset ? preset.url : defaults.backgroundUrl,
    backgroundPresetId: preset ? preset.id : defaults.backgroundPresetId,
    backgroundOpacity: normalizeOpacity(saved.background_opacity, defaults.backgroundOpacity)
  };
}

function templateBackgroundsFromLayout(layout, activeTemplateId, legacy = {}) {
  const rawMap = layout && typeof layout.template_backgrounds === "object" && !Array.isArray(layout.template_backgrounds)
    ? layout.template_backgrounds
    : {};
  const templateBackgrounds = {};
  Object.keys(TEMPLATE_META).forEach((templateId) => {
    const normalized = normalizeTemplateBackgroundConfig(templateId, rawMap[templateId] || rawMap[templateVariantKey(templateId)]);
    if (normalized) {
      templateBackgrounds[templateId] = normalized;
    }
  });
  const activeId = normalizeTemplateId(activeTemplateId);
  if (!templateBackgrounds[activeId]) {
    const legacyBackgroundUrl = typeof legacy.backgroundUrl === "string" ? legacy.backgroundUrl : "";
    templateBackgrounds[activeId] = legacyBackgroundUrl && !isBundledBackground(legacyBackgroundUrl)
      ? (normalizeTemplateBackgroundConfig(activeId, {
          background_url: legacyBackgroundUrl,
          background_preset_id: "",
          background_opacity: legacy.backgroundOpacity
        }) || backgroundConfigForSave(activeId, defaultBackgroundState(activeId)))
      : backgroundConfigForSave(activeId, defaultBackgroundState(activeId));
  }
  return templateBackgrounds;
}

function withCurrentTemplateBackground(data, patch = {}) {
  const templateId = normalizeTemplateId(data.templateId);
  return {
    ...(data.templateBackgrounds || {}),
    [templateId]: backgroundConfigForSave(templateId, {
      backgroundUrl: patch.backgroundUrl !== undefined ? patch.backgroundUrl : data.backgroundUrl,
      backgroundPresetId: patch.backgroundPresetId !== undefined ? patch.backgroundPresetId : data.backgroundPresetId,
      backgroundOpacity: patch.backgroundOpacity !== undefined ? patch.backgroundOpacity : data.backgroundOpacity
    })
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

function templateBackgroundsForSave(templateBackgrounds) {
  const result = {};
  Object.keys(TEMPLATE_META).forEach((templateId) => {
    const state = backgroundStateForTemplate(templateId, templateBackgrounds);
    result[templateId] = backgroundConfigForSave(templateId, state);
  });
  return result;
}

function backgroundConfigForSave(templateId, state) {
  const defaults = defaultBackgroundState(templateId);
  const customUrl = isBundledBackground(state.backgroundUrl) ? "" : String(state.backgroundUrl || "");
  return {
    background_url: customUrl,
    background_preset_id: customUrl ? "" : (state.backgroundPresetId || defaults.backgroundPresetId || null),
    background_opacity: normalizeOpacity(state.backgroundOpacity, defaults.backgroundOpacity)
  };
}

function normalizeTemplateBackgroundConfig(templateId, value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const defaults = defaultBackgroundState(templateId);
  const backgroundUrl = typeof value.background_url === "string" ? value.background_url.trim() : "";
  const presetFromBackground = presetFromUrl(backgroundUrl);
  const rawPresetId = typeof value.background_preset_id === "string" ? value.background_preset_id : "";
  const presetId = isPresetAllowedForTemplate(rawPresetId, templateId)
    ? rawPresetId
    : (presetFromBackground && isPresetAllowedForTemplate(presetFromBackground.id, templateId) ? presetFromBackground.id : "");
  return {
    background_url: presetFromBackground ? "" : backgroundUrl,
    background_preset_id: presetId || defaults.backgroundPresetId || null,
    background_opacity: normalizeOpacity(value.background_opacity, defaults.backgroundOpacity)
  };
}

function presetFromUrl(url) {
  return BACKGROUND_PRESETS.find((item) => item.url === url) || null;
}

function isBundledBackground(url) {
  return Boolean(presetFromUrl(String(url || ""))) || String(url || "").startsWith("/assets/card-backgrounds/");
}

function backgroundStyle(url, opacity = DEFAULT_BACKGROUND_OPACITY, templateId = "") {
  if (!url) {
    return "";
  }
  const alpha = 1 - normalizeOpacity(opacity, DEFAULT_BACKGROUND_OPACITY) / 100;
  const normalizedTemplateId = normalizeTemplateId(templateId);
  const overlay = normalizedTemplateId === "tpl_brand_image" || normalizedTemplateId === "tpl_dark"
    ? `rgba(0,0,0,${(alpha * 0.48).toFixed(2)})`
    : `rgba(255,255,255,${alpha.toFixed(2)})`;
  return `background: linear-gradient(${overlay}, ${overlay}), url("${url}") center / cover no-repeat;`;
}

function onChooseBackgroundImage() {
  this.chooseBackgroundImage();
}

function chooseBackgroundImage() {
  if (this.data.choosingBackground) {
    return;
  }
  this.setData({ choosingBackground: true, backgroundError: "" });
  wx.chooseImage({
    count: 1,
    sizeType: ["compressed"],
    sourceType: ["album", "camera"],
    success: async (result) => {
      try {
        const file = result.tempFiles && result.tempFiles[0];
        const tempFilePath = file && file.path ? file.path : (result.tempFilePaths && result.tempFilePaths[0]);
        if (!tempFilePath) {
          throw new Error("未读取到图片");
        }
        if (file && file.size && file.size > BACKGROUND_LIMIT_BYTES) {
          throw new Error("图片不能超过 2MB");
        }
        const info = await getImageInfo(tempFilePath);
        validateBackgroundImage(info);
        const dataUrl = await pathToDataUrl(tempFilePath, imageMime(info));
        const templateBackgrounds = withCurrentTemplateBackground(this.data, {
          backgroundUrl: dataUrl,
          backgroundPresetId: "",
          backgroundOpacity: this.data.backgroundOpacity
        });
        this.setData({
          backgroundUrl: dataUrl,
          backgroundPresetId: "",
          templateBackgrounds,
          backgroundPreviewStyle: backgroundStyle(dataUrl, this.data.backgroundOpacity, this.data.templateId),
          backgroundError: ""
        });
      } catch (error) {
        this.setData({ backgroundError: error.message || "图片不符合要求" });
        wx.showToast({ title: error.message || "图片不符合要求", icon: "none" });
      }
    },
    fail: () => {},
    complete: () => {
      this.setData({ choosingBackground: false });
    }
  });
}

function onSelectPresetBackground(event) {
  const detail = event.detail || {};
  const dataset = event.currentTarget ? event.currentTarget.dataset : {};
  const presetId = detail.presetId || dataset.id;
  const preset = BACKGROUND_PRESETS.find((item) => item.id === presetId);
  if (!preset || !isPresetAllowedForTemplate(preset.id, this.data.templateId)) {
    return;
  }
  const templateBackgrounds = withCurrentTemplateBackground(this.data, {
    backgroundUrl: "",
    backgroundPresetId: preset.id,
    backgroundOpacity: this.data.backgroundOpacity
  });
  this.setData({
    backgroundUrl: preset.url,
    backgroundPresetId: preset.id,
    templateBackgrounds,
    backgroundPreviewStyle: backgroundStyle(preset.url, this.data.backgroundOpacity, this.data.templateId),
    backgroundError: ""
  });
}

function onClearBackgroundImage() {
  this.clearBackgroundImage();
}

function clearBackgroundImage() {
  const backgroundState = defaultBackgroundState(this.data.templateId);
  const templateBackgrounds = withCurrentTemplateBackground(this.data, {
    backgroundUrl: "",
    backgroundPresetId: backgroundState.backgroundPresetId,
    backgroundOpacity: backgroundState.backgroundOpacity
  });
  this.setData({
    backgroundUrl: backgroundState.backgroundUrl,
    backgroundPresetId: backgroundState.backgroundPresetId,
    templateBackgrounds,
    backgroundPresets: backgroundState.backgroundPresets,
    backgroundOpacity: backgroundState.backgroundOpacity,
    backgroundPreviewStyle: backgroundStyle(backgroundState.backgroundUrl, backgroundState.backgroundOpacity, this.data.templateId),
    backgroundError: ""
  });
}

function onBackgroundOpacityChange(event) {
  const backgroundOpacity = normalizeOpacity(event.detail.value, DEFAULT_BACKGROUND_OPACITY);
  const templateBackgrounds = withCurrentTemplateBackground(this.data, { backgroundOpacity });
  this.setData({
    backgroundOpacity,
    templateBackgrounds,
    backgroundPreviewStyle: backgroundStyle(this.data.backgroundUrl, backgroundOpacity, this.data.templateId)
  });
}

function onPortraitPhotoChange(event) {
  this.setData({
    portraitPhotoUrl: String(event.detail && event.detail.url ? event.detail.url : "")
  });
}

function normalizeOpacity(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.max(0, Math.min(100, Math.round(number)));
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

function validateBackgroundImage(info) {
  const mime = imageMime(info);
  if (!mime) {
    throw new Error("仅支持 JPG、PNG、WebP 图片");
  }
  const ratio = info.width / info.height;
  if (ratio < BACKGROUND_MIN_RATIO || ratio > BACKGROUND_MAX_RATIO) {
    throw new Error("图片比例需在 1.5:1 到 2:1 之间");
  }
}

function imageMime(info) {
  const type = String(info.type || "").toLowerCase();
  if (BACKGROUND_TYPES[type]) {
    return BACKGROUND_TYPES[type];
  }
  const match = String(info.path || "").toLowerCase().match(/\.([a-z0-9]+)(?:\?|$)/);
  return match ? BACKGROUND_TYPES[match[1]] || "" : "";
}

function backgroundUrlForSave(url) {
  if (!url || /^data:image\//.test(url) || /^https?:\/\//.test(url)) {
    return Promise.resolve(url || "");
  }
  if (url.startsWith("/assets/")) {
    return Promise.resolve("");
  }
  return pathToDataUrl(url, mimeFromPath(url));
}

function mimeFromPath(path) {
  const match = String(path || "").toLowerCase().match(/\.([a-z0-9]+)(?:\?|$)/);
  return match ? BACKGROUND_TYPES[match[1]] || "image/webp" : "image/webp";
}

function pathToDataUrl(path, mime) {
  if (/^data:image\//.test(path) || /^https?:\/\//.test(path)) {
    return Promise.resolve(path);
  }
  return new Promise((resolve, reject) => {
    const fs = wx.getFileSystemManager && wx.getFileSystemManager();
    if (!fs || typeof fs.readFile !== "function") {
      reject(new Error("文件系统不可用"));
      return;
    }
    const filePath = path.startsWith("/") ? path.slice(1) : path;
    fs.readFile({
      filePath,
      encoding: "base64",
      success(result) {
        resolve(`data:${mime};base64,${result.data}`);
      },
      fail: reject
    });
  });
}
