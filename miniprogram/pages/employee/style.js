const app = getApp();
const { request } = require("../../utils/api");
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
const TEMPLATE_META = {
  tpl_horizontal_business: { className: "biz-card--horizontal", backgroundId: "light-wave" },
  tpl_minimal: { className: "biz-card--minimal", backgroundId: "light-geometry" },
  tpl_brand_image: { className: "biz-card--brand-image", backgroundId: "blue-dot", opacity: 100 },
  tpl_dark: { className: "biz-card--dark", backgroundId: "dark-dot", opacity: 100 },
  tpl_campaign: { className: "biz-card--campaign", backgroundId: "", opacity: 100 }
};

const stylePage = {
  data: {
    primary: DEFAULT_BRAND,
    themeStyle: "",
    templateId: "tpl_horizontal_business",
    templateClass: "biz-card--horizontal",
    card: { display_name: "", title: "", company: "", fields: {} },
    templates: [
      { id: "tpl_horizontal_business", name: "横版商务", desc: "企业级默认模板" },
      { id: "tpl_minimal", name: "极简", desc: "信息更克制" },
      { id: "tpl_brand_image", name: "品牌图", desc: "适合强品牌露出" },
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
    backgroundPresets: BACKGROUND_PRESETS,
    backgroundOpacity: DEFAULT_BACKGROUND_OPACITY,
    backgroundPreviewStyle: "",
    backgroundError: "",
    choosingBackground: false,
    submitting: false
  },

  onLoad() {
    const theme = setPageTheme(this);
    const current = app.globalData.currentCard;
    if (current) {
      this.setData({ card: Object.assign({ fields: {} }, current) });
    }
    this.setData({ primary: theme.themeBrand });
    this.loadPreview();
  },

  async loadPreview() {
    try {
      const preview = await request("/employee/cards/current/preview");
      const template = preview.template || {};
      const layout = template.layout || {};
      const templateId = normalizeTemplateId(template.template_id || layout.variant || this.data.templateId);
      const templateMeta = TEMPLATE_META[templateId] || TEMPLATE_META.tpl_horizontal_business;
      const savedPresetId = typeof layout.background_preset_id === "string" ? layout.background_preset_id : "";
      const preset = BACKGROUND_PRESETS.find((item) => item.id === (savedPresetId || templateMeta.backgroundId));
      const backgroundUrl = template.background_url || (preset ? preset.url : "");
      const backgroundPresetId = template.background_url ? "" : (preset ? preset.id : "");
      const colorScheme = template.color_scheme || {};
      const primary = colorScheme.primary || DEFAULT_BRAND;
      const backgroundOpacity = normalizeOpacity(layout.background_opacity, templateMeta.opacity || DEFAULT_BACKGROUND_OPACITY);
      setPageTheme(this, primary);
      app.globalData.currentCard = preview.card;
      this.setData({
        primary,
        customColor: primary,
        customHex: primary,
        customHexError: "",
        customColorExpanded: !this.data.presets.includes(primary),
        backgroundUrl,
        backgroundPresetId,
        backgroundOpacity,
        backgroundPreviewStyle: backgroundStyle(backgroundUrl, backgroundOpacity, templateId),
        backgroundError: "",
        templateId,
        templateClass: templateClass(templateId),
        card: Object.assign({ fields: {}, status: preview.status }, preview.card)
      });
    } catch (_error) {
      wx.showToast({ title: "名片信息加载失败，预览可能不完整", icon: "none" });
    }
  },

  selectTemplate(event) {
    const templateId = normalizeTemplateId(event.currentTarget.dataset.id);
    const meta = TEMPLATE_META[templateId] || TEMPLATE_META.tpl_horizontal_business;
    const preset = BACKGROUND_PRESETS.find((item) => item.id === meta.backgroundId);
    const backgroundUrl = preset ? preset.url : "";
    const backgroundOpacity = normalizeOpacity(meta.opacity, this.data.backgroundOpacity);
    this.setData({
      templateId,
      templateClass: meta.className,
      backgroundUrl,
      backgroundPresetId: preset ? preset.id : "",
      backgroundOpacity,
      backgroundPreviewStyle: backgroundStyle(backgroundUrl, backgroundOpacity, templateId),
      backgroundError: ""
    });
  },

  selectColor(event) {
    const primary = event.currentTarget.dataset.color;
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

  async applyStyle() {
    if (this.data.submitting) {
      return;
    }
    this.setData({ submitting: true });
    try {
      const backgroundUrl = await backgroundUrlForSave(this.data.backgroundUrl);
      const preview = await request("/employee/cards/current/style", {
        method: "PUT",
        data: {
          template_id: this.data.templateId,
          color_scheme: {
            primary: this.data.primary,
            surface: "#ffffff"
          },
          background_url: backgroundUrl || null,
          layout: {
            variant: this.data.templateId,
            background_opacity: this.data.backgroundOpacity,
            background_preset_id: this.data.backgroundPresetId || null
          }
        }
      });
      const primary = preview?.template?.color_scheme?.primary || this.data.primary;
      setPageTheme(this, primary);
      app.globalData.currentCard = preview.card || app.globalData.currentCard;
      const previewLayout = preview?.template?.layout || {};
      const previewBackgroundUrl = preview?.template?.background_url || this.data.backgroundUrl;
      this.setData({
        backgroundUrl: previewBackgroundUrl,
        backgroundPresetId: preview?.template?.background_url ? "" : (previewLayout.background_preset_id || this.data.backgroundPresetId),
        backgroundOpacity: normalizeOpacity(previewLayout.background_opacity, this.data.backgroundOpacity),
        backgroundPreviewStyle: backgroundStyle(
          previewBackgroundUrl,
          normalizeOpacity(previewLayout.background_opacity, this.data.backgroundOpacity),
          this.data.templateId
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
  onBackgroundOpacityChange
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

function templateClass(templateId) {
  return (TEMPLATE_META[normalizeTemplateId(templateId)] || TEMPLATE_META.tpl_horizontal_business).className;
}

function normalizeTemplateId(templateId) {
  if (templateId === "tpl_demo_business" || templateId === "horizontal-business") {
    return "tpl_horizontal_business";
  }
  return TEMPLATE_META[templateId] ? templateId : "tpl_horizontal_business";
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
        this.setData({
          backgroundUrl: dataUrl,
          backgroundPresetId: "",
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
  const preset = BACKGROUND_PRESETS.find((item) => item.id === event.currentTarget.dataset.id);
  if (!preset) {
    return;
  }
  this.setData({
    backgroundUrl: preset.url,
    backgroundPresetId: preset.id,
    backgroundPreviewStyle: backgroundStyle(preset.url, this.data.backgroundOpacity, this.data.templateId),
    backgroundError: ""
  });
}

function onClearBackgroundImage() {
  this.clearBackgroundImage();
}

function clearBackgroundImage() {
  this.setData({
    backgroundUrl: "",
    backgroundPresetId: "",
    backgroundPreviewStyle: "",
    backgroundError: ""
  });
}

function onBackgroundOpacityChange(event) {
  const backgroundOpacity = normalizeOpacity(event.detail.value, DEFAULT_BACKGROUND_OPACITY);
  this.setData({
    backgroundOpacity,
    backgroundPreviewStyle: backgroundStyle(this.data.backgroundUrl, backgroundOpacity, this.data.templateId)
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
