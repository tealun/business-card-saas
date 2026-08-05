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

  /**
   * 初始化样式页主题、当前名片缓存和编辑权限。
   * 个人身份可编辑颜色/背景，企业身份保留企业统一维护边界。
   */
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

  /**
   * 拉取当前名片的样式预览，并恢复模板、主题色、背景和照片模板状态。
   * 失败只提示预览不完整，允许用户继续查看本地缓存的名片。
   */
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

  /**
   * 切换名片模板，并同步该模板对应的背景预设和预览样式。
   */
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

  /**
   * 从预设色板选择主色。
   */
  selectColor(event) {
    const detail = event.detail || {};
    const dataset = event.currentTarget ? event.currentTarget.dataset : {};
    const primary = detail.color || dataset.color;
    this.previewColor(primary, { customHexError: "", customColorExpanded: false });
  },

  /**
   * 处理自定义 HEX 主色输入。
   * 合法颜色会立即预览，非法输入只更新错误提示。
   */
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

  /**
   * 确认使用自定义颜色，并展开自定义色块状态。
   */
  selectCustomColor() {
    const normalized = normalizeHexInput(this.data.customHex) || this.data.customColor;
    this.previewColor(normalized, {
      customColor: normalized,
      customHex: normalized,
      customHexError: "",
      customColorExpanded: true
    });
  },

  /**
   * 根据主色实时预览主题变量。
   * 额外状态用于同时合并输入框或错误提示状态。
   */
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

  /**
   * 保存当前样式配置到后端。
   * 会按权限拆分模板、颜色、背景和照片模板字段，避免企业统一维护字段被个人侧覆盖。
   */
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

/**
 * 规范化用户输入的 HEX 色值，返回小写 #rrggbb 或空字符串。
 */
function normalizeHexInput(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }
  const prefixed = raw.startsWith("#") ? raw : `#${raw}`;
  return /^#[0-9a-fA-F]{6}$/.test(prefixed) ? prefixed.toLowerCase() : "";
}

/**
 * 判断当前全局身份是否为个人名片身份。
 */
function isPersonalIdentity() {
  const identity = app.globalData.currentIdentity || {};
  return identity.identity_type === "personal" || identity.typeLabel === "涓汉鍚嶇墖";
}

/**
 * 根据模板 ID 获取页面卡片 class。
 */
function templateClass(templateId) {
  return templateMeta(templateId).className;
}

/**
 * 获取模板元数据，并对未知模板回退到横版商务模板。
 */
function templateMeta(templateId) {
  return TEMPLATE_META[normalizeTemplateId(templateId)] || TEMPLATE_META.tpl_horizontal_business;
}

/**
 * 从模板 layout 中读取图片地址字段，非字符串统一视为空。
 */
function layoutImageUrl(layout, key) {
  const value = layout && layout[key];
  return typeof value === "string" ? value.trim() : "";
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
  return TEMPLATE_META[templateId] ? templateId : "tpl_horizontal_business";
}

/**
 * 判断模板是否为照片头像展示型模板。
 */
function isPortraitTemplate(templateId) {
  return normalizeTemplateId(templateId) === "tpl_portrait_photo";
}

/**
 * 返回指定模板允许选择的背景预设列表。
 */
function backgroundPresetsForTemplate(templateId) {
  const ids = TEMPLATE_BACKGROUND_PRESET_IDS[normalizeTemplateId(templateId)] || TEMPLATE_BACKGROUND_PRESET_IDS.tpl_horizontal_business;
  return ids
    .map((id) => BACKGROUND_PRESETS.find((item) => item.id === id))
    .filter(Boolean);
}

/**
 * 判断背景预设是否允许用于当前模板。
 */
function isPresetAllowedForTemplate(presetId, templateId) {
  return backgroundPresetsForTemplate(templateId).some((item) => item.id === presetId);
}

/**
 * 生成模板默认背景状态。
 * 默认值来自模板元数据和允许的预设列表。
 */
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

/**
 * 合并已保存背景配置与模板默认值，得到当前可预览状态。
 * 自定义图片优先于预设图，非法配置回退默认值。
 */
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

/**
 * 从后端 layout 中还原各模板的背景配置。
 * 兼容旧字段 background_url/background_opacity，保证升级后的用户不丢背景。
 */
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

/**
 * 将当前页面背景状态写回 templateBackgrounds 映射。
 * 局部补丁用于选择图片、预设或透明度时只覆盖单个字段。
 */
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

/**
 * 将模板 ID 转换为旧版 layout.variant 使用的短横线键。
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
 * 将所有模板背景状态整理成后端保存结构。
 */
function templateBackgroundsForSave(templateBackgrounds) {
  const result = {};
  Object.keys(TEMPLATE_META).forEach((templateId) => {
    const state = backgroundStateForTemplate(templateId, templateBackgrounds);
    result[templateId] = backgroundConfigForSave(templateId, state);
  });
  return result;
}

/**
 * 生成单个模板的背景保存结构。
 * 内置资源只保存 presetId，自定义图片保存 background_url。
 */
function backgroundConfigForSave(templateId, state) {
  const defaults = defaultBackgroundState(templateId);
  const customUrl = isBundledBackground(state.backgroundUrl) ? "" : String(state.backgroundUrl || "");
  return {
    background_url: customUrl,
    background_preset_id: customUrl ? "" : (state.backgroundPresetId || defaults.backgroundPresetId || null),
    background_opacity: normalizeOpacity(state.backgroundOpacity, defaults.backgroundOpacity)
  };
}

/**
 * 校验并规范化单个模板背景配置。
 */
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

/**
 * 根据内置资源 URL 反查背景预设。
 */
function presetFromUrl(url) {
  return BACKGROUND_PRESETS.find((item) => item.url === url) || null;
}

/**
 * 判断背景 URL 是否来自小程序内置资源。
 */
function isBundledBackground(url) {
  return Boolean(presetFromUrl(String(url || ""))) || String(url || "").startsWith("/assets/card-backgrounds/");
}

/**
 * 生成名片背景预览的 CSS 字符串。
 * 透明度会转换成遮罩层 alpha，适配深色和品牌图模板。
 */
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

/**
 * 兼容组件事件命名，转发到选择背景图片流程。
 */
function onChooseBackgroundImage() {
  this.chooseBackgroundImage();
}

/**
 * 选择并校验自定义背景图片。
 * 图片需要满足大小、类型和长宽比要求，随后转成 dataURL 暂存在页面状态。
 */
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

/**
 * 选择当前模板允许的内置背景预设，并刷新预览。
 */
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

/**
 * 兼容组件事件命名，转发到清除背景流程。
 */
function onClearBackgroundImage() {
  this.clearBackgroundImage();
}

/**
 * 清除自定义背景并回到当前模板默认背景。
 */
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

/**
 * 调整背景遮罩透明度，并同步到当前模板背景配置。
 */
function onBackgroundOpacityChange(event) {
  const backgroundOpacity = normalizeOpacity(event.detail.value, DEFAULT_BACKGROUND_OPACITY);
  const templateBackgrounds = withCurrentTemplateBackground(this.data, { backgroundOpacity });
  this.setData({
    backgroundOpacity,
    templateBackgrounds,
    backgroundPreviewStyle: backgroundStyle(this.data.backgroundUrl, backgroundOpacity, this.data.templateId)
  });
}

/**
 * 更新照片模板使用的个人形象图地址。
 */
function onPortraitPhotoChange(event) {
  this.setData({
    portraitPhotoUrl: String(event.detail && event.detail.url ? event.detail.url : "")
  });
}

/**
 * 将透明度限制到 0-100 的整数范围，非法值使用 fallback。
 */
function normalizeOpacity(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.max(0, Math.min(100, Math.round(number)));
}

/**
 * 将 wx.getImageInfo 封装为 Promise，方便上传前校验图片尺寸和类型。
 */
function getImageInfo(src) {
  return new Promise((resolve, reject) => {
    wx.getImageInfo({
      src,
      success: resolve,
      fail: reject
    });
  });
}

/**
 * 校验背景图片格式和横向比例。
 * 这里限制为 1.5:1 到 2:1，保证名片卡片裁切稳定。
 */
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

/**
 * 从微信图片信息或文件后缀推断 MIME 类型。
 */
function imageMime(info) {
  const type = String(info.type || "").toLowerCase();
  if (BACKGROUND_TYPES[type]) {
    return BACKGROUND_TYPES[type];
  }
  const match = String(info.path || "").toLowerCase().match(/\.([a-z0-9]+)(?:\?|$)/);
  return match ? BACKGROUND_TYPES[match[1]] || "" : "";
}

/**
 * 将背景 URL 转成后端可保存的值。
 * 内置资源不重复保存 URL，本地临时文件会转为 dataURL。
 */
function backgroundUrlForSave(url) {
  if (!url || /^data:image\//.test(url) || /^https?:\/\//.test(url)) {
    return Promise.resolve(url || "");
  }
  if (url.startsWith("/assets/")) {
    return Promise.resolve("");
  }
  return pathToDataUrl(url, mimeFromPath(url));
}

/**
 * 根据文件路径后缀推断背景图片 MIME，未知时按 webp 兜底。
 */
function mimeFromPath(path) {
  const match = String(path || "").toLowerCase().match(/\.([a-z0-9]+)(?:\?|$)/);
  return match ? BACKGROUND_TYPES[match[1]] || "image/webp" : "image/webp";
}

/**
 * 将本地图片路径转换为 dataURL。
 * 已经是 dataURL 或远程 URL 时直接返回，避免重复读取。
 */
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
