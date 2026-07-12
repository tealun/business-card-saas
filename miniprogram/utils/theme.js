const THEME_STORAGE_KEY = "wecomcard.theme.v1";
const DEFAULT_BRAND = "#5a70c8";
const LEGACY_DEFAULT_BRANDS = ["#2b6cff", "#4c6ffc"];

function normalizeHex(value) {
  const hex = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
    const normalized = hex.toLowerCase();
    return LEGACY_DEFAULT_BRANDS.includes(normalized) ? DEFAULT_BRAND : normalized;
  }
  return DEFAULT_BRAND;
}

function hexToRgb(hex) {
  const normalized = normalizeHex(hex).slice(1);
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16)
  };
}

function rgbToHex(rgb) {
  return `#${[rgb.r, rgb.g, rgb.b].map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0")).join("")}`;
}

function mix(hex, target, weight) {
  const base = hexToRgb(hex);
  const end = hexToRgb(target);
  return rgbToHex({
    r: base.r * (1 - weight) + end.r * weight,
    g: base.g * (1 - weight) + end.g * weight,
    b: base.b * (1 - weight) + end.b * weight
  });
}

function hexToRgbText(hex) {
  const rgb = hexToRgb(hex);
  return `${rgb.r}, ${rgb.g}, ${rgb.b}`;
}

function buildTheme(brand) {
  const primary = normalizeHex(brand);
  if (primary === DEFAULT_BRAND) {
    return {
      themeBrand: primary,
      themeBrandDeep: "#485aa0",
      themeBrandTint: "#f0f2fa",
      themeBrandSoft: "#9ca9de",
      themeShadowBtn: "0 8rpx 24rpx rgba(90, 112, 200, 0.22)"
    };
  }
  return {
    themeBrand: primary,
    themeBrandDeep: mix(primary, "#000000", 0.2),
    themeBrandTint: mix(primary, "#ffffff", 0.92),
    themeBrandSoft: mix(primary, "#ffffff", 0.4),
    themeShadowBtn: `0 8rpx 24rpx rgba(${hexToRgbText(primary)}, 0.24)`
  };
}

function getAppInstance() {
  try {
    return typeof getApp === "function" ? getApp() : null;
  } catch (_error) {
    return null;
  }
}

function applyThemeToApp(brand) {
  const app = getAppInstance();
  const theme = buildTheme(brand);
  if (app && app.globalData) {
    Object.assign(app.globalData, theme);
  }
  if (typeof wx !== "undefined" && typeof wx.setStorageSync === "function") {
    wx.setStorageSync(THEME_STORAGE_KEY, theme.themeBrand);
  }
  return theme;
}

function restoreTheme(targetGlobalData) {
  let brand = DEFAULT_BRAND;
  if (typeof wx !== "undefined" && typeof wx.getStorageSync === "function") {
    brand = wx.getStorageSync(THEME_STORAGE_KEY) || brand;
  }
  const theme = buildTheme(brand);
  if (targetGlobalData) {
    Object.assign(targetGlobalData, theme);
  }
  return theme;
}

function currentTheme() {
  const app = getAppInstance();
  const brand = app && app.globalData ? app.globalData.themeBrand : DEFAULT_BRAND;
  return buildTheme(brand);
}

function themeStyle(theme) {
  const value = theme || currentTheme();
  return [
    `--brand: ${value.themeBrand}`,
    `--brand-deep: ${value.themeBrandDeep}`,
    `--brand-tint: ${value.themeBrandTint}`,
    `--brand-soft: ${value.themeBrandSoft}`,
    `--shadow-btn: ${value.themeShadowBtn}`
  ].join("; ");
}

function setPageTheme(page, brand) {
  const theme = brand ? applyThemeToApp(brand) : currentTheme();
  if (page && typeof page.setData === "function") {
    page.setData({ ...theme, themeStyle: themeStyle(theme) });
  }
  return theme;
}

module.exports = {
  DEFAULT_BRAND,
  applyThemeToApp,
  buildTheme,
  currentTheme,
  restoreTheme,
  setPageTheme,
  themeStyle
};
