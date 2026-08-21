const DEV_MODE = (() => {
  try {
    if (new URLSearchParams(window.location.search).has("dev")) return true;
  } catch (_) {
    /* ignore */
  }
  return window.location.protocol === "file:" || ["localhost", "127.0.0.1"].includes(window.location.hostname);
})();

const PAGE_META = {
  "tenant-dashboard": ["企业后台", "企业总览", "企业状态、名片规模和待办事项"],
  "tenant-members": ["企业后台", "成员与名片", "成员同步和名片编辑"],
  "tenant-company": ["企业后台", "企业主页", "企业资料和主页内容"],
  "tenant-design": ["企业后台", "企业设置", "成员字段权限与展示规则"],
  "tenant-templates": ["企业后台", "名片模板", "企业成员名片的版式与品牌视觉"],
  "tenant-sync": ["企业后台", "同步与回调", "企业同步事件"],
  "tenant-analytics": ["企业后台", "数据分析", "访问、互动和成员表现"],
  "tenant-billing": ["企业后台", "版本与额度", "商业化能力状态"],
  "tenant-admins": ["企业后台", "管理员", "企业管理员能力状态"],
  "tenant-audit": ["企业后台", "审计日志", "企业审计能力状态"],
  "platform-dashboard": ["系统后台", "系统总览", "平台授权和运维概览"],
  "platform-tenants": ["系统后台", "企业授权中心", "平台只读授权视图"],
  "platform-wecom": ["系统后台", "授权与回调", "平台回调能力状态"],
  "platform-commercial": ["系统后台", "商业化", "商业化能力状态"],
  "platform-features": ["系统后台", "功能开关", "平台默认和企业 override"],
  "platform-ops": ["系统后台", "运维", "数据库迁移和健康能力"],
  "platform-audit": ["系统后台", "审计", "平台审计能力状态"],
  "platform-accounts": ["系统后台", "系统账号", "平台账号能力状态"],
  "dev-tools": ["联调", "联调工具", "本地调试入口"]
};

const NAVS = {
  tenant: [
    ["tenant-dashboard", "总览", "tenant.dashboard"],
    ["tenant-members", "成员与名片", "tenant.members"],
    ["tenant-company", "企业主页", "tenant.company"],
    ["tenant-templates", "名片模板", "tenant.design"],
    ["tenant-design", "企业设置", "tenant.design"],
    ["tenant-sync", "同步与回调", "tenant.sync"],
    ["tenant-analytics", "数据分析", "tenant.analytics"],
    ["tenant-billing", "版本与额度", "tenant.billing"],
    ["tenant-admins", "管理员", "tenant.admins"],
    ["tenant-audit", "审计日志", "tenant.audit"]
  ],
  platform: [
    ["platform-dashboard", "总览", "platform.dashboard"],
    ["platform-tenants", "企业", "platform.tenants"],
    ["platform-wecom", "授权与回调", "platform.wecom"],
    ["platform-commercial", "商业化", "platform.commercial"],
    ["platform-features", "功能开关", "platform.features"],
    ["platform-ops", "运维", "platform.ops"],
    ["platform-audit", "审计", "platform.audit"],
    ["platform-accounts", "系统账号", "platform.accounts"]
  ]
};

const state = {
  adminToken: sessionStorage.getItem("bc_admin_token") || "",
  admin: null,
  mode: "tenant",
  page: "tenant-dashboard",
  members: [],
  tenantOverview: null,
  analyticsDays: 7,
  selectedMemberId: "",
  memberCard: null,
  companyProfile: null,
  companyHonors: [],
  companyVideos: [],
  companyActiveTab: "base",
  companyDirty: false,
  companyPreviewStyle: "classic",
  companyPreviewBrand: "#5272d6",
  deletedHonorIds: [],
  videoCapability: null,
  fieldSettings: [],
  templates: [],
  templatePreviewCard: null,
  templateDraftBackgrounds: {},
  wecomSettings: null,
  selectedTemplateId: "",
  tenantFeatures: [],
  tenantFeatureSearchResults: [],
  tenantAuthorizations: { items: [], total: 0, page: 1, pageSize: 20 },
  auditView: "operations",
  platformAuditView: "operations",
  tenantOps: { offset: 0, limit: 50, total: 0 },
  platformOps: { offset: 0, limit: 50, total: 0 }
};

const COMPANY_BUILDER_TABS = [
  { key: "base", title: "基础资料", moduleKey: "", panel: "profile", hint: "名称、Logo、官网与地址，保存后会同步到企业主页头部。" },
  { key: "intro", title: "企业简介", moduleKey: "profile", panel: "intro", hint: "用内容块维护企业介绍，支持段落、引用、图片、图集和视频引用。" },
  { key: "services", title: "服务项目", moduleKey: "services", panel: "services", hint: "选择展示布局，维护服务列表与排序。" },
  { key: "video", title: "企业视频", moduleKey: "videos", panel: "video", hint: "从已发布视频中选择引用，不需要填写编号。" },
  { key: "honors", title: "荣誉资质", moduleKey: "honors", panel: "honors", hint: "维护证书、奖项和资质图片，支持排序与展示状态。" }
];

const COMPANY_MODULE_DEFAULTS = [
  { key: "services", title: "服务项目", visible: true, sort_order: 10, layout: "graphic" },
  { key: "profile", title: "企业简介", visible: true, sort_order: 20, layout: "carousel" },
  { key: "videos", title: "企业视频", visible: true, sort_order: 30, layout: "carousel" },
  { key: "honors", title: "荣誉资质", visible: true, sort_order: 40, layout: "grid" }
];

const COMPANY_LAYOUTS = [
  { value: "graphic", label: "图文列表", desc: "适合服务项目" },
  { value: "grid", label: "宫格", desc: "适合多项并列" },
  { value: "carousel", label: "轮播", desc: "适合图片和证书" },
  { value: "text", label: "纯文字", desc: "突出文案" },
  { value: "image", label: "图片", desc: "图片优先展示" }
];

const COMPANY_INTRO_TYPES = [
  { type: "paragraph", label: "段落" },
  { type: "heading", label: "标题" },
  { type: "quote", label: "引用" },
  { type: "image", label: "图片" },
  { type: "gallery", label: "图集" },
  { type: "video", label: "视频" }
];

const TEMPLATE_VARIANTS = [
  { value: "horizontal-business", label: "横版商务", desc: "企业级默认模板" },
  { value: "minimal", label: "极简", desc: "信息更克制" },
  { value: "brand-image", label: "品牌图", desc: "适合强品牌露出" },
  { value: "portrait-photo", label: "照片版", desc: "突出成员形象" },
  { value: "dark", label: "深色", desc: "高对比展示" },
  { value: "campaign", label: "活动版", desc: "短期推广使用" }
];

const TEMPLATE_BACKGROUND_PRESETS = {
  "light-wave": "./assets/card-backgrounds/bg-light-wave.webp",
  "light-geometry": "./assets/card-backgrounds/bg-light-geometry.webp",
  "light-cubes": "./assets/card-backgrounds/bg-light-cubes.webp",
  "blue-dot": "./assets/card-backgrounds/bg-blue-dot.webp",
  "dark-dot": "./assets/card-backgrounds/bg-dark-dot.webp"
};

const TEMPLATE_BACKGROUND_PRESET_NAMES = {
  "light-wave": "浅色波纹",
  "light-geometry": "浅色几何",
  "light-cubes": "浅色立方",
  "blue-dot": "蓝色点阵",
  "dark-dot": "深色点阵"
};

const TEMPLATE_VARIANT_PRESETS = {
  "horizontal-business": ["light-wave", "light-cubes"],
  minimal: ["light-geometry", "light-wave"],
  "brand-image": ["blue-dot", "light-cubes"],
  "portrait-photo": ["light-cubes", "light-wave"],
  dark: ["dark-dot"],
  campaign: ["light-cubes", "blue-dot"]
};

const TEMPLATE_VARIANT_DEFAULT_PRESETS = {
  "horizontal-business": "light-wave",
  minimal: "light-geometry",
  "brand-image": "blue-dot",
  "portrait-photo": "light-cubes",
  dark: "dark-dot",
  campaign: "light-cubes"
};

const TEMPLATE_BRAND_COLORS = ["#5a70c8", "#c1666b", "#8d7ec7", "#4c8868", "#d68a4e", "#3f9999"];

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const apiBaseInput = $("#apiBase");
const authGate = $("#authGate");
const adminShell = $("#adminShell");
const navList = $("#navList");
const pageTitle = $("#pageTitle");
const pageSubtitle = $("#pageSubtitle");
const breadcrumb = $("#breadcrumb");
const pageLoadError = $("#pageLoadError");
const topbarAdmin = $("#topbarAdmin");
const adminStatus = $("#adminStatus");
const loginStatus = $("#loginStatus");
const tenantStatus = $("#tenantStatus");
const lastActionStatus = $("#lastActionStatus");
const apiStatus = $("#apiStatus");
const toast = $("#toast");
const gateError = $("#gateError");
const adminOutput = $("#adminOutput");
const drawer = $("#detailDrawer");
const drawerTitle = $("#drawerTitle");
const drawerSubtitle = $("#drawerSubtitle");
const drawerBody = $("#drawerBody");
const drawerFooter = $("#drawerFooter");
const confirmDialog = $("#confirmDialog");
const confirmTitle = $("#confirmTitle");
const confirmBody = $("#confirmBody");
const confirmReasonLabel = $("#confirmReasonLabel");
const confirmReason = $("#confirmReason");
const textInputDialog = $("#textInputDialog");
const textInputTitle = $("#textInputTitle");
const textInputBody = $("#textInputBody");
const textInputLabel = $("#textInputLabel");
const textInputValue = $("#textInputValue");
const textInputError = $("#textInputError");

apiBaseInput.value = defaultApiBase();
apiBaseInput.addEventListener("change", () => localStorage.setItem("bc_api_base", apiBaseInput.value.trim()));
if (DEV_MODE) document.body.classList.add("dev-mode");

function defaultApiBase() {
  const saved = localStorage.getItem("bc_api_base");
  if (saved) return saved;
  if (window.location.protocol === "http:" || window.location.protocol === "https:") {
    return `${window.location.origin}/api/v1`;
  }
  return "";
}

function apiBase() {
  if (!DEV_MODE) {
    const configured = String(window.BC_ADMIN_CONFIG?.apiBase || "").trim().replace(/\/$/, "");
    if (configured && /^https:\/\//.test(configured)) return configured;
    return `${window.location.origin}/api/v1`;
  }
  const value = apiBaseInput.value.trim().replace(/\/$/, "");
  if (!value) throw new Error("请先配置 API Base");
  if (!/^https?:\/\//.test(value)) throw new Error("API Base 必须是 http(s) URL");
  return value;
}

function mediaUrl(value) {
  const url = String(value || "").trim();
  if (!url || /^(?:https?:|data:|blob:)/i.test(url)) return url;
  if (url === "/api/v1" || url.startsWith("/api/v1/")) {
    return `${apiBase()}${url.slice("/api/v1".length)}`;
  }
  return url;
}

function normalizeHexColor(value, fallback = "") {
  const input = String(value || "").trim();
  const short = /^#([0-9a-f]{3})$/i.exec(input);
  if (short) return `#${short[1].split("").map((char) => `${char}${char}`).join("")}`.toLowerCase();
  return /^#[0-9a-f]{6}$/i.test(input) ? input.toLowerCase() : fallback;
}

function mixHexColor(color, target, ratio) {
  const source = normalizeHexColor(color, "#5272d6").slice(1);
  const destination = normalizeHexColor(target, "#ffffff").slice(1);
  const amount = Math.max(0, Math.min(1, ratio));
  const channels = [0, 2, 4].map((offset) => Math.round(
    parseInt(source.slice(offset, offset + 2), 16) * (1 - amount)
      + parseInt(destination.slice(offset, offset + 2), 16) * amount
  ));
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function brandTokens(primary) {
  const brand = normalizeHexColor(primary, "#5272d6");
  const rgb = [1, 3, 5].map((offset) => parseInt(brand.slice(offset, offset + 2), 16));
  return {
    brand,
    strong: mixHexColor(brand, "#000000", 0.2),
    bright: brand,
    soft: mixHexColor(brand, "#ffffff", 0.9),
    ring: `rgba(${rgb.join(", ")}, .18)`
  };
}

async function request(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const timeoutMs = options.timeoutMs || (method === "GET" ? 10000 : 15000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = { ...(options.headers || {}) };
    const hasBody = Object.prototype.hasOwnProperty.call(options, "body");
    if (hasBody && !headers["content-type"]) headers["content-type"] = "application/json";
    const token = options.token === undefined ? state.adminToken : options.token;
    if (options.auth !== false && token) headers.authorization = `Bearer ${token}`;
    const response = await fetch(`${apiBase()}${path}`, {
      ...options,
      method,
      headers,
      signal: controller.signal,
      body: hasBody ? JSON.stringify(options.body) : undefined
    });
    const text = await response.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch (_) {
      body = { message: `服务响应异常 (${response.status})` };
    }
    if (!response.ok) {
      const error = new Error(body?.message || `${response.status} ${response.statusText}`);
      error.status = response.status;
      throw error;
    }
    return body && typeof body === "object" && "data" in body ? body.data : body;
  } finally {
    clearTimeout(timeout);
  }
}

async function adminRequest(path, options = {}) {
  try {
    return await request(path, options);
  } catch (error) {
    if (error && error.status === 401) expireAdminSession("登录已过期，请重新登录");
    throw error;
  }
}

async function run(label, fn) {
  lastActionStatus.textContent = `${label}...`;
  try {
    const result = await fn();
    lastActionStatus.textContent = `${label}完成`;
    return result;
  } catch (error) {
    lastActionStatus.textContent = `${label}失败`;
    notify(error.message || String(error), "danger");
    throw error;
  }
}

function notify(message, tone = "success") {
  toast.textContent = message;
  toast.className = `toast ${tone}`;
  window.clearTimeout(notify.timer);
  notify.timer = window.setTimeout(() => toast.classList.add("hidden"), 3200);
}

function showGate(message = "") {
  authGate.classList.remove("hidden");
  adminShell.classList.add("hidden");
  if (message) gateError.dataset.preserve = "true";
  gateError.textContent = message;
}

function showConsole() {
  authGate.classList.add("hidden");
  adminShell.classList.remove("hidden");
}

function completeLogin(accessToken, admin) {
  state.adminToken = accessToken;
  state.tenantOverview = null;
  sessionStorage.setItem("bc_admin_token", accessToken);
  const adminTokenInput = $("#adminToken");
  if (adminTokenInput) adminTokenInput.value = accessToken;
  applyAdminIdentity(admin);
  const gateUsername = $("#gateUsername");
  if (gateUsername) gateUsername.value = "";
  const gatePassword = $("#gatePassword");
  if (gatePassword) gatePassword.value = "";
  showConsole();
}

function expireAdminSession(message) {
  state.adminToken = "";
  state.admin = null;
  sessionStorage.removeItem("bc_admin_token");
  topbarAdmin.textContent = "未登录";
  adminStatus.textContent = "未连接";
  loginStatus.textContent = "未登录";
  tenantStatus.textContent = "未加载";
  showGate(message);
}

function applyAdminIdentity(admin) {
  state.admin = admin;
  state.mode = admin.account_type === "platform" ? "platform" : "tenant";
  state.tenantOverview = null;
  const defaultPage = state.mode === "platform" ? "platform-dashboard" : "tenant-dashboard";
  state.page = canSeePage(defaultPage) ? defaultPage : firstVisiblePage();
  topbarAdmin.textContent = `${admin.tenant_name} · ${admin.role}`;
  adminStatus.textContent = `${state.mode === "platform" ? "系统" : "企业"} · ${admin.role}`;
  loginStatus.textContent = admin.account_type;
  tenantStatus.textContent = admin.tenant_name;
  $("#changePasswordButton").classList.toggle("hidden", state.mode !== "platform");
  $("#shellModeLabel").textContent = state.mode === "platform" ? "系统管理后台" : "企业管理后台";
  renderNav();
  showPage(state.page, { load: false });
  loadCurrentPage();
}

function cleanWecomScanQuery() {
  const url = new URL(window.location.href);
  url.searchParams.delete("code");
  url.searchParams.delete("auth_code");
  url.searchParams.delete("error");
  url.searchParams.delete("error_description");
  url.searchParams.delete("errcode");
  url.searchParams.delete("errmsg");
  url.searchParams.delete("state");
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
}

function scanLoginFailureMessage(error) {
  const raw = String(error?.message || error || "").trim();
  const known = [
    [/not installed|authorization was cancelled/i, "当前登录的企业未授权使用本应用，或企业授权已被取消"],
    [/not an enterprise administrator|not a tenant admin/i, "当前扫码用户不是该企业的企业微信管理员，无法登录企业管理后台"],
    [/no management permission/i, "当前扫码用户虽是企业微信管理员，但未开通应用管理权限，无法登录企业管理后台"],
    [/administrator userid/i, "企业微信未返回可校验的管理员账号，请确认扫码账号属于当前企业"],
    [/missing an agent id/i, "当前企业授权信息不完整，缺少企业微信应用 AgentID，请联系平台管理员重新同步授权"],
    [/disabled/i, "当前管理员账号已在本系统中停用，请联系企业 Owner 或平台管理员"],
    [/invalid or expired|expired/i, "扫码登录已过期或已被使用，请重新发起企业微信扫码登录"]
  ];
  for (const [pattern, message] of known) {
    if (pattern.test(raw)) return message;
  }
  return raw || "企业微信扫码登录失败，请重新扫码";
}

async function completeWecomScanFromLocation() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code") || params.get("auth_code");
  const scanState = params.get("state");
  const providerError = params.get("error_description") || params.get("errmsg") || params.get("error") || params.get("errcode");
  if (providerError || scanState || code) {
    if (!code || !scanState) {
      const message = providerError
        ? `企业微信扫码登录失败：${providerError}`
        : "企业微信回跳缺少登录授权码或 state，请重新发起扫码登录";
      sessionStorage.setItem("bc_admin_login_error", message);
      cleanWecomScanQuery();
      expireAdminSession(message);
      return true;
    }
  } else {
    return false;
  }

  showGate("正在完成企业微信登录…");
  try {
    const query = new URLSearchParams({ code, state: scanState });
    const result = await request(`/admin/auth/wecom/scan-callback?${query}`, { auth: false });
    cleanWecomScanQuery();
    completeLogin(result.access_token, result.admin);
  } catch (error) {
    const message = scanLoginFailureMessage(error);
    sessionStorage.setItem("bc_admin_login_error", message);
    cleanWecomScanQuery();
    expireAdminSession(message);
  }
  return true;
}

function fallbackWecomLoginUrl(config) {
  const url = new URL("https://login.work.weixin.qq.com/wwlogin/sso/login");
  url.searchParams.set("login_type", "ServiceApp");
  url.searchParams.set("appid", config.appid);
  url.searchParams.set("redirect_uri", config.redirect_uri);
  url.searchParams.set("state", config.state);
  url.searchParams.set("lang", "zh");
  return url.toString();
}

function hasCapability(listName, value) {
  const values = state.admin?.[listName];
  return !Array.isArray(values) || values.includes(value);
}

function hasMenuScope(scope) {
  return !scope || hasCapability("menu_scopes", scope);
}

function hasPermission(permission) {
  return !permission || hasCapability("permissions", permission);
}

function requirePermission(permission) {
  if (hasPermission(permission)) return true;
  notify("当前管理员没有此操作权限", "danger");
  return false;
}

function canSeePage(page) {
  if (page === "dev-tools") return DEV_MODE;
  const item = (NAVS[state.mode] || []).find(([candidate]) => candidate === page);
  return Boolean(item && hasMenuScope(item[2]));
}

function firstVisiblePage() {
  const item = (NAVS[state.mode] || []).find(([, , scope]) => hasMenuScope(scope));
  return item?.[0] || (state.mode === "platform" ? "platform-dashboard" : "tenant-dashboard");
}

function applyPermissionState(selector, permission) {
  const node = $(selector);
  if (!node) return;
  const allowed = hasPermission(permission);
  node.disabled = !allowed;
  node.title = allowed ? "" : "当前管理员没有此操作权限";
}

function refreshPermissionControls() {
  applyPermissionState("#syncMembers", "tenant.member.sync");
  applyTenantMemberControls();
  applyPermissionState("#saveCompanyProfile", "tenant.company.write");
  applyPermissionState("#publishCompanyProfile", "tenant.company.write");
  applyPermissionState("#saveFieldSettings", "tenant.config.write");
  applyPermissionState("#createTemplate", "tenant.template.write");
  applyPermissionState("#updateTemplate", "tenant.template.write");
  applyPermissionState("#setDefaultTemplate", "tenant.template.write");
  applyPermissionState("#uploadTemplateLogo", "tenant.template.write");
  applyPermissionState("#clearTemplateLogo", "tenant.template.write");
  applyPermissionState("#uploadTemplateBackground", "tenant.template.write");
  applyPermissionState("#clearTemplateBackground", "tenant.template.write");
  applyPermissionState("#uploadTemplatePortrait", "tenant.template.write");
  applyPermissionState("#clearTemplatePortrait", "tenant.template.write");
  applyPermissionState("#saveWecomSettings", "tenant.member.sync");
  applyPermissionState("#retrySyncEvents", "tenant.sync.retry");
  applyPermissionState("#saveVideoFeatures", "platform.feature.write");
  applyPermissionState("#createQuotaAdjustment", "platform.commercial.write");
  applyPermissionState("#openQuotaDialog", "platform.commercial.write");
  applyPermissionState("#retryPlatformEvents", "platform.sync.retry");
  applyPermissionState("#loadDatabaseMigrations", "platform.database.read");
  applyPermissionState("#runDatabaseMigrations", "platform.database.migrate");
  applyPermissionState("#createPlatformAccount", "platform.account.write");
  applyPermissionState("#createLocalEnterprise", "platform.tenant.write");
}

function renderNav() {
  navList.replaceChildren();
  const navItems = (NAVS[state.mode] || []).filter(([, , scope]) => hasMenuScope(scope));
  if (DEV_MODE) navItems.push(["dev-tools", "联调工具"]);
  navItems.forEach(([page, label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `nav-item${page === state.page ? " active" : ""}`;
    button.textContent = label;
    button.dataset.pageTarget = page;
    button.addEventListener("click", () => showPage(page));
    navList.append(button);
  });
}

function showPage(page, options = {}) {
  if (!canSeePage(page)) {
    const fallback = firstVisiblePage();
    if (fallback && fallback !== page) {
      showPage(fallback, options);
    }
    return;
  }
  state.page = page;
  $$(".page").forEach((node) => node.classList.toggle("active", node.dataset.page === page));
  $$("[data-page-target]").forEach((node) => node.classList.toggle("active", node.dataset.pageTarget === page));
  const [crumb, title, subtitle] = PAGE_META[page] || ["后台", "管理后台", ""];
  breadcrumb.textContent = crumb;
  pageTitle.textContent = title;
  pageSubtitle.textContent = subtitle;
  closeDrawer();
  refreshPermissionControls();
  if (options.load !== false) loadCurrentPage();
}

function loadCurrentPage() {
  const loaders = {
    "tenant-dashboard": loadTenantDashboard,
    "tenant-members": loadMembers,
    "tenant-company": loadCompanyProfileBundle,
    "tenant-design": loadFieldSettings,
    "tenant-templates": loadTemplatePage,
    "tenant-sync": loadTenantSyncPage,
    "tenant-analytics": loadTenantAnalytics,
    "tenant-billing": loadTenantCommercial,
    "tenant-admins": loadTenantAdmins,
    "tenant-audit": loadTenantAuditPage,
    "platform-dashboard": loadPlatformDashboard,
    "platform-tenants": () => loadTenantAuthorizations(),
    "platform-wecom": loadPlatformWecomEvents,
    "platform-commercial": loadPlatformCommercial,
    "platform-features": loadVideoFeatures,
    "platform-ops": loadDatabaseMigrations,
    "platform-audit": loadPlatformAuditPage,
    "platform-accounts": loadPlatformAccounts
  };
  const loader = loaders[state.page];
  if (!loader) return;
  setPageLoadStatus("加载中…", "pending");
  run("加载页面", loader)
    .then(() => setPageLoadStatus(""))
    .catch((error) => {
      // A refresh failure must not leave stale table content looking current with only a
      // 3.2s toast (run() already shows one) as the sole indicator. See 99_71 (A71-P2-6/7).
      setPageLoadStatus(error.message || "加载失败，请刷新重试", "error");
    });
}

function setPageLoadStatus(message, tone = "error") {
  if (!pageLoadError) return;
  if (!message) {
    pageLoadError.classList.add("hidden");
    pageLoadError.classList.remove("pending");
    pageLoadError.textContent = "";
    return;
  }
  pageLoadError.textContent = message;
  pageLoadError.classList.toggle("pending", tone === "pending");
  pageLoadError.classList.remove("hidden");
}

function tag(text, tone = "muted") {
  return `<span class="status-chip ${tone}">${escapeHtml(text)}</span>`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function tenantCanSyncMembers(overview = state.tenantOverview) {
  return state.mode === "tenant" && Boolean(overview && overview.wecom_bound);
}

function applyTenantMemberControls(overview = state.tenantOverview) {
  const syncButton = $("#syncMembers");
  if (!syncButton) return;
  const visible = hasPermission("tenant.member.sync") && tenantCanSyncMembers(overview);
  syncButton.classList.toggle("hidden", !visible);
  syncButton.disabled = !visible;
  syncButton.title = visible ? "" : "本地企业未绑定企业微信，无法同步成员";
}

function normalizeWebsiteUrl(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) return text;
  if (text.startsWith("//")) return `https:${text}`;
  const candidate = `https://${text}`;
  try {
    new URL(candidate);
    return candidate;
  } catch (_error) {
    return text;
  }
}

function formatDate(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function statusTone(value) {
  if (["active", "done", "published", "success"].includes(value)) return "success";
  if (["failed", "dead", "disabled", "cancelled"].includes(value)) return "danger";
  if (["processing", "received", "draft"].includes(value)) return "warning";
  return "muted";
}

function renderRows(tbody, rows, colSpan, render, emptyText = "暂无数据") {
  tbody.replaceChildren();
  if (!rows.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = colSpan;
    td.textContent = emptyText;
    tr.append(td);
    tbody.append(tr);
    return;
  }
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    render(row).forEach((cell) => {
      const td = document.createElement("td");
      if (cell instanceof Node) td.append(cell);
      else td.innerHTML = cell;
      tr.append(td);
    });
    tbody.append(tr);
  });
}

async function loadTenantDashboard() {
  // commercial 对 operator 角色返回 403（权限表不含 operator），全部并发请求单独降级，
  // 单个失败只让对应卡片显示 “—”，不阻塞整页。
  const [overview, analytics, commercial, profile, video, syncEvents] = await Promise.all([
    adminRequest("/admin/overview"),
    adminRequest("/admin/analytics?days=7").catch(() => null),
    adminRequest("/admin/commercial").catch(() => null),
    adminRequest("/admin/company-profile").catch(() => null),
    adminRequest("/admin/features/company-video").catch(() => null),
    adminRequest("/admin/sync-events").catch(() => null)
  ]);
  state.videoCapability = video;
  state.tenantOverview = overview;
  applyTenantMemberControls(overview);
  const sync = syncEvents ? summarizeSyncEvents(syncEvents.items || []) : null;
  const quota = summarizeMemberQuota(commercial);
  const completeness = profileCompleteness(profile);
  renderDashboardStatusCards({ sync, quota, completeness, video });
  const trend = analytics?.trend || [];
  $("#metricMembers").textContent = formatCount(overview.member_count);
  $("#metricActiveCards").textContent = formatCount(overview.active_card_count);
  // analytics overview 为全时段口径，近 7 日访问用 trend 求和，保证卡片文案与数据一致
  $("#metricWeekVisits").textContent = analytics ? formatCount(sumBy(trend, "visit_count")) : "—";
  $("#metricMemberQuotaLeft").textContent = quota?.subscribed ? formatCount(quota.remaining) : "—";
  renderVisitChart($("#dashboardVisitChart"), trend, { showActions: false });
  renderTenantTodos({ overview, sync, quota, completeness });
  return { overview, analytics, commercial, profile, video, syncEvents };
}

function formatCount(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return number.toLocaleString("en-US");
}

function sumBy(rows, key) {
  return rows.reduce((total, row) => total + (Number(row?.[key]) || 0), 0);
}

function summarizeSyncEvents(items) {
  const now = Date.now();
  const failed = items.filter((item) => ["failed", "dead"].includes(item.status));
  const recentFailure = failed.some((item) => {
    const time = new Date(item.received_at).getTime();
    return Number.isFinite(time) && now - time <= 24 * 3600000;
  });
  const lastDone = items.find((item) => item.status === "done");
  return {
    hasIssue: recentFailure,
    failedCount: failed.length,
    lastDoneAt: lastDone ? lastDone.processed_at || lastDone.received_at : null
  };
}

function summarizeMemberQuota(commercial) {
  if (!commercial || !commercial.subscription) return null;
  const subscription = commercial.subscription;
  if (!subscription.subscription_id) return { subscribed: false };
  const limit = Number(subscription.plan?.member_limit || 0) + Number(subscription.quota_adjustments?.member || 0);
  const remaining = Math.max(0, limit - Number(subscription.usage?.member_count || 0));
  return { subscribed: true, limit, remaining, ratio: limit > 0 ? remaining / limit : 0 };
}

// 资料完整度：基于 company-profile 的 6 项确定性检查（名称 / Logo / 官网 / 地址 / 简介 / 服务），
// 后端无评分字段，规则透明可复算（见 docs/99_audits/99_70 评估 P0-7）。
function profileCompleteness(profile) {
  if (!profile) return null;
  const checks = [
    Boolean(profile.display_name),
    Boolean(profile.logo_url),
    Boolean(profile.website_url),
    Boolean(profile.address),
    (profile.intro_blocks || []).length > 0,
    (profile.service_items || []).length > 0
  ];
  const done = checks.filter(Boolean).length;
  return {
    done,
    total: checks.length,
    percent: Math.round((done / checks.length) * 100),
    published: profile.status === "published"
  };
}

function setStatusCard(valueSelector, subSelector, [text, tone, sub]) {
  $(valueSelector).innerHTML = tag(text, tone);
  $(subSelector).textContent = sub;
}

function renderDashboardStatusCards({ sync, quota, completeness, video }) {
  setStatusCard("#dashSyncStatus", "#dashSyncSub", !sync
    ? ["—", "muted", "同步事件不可用"]
    : sync.hasIssue
      ? ["异常", "warning", "近 24 小时存在失败事件"]
      : ["正常", "success", sync.lastDoneAt ? `最近同步 ${formatDate(sync.lastDoneAt)}` : "暂无同步记录"]);
  setStatusCard("#dashQuotaStatus", "#dashQuotaSub", !quota
    ? ["—", "muted", "当前角色不可见"]
    : !quota.subscribed
      ? ["未开通", "muted", "未开通付费版本"]
      : quota.ratio > 0.2
        ? ["正常", "success", `成员额度剩余 ${formatCount(quota.remaining)} 个`]
        : ["剩余不足", "warning", `成员额度仅剩 ${formatCount(quota.remaining)} 个`]);
  setStatusCard("#dashProfileStatus", "#dashProfileSub", !completeness
    ? ["—", "muted", "资料读取失败"]
    : completeness.percent >= 80
      ? ["正常", "success", `完整度 ${completeness.percent}%`]
      : ["待完善", "warning", `完整度 ${completeness.percent}%（${completeness.done}/${completeness.total} 项）`]);
  setStatusCard("#dashVideoStatus", "#dashVideoSub", !video
    ? ["—", "muted", "能力状态不可用"]
    : video.enabled
      ? ["已开启", "success", `限额 ${video.effective_limit_mb} MB`]
      : ["未开启", "muted", `限额 ${video.effective_limit_mb} MB`]);
}

function renderTenantTodos({ overview, sync, quota, completeness }) {
  const todos = [];
  if (quota?.subscribed && quota.ratio <= 0.2) {
    todos.push({ tone: "warning", title: `成员额度仅剩 ${formatCount(quota.remaining)} 个，请及时扩容`, action: "版本与额度", page: "tenant-billing" });
  }
  if (completeness && (!completeness.published || completeness.percent < 80)) {
    todos.push({
      tone: "warning",
      title: !completeness.published ? "企业主页资料未发布" : `企业主页资料完整度 ${completeness.percent}%，待完善`,
      action: "企业主页",
      page: "tenant-company"
    });
  }
  const disabledCards = Math.max(0, Number(overview.card_count || 0) - Number(overview.active_card_count || 0));
  if (disabledCards > 0) {
    todos.push({ tone: "warning", title: `${formatCount(disabledCards)} 张成员名片已停用`, action: "成员与名片", page: "tenant-members" });
  }
  if (sync?.failedCount > 0) {
    todos.push({ tone: "danger", title: `${formatCount(sync.failedCount)} 条同步事件失败待处理`, time: sync.lastDoneAt ? formatDate(sync.lastDoneAt) : "", action: "同步与回调", page: "tenant-sync" });
  }
  const root = $("#tenantTodoList");
  if (!todos.length) {
    root.innerHTML = `<p class="hint">暂无待办事项</p>`;
    return;
  }
  root.replaceChildren(...todos.map(taskItem));
}

function taskItem(item) {
  const row = document.createElement("div");
  row.className = "task-item";
  const dot = document.createElement("span");
  dot.className = `risk-dot ${item.tone}`;
  const title = document.createElement("strong");
  title.textContent = item.title;
  const time = document.createElement("span");
  time.className = "task-time";
  time.textContent = item.time || "";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "link-btn";
  button.textContent = item.action;
  button.addEventListener("click", () => showPage(item.page));
  row.append(dot, title, time, button);
  return row;
}

function adminMemberListPath() {
  const params = new URLSearchParams({
    search: $("#memberSearch").value.trim(),
    status: $("#memberStatusFilter").value,
    limit: "50",
    offset: "0"
  });
  return `/admin/members?${params.toString()}`;
}

async function loadMembers() {
  const [overview, result] = await Promise.all([
    adminRequest("/admin/overview").catch(() => null),
    adminRequest(adminMemberListPath())
  ]);
  if (overview) state.tenantOverview = overview;
  applyTenantMemberControls(state.tenantOverview);
  state.members = result.items || [];
  $("#membersTotal").textContent = `${result.total || 0} 个成员`;
  renderRows($("#membersRows"), state.members, 8, (item) => [
    `<strong>${escapeHtml(item.display_name)}</strong>`,
    escapeHtml(item.title || "—"),
    escapeHtml(item.department || "—"),
    escapeHtml(maskMobile(item.mobile)),
    escapeHtml(maskEmail(item.email)),
    cardStatusTag(item.card_status),
    item.last_visit_at ? formatDate(item.last_visit_at) : "—",
    memberRowActions(item)
  ]);
  return result;
}

async function inviteLocalMember() {
  const displayName=window.prompt("请输入员工姓名");
  if(!displayName||!displayName.trim()) return;
  const result=await run("创建员工邀请",()=>adminRequest("/admin/local-enterprises/members/invitations",{method:"POST",body:{display_name:displayName.trim()}}));
  window.prompt("复制一次性邀请票据（24小时有效）",result.invitation_token||"");
  await loadMembers();
}

async function createEnterpriseJoinCode() {
  const result=await run("生成企业加入码",()=>adminRequest("/admin/local-enterprises/join-code",{method:"POST"}));
  renderJoinCode(result);
}

function renderJoinCode(result) {
  const root = $("#joinCodeResult");
  root.replaceChildren();
  if (!result.qr_code_data_url) {
    const error = document.createElement("div");
    error.className = "join-code-error";
    const title = document.createElement("strong");
    title.textContent = "企业加入码生成失败";
    const hint = document.createElement("p");
    hint.textContent = "后端未返回实际微信小程序码，请检查微信小程序 AppID/Secret 后重新生成。";
    error.append(title, hint);
    if (result.join_path) {
      const code = document.createElement("code");
      code.textContent = result.join_path;
      error.append(code);
    }
    root.append(error);
    return;
  }
  const shell = document.createElement("div");
  shell.className = "join-code-shell";

  const qrWrap = document.createElement("div");
  qrWrap.className = "join-code-qr";
  const image = document.createElement("img");
  image.src = result.qr_code_data_url;
  image.alt = "企业加入二维码";
  qrWrap.append(image);

  const meta = document.createElement("div");
  meta.className = "join-code-meta";
  const title = document.createElement("strong");
  title.textContent = "企业加入码";
  const hint = document.createElement("p");
  hint.textContent = "请使用微信扫码加入企业。";
  const expiry = document.createElement("span");
  expiry.textContent = `有效期至 ${formatDate(result.expires_at)}`;
  meta.append(title, hint, expiry);

  const actions = document.createElement("div");
  actions.className = "row-actions join-code-actions";
  actions.append(actionButton("下载二维码", () => {
    const link = document.createElement("a");
    link.href = result.qr_code_data_url;
    link.download = "enterprise-join-code.png";
    link.click();
  }, "secondary"));

  shell.append(qrWrap, meta, actions);
  root.append(shell);
}

async function loadJoinRequests() {
  const result=await adminRequest("/admin/local-enterprises/join-requests");
  renderRows($("#joinRequestRows"),result.items||[],4,item=>[
    `<strong>${escapeHtml(item.displayName||"")}</strong>`,tag(item.status,item.status==="approved"?"success":item.status==="pending"?"warning":"muted"),formatDate(item.createdAt),joinRequestActions(item)
  ]);
}

function joinRequestActions(item){const wrap=document.createElement("div");wrap.className="row-actions";if(item.status==="pending"){wrap.append(linkButton("批准",()=>reviewJoinRequest(item,"approved")));wrap.append(linkButton("拒绝",()=>reviewJoinRequest(item,"rejected"),"link-btn danger-link"));}return wrap;}
async function reviewJoinRequest(item,decision){await run("审批加入申请",()=>adminRequest(`/admin/local-enterprises/join-requests/${encodeURIComponent(item.id)}/review`,{method:"POST",body:{decision}}));await Promise.all([loadJoinRequests(),loadMembers()]);}

function memberRowActions(item) {
  const wrap = document.createElement("div");
  wrap.className = "row-actions";
  wrap.append(linkButton(item.card_status === "none" ? "创建名片" : "编辑", () => openMemberDrawer(item)));
  const nextStatus = item.card_status === "active" ? "disabled" : "active";
  const label = item.card_status === "active" ? "停用" : "启用";
  wrap.append(linkButton(label, () => updateMemberCardStatus(item, nextStatus), "link-btn"));
  wrap.append(linkButton("删除", () => deleteMember(item), "link-btn danger-link"));
  return wrap;
}

async function deleteMember(item) {
  const ok = await confirmAction({
    title: "确认删除成员",
    body: `将永久删除「${item.display_name}」的成员档案、名片及其访问记录。若该成员仍在企业微信通讯录中，下次同步会重新建档。`,
    danger: true
  });
  if (!ok) return;
  await run("删除成员", () => adminRequest(`/admin/members/${encodeURIComponent(item.member_identity_id)}`, { method: "DELETE" }));
  notify("成员已删除");
  await loadMembers();
}

function cardStatusTag(status) {
  if (status === "active") return tag("已启用", "success");
  if (status === "disabled") return tag("已停用", "muted");
  return tag("未创建", "warning");
}

// 展示层掩码：手机保留前 3 后 4，邮箱保留首字符与域名；空值显示 —
function maskMobile(value) {
  const text = String(value || "").trim();
  if (!text) return "—";
  if (text.length <= 7) return `${text.slice(0, 2)}****`;
  return `${text.slice(0, 3)}****${text.slice(-4)}`;
}

function maskEmail(value) {
  const text = String(value || "").trim();
  if (!text) return "—";
  const at = text.indexOf("@");
  if (at <= 0) return `${text[0]}***`;
  return `${text[0]}***${text.slice(at)}`;
}
function actionButton(label, handler, className = "secondary", permission = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  if (!hasPermission(permission)) {
    button.disabled = true;
    button.title = "当前管理员没有此操作权限";
  }
  button.addEventListener("click", handler);
  return button;
}

async function openMemberDrawer(item) {
  const card = await run("读取名片", () => adminRequest(`/admin/members/${encodeURIComponent(item.member_identity_id)}/card`));
  state.selectedMemberId = item.member_identity_id;
  state.memberCard = card;
  drawerTitle.textContent = item.display_name;
  drawerSubtitle.textContent = item.card_status === "none" ? "创建成员名片" : "成员名片编辑";
  drawerBody.innerHTML = `
    <form id="cardForm" class="form-grid">
      <label><span>姓名</span><input name="display_name" required value="${escapeAttr(card.display_name || "")}" /></label>
      <label><span>职位</span><input name="title" value="${escapeAttr(card.title || "")}" /></label>
      <label><span>手机号</span><input name="mobile" value="${escapeAttr(card.fields?.mobile || "")}" /></label>
      <label><span>座机</span><input name="phone" value="${escapeAttr(card.fields?.phone || "")}" /></label>
      <label><span>邮箱</span><input name="email" type="email" value="${escapeAttr(card.fields?.email || "")}" /></label>
      <label><span>微信号</span><input name="wechat_id" value="${escapeAttr(card.fields?.wechat_id || "")}" /></label>
      <label><span>状态</span><select name="status"><option value="active">启用</option><option value="disabled">停用</option></select></label>
      <label class="wide"><span>地址</span><input name="address" value="${escapeAttr(card.fields?.address || "")}" /></label>
      <label class="check-line"><input name="show_mobile" type="checkbox" /> 展示手机</label>
      <label class="check-line"><input name="show_email" type="checkbox" /> 展示邮箱</label>
      <label class="check-line"><input name="show_wechat" type="checkbox" /> 展示微信</label>
      <label class="check-line"><input name="allow_forward" type="checkbox" /> 允许转发</label>
    </form>
  `;
  const form = $("#cardForm", drawerBody);
  form.status.value = card.status || "active";
  form.show_mobile.checked = Boolean(card.privacy?.show_mobile);
  form.show_email.checked = Boolean(card.privacy?.show_email);
  form.show_wechat.checked = Boolean(card.privacy?.show_wechat);
  form.allow_forward.checked = card.privacy?.allow_forward !== false;
  drawerFooter.replaceChildren(actionButton(card.card_id ? "保存名片" : "创建名片", saveMemberCard, "secondary", "tenant.member.card.write"));
  showDrawer();
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

async function saveMemberCard() {
  if (!requirePermission("tenant.member.card.write")) return;
  const form = $("#cardForm", drawerBody);
  if (!form.reportValidity()) return;
  const payload = {
    display_name: form.display_name.value.trim(),
    title: form.title.value.trim() || null,
    status: form.status.value,
    fields: {
      mobile: form.mobile.value.trim() || null,
      phone: form.phone.value.trim() || null,
      email: form.email.value.trim() || null,
      wechat_id: form.wechat_id.value.trim() || null,
      address: form.address.value.trim() || null
    },
    privacy: {
      show_mobile: form.show_mobile.checked,
      show_email: form.show_email.checked,
      show_wechat: form.show_wechat.checked,
      allow_forward: form.allow_forward.checked
    }
  };
  await run("保存名片", () => adminRequest(`/admin/members/${encodeURIComponent(state.selectedMemberId)}/card`, {
    method: "PUT",
    body: payload
  }));
  notify("名片已保存");
  closeDrawer();
  await loadMembers();
}

async function updateMemberCardStatus(item, status) {
  if (!requirePermission("tenant.member.card.write")) return;
  const label = status === "active" ? "启用名片" : "停用名片";
  const ok = await confirmAction({
    title: `确认${label}`,
    body: status === "active"
      ? `将为「${item.display_name}」创建或启用默认名片。`
      : `将停用「${item.display_name}」的默认名片，公开访问将不可用。`,
    danger: status === "disabled"
  });
  if (!ok) return;
  await run(label, () => adminRequest(`/admin/members/${encodeURIComponent(item.member_identity_id)}/card`, {
    method: "PUT",
    body: {
      display_name: item.display_name,
      title: item.title || null,
      status
    }
  }));
  notify(`${label}完成`);
  await loadMembers();
}

async function loadCompanyProfileBundle() {
  const [profile, capability, honors, videos, templates] = await Promise.all([
    adminRequest("/admin/company-profile"),
    adminRequest("/admin/features/company-video").catch(() => null),
    adminRequest("/admin/company-honors").catch(() => ({ items: [] })),
    adminRequest("/admin/company-videos").catch(() => ({ items: [] })),
    adminRequest("/admin/templates").catch(() => ({ items: [] }))
  ]);
  state.videoCapability = capability;
  state.companyHonors = honors.items || [];
  state.companyVideos = videos.items || [];
  state.templates = templates.items || [];
  syncCompanyBrandFromDefaultTemplate();
  state.deletedHonorIds = [];
  fillCompany(profile);
  return { profile, capability, honors, videos, templates };
}

async function loadCompanyProfileOnly() {
  const profile = await adminRequest("/admin/company-profile");
  fillCompany(profile);
  return profile;
}

function fillCompany(profile) {
  state.companyProfile = normalizeCompanyProfile(profile);
  state.companyDirty = false;
  const form = $("#companyForm");
  form.display_name.value = profile.display_name || "";
  form.short_name.value = profile.short_name || "";
  form.logo_url.value = profile.logo_url || "";
  form.website_url.value = profile.website_url || "";
  form.address.value = profile.address || "";
  form.status.value = profile.status || "draft";
  form.visible.checked = Boolean(profile.visible);
  renderCompanyLogoPreview();
  renderCompanyEditors();
  renderCompanyPreview();
  renderCompanyCompleteness();
  applyCompanyPreviewStyle();
  applyCompanyPermission();
  renderCompanyDirtyState();
  $("#companyStatusTag").innerHTML = profile.status === "published" ? tag("已发布", "success") : tag("草稿", "warning");
}

function input(value, key, index, group, placeholder = "", type = "text") {
  const node = document.createElement(type === "textarea" ? "textarea" : "input");
  if (type !== "textarea") node.type = type;
  node.value = value ?? "";
  node.placeholder = placeholder;
  node.dataset.key = key;
  node.dataset.index = index;
  node.dataset.group = group;
  return node;
}

function normalizeCompanyProfile(profile = {}) {
  return {
    ...structuredClone(profile),
    display_modules: normalizeCompanyModules(profile.display_modules || []),
    intro_blocks: Array.isArray(profile.intro_blocks) ? structuredClone(profile.intro_blocks) : [],
    service_items: Array.isArray(profile.service_items) ? structuredClone(profile.service_items) : []
  };
}

function normalizeCompanyModules(modules = []) {
  const byKey = new Map((modules || []).map((module) => [module.key, module]));
  return COMPANY_MODULE_DEFAULTS.map((fallback, index) => ({
    ...fallback,
    ...(byKey.get(fallback.key) || {}),
    visible: byKey.has(fallback.key) ? byKey.get(fallback.key).visible !== false : fallback.visible,
    sort_order: Number(byKey.get(fallback.key)?.sort_order ?? fallback.sort_order ?? index * 10),
    layout: byKey.get(fallback.key)?.layout || fallback.layout
  })).sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
}

function companyTabMeta(key = state.companyActiveTab) {
  return COMPANY_BUILDER_TABS.find((item) => item.key === key) || COMPANY_BUILDER_TABS[0];
}

function companyModuleByKey(key) {
  return (state.companyProfile?.display_modules || []).find((item) => item.key === key);
}

function companyModuleForTab(key = state.companyActiveTab) {
  const meta = companyTabMeta(key);
  return meta.moduleKey ? companyModuleByKey(meta.moduleKey) : null;
}

function sortedCompanyModules() {
  return [...(state.companyProfile?.display_modules || [])].sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
}

function sortedCompanyVideos() {
  return [...(state.companyVideos || [])].sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
}

function selectableCompanyVideos() {
  return sortedCompanyVideos().filter((item) => item.visible !== false && item.status === "published");
}

function companyVideoTitle(videoId) {
  const item = (state.companyVideos || []).find((video) => String(video.video_id || "") === String(videoId || ""));
  return item ? item.title : "";
}

function markCompanyDirty() {
  state.companyDirty = true;
  renderCompanyDirtyState();
}

function defaultCompanyTemplate() {
  return (state.templates || []).find((item) => item.is_default)
    || (state.templates || []).find((item) => item.status === "active")
    || state.templates?.[0]
    || null;
}

function syncCompanyBrandFromDefaultTemplate() {
  const template = defaultCompanyTemplate();
  state.companyPreviewBrand = normalizeHexColor(template?.color_scheme?.primary, "#5272d6");
}

function updateDefaultTemplateBrand(primary) {
  const template = defaultCompanyTemplate();
  if (!template) return false;
  const color = normalizeHexColor(primary);
  if (!color) return false;
  template.color_scheme = { ...(template.color_scheme || {}), primary: color };
  state.companyPreviewBrand = color;
  return true;
}

async function saveDefaultTemplateBrand() {
  const template = defaultCompanyTemplate();
  if (!template) return null;
  const updated = await adminRequest(`/admin/templates/${encodeURIComponent(template.template_id)}`, {
    method: "PUT",
    body: templateRecordPayload(template)
  });
  state.templates = state.templates.map((item) => item.template_id === updated.template_id ? updated : item);
  syncCompanyBrandFromDefaultTemplate();
  return updated;
}

function renderCompanyDirtyState() {
  const node = $("#companyDirtyTag");
  if (!node) return;
  node.classList.toggle("hidden", !state.companyDirty);
}

function applyCompanyPreviewStyle() {
  const shell = $("#companyBuilderShell");
  if (!shell) return;
  shell.classList.remove("company-style-classic", "company-style-plain", "company-style-dark");
  shell.classList.add(`company-style-${state.companyPreviewStyle}`);
  const brand = brandTokens(state.companyPreviewBrand);
  shell.style.setProperty("--brand", brand.brand);
  shell.style.setProperty("--brand-strong", brand.strong);
  shell.style.setProperty("--brand-bright", brand.bright);
  shell.style.setProperty("--brand-soft", brand.soft);
  shell.style.setProperty("--brand-ring", brand.ring);
  $$(".builder-style-card").forEach((node) => {
    node.classList.toggle("builder-style-card--active", node.dataset.companyStyle === state.companyPreviewStyle);
  });
  $$(".builder-swatches button").forEach((node) => {
    node.classList.toggle("active", normalizeHexColor(node.dataset.companyBrand) === state.companyPreviewBrand);
  });
  const colorInput = $("#companyBrandColor");
  if (colorInput && document.activeElement !== colorInput) colorInput.value = state.companyPreviewBrand;
}

function publishCheckRows() {
  const form = $("#companyForm");
  const profile = state.companyProfile || {};
  const checks = [
    {
      ok: [form?.display_name?.value, form?.logo_url?.value, form?.website_url?.value, form?.address?.value]
        .every((value) => String(value || "").trim()),
      title: "基础资料",
      detail: "企业名称、Logo、官网和地址会展示在主页头部。"
    },
    {
      ok: (profile.intro_blocks || []).length > 0,
      title: "企业简介",
      detail: `${(profile.intro_blocks || []).length} 个内容块。`
    },
    {
      ok: (profile.service_items || []).some((item) => item.visible !== false),
      title: "服务项目",
      detail: `${(profile.service_items || []).filter((item) => item.visible !== false).length} 项对访客展示。`
    },
    {
      ok: !state.videoCapability?.enabled || selectableCompanyVideos().length > 0,
      title: "企业视频",
      detail: state.videoCapability?.enabled
        ? (selectableCompanyVideos().length ? `${selectableCompanyVideos().length} 个已发布视频。` : "未选择视频，发布后该模块不展示。")
        : "视频能力未开通，自动跳过。"
    },
    {
      ok: (state.companyHonors || []).some((item) => item.visible !== false && item.status === "published"),
      title: "荣誉资质",
      detail: `${(state.companyHonors || []).filter((item) => item.visible !== false).length} 项荣誉。`
    }
  ];
  return checks;
}

function openCompanyPublishDialog() {
  syncCompanyEditors();
  const list = $("#companyPublishChecks");
  if (list) {
    list.replaceChildren(...publishCheckRows().map((item) => {
      const row = document.createElement("div");
      row.className = `publish-check-row ${item.ok ? "" : "is-warning"}`;
      row.innerHTML = `<span class="publish-check-dot"></span><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.detail)}</small></span>`;
      return row;
    }));
  }
  $("#companyPublishDialog")?.classList.remove("hidden");
}

function closeCompanyPublishDialog() {
  $("#companyPublishDialog")?.classList.add("hidden");
}

function showCompanyVisitorPreview() {
  $(".company-phone")?.scrollIntoView({ behavior: "smooth", block: "center" });
  notify("中间手机视图已按访客视角预览，发布后访客端生效");
}

function companyTabStatus(key) {
  const form = $("#companyForm");
  const profile = state.companyProfile || {};
  if (key === "base") {
    const missing = [form?.display_name?.value, form?.logo_url?.value, form?.website_url?.value, form?.address?.value].filter((value) => !String(value || "").trim()).length;
    return missing ? { text: "待完善", tone: "warning", summary: `${4 - missing}/4 项` } : { text: "已完善", tone: "success", summary: "基础资料完整" };
  }
  if (key === "intro") {
    const count = (profile.intro_blocks || []).length;
    return count ? { text: "已完善", tone: "success", summary: `${count} 个内容块` } : { text: "缺内容", tone: "warning", summary: "未配置内容块" };
  }
  if (key === "services") {
    const count = (profile.service_items || []).filter((item) => item.visible !== false).length;
    return count ? { text: "已完善", tone: "success", summary: `${count} 项服务` } : { text: "缺内容", tone: "warning", summary: "未配置服务" };
  }
  if (key === "video") {
    if (state.videoCapability && !state.videoCapability.enabled) return { text: "未开通", tone: "muted", summary: "视频能力未开启" };
    const count = selectableCompanyVideos().length;
    return count ? { text: "可展示", tone: "success", summary: `${count} 个已发布视频` } : { text: "待选择", tone: "warning", summary: "暂无已发布视频" };
  }
  const honors = state.companyHonors || [];
  if (!honors.length) return { text: "缺内容", tone: "warning", summary: "未配置荣誉" };
  return { text: "已完善", tone: "success", summary: `${honors.length} 项荣誉` };
}

function renderCompanyLogoPreview() {
  const form = $("#companyForm");
  const preview = $("#companyLogoPreview");
  if (!form || !preview) return;
  preview.replaceChildren();
  const url = form.logo_url.value.trim();
  if (url) {
    const image = document.createElement("img");
    image.src = mediaUrl(url);
    image.alt = "企业 LOGO";
    preview.append(image);
    return;
  }
  preview.textContent = (form.display_name.value.trim() || "企").charAt(0);
}

function renderCompanyStructure() {
  const root = $("#companyStructure");
  if (!root) return;
  root.replaceChildren(...COMPANY_BUILDER_TABS.map((meta) => {
    const status = companyTabStatus(meta.key);
    const row = document.createElement("div");
    row.className = `builder-structure-item ${state.companyActiveTab === meta.key ? "active" : ""}`;
    row.dataset.companyTab = meta.key;
    row.tabIndex = 0;

    const grip = document.createElement("span");
    grip.className = "builder-grip";
    grip.textContent = "::";

    const main = document.createElement("div");
    main.className = "builder-structure-main";
    const title = document.createElement("strong");
    title.textContent = meta.title;
    const summary = document.createElement("small");
    summary.textContent = status.summary;
    main.append(title, summary);

    const stateNode = document.createElement("span");
    stateNode.className = "builder-structure-status";
    stateNode.innerHTML = tag(status.text, status.tone);

    row.append(grip, main, stateNode);
    const module = meta.moduleKey ? companyModuleByKey(meta.moduleKey) : null;
    if (module) {
      const label = document.createElement("label");
      label.className = "builder-switch";
      label.title = module.visible === false ? "当前模块对访客隐藏" : "当前模块对访客展示";
      const toggle = document.createElement("input");
      toggle.type = "checkbox";
      toggle.checked = module.visible !== false;
      toggle.dataset.companyModuleVisible = module.key;
      label.append(toggle, document.createElement("i"));
      row.append(label);
    }
    return row;
  }));
}

function selectCompanyTab(key = "base") {
  state.companyActiveTab = companyTabMeta(key).key;
  const meta = companyTabMeta(state.companyActiveTab);
  $$("#companyStructure [data-company-tab]").forEach((node) => {
    node.classList.toggle("active", node.dataset.companyTab === state.companyActiveTab);
  });
  $$("#companyEditorPanels [data-company-panel]").forEach((node) => {
    node.classList.toggle("active", node.dataset.companyPanel === meta.panel);
  });
  $("#companyTabTitle").textContent = meta.title;
  $("#companyPanelHint").textContent = meta.hint;
  const status = companyTabStatus(state.companyActiveTab);
  $("#companyPanelStatus").innerHTML = tag(status.text, status.tone);
}

function renderServiceLayoutChoices() {
  renderCompanyLayoutChoices("#serviceLayoutChoices", "services", "serviceLayout");
}

function renderHonorLayoutChoices() {
  renderCompanyLayoutChoices("#honorLayoutChoices", "honors", "honorLayout");
}

function renderCompanyLayoutChoices(rootSelector, moduleKey, dataKey) {
  const root = $(rootSelector);
  const module = companyModuleByKey(moduleKey);
  if (!root || !module) return;
  root.replaceChildren(...COMPANY_LAYOUTS.map((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `layout-choice ${module.layout === item.value ? "active" : ""}`;
    button.dataset[dataKey] = item.value;
    button.innerHTML = `<strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.desc)}</small>`;
    return button;
  }));
}

function renderCompanyEditors() {
  const profile = state.companyProfile || { display_modules: [], service_items: [], intro_blocks: [] };
  profile.display_modules = normalizeCompanyModules(profile.display_modules || []);
  renderCompanyStructure();
  renderServiceLayoutChoices();
  renderHonorLayoutChoices();
  renderIntroEditor();
  renderServiceEditor();
  renderHonorEditors();
  const videoHint = $("#videoCapabilityHint");
  const addVideo = $("#addVideo");
  addVideo.disabled = !state.videoCapability?.enabled || !selectableCompanyVideos().length;
  videoHint.textContent = state.videoCapability?.enabled
    ? `视频能力已开通，上限 ${state.videoCapability.effective_limit_mb} MB；视频块从已发布视频中选择。`
    : "视频是高级功能，当前企业未开通时不会提交视频模块。";
  renderVideoPanel();
  selectCompanyTab(state.companyActiveTab);
  renderCompanyPreview();
  renderCompanyCompleteness();
  applyCompanyPermission();
}

function editorCard({ type, title, summary, index, actions = [] }) {
  const row = document.createElement("div");
  row.className = `builder-item builder-item--${type}`;
  const head = document.createElement("div");
  head.className = "builder-item-head";
  const label = document.createElement("span");
  label.className = "builder-type";
  label.textContent = type;
  const main = document.createElement("div");
  main.className = "builder-item-main";
  const strong = document.createElement("strong");
  strong.textContent = title;
  const small = document.createElement("small");
  small.textContent = summary || "";
  main.append(strong, small);
  const controls = document.createElement("div");
  controls.className = "builder-item-actions";
  actions.forEach((button) => controls.append(button));
  head.append(label, main, controls);
  if (Number.isInteger(index)) row.dataset.index = String(index);
  row.append(head);
  return row;
}

function renderEmptyEditor(root, text) {
  root.innerHTML = `<div class="builder-empty">${escapeHtml(text)}</div>`;
}

function renderIntroEditor() {
  const root = $("#introEditor");
  const blocks = state.companyProfile?.intro_blocks || [];
  if (!root) return;
  if (!blocks.length) {
    renderEmptyEditor(root, "暂无内容块，先添加段落、图片或引用。");
    return;
  }
  root.replaceChildren(...blocks.map((item, index) => {
    const label = companyIntroLabel(item.type);
    const row = editorCard({
      type: label,
      title: companyIntroTitle(item),
      summary: companyIntroSummary(item),
      index,
      actions: [
        actionButton("上移", () => moveCompanyArrayItem("intro_blocks", index, -1), "ghost compact"),
        actionButton("下移", () => moveCompanyArrayItem("intro_blocks", index, 1), "ghost compact"),
        actionButton("删除", () => deleteCompanyIntroBlock(index), "ghost danger-lite compact")
      ]
    });
    if (["heading", "paragraph", "quote"].includes(item.type)) {
      const text = input(item.text, "text", index, "intro", "填写内容", "textarea");
      text.className = "builder-textarea";
      row.append(text);
    } else if (item.type === "image") {
      row.append(companyAssetEditor({
        value: item.url,
        caption: item.caption,
        index,
        group: "intro",
        urlKey: "url",
        captionKey: "caption",
        category: "company-images",
        label: "正文图片"
      }));
    } else if (item.type === "gallery") {
      row.append(galleryEditor(item, index));
    } else if (item.type === "video") {
      row.append(videoPickerEditor(item, index));
    } else if (item.type === "list") {
      const text = input((item.items || []).join("\n"), "items", index, "intro", "每行一项", "textarea");
      text.className = "builder-textarea";
      row.append(text);
    }
    return row;
  }));
}

function renderServiceEditor() {
  const root = $("#serviceEditor");
  const services = state.companyProfile?.service_items || [];
  if (!root) return;
  if (!services.length) {
    renderEmptyEditor(root, "暂无服务项目，点击上方按钮添加。");
    return;
  }
  root.replaceChildren(...services.map((item, index) => {
    const row = editorCard({
      type: "服务",
      title: item.title || "未命名服务",
      summary: item.visible === false ? "对访客隐藏" : (item.description || "已展示"),
      index,
      actions: [
        actionButton("上移", () => moveCompanyArrayItem("service_items", index, -1), "ghost compact"),
        actionButton("下移", () => moveCompanyArrayItem("service_items", index, 1), "ghost compact"),
        actionButton("删除", () => deleteCompanyService(index), "ghost danger-lite compact")
      ]
    });
    const title = input(item.title, "title", index, "service", "服务名称");
    title.className = "builder-input";
    const desc = input(item.description, "description", index, "service", "一句话说明这项服务", "textarea");
    desc.className = "builder-textarea";
    const visible = input("", "visible", index, "service", "", "checkbox");
    visible.checked = item.visible !== false;
    const visibleLabel = document.createElement("label");
    visibleLabel.className = "check-line";
    visibleLabel.append(visible, document.createTextNode("对访客展示"));
    row.append(title, desc, companyAssetEditor({
      value: item.image_url,
      index,
      group: "service",
      urlKey: "image_url",
      category: "company-images",
      label: "服务图片"
    }), visibleLabel);
    return row;
  }));
}

function galleryEditor(item, index) {
  const wrap = document.createElement("div");
  wrap.className = "gallery-editor";
  const images = item.images || [];
  const grid = document.createElement("div");
  grid.className = "gallery-editor-grid";
  images.forEach((image, imageIndex) => {
    const cell = document.createElement("div");
    cell.className = "gallery-editor-item";
    cell.innerHTML = image.url ? `<img src="${escapeAttr(mediaUrl(image.url))}" alt="" />` : `<span>图片</span>`;
    const caption = input(image.caption || "", "caption", index, "intro-gallery", "图片说明");
    caption.dataset.imageIndex = imageIndex;
    const remove = actionButton("删除", () => {
      syncCompanyEditors();
      const current = state.companyProfile.intro_blocks[index];
      current.images = (current.images || []).filter((_, itemIndex) => itemIndex !== imageIndex);
      markCompanyDirty();
      renderCompanyEditors();
    }, "ghost danger-lite compact");
    cell.append(caption, remove);
    grid.append(cell);
  });
  const upload = actionButton("+ 上传图片", async () => {
    await uploadIntroGalleryImages(index);
  }, "secondary");
  wrap.append(grid, upload);
  return wrap;
}

function videoPickerEditor(item, index) {
  const wrap = document.createElement("div");
  wrap.className = "video-picker";
  const hidden = input(item.video_id || "", "video_id", index, "intro", "", "hidden");
  wrap.append(hidden);
  const videos = selectableCompanyVideos();
  if (!videos.length) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = "暂无已发布视频，请先在企业视频中上传并发布。";
    wrap.append(empty);
    return wrap;
  }
  videos.forEach((video) => {
    const label = document.createElement("label");
    label.className = `video-choice ${String(item.video_id || "") === String(video.video_id || "") ? "active" : ""}`;
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = `company-intro-video-${index}`;
    radio.value = video.video_id;
    radio.checked = String(item.video_id || "") === String(video.video_id || "");
    radio.dataset.group = "intro";
    radio.dataset.key = "video_id";
    radio.dataset.index = index;
    const body = document.createElement("span");
    body.innerHTML = `<strong>${escapeHtml(video.title || "未命名视频")}</strong><small>${escapeHtml(video.status === "published" ? "已发布" : "草稿")}</small>`;
    label.append(radio, body);
    wrap.append(label);
  });
  return wrap;
}

function companyAssetEditor({ value, caption = "", index, group, urlKey, captionKey = "", category, label }) {
  const wrap = document.createElement("div");
  wrap.className = "asset-editor";
  const hidden = input(value || "", urlKey, index, group, "", "hidden");
  wrap.append(hidden);
  const preview = document.createElement("div");
  preview.className = "asset-editor-preview";
  if (value) preview.innerHTML = `<img src="${escapeAttr(mediaUrl(value))}" alt="" />`;
  else preview.textContent = label || "图片";
  const actions = document.createElement("div");
  actions.className = "asset-editor-actions";
  actions.append(
    actionButton(value ? "替换图片" : "上传图片", async () => {
      await uploadCompanyImageInto({ group, index, urlKey, category });
    }, "secondary"),
    actionButton("清除", () => {
      syncCompanyEditors();
      setCompanyEditorValue({ group, index, key: urlKey, value: null });
      markCompanyDirty();
      renderCompanyEditors();
    }, "ghost")
  );
  wrap.append(preview, actions);
  if (captionKey) {
    const captionInput = input(caption || "", captionKey, index, group, "图片说明");
    captionInput.className = "builder-input";
    wrap.append(captionInput);
  }
  return wrap;
}

function companyIntroLabel(type) {
  const found = COMPANY_INTRO_TYPES.find((item) => item.type === type);
  return found ? found.label : type || "内容";
}

function companyIntroTitle(item) {
  if (["heading", "paragraph", "quote"].includes(item.type)) return String(item.text || "未填写内容").slice(0, 26);
  if (item.type === "image") return item.caption || "正文图片";
  if (item.type === "gallery") return "图集";
  if (item.type === "video") return companyVideoTitle(item.video_id) || "企业视频";
  if (item.type === "list") return "列表";
  return "内容块";
}

function companyIntroSummary(item) {
  if (item.type === "gallery") return `${(item.images || []).length} 张图片`;
  if (item.type === "video") return item.video_id ? "已选择视频" : "未选择视频";
  if (item.type === "list") return `${(item.items || []).length} 项`;
  return "";
}

function syncCompanyEditors() {
  const profile = state.companyProfile;
  if (!profile) return;
  $$('[data-group="module"]').forEach((node) => {
    const item = sortedCompanyModules()[Number(node.dataset.index)];
    if (!item) return;
    item[node.dataset.key] = node.type === "checkbox" ? node.checked : node.value;
  });
  $$('[data-group="service"]').forEach((node) => {
    const item = profile.service_items[Number(node.dataset.index)];
    if (!item) return;
    item[node.dataset.key] = node.type === "checkbox" ? node.checked : (node.value || null);
  });
  $$('[data-group="intro"]').forEach((node) => {
    const item = profile.intro_blocks[Number(node.dataset.index)];
    if (!item) return;
    if (node.dataset.key === "images") {
      item.images = node.value.split(/\n/).filter(Boolean).map((line) => {
        const [url, ...caption] = line.split("|");
        return { url: url.trim(), caption: caption.join("|").trim() };
      });
    } else if (node.dataset.key === "items") {
      item.items = node.value.split(/\n/).map((line) => line.trim()).filter(Boolean);
    } else {
      item[node.dataset.key] = node.type === "radio" ? (node.checked ? node.value : item[node.dataset.key]) : node.value;
    }
  });
  $$('[data-group="intro-gallery"]').forEach((node) => {
    const item = profile.intro_blocks[Number(node.dataset.index)];
    const image = item?.images?.[Number(node.dataset.imageIndex)];
    if (image) image[node.dataset.key] = node.value;
  });
  resequenceCompanyProfile();
}

function companyPayloadFromForm() {
  syncCompanyEditors();
  const form = $("#companyForm");
  return {
    display_name: form.display_name.value.trim(),
    short_name: form.short_name.value.trim() || null,
    logo_url: form.logo_url.value.trim() || null,
    website_url: normalizeWebsiteUrl(form.website_url.value),
    address: form.address.value.trim() || null,
    visible: form.visible.checked,
    status: form.status.value,
    intro_blocks: cleanIntroBlocksForPayload(state.companyProfile.intro_blocks),
    service_items: cleanServicesForPayload(state.companyProfile.service_items),
    display_modules: normalizeCompanyModules(state.companyProfile.display_modules)
  };
}

function renderCompanyPreview() {
  const form = $("#companyForm");
  const name = form.display_name.value.trim();
  $("#previewCompanyName").textContent = name || "企业名称";
  $("#previewCompanyShort").textContent = form.short_name.value.trim() || form.website_url.value.trim() || "--";
  const logo = $("#previewCompanyLogo");
  const logoUrl = form.logo_url.value.trim();
  if (logoUrl) {
    logo.src = mediaUrl(logoUrl);
    logo.classList.remove("hidden");
  } else {
    logo.removeAttribute("src");
    logo.classList.add("hidden");
  }
  $("#previewCompanyInitial").textContent = (name || "企").charAt(0);
  renderCompanyLogoPreview();
  const profile = state.companyProfile || {};
  const textBlock = (profile.intro_blocks || []).find((block) => ["heading", "paragraph", "quote"].includes(block.type) && String(block.text || "").trim());
  $("#previewCompanyBasics").innerHTML = [
    form.address.value.trim(),
    form.website_url.value.trim()
  ].filter(Boolean).map((item) => `<span>${escapeHtml(item)}</span>`).join("");
  const root = $("#previewModules");
  const modules = sortedCompanyModules();
  root.replaceChildren(...modules.filter((item) => item.visible).map((item) => previewModule(item, textBlock)));
}

function previewModule(module, textBlock) {
  const card = document.createElement("section");
  card.className = `preview-module preview-module--${module.key}`;
  card.dataset.previewTab = COMPANY_BUILDER_TABS.find((item) => item.moduleKey === module.key)?.key || "";
  const title = document.createElement("h4");
  title.textContent = module.title;
  card.append(title);
  if (module.key === "profile") {
    const paragraph = document.createElement("p");
    paragraph.textContent = textBlock ? String(textBlock.text).slice(0, 86) : "点击右侧添加段落、图片、引用等内容块。";
    card.append(paragraph);
    const media = (state.companyProfile?.intro_blocks || []).find((block) => block.type === "image" || block.type === "gallery");
    if (media) {
      const box = document.createElement("div");
      box.className = "preview-media-box";
      const url = media.type === "image" ? media.url : media.images?.[0]?.url;
      if (url) box.innerHTML = `<img src="${escapeAttr(mediaUrl(url))}" alt="" />`;
      else box.textContent = "图片";
      card.append(box);
    }
  } else if (module.key === "services") {
    const services = (state.companyProfile?.service_items || []).filter((item) => item.visible !== false).slice(0, 4);
    card.append(previewServices(services, module.layout));
  } else if (module.key === "videos") {
    const video = selectableCompanyVideos()[0];
    if (video) {
      const box = document.createElement("div");
      box.className = "preview-video-card";
      if (video.cover_url) box.innerHTML = `<img src="${escapeAttr(mediaUrl(video.cover_url))}" alt="" />`;
      const play = document.createElement("span");
      play.className = "preview-video-play";
      const titleNode = document.createElement("strong");
      titleNode.className = "preview-video-title";
      titleNode.textContent = video.title || "企业视频";
      box.append(play, titleNode);
      card.append(box);
    } else {
      card.append(previewList([], "未选择视频，发布后访客不可见", () => []));
    }
  } else if (module.key === "honors") {
    const honors = (state.companyHonors || []).filter((item) => item.visible !== false).slice(0, 4);
    card.append(previewServices(honors.map((item) => ({
      title: item.title || "荣誉资质",
      description: item.body || item.images?.[0]?.caption || `${(item.images || []).length} 张图片`,
      image_url: item.images?.[0]?.image_url || ""
    })), module.layout, "暂无荣誉资质"));
  }
  return card;
}

function previewServices(services, layout = "graphic", emptyText = "暂无服务项目") {
  const normalizedLayout = COMPANY_LAYOUTS.some((item) => item.value === layout) ? layout : "graphic";
  const wrap = document.createElement("div");
  wrap.className = `preview-services preview-services--${normalizedLayout}`;
  if (!services.length) {
    const empty = document.createElement("p");
    empty.className = "preview-empty";
    empty.textContent = emptyText;
    wrap.append(empty);
    return wrap;
  }
  services.forEach((item) => {
    const row = document.createElement("div");
    row.className = "preview-service-item";
    if (item.image_url && normalizedLayout !== "text") {
      const image = document.createElement("img");
      image.src = mediaUrl(item.image_url);
      image.alt = "";
      row.append(image);
    } else {
      row.classList.add("preview-service-item--no-image");
    }
    if (normalizedLayout !== "image") {
      const content = document.createElement("div");
      content.className = "preview-service-content";
      const title = document.createElement("strong");
      title.textContent = item.title || "未命名服务";
      content.append(title);
      if (["graphic", "grid", "carousel"].includes(normalizedLayout)) {
        const desc = document.createElement("span");
        desc.textContent = item.description || "一句话说明";
        content.append(desc);
      }
      row.append(content);
    }
    wrap.append(row);
  });
  return wrap;
}

function previewList(items, emptyText, formatter) {
  const wrap = document.createElement("div");
  wrap.className = "preview-list";
  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "preview-empty";
    empty.textContent = emptyText;
    wrap.append(empty);
    return wrap;
  }
  items.forEach((item) => {
    const [title, desc] = formatter(item);
    const row = document.createElement("div");
    row.className = "preview-list-item";
    row.innerHTML = `<strong>${escapeHtml(title)}</strong><span>${escapeHtml(desc || "")}</span>`;
    wrap.append(row);
  });
  return wrap;
}

// 完整度条：复用 profileCompleteness 的确定性规则，缺失项补充视频与荣誉图片检查。
function currentCompanySnapshot() {
  const form = $("#companyForm");
  const base = state.companyProfile || {};
  return {
    display_name: form.display_name.value.trim(),
    logo_url: form.logo_url.value.trim(),
    website_url: form.website_url.value.trim(),
    address: form.address.value.trim(),
    status: form.status.value,
    intro_blocks: base.intro_blocks || [],
    service_items: base.service_items || []
  };
}

function companyMissingItems(profile) {
  const missing = [];
  if (!profile.display_name) missing.push("企业名称未填写");
  if (!profile.logo_url) missing.push("Logo 未上传");
  if (!profile.website_url) missing.push("官网未填写");
  if (!profile.address) missing.push("地址未填写");
  if (!(profile.intro_blocks || []).length) missing.push("企业介绍未配置");
  if (!(profile.service_items || []).length) missing.push("服务未配置");
  const hasVideo = (profile.intro_blocks || []).some((block) => block.type === "video" && String(block.video_id || "").trim());
  if (state.videoCapability?.enabled && !hasVideo) missing.push("视频介绍未配置");
  const honors = state.companyHonors || [];
  if (!honors.length) missing.push("荣誉资质未配置");
  else if (!honors.some((honor) => (honor.images || []).length)) missing.push("荣誉资质图片未上传");
  return missing;
}

function renderCompanyCompleteness() {
  const result = profileCompleteness(currentCompanySnapshot());
  if (!result) return;
  $("#companyCompletenessValue").textContent = `${result.percent}%`;
  const bar = $("#companyCompletenessBar");
  bar.style.width = `${result.percent}%`;
  bar.classList.toggle("warn", result.percent < 80);
  const missing = companyMissingItems(currentCompanySnapshot());
  $("#companyCompletenessHint").textContent = missing.length ? `待完善：${missing.join(" · ")}` : "资料已完善，可以发布。";
}

function renderVideoPanel() {
  const root = $("#videoPanel");
  if (!root) return;
  const capability = state.videoCapability;
  if (!capability) {
    root.innerHTML = `<p class="hint">视频能力状态读取失败，请重新读取主页。</p>`;
    return;
  }
  if (!capability.enabled) {
    root.innerHTML = `
      <div class="video-status">${tag("未开启", "muted")}</div>
      <p>企业视频是高级功能，当前企业未开通。开通后可在「介绍」标签页添加视频块，并展示在企业主页。</p>
      <p class="hint">如需开通，请联系平台或服务商升级版本。</p>`;
    return;
  }
  const published = selectableCompanyVideos();
  const header = document.createElement("div");
  header.className = "video-status";
  header.innerHTML = `${tag("已开启", "success")}<span class="hint">从已发布视频中选择，不需要填写视频编号。</span>`;
  root.replaceChildren(header);
  if (!published.length) {
    const empty = document.createElement("div");
    empty.className = "builder-empty";
    empty.textContent = "暂无已发布视频。视频上传和审核完成后，会自动出现在这里供选择。";
    root.append(empty);
    return;
  }
  const card = document.createElement("div");
  card.className = "video-feature-card";
  const current = published[0];
  const currentRow = document.createElement("div");
  currentRow.className = "video-feature-current";
  const thumb = document.createElement("div");
  thumb.className = "video-feature-thumb";
  if (current.cover_url) thumb.innerHTML = `<img src="${escapeAttr(mediaUrl(current.cover_url))}" alt="" />`;
  const main = document.createElement("div");
  main.className = "video-feature-main";
  main.innerHTML = `<strong>${escapeHtml(current.title || "企业视频")}</strong><small>当前展示 · 已通过审核</small>`;
  currentRow.append(thumb, main, actionButton("引用到简介", () => addIntroVideoBlock(current.video_id), "secondary compact"));
  card.append(currentRow);
  const choices = document.createElement("div");
  choices.className = "video-picker";
  published.slice(0, 6).forEach((video) => {
    const choice = document.createElement("button");
    choice.type = "button";
    choice.className = "video-choice";
    choice.innerHTML = `<span class="video-feature-thumb">${video.cover_url ? `<img src="${escapeAttr(mediaUrl(video.cover_url))}" alt="" />` : ""}</span><span><strong>${escapeHtml(video.title || "未命名视频")}</strong><small>已发布，可引用到企业简介</small></span>`;
    choice.addEventListener("click", () => addIntroVideoBlock(video.video_id));
    choices.append(choice);
  });
  card.append(choices);
  root.append(card);
  const hint = document.createElement("p");
  hint.className = "hint";
  hint.textContent = `当前可展示 ${published.length} 个已发布视频；公开页的视频模块会按视频排序展示。`;
  root.append(hint);
}

function applyCompanyPermission() {
  const writable = hasPermission("tenant.company.write");
  ["#saveCompanyProfile", "#publishCompanyProfile", "#addService", "#addHeading", "#addParagraph", "#addImage", "#addGallery", "#addVideo", "#loadHonors", "#addHonor", "#saveHonors"].forEach((selector) => {
    const node = $(selector);
    if (node) node.classList.toggle("hidden", !writable);
  });
  $$("#companyForm input, #companyForm select, #companyForm textarea").forEach((node) => { node.disabled = !writable; });
  $$(".company-editor .editor-row input, .company-editor .editor-row textarea, .company-editor .editor-row button").forEach((node) => { node.disabled = !writable; });
}

function renderHonorEditors() {
  const root = $("#honorEditor");
  const honors = state.companyHonors || [];
  if (!honors.length) {
    renderEmptyEditor(root, "暂无荣誉资质，点击上方按钮添加。");
    return;
  }
  root.replaceChildren(...honors.map((honor, index) => {
    const row = editorCard({
      type: "荣誉",
      title: honor.title || "未命名荣誉",
      summary: honor.visible === false ? "对访客隐藏" : `${(honor.images || []).length} 张图片`,
      index,
      actions: [
        actionButton("上移", () => moveCompanyHonor(index, -1), "ghost compact"),
        actionButton("下移", () => moveCompanyHonor(index, 1), "ghost compact"),
        actionButton("删除", () => {
          syncHonorEditors();
        if (!String(honor.honor_id).startsWith("draft_")) state.deletedHonorIds.push(honor.honor_id);
        honors.splice(index, 1);
          markCompanyDirty();
        renderHonorEditors();
        }, "ghost danger-lite compact")
      ]
    });
    const title = input(honor.title, "title", index, "honor", "荣誉标题");
    title.className = "builder-input";
    const body = input(honor.body || "", "body", index, "honor", "荣誉说明", "textarea");
    body.className = "builder-textarea";
    const visible = input("", "visible", index, "honor", "", "checkbox");
    visible.checked = honor.visible !== false;
    const status = document.createElement("select");
    status.dataset.key = "status";
    status.dataset.index = index;
    status.dataset.group = "honor";
    status.innerHTML = `<option value="draft">草稿</option><option value="published">发布</option>`;
    status.value = honor.status || "draft";
    const visibleLabel = document.createElement("label");
    visibleLabel.className = "check-line";
    visibleLabel.append(visible, document.createTextNode("对访客展示"));
    row.append(title, body, honorImagesEditor(honor, index), status, visibleLabel);
    return row;
  }));
  renderCompanyPreview();
  renderCompanyCompleteness();
  applyCompanyPermission();
}

function honorImagesEditor(honor, index) {
  const wrap = document.createElement("div");
  wrap.className = "gallery-editor";
  const grid = document.createElement("div");
  grid.className = "gallery-editor-grid";
  (honor.images || []).forEach((image, imageIndex) => {
    const cell = document.createElement("div");
    cell.className = "gallery-editor-item";
    cell.innerHTML = image.image_url ? `<img src="${escapeAttr(mediaUrl(image.image_url))}" alt="" />` : `<span>图片</span>`;
    const title = input(image.title || "", "title", index, "honor-image", "图片标题");
    title.dataset.imageIndex = imageIndex;
    const caption = input(image.caption || "", "caption", index, "honor-image", "图片说明");
    caption.dataset.imageIndex = imageIndex;
    const remove = actionButton("删除", () => {
      syncHonorEditors();
      honor.images = (honor.images || []).filter((_, itemIndex) => itemIndex !== imageIndex);
      markCompanyDirty();
      renderHonorEditors();
    }, "ghost danger-lite compact");
    cell.append(title, caption, remove);
    grid.append(cell);
  });
  const upload = actionButton("+ 上传证书图", async () => {
    await uploadHonorImages(index);
  }, "secondary");
  wrap.append(grid, upload);
  return wrap;
}

function syncHonorEditors() {
  $$('[data-group="honor"]').forEach((node) => {
    const item = state.companyHonors[Number(node.dataset.index)];
    if (!item) return;
    if (node.type === "checkbox") item[node.dataset.key] = node.checked;
    else item[node.dataset.key] = node.dataset.key === "sort_order" ? Number(node.value || 0) : node.value;
  });
  $$('[data-group="honor-image"]').forEach((node) => {
    const honor = state.companyHonors[Number(node.dataset.index)];
    const image = honor?.images?.[Number(node.dataset.imageIndex)];
    if (image) image[node.dataset.key] = node.value || null;
  });
}

function resequenceCompanyProfile() {
  if (!state.companyProfile) return;
  state.companyProfile.display_modules = normalizeCompanyModules(state.companyProfile.display_modules || []).map((item, index) => ({
    ...item,
    sort_order: (index + 1) * 10
  }));
  state.companyProfile.service_items = (state.companyProfile.service_items || []).map((item, index) => ({
    ...item,
    sort_order: (index + 1) * 10
  }));
}

function moveCompanyArrayItem(key, index, direction) {
  syncCompanyEditors();
  const list = state.companyProfile?.[key];
  if (!Array.isArray(list)) return;
  const nextIndex = index + direction;
  if (!list[index] || !list[nextIndex]) return;
  [list[index], list[nextIndex]] = [list[nextIndex], list[index]];
  resequenceCompanyProfile();
  markCompanyDirty();
  renderCompanyEditors();
}

function moveCompanyHonor(index, direction) {
  syncHonorEditors();
  const list = state.companyHonors || [];
  const nextIndex = index + direction;
  if (!list[index] || !list[nextIndex]) return;
  [list[index], list[nextIndex]] = [list[nextIndex], list[index]];
  list.forEach((item, itemIndex) => { item.sort_order = (itemIndex + 1) * 10; });
  markCompanyDirty();
  renderHonorEditors();
}

function deleteCompanyIntroBlock(index) {
  syncCompanyEditors();
  state.companyProfile.intro_blocks.splice(index, 1);
  markCompanyDirty();
  renderCompanyEditors();
}

function deleteCompanyService(index) {
  syncCompanyEditors();
  state.companyProfile.service_items.splice(index, 1);
  markCompanyDirty();
  renderCompanyEditors();
}

function setCompanyEditorValue({ group, index, key, value }) {
  if (group === "service") {
    const item = state.companyProfile?.service_items?.[index];
    if (item) item[key] = value;
    return;
  }
  if (group === "intro") {
    const item = state.companyProfile?.intro_blocks?.[index];
    if (item) item[key] = value;
  }
}

function cleanServicesForPayload(items = []) {
  return items
    .map((item, index) => ({
      id: /^service_[A-Za-z0-9_-]{1,64}$/.test(String(item.id || "")) ? item.id : `service_${Date.now()}_${index}`,
      title: String(item.title || "").trim(),
      description: String(item.description || "").trim(),
      image_url: item.image_url || null,
      visible: item.visible !== false,
      sort_order: Number(item.sort_order || (index + 1) * 10)
    }))
    .filter((item) => item.title || item.image_url);
}

function cleanIntroBlocksForPayload(blocks = []) {
  return blocks.map((block) => {
    if (["heading", "paragraph", "quote"].includes(block.type)) {
      return { type: block.type, text: String(block.text || "").trim() };
    }
    if (block.type === "list") {
      return { type: "list", items: (block.items || []).map((item) => String(item || "").trim()).filter(Boolean) };
    }
    if (block.type === "image") {
      return { type: "image", url: String(block.url || "").trim(), caption: String(block.caption || "").trim() };
    }
    if (block.type === "gallery") {
      return {
        type: "gallery",
        images: (block.images || [])
          .map((image) => ({ url: String(image.url || "").trim(), caption: String(image.caption || "").trim() }))
          .filter((image) => image.url)
          .slice(0, 12)
      };
    }
    if (block.type === "video") {
      return { type: "video", video_id: String(block.video_id || "").trim() };
    }
    return null;
  }).filter((block) => {
    if (!block) return false;
    if (["heading", "paragraph", "quote"].includes(block.type)) return Boolean(block.text);
    if (block.type === "list") return block.items.length > 0;
    if (block.type === "image") return Boolean(block.url);
    if (block.type === "gallery") return block.images.length > 0;
    if (block.type === "video") return /^\d+$/.test(block.video_id);
    return false;
  });
}

function addIntroVideoBlock(videoId) {
  const selected = String(videoId || selectableCompanyVideos()[0]?.video_id || "").trim();
  if (!selected) {
    notify("暂无可引用的已发布视频", "warning");
    return;
  }
  addIntro("video", { video_id: selected });
  selectCompanyTab("intro");
}

async function uploadCompanyImageInto({ group, index, urlKey, category }) {
  syncCompanyEditors();
  const urls = await chooseAndUploadCompanyImages(category, false);
  if (!urls.length) return;
  setCompanyEditorValue({ group, index, key: urlKey, value: urls[0] });
  markCompanyDirty();
  renderCompanyEditors();
}

async function uploadIntroGalleryImages(index) {
  syncCompanyEditors();
  const urls = await chooseAndUploadCompanyImages("company-images", true);
  if (!urls.length) return;
  const block = state.companyProfile?.intro_blocks?.[index];
  if (!block) return;
  block.images = [...(block.images || []), ...urls.map((url) => ({ url, caption: "" }))].slice(0, 12);
  markCompanyDirty();
  renderCompanyEditors();
}

async function uploadHonorImages(index) {
  syncHonorEditors();
  const urls = await chooseAndUploadCompanyImages("honors", true);
  if (!urls.length) return;
  const honor = state.companyHonors?.[index];
  if (!honor) return;
  honor.images = [...(honor.images || []), ...urls.map((url, imageIndex) => ({
    image_url: url,
    title: null,
    caption: null,
    sort_order: (honor.images || []).length + imageIndex
  }))].slice(0, 12);
  markCompanyDirty();
  renderHonorEditors();
}

async function chooseAndUploadCompanyImages(category, multiple, permission = "tenant.company.write") {
  if (!requirePermission(permission)) return [];
  const files = await chooseBrowserFiles({ accept: "image/*", multiple });
  if (!files.length) return [];
  return run("上传图片", async () => {
    const urls = [];
    for (const file of files) {
      const result = await uploadAdminBinary("/admin/uploads/images", file, { category, file_name: file.name || "image" });
      if (result.url) urls.push(result.url);
    }
    return urls;
  });
}

function chooseBrowserFiles({ accept, multiple = false }) {
  return new Promise((resolve) => {
    const picker = document.createElement("input");
    picker.type = "file";
    picker.accept = accept;
    picker.multiple = multiple;
    picker.addEventListener("change", () => resolve(Array.from(picker.files || [])), { once: true });
    picker.click();
  });
}

async function uploadAdminBinary(path, file, query = {}) {
  const params = new URLSearchParams(query);
  const headers = { "content-type": file.type || "application/octet-stream" };
  if (state.adminToken) headers.authorization = `Bearer ${state.adminToken}`;
  const response = await fetch(`${apiBase()}${path}?${params.toString()}`, {
    method: "POST",
    headers,
    body: file
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch (_error) {
    body = { message: `服务响应异常 (${response.status})` };
  }
  if (!response.ok) {
    const error = new Error(body?.message || `${response.status} ${response.statusText}`);
    error.status = response.status;
    throw error;
  }
  return body && typeof body === "object" && "data" in body ? body.data : body;
}

async function saveHonors() {
  syncHonorEditors();
  for (const honorId of [...new Set(state.deletedHonorIds)]) {
    await adminRequest(`/admin/company-honors/${encodeURIComponent(honorId)}`, { method: "DELETE" });
  }
  for (const honor of state.companyHonors) {
    const payload = {
      title: String(honor.title || "").trim(),
      body: honor.body || null,
      sort_order: Number(honor.sort_order || 0),
      visible: honor.visible !== false,
      status: honor.status || "draft",
      images: honor.images || []
    };
    if (String(honor.honor_id).startsWith("draft_")) {
      await adminRequest("/admin/company-honors", { method: "POST", body: payload });
    } else {
      await adminRequest(`/admin/company-honors/${encodeURIComponent(honor.honor_id)}`, { method: "PUT", body: payload });
    }
  }
  const result = await adminRequest("/admin/company-honors");
  state.companyHonors = result.items || [];
  state.deletedHonorIds = [];
  renderHonorEditors();
  return result;
}

async function loadTemplatePage() {
  const [profile, previewCard] = await Promise.all([
    adminRequest("/admin/company-profile").catch(() => null),
    loadTemplatePreviewCard()
  ]);
  if (profile) state.companyProfile = normalizeCompanyProfile(profile);
  state.templatePreviewCard = previewCard;
  const templates = await loadTemplates();
  return { templates, profile };
}

async function loadTemplatePreviewCard() {
  const result = await adminRequest("/admin/members?search=&status=all&limit=1&offset=0").catch(() => null);
  const member = result?.items?.[0];
  if (!member) return null;
  return adminRequest(`/admin/members/${encodeURIComponent(member.member_identity_id)}/card`).catch(() => ({
    display_name: member.display_name,
    title: member.title,
    avatar_url: "",
    fields: { mobile: member.mobile || "" },
    privacy: { show_avatar: true }
  }));
}

async function loadFieldSettings() {
  const result = await adminRequest("/admin/settings/fields");
  state.fieldSettings = result.fields || [];
  const writable = hasPermission("tenant.config.write");
  renderRows($("#fieldRows"), state.fieldSettings, 5, (field) => [
    `<strong>${escapeHtml(field.label)}</strong><br><code>${escapeHtml(field.field_key)}</code>`,
    checkboxCell(field.locked, field.field_key, "locked", writable),
    checkboxCell(field.employee_editable, field.field_key, "employee_editable", writable),
    checkboxCell(field.default_visible, field.field_key, "default_visible", writable),
    `<span class="muted-cell field-note">${escapeHtml(fieldRuleNote(field))}</span>`
  ]);
  return result;
}

function fieldRuleNote(field) {
  return [
    field.locked ? "管理员锁定" : "未锁定",
    field.employee_editable ? "员工可修改" : "员工不可修改",
    field.default_visible ? "默认展示" : "默认隐藏"
  ].join("，");
}

function checkboxCell(checked, key, prop, writable = true) {
  const label = document.createElement("label");
  label.className = "switch";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  input.disabled = !writable;
  input.dataset.fieldKey = key;
  input.dataset.fieldProp = prop;
  input.addEventListener("change", () => {
    const row = input.closest("tr");
    const note = row?.querySelector(".field-note");
    if (!note) return;
    const val = (name) => row.querySelector(`[data-field-prop="${name}"]`).checked;
    note.textContent = fieldRuleNote({ locked: val("locked"), employee_editable: val("employee_editable"), default_visible: val("default_visible") });
  });
  const track = document.createElement("span");
  track.className = "switch-track";
  label.append(input, track);
  return label;
}

function fieldSettingsPayload() {
  const fields = state.fieldSettings.map((field) => ({ ...field }));
  $$("[data-field-key]").forEach((input) => {
    const field = fields.find((item) => item.field_key === input.dataset.fieldKey);
    if (field) field[input.dataset.fieldProp] = input.checked;
  });
  return { fields };
}

async function loadTemplates() {
  const result = await adminRequest("/admin/templates");
  state.templates = result.items || [];
  syncCompanyBrandFromDefaultTemplate();
  const selected = state.templates.find((item) => item.template_id === state.selectedTemplateId)
    || state.templates.find((item) => item.is_default)
    || state.templates[0];
  state.selectedTemplateId = selected?.template_id || "";
  if (selected) fillTemplateForm(selected);
  else resetTemplateForm();
  return result;
}

function fillTemplateForm(template) {
  state.selectedTemplateId = template.template_id;
  $("#templateId").value = template.template_id;
  $("#templateName").value = template.name || "";
  $("#templateStatus").value = template.status || "active";
  const variant = normalizeTemplateVariant(template.layout?.variant);
  state.templateDraftBackgrounds = normalizeTemplateBackgroundMap(template.layout?.template_backgrounds);
  if (!state.templateDraftBackgrounds[variant]) {
    state.templateDraftBackgrounds[variant] = {
      background_url: template.background_url || "",
      background_preset_id: template.layout?.background_preset_id || null,
      background_opacity: normalizeTemplateOpacity(template.layout?.background_opacity, 100)
    };
  }
  $("#templateBackgroundUrl").value = state.templateDraftBackgrounds[variant]?.background_url || template.background_url || "";
  $("#templateLogoUrl").value = template.logo_url || "";
  $("#templatePrimaryColor").value = normalizeHexColor(template.color_scheme?.primary, "#5a70c8");
  $("#templateSurfaceColor").value = template.color_scheme?.surface || "#ffffff";
  $("#templateLayoutVariant").value = variant;
  $("#templateBackgroundOpacity").value = normalizeTemplateOpacity(state.templateDraftBackgrounds[variant]?.background_opacity, normalizeTemplateOpacity(template.layout?.background_opacity, 100));
  $("#templatePortraitUrl").value = String(template.layout?.portrait_photo_url || "");
  renderTemplateEditor();
}

function templatePayload(includeStatus = false) {
  const current = selectedTemplateRecord();
  const variant = normalizeTemplateVariant($("#templateLayoutVariant").value);
  const backgroundUrl = $("#templateBackgroundUrl").value.trim() || null;
  const backgroundOpacity = normalizeTemplateOpacity($("#templateBackgroundOpacity").value, 100);
  captureTemplateVariantBackground();
  const existingBackgrounds = state.templateDraftBackgrounds;
  const payload = {
    name: $("#templateName").value.trim(),
    background_url: backgroundUrl,
    logo_url: $("#templateLogoUrl").value.trim() || null,
    color_scheme: {
      ...(current?.color_scheme || {}),
      primary: normalizeHexColor($("#templatePrimaryColor").value, "#5a70c8"),
      surface: normalizeHexColor($("#templateSurfaceColor").value, "#ffffff")
    },
    layout: {
      ...(current?.layout || {}),
      variant,
      background_opacity: backgroundOpacity,
      portrait_photo_url: $("#templatePortraitUrl").value.trim() || null,
      template_backgrounds: {
        ...existingBackgrounds,
        [variant]: {
          ...(existingBackgrounds[variant] || {}),
          background_url: backgroundUrl || "",
          background_preset_id: backgroundUrl ? "" : (existingBackgrounds[variant]?.background_preset_id || null),
          background_opacity: backgroundOpacity
        }
      }
    }
  };
  if (includeStatus) payload.status = $("#templateStatus").value;
  return payload;
}

function templateRecordPayload(template) {
  return {
    name: template.name,
    background_url: template.background_url || null,
    logo_url: template.logo_url || null,
    color_scheme: { ...(template.color_scheme || {}) },
    layout: { ...(template.layout || {}) },
    status: template.status || "active"
  };
}

function selectedTemplateRecord() {
  return (state.templates || []).find((item) => item.template_id === state.selectedTemplateId) || null;
}

function normalizeTemplateVariant(value) {
  const aliases = {
    tpl_horizontal_business: "horizontal-business",
    tpl_demo_business: "horizontal-business",
    tpl_minimal: "minimal",
    tpl_brand_image: "brand-image",
    tpl_portrait_photo: "portrait-photo",
    tpl_photo_portrait: "portrait-photo",
    "photo-portrait": "portrait-photo",
    tpl_dark: "dark",
    tpl_campaign: "campaign"
  };
  const normalized = aliases[value] || value;
  return TEMPLATE_VARIANTS.some((item) => item.value === normalized) ? normalized : "horizontal-business";
}

function normalizeTemplateOpacity(value, fallback = 100) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : fallback;
}

function normalizeTemplateBackgroundMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.entries(value).reduce((result, [variant, config]) => {
    if (!config || typeof config !== "object" || Array.isArray(config)) return result;
    result[normalizeTemplateVariant(variant)] = structuredClone(config);
    return result;
  }, {});
}

function templateBackgroundVisualUrl(variant, customUrl = "", presetId = "") {
  if (String(customUrl || "").trim()) return mediaUrl(customUrl);
  const normalizedVariant = normalizeTemplateVariant(variant);
  const resolvedPreset = presetId || TEMPLATE_VARIANT_DEFAULT_PRESETS[normalizedVariant];
  return TEMPLATE_BACKGROUND_PRESETS[resolvedPreset] || "";
}

function resetTemplateForm() {
  state.selectedTemplateId = "";
  state.templateDraftBackgrounds = {};
  $("#templateForm").reset();
  $("#templateId").value = "";
  $("#templateLayoutVariant").value = "horizontal-business";
  $("#templatePrimaryColor").value = "#5a70c8";
  $("#templateSurfaceColor").value = "#ffffff";
  $("#templateBackgroundOpacity").value = "100";
  renderTemplateEditor();
}

function captureTemplateVariantBackground() {
  const variant = normalizeTemplateVariant($("#templateLayoutVariant").value);
  const previous = state.templateDraftBackgrounds[variant] || {};
  const backgroundUrl = $("#templateBackgroundUrl").value.trim();
  state.templateDraftBackgrounds[variant] = {
    ...previous,
    background_url: backgroundUrl,
    background_preset_id: backgroundUrl ? "" : (previous.background_preset_id || null),
    background_opacity: normalizeTemplateOpacity($("#templateBackgroundOpacity").value, 100)
  };
}

function loadTemplateVariantBackground(variant) {
  const config = state.templateDraftBackgrounds[normalizeTemplateVariant(variant)] || {};
  $("#templateBackgroundUrl").value = config.background_url || "";
  $("#templateBackgroundOpacity").value = normalizeTemplateOpacity(config.background_opacity, 100);
}

function renderTemplateEditor() {
  const variant = normalizeTemplateVariant($("#templateLayoutVariant").value);
  const primary = normalizeHexColor($("#templatePrimaryColor").value, "#5a70c8");
  const opacity = normalizeTemplateOpacity($("#templateBackgroundOpacity").value, 100);
  const preview = $("#templatePreview");
  preview.className = `template-preview-card template-preview-card--${variant}`;
  preview.style.setProperty("--template-brand", primary);
  preview.style.setProperty("--template-brand-deep", mixHexColor(primary, "#000000", 0.22));
  preview.style.setProperty("--template-brand-soft", mixHexColor(primary, "#ffffff", 0.4));
  const backgroundUrl = $("#templateBackgroundUrl").value.trim();
  const backgroundPresetId = state.templateDraftBackgrounds[variant]?.background_preset_id || "";
  const backgroundVisualUrl = templateBackgroundVisualUrl(variant, backgroundUrl, backgroundPresetId);
  const overlayAlpha = ["brand-image", "dark"].includes(variant) ? (1 - opacity / 100) * 0.48 : 1 - opacity / 100;
  const overlayColor = ["brand-image", "dark"].includes(variant) ? `rgba(0,0,0,${overlayAlpha})` : `rgba(255,255,255,${overlayAlpha})`;
  preview.style.backgroundImage = backgroundVisualUrl
    ? `linear-gradient(${overlayColor}, ${overlayColor}), url("${backgroundVisualUrl.replaceAll('"', '%22')}")`
    : "";
  $("#templatePreviewName").textContent = $("#templateName").value.trim() || "新模板";
  $("#templatePreviewState").textContent = $("#templateStatus").value === "disabled" ? "当前停用，不会分配给成员" : "保存后同步到企业成员名片";
  $("#templatePrimaryColorValue").textContent = primary.toUpperCase();
  $("#templatePrimaryColorPicker").value = primary;
  $("#templateBackgroundOpacityValue").textContent = `${opacity}%`;
  $("#templatePortraitField").classList.toggle("hidden", variant !== "portrait-photo");
  const current = selectedTemplateRecord();
  const defaultButton = $("#setDefaultTemplate");
  defaultButton.disabled = !current || current.is_default || !hasPermission("tenant.template.write");
  defaultButton.textContent = current?.is_default ? "当前默认模板" : "设为默认模板";
  renderTemplateChoiceControls(variant, primary);
  renderTemplateBackgroundPresetControls(variant, backgroundPresetId, Boolean(backgroundUrl));
  renderTemplateAssetPreview("#templateLogoPreview", $("#templateLogoUrl").value, "未上传");
  renderTemplateAssetPreview("#templateBackgroundPreview", backgroundVisualUrl, "使用版式默认背景");
  renderTemplateAssetPreview("#templatePortraitPreview", $("#templatePortraitUrl").value, "未上传");
  const logoUrl = $("#templateLogoUrl").value.trim() || state.companyProfile?.logo_url || "";
  const logoNode = $("#templatePreviewLogo");
  logoNode.innerHTML = logoUrl ? `<img src="${escapeAttr(mediaUrl(logoUrl))}" alt="" />` : "";
  logoNode.classList.toggle("hidden", !logoUrl);
  const companyShort = state.companyProfile?.short_name || "";
  $("#templatePreviewCompanyShort").textContent = companyShort;
  $("#templatePreviewCompanyShort").classList.toggle("hidden", !companyShort);
  $("#templatePreviewCompany").textContent = state.companyProfile?.display_name || "企业名称";
  const card = state.templatePreviewCard || {};
  $("#templatePreviewMemberName").textContent = card.display_name || "姓名";
  $("#templatePreviewMemberTitle").textContent = card.title || "职位";
  $("#templatePreviewMemberMobile").textContent = card.fields?.mobile || "联系方式未设置";
  const avatar = $("#templatePreviewAvatar");
  const showAvatar = variant === "portrait-photo" || card.privacy?.show_avatar !== false;
  const avatarUrl = variant === "portrait-photo"
    ? ($("#templatePortraitUrl").value.trim() || `${apiBase()}/demo-assets/card-portraits/default-avatar-square.png?v=20260726-portrait`)
    : (card.avatar_url || "");
  avatar.classList.toggle("hidden", !showAvatar);
  avatar.innerHTML = avatarUrl ? `<img src="${escapeAttr(mediaUrl(avatarUrl))}" alt="" />` : `<span aria-hidden="true"></span>`;
}

function renderTemplateChoiceControls(activeVariant, primary) {
  $("#templateVariantChoices").replaceChildren(...TEMPLATE_VARIANTS.map((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `template-variant-choice ${item.value === activeVariant ? "active" : ""}`;
    button.dataset.templateVariant = item.value;
    button.innerHTML = `<span class="template-variant-thumb template-variant-thumb--${item.value}"></span><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.desc)}</small>`;
    button.querySelector(".template-variant-thumb").style.backgroundImage = `url("${templateBackgroundVisualUrl(item.value).replaceAll('"', '%22')}")`;
    return button;
  }));
  $("#templateColorChoices").replaceChildren(...TEMPLATE_BRAND_COLORS.map((color) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `template-color-choice ${color === primary ? "active" : ""}`;
    button.dataset.templateColor = color;
    button.style.backgroundColor = color;
    button.setAttribute("aria-label", color);
    return button;
  }));
}

function renderTemplateBackgroundPresetControls(variant, activePresetId, hasCustomBackground) {
  const normalizedVariant = normalizeTemplateVariant(variant);
  const presetIds = TEMPLATE_VARIANT_PRESETS[normalizedVariant] || [];
  $("#templateBackgroundPresetChoices").replaceChildren(...presetIds.map((presetId) => {
    const button = document.createElement("button");
    button.type = "button";
    const activeId = activePresetId || TEMPLATE_VARIANT_DEFAULT_PRESETS[normalizedVariant];
    button.className = `template-background-preset ${!hasCustomBackground && presetId === activeId ? "active" : ""}`;
    button.dataset.templateBackgroundPreset = presetId;
    button.innerHTML = `<img src="${escapeAttr(TEMPLATE_BACKGROUND_PRESETS[presetId])}" alt="" /><span>${escapeHtml(TEMPLATE_BACKGROUND_PRESET_NAMES[presetId])}</span>`;
    return button;
  }));
}

function renderTemplateAssetPreview(selector, value, emptyText) {
  const node = $(selector);
  const url = String(value || "").trim();
  node.innerHTML = url ? `<img src="${escapeAttr(mediaUrl(url))}" alt="" />` : `<span>${escapeHtml(emptyText)}</span>`;
}

async function loadSyncEvents() {
  const result = await adminRequest("/admin/sync-events");
  renderRows($("#syncEventRows"), result.items || [], 5, (item) => [
    `<strong>${escapeHtml(item.event_type)}</strong><br><code>${escapeHtml(item.event_key)}</code>`,
    escapeHtml(item.source),
    tag(item.status, statusTone(item.status)),
    String(item.retry_count),
    formatDate(item.received_at)
  ]);
  return result;
}

async function loadTenantSyncPage() {
  const [settings, events] = await Promise.all([loadWecomSettings(), loadSyncEvents()]);
  return { settings, events };
}

async function loadWecomSettings() {
  const settings = await adminRequest("/admin/wecom/settings");
  state.wecomSettings = settings;
  fillWecomSettings(settings);
  return settings;
}

function fillWecomSettings(settings) {
  $("#wecomAutoSyncOnAuth").checked = Boolean(settings.auto_sync_on_auth);
  $("#wecomAutoCreateCards").checked = Boolean(settings.auto_create_cards);
  $("#wecomAutoDisableLeftMembers").checked = Boolean(settings.auto_disable_left_members);
  $("#wecomAllowPrivacyEdit").checked = Boolean(settings.allow_employee_privacy_edit);
  $("#wecomAllowShareEdit").checked = Boolean(settings.allow_employee_share_edit);
  $("#wecomAllowQrUpload").checked = Boolean(settings.allow_employee_wecom_qrcode_upload);
  $("#wecomQrCodeSource").value = settings.qrcode_source || "enterprise_first";
  $("#wecomSettingsUpdated").textContent = settings.updated_at ? `Updated ${formatDate(settings.updated_at)}` : "Using default settings";
  $("#wecomPolicySync").textContent = settings.auto_sync_on_auth
    ? "Auth sync on"
    : "Manual sync only";
  $("#wecomPolicyCards").textContent = settings.auto_create_cards
    ? settings.auto_disable_left_members ? "Auto create/disable" : "Auto create"
    : "Manual card creation";
  $("#wecomPolicyEmployee").textContent = [
    settings.allow_employee_privacy_edit ? "privacy" : "privacy locked",
    settings.allow_employee_share_edit ? "share" : "share locked"
  ].join(" / ");
  $("#wecomPolicyQr").textContent = qrSourceLabel(settings.qrcode_source);
}

function wecomSettingsPayloadFromForm() {
  return {
    auto_sync_on_auth: $("#wecomAutoSyncOnAuth").checked,
    auto_create_cards: $("#wecomAutoCreateCards").checked,
    auto_disable_left_members: $("#wecomAutoDisableLeftMembers").checked,
    allow_employee_privacy_edit: $("#wecomAllowPrivacyEdit").checked,
    allow_employee_share_edit: $("#wecomAllowShareEdit").checked,
    allow_employee_wecom_qrcode_upload: $("#wecomAllowQrUpload").checked,
    qrcode_source: $("#wecomQrCodeSource").value
  };
}

function qrSourceLabel(value) {
  return ({
    enterprise_first: "Enterprise first",
    employee_upload_only: "Employee upload only",
    enterprise_only: "Enterprise only"
  })[value] || value || "--";
}

async function loadTenantAnalytics(days = state.analyticsDays) {
  state.analyticsDays = days;
  const result = await adminRequest(`/admin/analytics?days=${days}`);
  const overview = result.overview || {};
  // overview / member_rank / action_types 均为全时段口径，仅 trend 随 days 窗口变化
  $("#analyticsVisits").textContent = formatCount(overview.visit_count ?? 0);
  $("#analyticsVisitors").textContent = formatCount(overview.visitor_count ?? 0);
  $("#analyticsActions").textContent = formatCount(overview.action_count ?? 0);
  $("#analyticsShares").textContent = formatCount(overview.share_count ?? 0);
  $$("#analyticsRange button").forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.days) === days);
  });
  renderVisitChart($("#analyticsTrend"), result.trend || [], { showActions: true });
  renderAnalyticsFunnel(overview);
  const ranked = (result.member_rank || []).slice(0, 20).map((item, index) => ({ ...item, rank: index + 1 }));
  renderRows($("#analyticsMemberRows"), ranked, 5, (item) => [
    String(item.rank),
    `<strong>${escapeHtml(item.display_name)}</strong>`,
    formatCount(item.visit_count),
    formatCount(item.visitor_count),
    formatCount(item.action_count)
  ]);
  const actionTypes = result.action_types || [];
  $("#analyticsActionPanel").classList.toggle("hidden", !actionTypes.length);
  renderRows($("#analyticsActionRows"), actionTypes, 2, (item) => [
    escapeHtml(actionTypeLabel(item.action_type)),
    formatCount(item.action_count)
  ]);
  return result;
}

// 互动漏斗：访问 → 互动 → 分享，占比以第一级（访问）为基准
function renderAnalyticsFunnel(overview) {
  const root = $("#analyticsFunnel");
  const visits = Number(overview.visit_count || 0);
  const stages = [
    ["访问", visits],
    ["互动", Number(overview.action_count || 0)],
    ["分享", Number(overview.share_count || 0)]
  ];
  root.replaceChildren(...stages.map(([label, value]) => {
    const ratio = visits > 0 ? value / visits : 0;
    const row = document.createElement("div");
    row.className = "funnel-row";
    const name = document.createElement("span");
    name.className = "funnel-label";
    name.textContent = label;
    const track = document.createElement("div");
    track.className = "funnel-track";
    const bar = document.createElement("i");
    bar.style.width = `${value > 0 ? Math.max(3, Math.round(ratio * 100)) : 0}%`;
    track.append(bar);
    const stat = document.createElement("strong");
    stat.textContent = `${formatCount(value)} · ${Math.round(ratio * 100)}%`;
    row.append(name, track, stat);
    return row;
  }));
}

// 访问趋势柱状图：复用 .callback-chart 结构，visit 主柱 + 可选 action 次柱，企业总览与数据分析共用
function renderVisitChart(root, rows, { showActions = true } = {}) {
  if (!rows.length) {
    root.innerHTML = `<p class="hint">暂无趋势数据</p>`;
    return;
  }
  const max = Math.max(1, ...rows.map((row) => Math.max(Number(row.visit_count || 0), Number(row.action_count || 0))));
  const step = rows.length > 10 ? Math.ceil(rows.length / 6) : 1;
  root.replaceChildren(...rows.map((row, index) => {
    const column = document.createElement("div");
    column.className = "chart-col";
    column.title = `${row.date} · 访问 ${row.visit_count} · 互动 ${row.action_count}`;
    const bars = document.createElement("div");
    bars.className = "chart-bars";
    const visit = document.createElement("i");
    visit.className = "bar visit";
    visit.style.height = `${Math.max(2, Math.round((Number(row.visit_count || 0) / max) * 100))}%`;
    bars.append(visit);
    if (showActions) {
      const action = document.createElement("i");
      action.className = "bar action";
      action.style.height = `${Math.max(2, Math.round((Number(row.action_count || 0) / max) * 100))}%`;
      bars.append(action);
    }
    const label = document.createElement("span");
    label.textContent = index % step === 0 ? String(row.date).slice(5) : "";
    column.append(bars, label);
    return column;
  }));
}
function actionTypeLabel(type) {
  return ({
    like_card: "点赞名片",
    copy_phone: "复制电话",
    copy_email: "复制邮箱",
    call_phone: "拨打电话",
    open_website: "访问官网"
  })[type] || type;
}

async function loadTenantCommercial() {
  const result = await adminRequest("/admin/commercial");
  const subscription = result.subscription || null;
  // 后端在无订阅时返回 fallback 套餐且 subscription_id 为 null，以此判断是否开通
  const subscribed = Boolean(subscription?.subscription_id);
  const plan = subscription?.plan || null;
  $("#billingPlanName").textContent = subscribed ? plan.name : "未开通付费版本";
  $("#billingPlanStatus").innerHTML = !subscribed
    ? tag("未开通", "muted")
    : subscription.status === "active"
      ? tag("生效中", "success")
      : tag(subscription.status || "未知", "warning");
  $("#billingExpires").textContent = subscribed && subscription.expires_at ? formatDate(subscription.expires_at) : "—";
  $("#billingPeriod").textContent = subscribed ? billingPeriodLabel(plan.billing_period) : "—";
  $("#billingPrice").textContent = subscribed
    ? `${moneyText(plan.price_cents, plan.currency)}${plan.billing_period === "yearly" ? " / 年" : " / 月"}`
    : "—";
  renderQuotaBar({
    text: "#billingMemberQuotaText",
    bar: "#billingMemberQuotaBar",
    left: "#billingMemberQuotaLeft",
    used: subscription?.usage?.member_count,
    limit: subscribed ? Number(plan.member_limit || 0) + Number(subscription.quota_adjustments?.member || 0) : null
  });
  renderQuotaBar({
    text: "#billingCardQuotaText",
    bar: "#billingCardQuotaBar",
    left: "#billingCardQuotaLeft",
    used: subscription?.usage?.active_card_count,
    limit: subscribed ? Number(plan.card_limit || 0) + Number(subscription.quota_adjustments?.card || 0) : null
  });
  const orders = result.orders || [];
  if (!orders.length) {
    $("#tenantOrderRows").innerHTML = `<tr><td colspan="5">暂无订单</td></tr>`;
  } else {
    renderRows($("#tenantOrderRows"), orders, 5, (item) => [
      `<code>${escapeHtml(maskOrderNo(item.order_no))}</code>`,
      escapeHtml(item.plan_key),
      moneyText(item.amount_cents, item.currency),
      orderStatusTag(item.status),
      formatDate(item.paid_at || item.created_at)
    ]);
  }
  const ledger = result.quota_ledger || [];
  $("#tenantQuotaCount").textContent = `${ledger.length} 条`;
  renderRows($("#tenantQuotaRows"), ledger, 5, (item) => [
    formatDate(item.created_at),
    quotaTypeLabel(item.quota_type),
    deltaText(item.delta),
    escapeHtml(item.reason),
    escapeHtml(item.created_by || "—")
  ]);
  return result;
}

function billingPeriodLabel(period) {
  return ({ monthly: "按月付费", yearly: "按年付费" })[period] || period || "—";
}

function orderStatusTag(status) {
  if (status === "paid") return tag("已支付", "success");
  if (status === "pending") return tag("处理中", "warning");
  return tag(status || "未知", "muted");
}

// 订单号掩码：保留前 3 后 4，中间以 **** 代替
function maskOrderNo(value) {
  const text = String(value || "");
  if (!text) return "--";
  if (text.length <= 7) return `${text.slice(0, 2)}****`;
  return `${text.slice(0, 3)}****${text.slice(-4)}`;
}

function deltaText(delta) {
  const value = Number(delta || 0);
  const sign = value > 0 ? "+" : "";
  return `<span class="${value >= 0 ? "delta-pos" : "delta-neg"}">${sign}${formatCount(value)}</span>`;
}

// 额度进度条：limit 为 null（未开通）时整条显示 —；使用率 > 85% 切换 warning 色
function renderQuotaBar({ text, bar, left, used, limit }) {
  const barNode = $(bar);
  if (limit === null || limit === undefined) {
    $(text).textContent = "—";
    barNode.style.width = "0%";
    barNode.classList.remove("warn");
    $(left).textContent = "未开通付费版本";
    return;
  }
  const usedCount = Number(used || 0);
  const ratio = limit > 0 ? Math.min(1, usedCount / limit) : 0;
  $(text).textContent = `${formatCount(usedCount)} / ${formatCount(limit)}`;
  barNode.style.width = `${Math.round(ratio * 100)}%`;
  barNode.classList.toggle("warn", ratio > 0.85);
  $(left).textContent = `剩余 ${formatCount(Math.max(0, limit - usedCount))} · 已用 ${Math.round(ratio * 100)}%`;
}
async function loadPlatformCommercial() {
  const result = await adminRequest("/admin/platform/commercial");
  renderRows($("#platformPlanRows"), result.plans || [], 4, (item) => [
    `<strong>${escapeHtml(item.name)}</strong>`,
    `<code>${escapeHtml(item.plan_key)}</code>`,
    `${moneyText(item.price_cents, item.currency)}${item.billing_period === "yearly" ? " / 年" : " / 月"}`,
    tag("启用", "success")
  ]);
  renderRows($("#platformSubscriptionRows"), result.subscriptions || [], 5, (item) => [
    `<strong>${escapeHtml(item.tenant_name)}</strong><br><code>${escapeHtml(item.tenant_id)}</code>`,
    escapeHtml(item.plan.name),
    tag(item.status, statusTone(item.status)),
    quotaText(item.usage.member_count, item.plan.member_limit + item.quota_adjustments.member),
    quotaText(item.usage.active_card_count, item.plan.card_limit + item.quota_adjustments.card)
  ]);
  const orders = result.orders || [];
  renderRows($("#platformOrderRows"), orders, 6, (item) => [
    `<strong>${escapeHtml(item.tenant_name || "--")}</strong><br><code>${escapeHtml(item.tenant_id)}</code>`,
    `<code>${escapeHtml(item.order_no)}</code>`,
    escapeHtml(item.plan_key),
    moneyText(item.amount_cents, item.currency),
    tag(item.status, statusTone(item.status)),
    formatDate(item.created_at)
  ]);
  const exceptions = orders.filter((order) => !["paid", "success", "closed"].includes(String(order.status)));
  const exceptionRoot = $("#platformOrderExceptionList");
  if (!exceptions.length) {
    exceptionRoot.innerHTML = `<p class="hint">暂无异常订单</p>`;
  } else {
    exceptionRoot.replaceChildren(...exceptions.slice(0, 8).map((order) => {
      const row = document.createElement("div");
      row.className = "task-item";
      row.innerHTML = `<span class="risk-dot warning"></span><strong>${escapeHtml(order.tenant_name || order.tenant_id)} · ${escapeHtml(order.order_no)}（${escapeHtml(moneyText(order.amount_cents, order.currency))}）</strong><span class="task-time">${escapeHtml(formatDate(order.created_at))}</span>`;
      return row;
    }));
  }
  return result;
}

function quotaText(used, limit) {
  return `${used} / ${limit}`;
}

function moneyText(cents, currency) {
  return `${currency} ${(Number(cents || 0) / 100).toFixed(2)}`;
}

function quotaTypeLabel(type) {
  return ({ member: "成员", card: "名片", video_mb: "视频 MB" })[type] || type;
}

function queryFromControls(mapping) {
  const params = new URLSearchParams();
  mapping.forEach(([name, selector]) => {
    const node = $(selector);
    if (!node) return;
    const value = node.value.trim();
    if (value) params.set(name, value);
  });
  return params.toString();
}

async function loadTenantAdmins() {
  const query = queryFromControls([
    ["search", "#tenantAdminSearch"],
    ["status", "#tenantAdminStatus"]
  ]);
  const result = await adminRequest(`/admin/admins?${query}`);
  renderRows($("#tenantAdminRows"), result.items || [], 5, (item) => [
    `<strong>${escapeHtml(item.display_name || item.open_userid || item.userid || "--")}</strong>`,
    tag(tenantAdminRoleLabel(item.role), tenantAdminRoleTone(item.role)),
    item.status === "active" ? tag("正常", "success") : tag("已停用", "danger"),
    formatDate(item.created_at),
    tenantAdminActionCell(item)
  ]);
  $("#tenantAdminTotal").textContent = `${result.total || 0} 个管理员`;
  return result;
}

function tenantAdminRoleLabel(role) {
  return ({ owner: "Owner", admin: "管理员", operator: "运营", auditor: "审计" })[role] || role;
}

function tenantAdminRoleTone(role) {
  return ({ owner: "brand", admin: "success", operator: "muted", auditor: "muted" })[role] || "muted";
}

// owner 行与当前登录人自己的行不显示启停操作（后端同样会拒绝）。
function tenantAdminActionCell(item) {
  if (item.role === "owner") return "";
  const self = state.admin;
  const isSelf = self && ((self.member_identity_id && item.member_identity_id === self.member_identity_id) || (self.open_userid && item.open_userid === self.open_userid));
  if (isSelf) return "";
  const next = item.status === "active" ? "disabled" : "active";
  return linkButton(item.status === "active" ? "停用" : "恢复", () => updateTenantAdminStatus(item, next), item.status === "active" ? "link-btn danger-link" : "link-btn");
}

async function updateTenantAdminStatus(item, status) {
  const label = status === "disabled" ? "停用" : "恢复";
  const name = item.display_name || item.open_userid || item.userid || item.admin_id;
  const ok = await confirmAction({
    title: `确认${label}管理员`,
    body: `将${label}管理员「${name}」。${status === "disabled" ? "停用后该成员将无法登录企业后台。" : "恢复后该成员可重新登录企业后台。"}`,
    danger: status === "disabled"
  });
  if (!ok) return;
  await run(`${label}管理员`, () => adminRequest(`/admin/admins/${encodeURIComponent(item.admin_id)}`, { method: "PATCH", body: { status } }));
  notify(`管理员已${label}`);
  await loadTenantAdmins();
}

async function loadTenantAuditEvents() {
  const query = queryFromControls([
    ["search", "#tenantAuditSearch"],
    ["source", "#tenantAuditSource"],
    ["status", "#tenantAuditStatus"]
  ]);
  const result = await adminRequest(`/admin/audit-events?${query}`);
  const today = result.today || null;
  $("#auditTodayReceived").textContent = today ? formatCount(today.received) : "--";
  $("#auditTodaySucceeded").textContent = today ? formatCount(today.succeeded) : "--";
  $("#auditTodayFailed").textContent = today ? formatCount(today.failed) : "--";
  $("#auditTodayRetryable").textContent = today ? formatCount(today.retryable) : "--";
  renderRows($("#tenantAuditRows"), result.items || [], 6, (item) => [
    formatDate(item.received_at),
    escapeHtml(sourceLabel(item.source)),
    `<strong>${escapeHtml(item.event_type)}</strong>${item.change_type ? `<br><code>${escapeHtml(item.change_type)}</code>` : ""}`,
    auditStatusTag(item.status),
    String(item.retry_count),
    linkButton("详情", () => openTenantAuditDrawer(item))
  ]);
  $("#tenantAuditTotal").textContent = `${result.total || 0} 条事件`;
  return result;
}

function auditStatusTag(status) {
  const map = {
    done: ["完成", "success"],
    failed: ["失败", "danger"],
    dead: ["死信", "muted"],
    processing: ["处理中", "warning"],
    received: ["已接收", "muted"]
  };
  const [label, tone] = map[status] || [status, "muted"];
  return tag(label, tone);
}

function openTenantAuditDrawer(item) {
  drawerTitle.textContent = item.event_type || "事件详情";
  drawerSubtitle.textContent = item.event_key || "";
  const rows = [
    ["事件 Key", item.event_key],
    ["事件类型", item.event_type],
    ["变更类型", item.change_type],
    ["来源", sourceLabel(item.source)],
    ["状态", item.status],
    ["重试次数", item.retry_count],
    ["企业", item.tenant_name || item.tenant_id],
    ["接收时间", formatDate(item.received_at)],
    ["处理时间", formatDate(item.processed_at)],
    ["最近错误", item.last_error || "--"]
  ];
  drawerBody.innerHTML = `<div class="kv-list">${rows.map(([key, value]) => `<div class="kv-row"><span>${escapeHtml(key)}</span><strong>${escapeHtml(String(value ?? "--"))}</strong></div>`).join("")}</div>`;
  drawerFooter.replaceChildren();
  showDrawer();
}

// ---- 操作审计日志（/admin/operation-logs 与 /admin/platform/operation-logs） ----

// 动作全集与后端写入的 action key 一一对应；下拉选项由映射表生成，避免两处漂移
const TENANT_OPERATION_ACTIONS = [
  ["admin.status.update", "变更管理员状态"],
  ["company.honor.create", "新增荣誉"],
  ["company.honor.delete", "删除荣誉"],
  ["company.honor.update", "更新荣誉"],
  ["company.profile.publish", "发布企业主页"],
  ["company.profile.update", "保存企业主页"],
  ["config.fields.update", "保存字段规则"],
  ["member.card.update", "更新成员名片"],
  ["member.sync", "同步成员"],
  ["sync.retry", "重试同步事件"],
  ["template.create", "新建模板"],
  ["template.set_default", "设为默认模板"],
  ["template.update", "更新模板"],
  ["wecom.settings.update", "更新企微设置"]
];

const PLATFORM_OPERATION_ACTIONS = [
  ["platform.account.status.update", "平台账号启停"],
  ["platform.audit.retry", "重试回调事件"],
  ["platform.quota.adjust", "额度调整"],
  ["platform.tenant.sync", "触发租户同步"],
  ["platform.video_feature.update", "视频功能设置"]
];

const OPERATION_ACTION_LABELS = new Map([...TENANT_OPERATION_ACTIONS, ...PLATFORM_OPERATION_ACTIONS]);

// 未知 action 原样展示 key，新版本后端动作不会显示成空白
function operationActionLabel(action) {
  return OPERATION_ACTION_LABELS.get(action) || action;
}

function fillOperationActionOptions() {
  const tenantSelect = $("#tenantOpsAction");
  TENANT_OPERATION_ACTIONS.forEach(([value, label]) => tenantSelect.append(new Option(label, value)));
  const platformSelect = $("#platformOpsAction");
  const platformGroup = document.createElement("optgroup");
  platformGroup.label = "平台动作";
  PLATFORM_OPERATION_ACTIONS.forEach(([value, label]) => platformGroup.append(new Option(label, value)));
  const tenantGroup = document.createElement("optgroup");
  tenantGroup.label = "企业动作";
  TENANT_OPERATION_ACTIONS.forEach(([value, label]) => tenantGroup.append(new Option(label, value)));
  platformSelect.append(platformGroup, tenantGroup);
}

function operationTargetText(item) {
  return [item.target_type, item.target_id].filter(Boolean).join(" ");
}

function operationTargetCell(item) {
  const text = operationTargetText(item);
  return text ? `<span class="ops-target">${escapeHtml(text)}</span>` : "—";
}

async function loadTenantOperationLogs(offset = state.tenantOps.offset) {
  const params = new URLSearchParams(queryFromControls([
    ["hours", "#tenantOpsHours"],
    ["action", "#tenantOpsAction"],
    ["search", "#tenantOpsSearch"]
  ]));
  params.set("limit", String(state.tenantOps.limit));
  params.set("offset", String(offset));
  const result = await adminRequest(`/admin/operation-logs?${params.toString()}`);
  state.tenantOps.offset = offset;
  state.tenantOps.total = result.total || 0;
  renderRows($("#tenantOpsRows"), result.items || [], 7, (item) => [
    formatDate(item.created_at),
    `<strong>${escapeHtml(item.actor_open_userid || "--")}</strong>`,
    tag(tenantAdminRoleLabel(item.actor_role), tenantAdminRoleTone(item.actor_role)),
    `<strong>${escapeHtml(operationActionLabel(item.action))}</strong><br><code>${escapeHtml(item.action)}</code>`,
    operationTargetCell(item),
    tag("成功", "success"),
    linkButton("详情", () => openOperationLogDrawer(item, { platform: false }))
  ], "暂无操作日志");
  renderOperationPager("tenantOps", state.tenantOps);
  return result;
}

async function loadPlatformOperationLogs(offset = state.platformOps.offset) {
  const tenantId = $("#platformOpsTenantId").value.trim();
  if (tenantId && !/^\d+$/.test(tenantId)) throw new Error("租户 ID 需为数字");
  const params = new URLSearchParams(queryFromControls([
    ["hours", "#platformOpsHours"],
    ["action", "#platformOpsAction"],
    ["search", "#platformOpsSearch"],
    ["tenant_id", "#platformOpsTenantId"]
  ]));
  params.set("limit", String(state.platformOps.limit));
  params.set("offset", String(offset));
  const result = await adminRequest(`/admin/platform/operation-logs?${params.toString()}`);
  state.platformOps.offset = offset;
  state.platformOps.total = result.total || 0;
  renderRows($("#platformOpsRows"), result.items || [], 9, (item) => [
    formatDate(item.created_at),
    tenantCell(item),
    `<strong>${escapeHtml(item.actor_open_userid || "--")}</strong>`,
    tag(tenantAdminRoleLabel(item.actor_role), tenantAdminRoleTone(item.actor_role)),
    `<strong>${escapeHtml(operationActionLabel(item.action))}</strong><br><code>${escapeHtml(item.action)}</code>`,
    operationTargetCell(item),
    escapeHtml(item.ip || "--"),
    tag("成功", "success"),
    linkButton("详情", () => openOperationLogDrawer(item, { platform: true }))
  ], "暂无操作日志");
  renderOperationPager("platformOps", state.platformOps);
  return result;
}

function renderOperationPager(prefix, pager) {
  const start = pager.total === 0 ? 0 : pager.offset + 1;
  const end = Math.min(pager.offset + pager.limit, pager.total);
  $(`#${prefix}PageInfo`).textContent = `第 ${start}–${end} 条 / 共 ${pager.total} 条`;
  $(`#${prefix}Prev`).disabled = pager.offset <= 0;
  $(`#${prefix}Next`).disabled = pager.offset + pager.limit >= pager.total;
}

function openOperationLogDrawer(item, { platform }) {
  drawerTitle.textContent = "操作详情";
  drawerSubtitle.textContent = operationActionLabel(item.action);
  const rows = [
    ["日志 ID", item.log_id],
    ["时间", formatDate(item.created_at)],
    ...(platform ? [["租户", item.tenant_name || item.tenant_id]] : []),
    ["操作者", item.actor_open_userid || "--"],
    ["角色", tenantAdminRoleLabel(item.actor_role)],
    ["动作", `${operationActionLabel(item.action)}（${item.action}）`],
    ["目标", operationTargetText(item) || "--"],
    ["IP", item.ip || "--"]
  ];
  drawerBody.innerHTML = [
    `<div class="kv-list audit-kv">${rows.map(([key, value]) => `<div class="kv-row"><span>${escapeHtml(key)}</span><strong>${escapeHtml(String(value ?? "--"))}</strong></div>`).join("")}</div>`,
    `<p class="audit-detail-label">detail</p>`,
    `<pre class="output audit-detail-json">${escapeHtml(item.detail ? JSON.stringify(item.detail, null, 2) : "--")}</pre>`
  ].join("");
  drawerFooter.replaceChildren();
  showDrawer();
}

function applyTenantAuditView(view) {
  state.auditView = view;
  $$("#tenantAuditView button").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  $("#tenantAuditOpsView").classList.toggle("hidden", view !== "operations");
  $("#tenantAuditEventsView").classList.toggle("hidden", view !== "events");
}

function loadTenantAuditPage() {
  applyTenantAuditView(state.auditView);
  return state.auditView === "operations" ? loadTenantOperationLogs() : loadTenantAuditEvents();
}

function applyPlatformAuditView(view) {
  state.platformAuditView = view;
  $$("#platformAuditView button").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  $("#platformAuditOpsView").classList.toggle("hidden", view !== "operations");
  $("#platformAuditEventsView").classList.toggle("hidden", view !== "events");
}

function loadPlatformAuditPage() {
  applyPlatformAuditView(state.platformAuditView);
  return state.platformAuditView === "operations" ? loadPlatformOperationLogs() : loadPlatformAuditEvents();
}

async function loadPlatformWecomEvents() {
  const result = await loadPlatformEvents({
    search: "#platformWecomSearch",
    source: "#platformWecomSource",
    status: "#platformWecomStatus"
  });
  const today = result.today || null;
  $("#platformWecomTodaySuccess").textContent = today ? today.succeeded : "--";
  $("#platformWecomTodayFailed").textContent = today ? today.failed : "--";
  $("#platformWecomTodayRetry").textContent = today ? today.retryable : "--";
  renderRows($("#platformWecomRows"), result.items || [], 6, (item) => [
    `<strong>${escapeHtml(item.event_type)}</strong><br><code>${escapeHtml(sourceLabel(item.source))}</code>`,
    tenantCell(item),
    tag(item.status === "failed" && item.retry_count < 5 ? "可重试失败" : item.status, item.status === "failed" && item.retry_count < 5 ? "warning" : statusTone(item.status)),
    formatDate(item.received_at),
    `<span class="error-cell">${escapeHtml(item.last_error || "--")}</span>`,
    ["failed", "dead"].includes(item.status) && item.tenant_id
      ? linkButton("重试", () => retryTenantEvents(item.tenant_id))
      : ""
  ]);
  $("#platformWecomTotal").textContent = `${result.total || 0} 条事件`;
  return result;
}

async function retryTenantEvents(tenantId) {
  if (!requirePermission("platform.sync.retry")) return;
  const ok = await confirmAction({ title: "确认重试", body: "将重新处理该企业可重试的失败回调事件。", danger: true });
  if (!ok) return;
  const result = await run("重试失败事件", () => adminRequest("/admin/platform/audit-events/retry", { method: "POST", body: { tenant_id: String(tenantId) } }));
  notify(`重试 ${result.retried_count} 条 · 成功 ${result.succeeded_count} · 失败 ${result.failed_count}`);
  await loadPlatformWecomEvents();
}

async function loadPlatformAuditEvents() {
  const result = await loadPlatformEvents({
    search: "#platformAuditSearch",
    source: "#platformAuditSource",
    status: "#platformAuditStatus"
  });
  renderRows($("#platformAuditRows"), result.items || [], 6, (item) => [
    formatDate(item.received_at),
    tenantCell(item),
    eventCell(item),
    tag(item.status, statusTone(item.status)),
    `<span class="error-cell">${escapeHtml(item.last_error || "--")}</span>`,
    formatDate(item.processed_at)
  ]);
  $("#platformAuditTotal").textContent = `${result.total || 0} 条事件`;
  return result;
}

async function loadPlatformEvents(selectors) {
  const query = queryFromControls([
    ["search", selectors.search],
    ["source", selectors.source],
    ["status", selectors.status]
  ]);
  return adminRequest(`/admin/platform/audit-events?${query}`);
}

async function loadPlatformAccounts() {
  const query = queryFromControls([
    ["search", "#platformAccountSearch"],
    ["status", "#platformAccountStatus"]
  ]);
  const result = await adminRequest(`/admin/platform/accounts?${query}`);
  renderRows($("#platformAccountRows"), result.items || [], 5, (item) => [
    `<strong>${escapeHtml(item.username)}</strong><br><code>${escapeHtml(item.admin_id)}</code>`,
    tag(roleLabel(item.role), roleTone(item.role)),
    tag(item.status === "active" ? "启用" : "已禁用", statusTone(item.status)),
    formatDate(item.password_updated_at),
    accountActions(item)
  ]);
  $("#platformAccountTotal").textContent = `${result.total || 0} 个账号`;
  return result;
}

async function updateAccountStatus(item, status) {
  if (!requirePermission("platform.account.write")) return;
  const label = status === "disabled" ? "禁用" : "启用";
  const ok = await confirmAction({
    title: `确认${label}账号`,
    body: `将${label}平台账号「${item.username}」。${status === "disabled" ? "禁用后该账号将无法登录系统后台，现有会话立即失效。" : ""}`,
    danger: status === "disabled"
  });
  if (!ok) return;
  await run(`${label}账号`, () => adminRequest(`/admin/platform/accounts/${encodeURIComponent(item.admin_id)}`, { method: "PATCH", body: { status } }));
  notify(`账号已${label}`);
  await loadPlatformAccounts();
}

// 内建 owner（platform_owner，含迁移前 legacy 'owner' 行）不提供改角色/删除入口；
// 禁止删除自己等约束由服务端兜底，错误消息直接 toast。
function accountActions(item) {
  const container = document.createElement("span");
  container.className = "row-actions";
  const isBuiltInOwner = item.role === "platform_owner" || item.role === "owner";
  if (!isBuiltInOwner) {
    container.append(
      item.status === "active"
        ? linkButton("禁用", () => updateAccountStatus(item, "disabled"), "link-btn danger-link")
        : linkButton("启用", () => updateAccountStatus(item, "active"))
    );
  }
  if (!isBuiltInOwner) {
    container.append(
      linkButton("改角色", () => updateAccountRole(item)),
      linkButton("删除", () => deleteAccount(item), "link-btn danger-link")
    );
  }
  return container;
}

async function createPlatformAccount() {
  if (!requirePermission("platform.account.write")) return;
  const username = $("#platformAccountCreateUsername").value.trim();
  const password = $("#platformAccountCreatePassword").value;
  const role = $("#platformAccountCreateRole").value;
  if (!username || !password) {
    notify("请填写用户名和初始密码", "danger");
    return;
  }
  await run("创建平台账号", () => adminRequest("/admin/platform/accounts", { method: "POST", body: { username, password, role } }));
  notify(`账号「${username}」已创建`);
  $("#platformAccountCreateUsername").value = "";
  $("#platformAccountCreatePassword").value = "";
  await loadPlatformAccounts();
}

async function updateAccountRole(item) {
  if (!requirePermission("platform.account.write")) return;
  const nextRole = item.role === "ops" ? "support" : "ops";
  const ok = await confirmAction({
    title: "确认修改角色",
    body: `将把平台账号「${item.username}」的角色从 ${roleLabel(item.role)} 修改为 ${roleLabel(nextRole)}。新角色在该账号下次登录时生效。`
  });
  if (!ok) return;
  await run("修改角色", () => adminRequest(`/admin/platform/accounts/${encodeURIComponent(item.admin_id)}/role`, { method: "PATCH", body: { role: nextRole } }));
  notify("角色已修改");
  await loadPlatformAccounts();
}

async function deleteAccount(item) {
  if (!requirePermission("platform.account.write")) return;
  const ok = await confirmAction({
    title: "确认删除账号",
    body: `将永久删除平台账号「${item.username}」（硬删除，不可恢复），其现有会话立即失效。`,
    danger: true
  });
  if (!ok) return;
  await run("删除账号", () => adminRequest(`/admin/platform/accounts/${encodeURIComponent(item.admin_id)}`, { method: "DELETE" }));
  notify("账号已删除");
  await loadPlatformAccounts();
}

function roleLabel(role) {
  return ({
    owner: "Owner",
    platform_owner: "Platform Owner",
    ops: "Ops",
    support: "Support",
    finance: "Finance",
    engineer: "Engineer",
    admin: "Admin",
    operator: "Operator",
    auditor: "Auditor"
  })[role] || role;
}

function roleTone(role) {
  return ({
    owner: "brand",
    platform_owner: "brand",
    ops: "success",
    support: "warning",
    finance: "warning",
    engineer: "success",
    admin: "success",
    operator: "warning",
    auditor: "muted"
  })[role] || "muted";
}

function sourceLabel(source) {
  return ({ command: "指令回调", data: "数据回调", sync: "同步任务" })[source] || source;
}

function tenantCell(item) {
  return `<strong>${escapeHtml(item.tenant_name || "--")}</strong><br><code>${escapeHtml(item.tenant_id || "--")}</code>`;
}

function eventCell(item) {
  return `<strong>${escapeHtml(item.event_type)}</strong><br><code>${escapeHtml(item.event_key)}</code>`;
}

async function loadPlatformDashboard() {
  const [tenants, events, commercial, video, migrations] = await Promise.all([
    adminRequest("/admin/platform/tenants?page=1&page_size=20&status=all"),
    adminRequest("/admin/platform/audit-events?status=all&source=all&search=").catch(() => null),
    adminRequest("/admin/platform/commercial").catch(() => null),
    adminRequest("/admin/platform/features/company-video").catch(() => null),
    adminRequest("/admin/database/migrations").catch(() => null)
  ]);
  const summary = tenants.summary || {};
  const unhealthy = summary.unhealthy_count ?? (tenants.items || []).filter((item) => item.authorization_healthy === false).length;
  const today = events?.today || null;
  const failedToday = today ? today.failed : (events?.items || []).filter((item) => ["failed", "dead"].includes(item.status)).length;
  const pendingOrders = (commercial?.orders || []).filter((order) => !["paid", "success", "closed"].includes(String(order.status))).length;
  const quotaRisk = (commercial?.subscriptions || []).filter((sub) => {
    const memberLimit = sub.plan.member_limit + sub.quota_adjustments.member;
    const cardLimit = sub.plan.card_limit + sub.quota_adjustments.card;
    return (memberLimit > 0 && sub.usage.member_count / memberLimit >= 0.9) || (cardLimit > 0 && sub.usage.active_card_count / cardLimit >= 0.9);
  }).length;
  $("#platformTenantCount").textContent = tenants.total ?? 0;
  $("#platformUnhealthyCount").textContent = unhealthy;
  $("#platformTodayFailed").textContent = failedToday;
  $("#platformPendingOrders").textContent = pendingOrders;
  $("#platformQuotaRisk").textContent = quotaRisk;
  renderPlatformRisks({ tenants, events, commercial, video, migrations, unhealthy, failedToday, pendingOrders, quotaRisk });
  renderCallbackChart(events?.items || []);
  return { tenants, events, commercial, video, migrations };
}

function renderPlatformRisks(context) {
  const risks = [];
  const pendingMigrations = context.migrations?.pending_count ?? context.migrations?.pending?.length ?? 0;
  const lastEvent = (context.events?.items || [])[0];
  risks.push({
    tone: context.unhealthy > 0 ? "warning" : "success",
    title: context.unhealthy > 0 ? `${context.unhealthy} 家企业授权异常，需要检查` : "授权企业状态正常",
    time: "",
    action: "企业授权",
    page: "platform-tenants"
  });
  risks.push({
    tone: context.failedToday > 0 ? "danger" : "success",
    title: context.failedToday > 0 ? `今日 ${context.failedToday} 条回调失败` : "今日回调全部成功",
    time: lastEvent ? formatDate(lastEvent.received_at) : "",
    action: "授权与回调",
    page: "platform-wecom"
  });
  risks.push({
    tone: context.pendingOrders > 0 ? "warning" : "success",
    title: context.pendingOrders > 0 ? `${context.pendingOrders} 笔订单待处理` : "订单处理正常",
    time: "",
    action: "商业化",
    page: "platform-commercial"
  });
  risks.push({
    tone: pendingMigrations > 0 ? "danger" : "success",
    title: pendingMigrations > 0 ? `${pendingMigrations} 个数据库迁移待执行` : "数据库迁移已同步",
    time: "",
    action: "运维",
    page: "platform-ops"
  });
  risks.push({
    tone: context.video?.enabled ? "success" : "muted",
    title: context.video?.enabled ? "平台视频能力已启用" : "平台视频能力未启用",
    time: "",
    action: "功能开关",
    page: "platform-features"
  });
  $("#platformRiskList").replaceChildren(...risks.map(taskItem));
}

function renderCallbackChart(items) {
  const root = $("#platformCallbackChart");
  const buckets = [];
  const now = Date.now();
  for (let index = 23; index >= 0; index -= 1) {
    const start = new Date(now - index * 3600000);
    buckets.push({ hour: start.getHours(), key: `${start.getFullYear()}-${start.getMonth()}-${start.getDate()}-${start.getHours()}`, ok: 0, bad: 0 });
  }
  const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));
  items.forEach((item) => {
    const date = new Date(item.received_at);
    if (Number.isNaN(date.getTime()) || now - date.getTime() > 24 * 3600000) return;
    const bucket = byKey.get(`${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}`);
    if (!bucket) return;
    if (["failed", "dead"].includes(item.status)) bucket.bad += 1;
    else bucket.ok += 1;
  });
  const max = Math.max(1, ...buckets.map((bucket) => Math.max(bucket.ok, bucket.bad)));
  root.replaceChildren(...buckets.map((bucket) => {
    const column = document.createElement("div");
    column.className = "chart-col";
    column.title = `${bucket.hour}:00 · 成功 ${bucket.ok} · 失败 ${bucket.bad}`;
    const bars = document.createElement("div");
    bars.className = "chart-bars";
    const ok = document.createElement("i");
    ok.className = "bar ok";
    ok.style.height = `${Math.max(2, Math.round((bucket.ok / max) * 100))}%`;
    const bad = document.createElement("i");
    bad.className = "bar bad";
    bad.style.height = `${Math.max(2, Math.round((bucket.bad / max) * 100))}%`;
    bars.append(ok, bad);
    const label = document.createElement("span");
    label.textContent = bucket.hour % 4 === 0 ? `${bucket.hour}时` : "";
    column.append(bars, label);
    return column;
  }));
}

async function loadTenantAuthorizations(page = state.tenantAuthorizations.page) {
  const params = new URLSearchParams({
    search: $("#tenantAuthorizationSearch").value.trim(),
    status: $("#tenantAuthorizationStatus").value,
    page: String(Math.max(1, page)),
    page_size: String(state.tenantAuthorizations.pageSize)
  });
  const result = await adminRequest(`/admin/platform/tenants?${params.toString()}`);
  state.tenantAuthorizations = {
    items: result.items || [],
    total: Number(result.total || 0),
    page: Number(result.page || 1),
    pageSize: Number(result.page_size || 20)
  };
  renderTenantAuthorizations();
  return result;
}

function renderTenantAuthorizations() {
  const current = state.tenantAuthorizations;
  renderRows($("#tenantAuthorizationRows"), current.items, 8, (item) => {
    const isLocal = item.creation_source === "local";
    const nameCell = isLocal
      ? `<strong>${escapeHtml(item.tenant_name)}</strong> ${tag("本地企业", "brand")}${item.status === "disabled" ? " " + tag("已禁用", "danger") : ""}`
      : `<strong>${escapeHtml(item.tenant_name)}</strong>`;
    const corpCell = isLocal ? "<code>--</code>" : `<code>${escapeHtml(item.open_corpid)}</code>`;
    const authCell = isLocal
      ? tag(item.status === "disabled" ? "已禁用" : "本地启用", item.status === "disabled" ? "danger" : "success")
      : tag(item.auth_status === "active" ? "授权有效" : "已取消授权", statusTone(item.auth_status));
    const healthCell = isLocal
      ? tag("本地", "muted")
      : item.authorization_healthy === undefined
        ? tag("未知", "muted")
        : item.authorization_healthy
          ? tag("正常", "success")
          : tag("需检查", "warning");
    return [
      nameCell,
      corpCell,
      authCell,
      healthCell,
      `${item.active_member_count} / ${item.member_count}${isLocal ? formatMemberLimit(item.member_limit) : ""}`,
      `${item.active_card_count} / ${item.card_count}`,
      formatDate(item.authorized_at),
      isLocal ? buildLocalEnterpriseActions(item) : linkButton("查看详情", () => openTenantDetail(item.tenant_id))
    ];
  });
  const totalPages = Math.max(1, Math.ceil(current.total / current.pageSize));
  $("#tenantAuthorizationPage").textContent = `第 ${current.page} / ${totalPages} 页`;
  $("#tenantAuthorizationPrev").disabled = current.page <= 1;
  $("#tenantAuthorizationNext").disabled = current.page >= totalPages;
  $("#tenantAuthorizationTotal").textContent = `${current.total} 家企业`;
}

function formatMemberLimit(memberLimit) {
  return memberLimit === null || memberLimit === undefined ? "（不限）" : `（上限 ${memberLimit}）`;
}

function buildLocalEnterpriseActions(item) {
  const wrap = document.createElement("div");
  wrap.className = "row-actions";
  wrap.append(linkButton("详情", () => openTenantDetail(item.tenant_id)));
  if (hasPermission("platform.tenant.write")) {
    wrap.append(linkButton("改名", () => renameLocalEnterprise(item)));
    if (item.status === "disabled") {
      wrap.append(linkButton("启用", () => toggleLocalEnterprise(item, "enable")));
    } else {
      wrap.append(linkButton("禁用", () => toggleLocalEnterprise(item, "disable")));
    }
    wrap.append(linkButton("删除", () => deleteLocalEnterprise(item), "link-btn danger-link"));
  }
  return wrap;
}

function adminRoleLabel(role) {
  return ({ owner: "Owner", admin: "管理员", operator: "运营", auditor: "审计" })[role] || role || "--";
}

function adminStatusTag(status) {
  return status === "active" ? tag("启用", "success") : tag(status || "未知", "muted");
}

function renderTenantAdmins(admins) {
  const items = Array.isArray(admins) ? admins : [];
  if (!items.length) {
    return `<div class="empty-block">暂无管理员。请生成管理员认领二维码，由企业负责人扫码完成绑定。</div>`;
  }
  return `
    <div class="admin-list">
      ${items.map((admin) => `
        <div class="admin-list-item">
          <div class="admin-list-item__main">
            <strong>${escapeHtml(admin.name || admin.open_userid || "--")}</strong>
            <span>${escapeHtml(admin.open_userid || "--")}</span>
          </div>
          <div class="admin-list-item__meta">
            ${tag(adminRoleLabel(admin.role), admin.role === "owner" ? "brand" : "muted")}
            ${adminStatusTag(admin.status)}
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

async function openCreateLocalEnterprise() {
  if (!requirePermission("platform.tenant.write")) return;
  const panel = $("#createLocalEnterprisePanel");
  panel.hidden = false;
  $("#localEnterpriseCreateName").value = "";
  $("#localEnterpriseCreateMemberLimit").value = "";
  $("#localEnterpriseCreateName").focus();
}

async function submitCreateLocalEnterprise() {
  if (!requirePermission("platform.tenant.write")) return;
  const name = $("#localEnterpriseCreateName").value.trim();
  const limitRaw = $("#localEnterpriseCreateMemberLimit").value.trim();
  if (name.length < 2) {
    notify("请填写企业名称（至少 2 个字）", "danger");
    return;
  }
  const body = { name };
  if (limitRaw) {
    const limit = Number(limitRaw);
    if (!Number.isInteger(limit) || limit < 1) {
      notify("授权人数需为正整数，或留空表示不限", "danger");
      return;
    }
    body.member_limit = limit;
  }
  const res = await run("创建本地企业", () => adminRequest("/admin/platform/tenants", { method: "POST", body }));
  notify(`本地企业「${name}」已创建`);
  if (res && res.claim_path) showLocalEnterpriseClaimDialog(res);
  $("#localEnterpriseCreateName").value = "";
  $("#localEnterpriseCreateMemberLimit").value = "";
  $("#createLocalEnterprisePanel").hidden = true;
  await loadTenantAuthorizations(1);
}

function showLocalEnterpriseClaimDialog(result) {
  const dialog = $("#localEnterpriseClaimDialog");
  $("#localEnterpriseClaimTitle").textContent = `「${result.tenant_name || result.tenant_id}」认领二维码`;
  $("#localEnterpriseClaimMeta").textContent = `企业 ID ${result.tenant_id} · 有效期至 ${formatDate(result.claim_expires_at)}`;
  const qrWrap = $("#localEnterpriseClaimQrWrap");
  const copyPathButton = $("#copyLocalEnterpriseClaimPath");
  const codeWrap = $("#localEnterpriseClaimCodeWrap");
  const codeValue = $("#localEnterpriseClaimCode");
  qrWrap.replaceChildren();
  const claimCode = String(result.claim_code || "").trim();
  codeWrap.hidden = !claimCode;
  codeValue.textContent = claimCode;
  if (result.claim_qr_code_data_url) {
    const image = document.createElement("img");
    image.src = result.claim_qr_code_data_url;
    image.alt = "本地企业认领二维码";
    qrWrap.append(image);
    copyPathButton.hidden = true;
    $("#localEnterpriseClaimHint").textContent = claimCode
      ? "请企业负责人使用微信扫描二维码，或在小程序认领页输入 8 位认领码。二维码与认领码 15 分钟内有效。"
      : "请企业负责人使用微信扫描二维码，在小程序内完成认领。二维码 15 分钟内有效。";
  } else {
    const error = document.createElement("div");
    error.className = "claim-qr-error";
    error.textContent = "微信小程序码生成失败";
    qrWrap.append(error);
    copyPathButton.hidden = false;
    $("#localEnterpriseClaimHint").textContent = localEnterpriseClaimQrFailureHint(result);
  }
  dialog.dataset.claimPath = result.claim_path || "";
  dialog.showModal();
}

function localEnterpriseClaimQrFailureHint(result) {
  const error = String(result.claim_qr_error || "").trim();
  if (String(result.claim_code || "").trim()) {
    return error
      ? `微信小程序码生成失败：${error}。认领码仍可直接使用，也可先复制小程序路径用于排障。`
      : "未收到实际微信小程序码，认领码仍可直接使用，也可先复制小程序路径用于排障。";
  }
  if (!error || error === "wechat_miniprogram_credentials_missing") {
    return "当前后端进程未读取到微信小程序凭据，无法自动生成二维码。请确认服务器 .env 已配置并重启后端。可先复制小程序路径用于排障。";
  }
  return `微信小程序码生成失败：${error}。可先复制小程序路径用于排障，修复配置后重新生成。`;
}

async function renameLocalEnterprise(item) {
  if (!requirePermission("platform.tenant.write")) return;
  const currentName = item.tenant_name || "";
  const next = await promptTextInput({
    title: "修改企业名称",
    body: `将修改本地企业「${currentName}」的显示名称。`,
    label: "新企业名称",
    value: currentName,
    placeholder: "请输入新的企业名称",
    minLength: 2,
    maxLength: 255,
    validate: (value) => value.length > 255 ? "企业名称最多 255 个字" : ""
  });
  if (next === false) return;
  const trimmed = String(next || "").trim();
  if (trimmed === currentName) {
    notify("企业名称未变化", "warning");
    return;
  }
  await run("修改企业名称", () => adminRequest(`/admin/platform/tenants/${encodeURIComponent(item.tenant_id)}`, { method: "PATCH", body: { name: trimmed } }));
  notify(`企业名称已修改为「${trimmed}」`);
  await loadTenantAuthorizations();
}

async function toggleLocalEnterprise(item, action) {
  if (!requirePermission("platform.tenant.write")) return;
  const disabling = action === "disable";
  const ok = await confirmAction({
    title: disabling ? "确认禁用企业" : "确认启用企业",
    body: disabling
      ? `将禁用本地企业「${item.tenant_name}」，其成员将无法在小程序切换到该企业身份。`
      : `将重新启用本地企业「${item.tenant_name}」。`,
    danger: disabling
  });
  if (!ok) return;
  await run(disabling ? "禁用企业" : "启用企业", () => adminRequest(`/admin/platform/tenants/${encodeURIComponent(item.tenant_id)}/${disabling ? "disable" : "enable"}`, { method: "POST" }));
  notify(disabling ? "企业已禁用" : "企业已启用");
  await loadTenantAuthorizations();
}

async function deleteLocalEnterprise(item) {
  if (!requirePermission("platform.tenant.write")) return;
  const ok = await confirmAction({
    title: "确认删除企业",
    body: `将删除本地企业「${item.tenant_name}」（软删除，成员与名片保留但不可再访问）。此操作后成员无法再切换到该企业身份。`,
    danger: true
  });
  if (!ok) return;
  await run("删除企业", () => adminRequest(`/admin/platform/tenants/${encodeURIComponent(item.tenant_id)}`, { method: "DELETE" }));
  notify("企业已删除");
  await loadTenantAuthorizations();
}

async function createLocalEnterpriseClaimToken(item) {
  if (!requirePermission("platform.tenant.write")) return;
  const ok = await confirmAction({
    title: "生成管理员认领码",
    body: `将为本地企业「${item.tenant_name}」生成一个 15 分钟有效的管理员认领二维码。适用于尚未绑定 Owner 的本地企业。`
  });
  if (!ok) return;
  const result = await run("生成管理员认领码", () => adminRequest(`/admin/platform/tenants/${encodeURIComponent(item.tenant_id)}/claim-token`, { method: "POST" }));
  showLocalEnterpriseClaimDialog(result);
  await openTenantDetail(item.tenant_id);
}

function linkButton(label, handler, className = "link-btn") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", handler);
  return button;
}

function maskAgentId(value) {
  const text = String(value || "").trim();
  if (!text) return "--";
  if (text.length <= 3) return `${text[0]}**`;
  return `${text.slice(0, 2)}****${text.slice(-2)}`;
}

async function openTenantDetail(tenantId) {
  const item = await run("读取企业授权详情", () => adminRequest(`/admin/platform/tenants/${encodeURIComponent(tenantId)}`));
  const metricsHtml = `
    <div class="drawer-metrics">
      <div class="drawer-metric"><span>成员</span><strong>${formatCount(item.active_member_count)}<small> / ${formatCount(item.member_count)}</small></strong></div>
      <div class="drawer-metric"><span>名片</span><strong>${formatCount(item.active_card_count)}<small> / ${formatCount(item.card_count)}</small></strong></div>
      <div class="drawer-metric"><span>管理员</span><strong>${formatCount(item.active_admin_count)}<small> / ${formatCount(item.admin_count)}</small></strong></div>
    </div>
  `;
  drawerTitle.textContent = item.tenant_name;
  const isWecomConnected = item.creation_source === "wecom" && Boolean(item.open_corpid);
  if (!isWecomConnected) {
    const memberLimit = item.member_limit === null || item.member_limit === undefined ? "不限" : `${formatCount(item.member_limit)} 人`;
    drawerSubtitle.textContent = "本地企业 · 未接入企业微信";
    drawerBody.innerHTML = `
      <section class="drawer-section">
        <h3>本地企业</h3>
        <div class="kv-list">
          <div class="kv-row"><span>类型</span><strong>${tag("本地企业", "brand")}</strong></div>
          <div class="kv-row"><span>状态</span><strong>${item.status === "disabled" ? tag("已禁用", "danger") : tag("本地启用", "success")}</strong></div>
          <div class="kv-row"><span>成员上限</span><strong>${escapeHtml(memberLimit)}</strong></div>
          <div class="kv-row"><span>更新时间</span><strong>${escapeHtml(formatDate(item.updated_at))}</strong></div>
        </div>
      </section>
      <section class="drawer-section">
        <h3>企业微信接入</h3>
        <div class="kv-list">
          <div class="kv-row"><span>连接状态</span><strong>${tag("未接入", "muted")}</strong></div>
        </div>
        <p class="info-banner">未接入企业微信，企微专属授权、通讯录同步和回调信息已隐藏。</p>
      </section>
      <section class="drawer-section">
        <h3>企业规模</h3>
        ${metricsHtml}
      </section>
      <section class="drawer-section">
        <div class="section-head-inline">
          <h3>管理员</h3>
          ${item.active_admin_count > 0 ? "" : `<span class="hint">尚未绑定</span>`}
        </div>
        ${renderTenantAdmins(item.admins)}
      </section>
    `;
    const footerActions = [];
    if (hasPermission("platform.tenant.write") && Number(item.active_admin_count || 0) === 0) {
      footerActions.push(actionButton("生成管理员认领码", () => createLocalEnterpriseClaimToken(item), "secondary"));
    }
    drawerFooter.replaceChildren(...footerActions);
    showDrawer();
    return;
  }
  drawerSubtitle.textContent = item.open_corpid;
  drawerBody.innerHTML = `
    <section class="drawer-section">
      <h3>授权状态</h3>
      <div class="kv-list">
        <div class="kv-row"><span>状态</span><strong>${item.auth_status === "active" ? tag("授权有效", "success") : tag("已取消授权", "danger")}</strong></div>
        <div class="kv-row"><span>授权健康</span><strong>${item.authorization_healthy ? tag("正常", "success") : tag("需检查", "warning")}</strong></div>
        <div class="kv-row"><span>安装时间</span><strong>${escapeHtml(formatDate(item.authorized_at))}</strong></div>
        <div class="kv-row"><span>AgentID</span><strong><code>${escapeHtml(maskAgentId(item.agent_id))}</code></strong></div>
      </div>
    </section>
    <section class="drawer-section">
      <h3>安全凭据</h3>
      <div class="kv-list">
        <div class="kv-row"><span>凭据已配置</span><strong>${item.permanent_code_configured ? "是" : tag("未配置", "warning")}</strong></div>
        <div class="kv-row"><span>凭据已缓存</span><strong>${item.corp_token_cached ? "是" : "否"}</strong></div>
        <div class="kv-row"><span>到期时间</span><strong>${escapeHtml(formatDate(item.corp_token_expires_at))}</strong></div>
      </div>
    </section>
    <section class="drawer-section">
      <h3>通讯录授权诊断</h3>
      <div class="kv-list">
        <div class="kv-row"><span>通讯录同步</span><strong>${contactSyncDiagnosticTag(item)}</strong></div>
        <div class="kv-row"><span>最近错误</span><strong>${escapeHtml(item.last_callback?.last_error || "--")}</strong></div>
      </div>
      <pre class="output">${escapeHtml(JSON.stringify(item.auth_scope || {}, null, 2))}</pre>
    </section>
    <section class="drawer-section">
      <h3>企业规模</h3>
      ${metricsHtml}
    </section>
    <section class="drawer-section">
      <h3>最近回调</h3>
      <div id="drawerCallbackList" class="drawer-callbacks"><p class="hint">加载中...</p></div>
    </section>
  `;
  drawerFooter.replaceChildren(
    actionButton("重新同步", async () => {
      const ok = await confirmAction({ title: "确认重新同步", body: `将从企业微信重新拉取「${item.tenant_name}」的通讯录并更新成员状态。`, danger: true });
      if (!ok) return;
      const result = await run("重新同步", () => adminRequest(`/admin/platform/tenants/${encodeURIComponent(tenantId)}/sync`, { method: "POST", timeoutMs: 60000 }));
      notify(memberSyncResultMessage(result), result.detail_missing_count > 0 ? "warning" : "success");
      await openTenantDetail(tenantId);
    }, "secondary"),
    actionButton("重试失败事件", async () => {
      const ok = await confirmAction({ title: "确认重试失败事件", body: `将重新处理「${item.tenant_name}」可重试的失败回调事件。`, danger: true });
      if (!ok) return;
      const result = await run("重试失败事件", () => adminRequest("/admin/platform/audit-events/retry", { method: "POST", body: { tenant_id: String(tenantId) } }));
      notify(`重试 ${result.retried_count} 条 · 成功 ${result.succeeded_count} · 失败 ${result.failed_count}`);
      await openTenantDetail(tenantId);
    }, "secondary danger-lite")
  );
  showDrawer();
  const events = await adminRequest(`/admin/platform/audit-events?search=${encodeURIComponent(item.tenant_name)}&status=all&source=all`).catch(() => null);
  const list = $("#drawerCallbackList", drawerBody);
  if (!list) return;
  const recent = (events?.items || []).slice(0, 5);
  if (!recent.length) {
    list.innerHTML = `<p class="hint">暂无回调记录</p>`;
    return;
  }
  list.replaceChildren(...recent.map((event) => {
    const row = document.createElement("div");
    row.className = "callback-row";
    const main = document.createElement("div");
    main.className = "callback-main";
    main.innerHTML = `<strong>${escapeHtml(event.event_type)}</strong><span>${escapeHtml(sourceLabel(event.source))}</span>`;
    const side = document.createElement("div");
    side.className = "callback-side";
    side.innerHTML = `${tag(event.status, statusTone(event.status))}<span>${escapeHtml(formatDate(event.received_at))}</span>`;
    row.append(main, side);
    return row;
  }));
}

function contactSyncDiagnosticTag(item) {
  const lastError = String(item.last_callback?.last_error || "");
  if (/user\/list_id|user\/simplelist|user\/get|department\/simplelist|48002|60011|通讯录读取接口/.test(lastError)) {
    return tag("缺少通讯录权限或仍在使用旧授权 Token", "danger");
  }
  if (item.last_callback?.event_type === "contact_sync" && item.last_callback.status === "done") {
    return tag("最近同步成功", "success");
  }
  return tag("需结合授权范围确认", "warning");
}

function memberSyncResultMessage(result) {
  const synced = Number(result?.synced_count || 0);
  const detailSynced = Number(result?.detail_synced_count || 0);
  const detailMissing = Number(result?.detail_missing_count || 0);
  if (detailMissing > 0) {
    return `同步 ${synced} 个成员，${detailSynced} 个已有真实资料，${detailMissing} 个暂无真实姓名/职位。企业微信不向第三方应用开放成员真实姓名，请通知成员在名片小程序中完成个人信息授权，资料将自动补全。`;
  }
  return `同步 ${synced} 个成员，${detailSynced} 个已有真实资料。`;
}

async function loadVideoFeatures() {
  const [platform, tenants] = await Promise.all([
    adminRequest("/admin/platform/features/company-video"),
    adminRequest("/admin/platform/features/company-video/tenants?scope=overrides&page_size=100")
  ]);
  $("#platformVideoEnabled").checked = platform.enabled;
  $("#platformVideoLimit").value = platform.default_limit_mb;
  state.tenantFeatures = tenants.items || [];
  const overrideCount = Number(tenants.total ?? state.tenantFeatures.length);
  $("#platformVideoOverrideCount").textContent = String(overrideCount);
  $("#tenantFeatureOverrideTotal").textContent = `${overrideCount} 家`;
  renderTenantFeatures();
  return { platform, tenants };
}

function renderTenantFeatures() {
  const root = $("#tenantFeatureEditor");
  if (!state.tenantFeatures.length) {
    root.innerHTML = `<p class="hint">暂无已授权企业</p>`;
    return;
  }
  root.replaceChildren(...state.tenantFeatures.map((item, index) => {
    const row = document.createElement("div");
    row.className = "editor-row feature-row";
    const name = tenantFeatureNameCell(item);
    const enabledLabel = document.createElement("label");
    enabledLabel.className = "check-line";
    const enabled = document.createElement("input");
    enabled.type = "checkbox";
    enabled.checked = item.enabled;
    enabledLabel.append(enabled, document.createTextNode("启用"));
    const limit = input(item.limit_bytes === null ? "" : Math.round(item.limit_bytes / 1048576), "limit", index, "tenantFeature", "继承默认 MB", "number");
    const save = actionButton("保存", async () => {
      if (!requirePermission("platform.feature.write")) return;
      const updated = await run("保存企业功能", () => adminRequest(`/admin/platform/features/company-video/tenants/${encodeURIComponent(item.tenant_id)}`, {
        method: "PUT",
        body: {
          enabled: enabled.checked,
          limit_bytes: limit.value ? Math.round(Number(limit.value) * 1048576) : null
        }
      }));
      state.tenantFeatures[index] = updated;
      renderTenantFeatures();
    }, "secondary", "platform.feature.write");
    row.append(name, enabledLabel, limit, save);
    return row;
  }));
}

function tenantFeatureNameCell(item) {
  const name = document.createElement("div");
  name.className = "editor-main";
  name.innerHTML = `<strong>${escapeHtml(item.tenant_name)}</strong><code>${escapeHtml(item.tenant_id)}</code>`;
  return name;
}

function tenantFeatureLimitText(item) {
  const limitBytes = item.limit_bytes ?? item.effective_limit_bytes;
  const limitMb = Number.isFinite(Number(limitBytes)) ? Math.round(Number(limitBytes) / 1048576) : "--";
  return item.limit_bytes === null ? `继承默认 ${limitMb} MB` : `${limitMb} MB`;
}

async function loadTenantFeatureCandidates() {
  const search = $("#tenantFeatureSearch").value.trim();
  if (!search) {
    state.tenantFeatureSearchResults = [];
    renderTenantFeatureSearchResults();
    return null;
  }
  const tenants = await adminRequest(`/admin/platform/features/company-video/tenants?scope=all&search=${encodeURIComponent(search)}&page_size=20`);
  state.tenantFeatureSearchResults = tenants.items || [];
  renderTenantFeatureSearchResults();
  return tenants;
}

function renderTenantFeatureSearchResults() {
  const root = $("#tenantFeatureSearchResults");
  const search = $("#tenantFeatureSearch").value.trim();
  if (!search) {
    root.innerHTML = `<p class="hint">请输入企业名称后查询。</p>`;
    return;
  }
  if (!state.tenantFeatureSearchResults.length) {
    root.innerHTML = `<p class="hint">未找到匹配企业</p>`;
    return;
  }
  root.replaceChildren(...state.tenantFeatureSearchResults.map((item) => {
    const row = document.createElement("div");
    row.className = "editor-row feature-row";
    const status = document.createElement("div");
    status.innerHTML = item.source === "tenant_override"
      ? tag(item.enabled ? "已授权" : "已配置", item.enabled ? "success" : "muted")
      : tag("未授权", "muted");
    const limit = document.createElement("span");
    limit.className = "muted-cell";
    limit.textContent = tenantFeatureLimitText(item);
    const action = item.source === "tenant_override"
      ? actionButton("已在列表", () => {}, "secondary")
      : actionButton("授权", () => grantTenantVideoFeature(item), "secondary", "platform.feature.write");
    if (item.source === "tenant_override") action.disabled = true;
    row.append(tenantFeatureNameCell(item), status, limit, action);
    return row;
  }));
}

async function grantTenantVideoFeature(item) {
  if (!requirePermission("platform.feature.write")) return;
  const updated = await run("授权企业功能", () => adminRequest(`/admin/platform/features/company-video/tenants/${encodeURIComponent(item.tenant_id)}`, {
    method: "PUT",
    body: { enabled: true, limit_bytes: null }
  }));
  notify(`已授权「${updated.tenant_name}」企业视频`);
  await loadVideoFeatures();
  await loadTenantFeatureCandidates();
}

async function loadDatabaseMigrations() {
  const [result, ready] = await Promise.all([
    adminRequest("/admin/database/migrations"),
    request("/health/ready", { auth: false, timeoutMs: 5000 }).catch(() => null)
  ]);
  renderHealthCards(result, ready);
  const pending = result.pending_migrations || [];
  const files = result.migration_files || [];
  const appliedDetails = result.applied_details || [];
  const runOnByName = new Map(appliedDetails.map((item) => [item.name, item.run_on]));
  $("#databaseDir").textContent = result.database_dir || "--";
  $("#databaseMigrationFiles").textContent = String(files.length);
  $("#databasePendingCount").textContent = String(result.pending_count ?? pending.length);
  const rows = files.length ? files.map((file) => ({
    name: String(file).replace(/\.sql$/, ""),
    file: String(file),
    status: pending.some((p) => p.file_name === file || p.name === String(file).replace(/\.sql$/, "")) ? "pending" : "applied"
  })) : pending.map((item) => ({ name: item.name, file: item.file_name, status: "pending" }));
  renderRows($("#databaseMigrationRows"), rows, 4, (item) => [
    `<strong>${escapeHtml(item.name)}</strong><br><code>${escapeHtml(item.file)}</code>`,
    tag(item.status === "pending" ? "待执行" : "已完成", item.status === "pending" ? "warning" : "success"),
    item.status === "pending" ? "--" : formatDate(runOnByName.get(item.name)),
    item.status === "pending" ? tag("等待执行", "muted") : ""
  ]);
  return result;
}

function renderHealthCards(migrations, ready) {
  const databaseOk = Boolean(ready?.database?.ok) || (migrations?.configured && !(migrations?.errors || []).length);
  $("#healthDatabase").innerHTML = databaseOk ? tag("正常", "success") : tag("需检查", "warning");
  $("#healthQueue").innerHTML = tag("未接入", "muted");
  $("#healthCache").innerHTML = tag("未接入", "muted");
  $("#healthWecomApi").innerHTML = tag("未监控", "muted");
}

function showDrawer() {
  drawer.classList.remove("hidden");
  $("#drawerBackdrop").classList.remove("hidden");
}

function closeDrawer() {
  drawer.classList.add("hidden");
  $("#drawerBackdrop").classList.add("hidden");
  drawerBody.replaceChildren();
  drawerFooter.replaceChildren();
}

function confirmAction({ title, body, reason = false, danger = false }) {
  return new Promise((resolve) => {
    confirmTitle.textContent = title;
    confirmBody.textContent = body;
    $("span", confirmReasonLabel).textContent = "原因";
    confirmReasonLabel.classList.toggle("hidden", !reason);
    confirmReason.value = "";
    confirmDialog.returnValue = "cancel";
    $("#confirmOk").className = danger ? "danger-lite secondary" : "";
    const handler = (event) => {
      confirmDialog.removeEventListener("close", handler);
      resolve(confirmDialog.returnValue === "ok" ? (reason ? confirmReason.value.trim() : true) : false);
    };
    confirmDialog.addEventListener("close", handler);
    confirmDialog.showModal();
  });
}

function promptTextInput({ title, body, label, value = "", placeholder = "", minLength = 0, maxLength = 255, validate }) {
  return new Promise((resolve) => {
    textInputTitle.textContent = title;
    textInputBody.textContent = body;
    textInputLabel.textContent = label;
    textInputValue.value = value;
    textInputValue.placeholder = placeholder;
    textInputValue.minLength = minLength;
    textInputValue.maxLength = maxLength;
    textInputValue.required = minLength > 0;
    textInputError.textContent = "";
    textInputDialog.returnValue = "cancel";
    $("#textInputOk").className = "";

    const submit = () => {
      const next = textInputValue.value.trim();
      if (minLength && next.length < minLength) {
        textInputError.textContent = `${label}至少 ${minLength} 个字`;
        textInputValue.focus();
        return;
      }
      const error = validate?.(next);
      if (error) {
        textInputError.textContent = error;
        textInputValue.focus();
        return;
      }
      textInputValue.value = next;
      textInputDialog.close("ok");
    };
    $("#textInputCancel").onclick = () => textInputDialog.close("cancel");
    $("#textInputOk").onclick = submit;
    textInputValue.onkeydown = (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        submit();
      }
    };

    const handler = () => {
      textInputDialog.removeEventListener("close", handler);
      $("#textInputCancel").onclick = null;
      $("#textInputOk").onclick = null;
      textInputValue.onkeydown = null;
      resolve(textInputDialog.returnValue === "ok" ? textInputValue.value.trim() : false);
    };
    textInputDialog.addEventListener("close", handler);
    textInputDialog.showModal();
    textInputValue.select();
  });
}

function addIntro(type, value) {
  if (!state.companyProfile) return;
  syncCompanyEditors();
  state.companyProfile.intro_blocks.push({ type, ...value });
  markCompanyDirty();
  renderCompanyEditors();
}

async function checkApiHealth() {
  try {
    const result = await request("/health", { auth: false, timeoutMs: 5000 });
    apiStatus.textContent = result.status || "ok";
    return result;
  } catch (error) {
    apiStatus.textContent = "不可用";
    return null;
  }
}

window.AdminLogin.bind({
  $,
  $$,
  request,
  run,
  completeLogin,
  fallbackWecomLoginUrl,
  gateError,
  topbarAdmin
});

$("#logoutButton").addEventListener("click", () => expireAdminSession(""));
$("#loadAdminMe").addEventListener("click", () => run("刷新会话", async () => {
  const result = await adminRequest("/admin/session/me");
  applyAdminIdentity(result.admin);
  return result;
}));
$("#changePasswordButton").addEventListener("click", () => $("#passwordDialog").showModal());
$("#pwdCancel").addEventListener("click", () => $("#passwordDialog").close());
$("#pwdSave").addEventListener("click", async () => {
  const oldPassword = $("#pwdOld").value;
  const newPassword = $("#pwdNew").value;
  $("#pwdError").textContent = "";
  if (!oldPassword || !newPassword) {
    $("#pwdError").textContent = "请输入当前密码和新密码";
    return;
  }
  if (newPassword.length < 8) {
    $("#pwdError").textContent = "新密码至少 8 位";
    return;
  }
  if (newPassword !== $("#pwdConfirm").value) {
    $("#pwdError").textContent = "两次输入的新密码不一致";
    return;
  }
  await run("修改密码", () => adminRequest("/admin/auth/password", {
    method: "PUT",
    body: { old_password: oldPassword, new_password: newPassword }
  }));
  $("#passwordDialog").close();
  notify("密码已修改");
});

$("#loadTenantDashboard").addEventListener("click", () => run("刷新总览", loadTenantDashboard));
$("#loadMembers").addEventListener("click", () => run("刷新成员", loadMembers));
$("#memberSearch").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    run("搜索成员", loadMembers);
  }
});
$("#memberStatusFilter").addEventListener("change", () => run("筛选成员", loadMembers));
$("#inviteMember").addEventListener("click",inviteLocalMember);
$("#createJoinCode").addEventListener("click",createEnterpriseJoinCode);
$("#loadJoinRequests").addEventListener("click",()=>run("加载加入申请",loadJoinRequests));
$("#syncMembers").addEventListener("click", async () => {
  if (!requirePermission("tenant.member.sync")) return;
  if (!state.tenantOverview) {
    state.tenantOverview = await adminRequest("/admin/overview").catch(() => null);
    applyTenantMemberControls(state.tenantOverview);
  }
  if (!tenantCanSyncMembers()) {
    notify("本地企业未绑定企业微信，无法同步成员", "danger");
    return;
  }
  const ok = await confirmAction({
    title: "确认同步成员",
    body: "同步会从企业微信拉取通讯录并更新当前企业成员状态。",
    danger: true
  });
  if (ok) {
    const result = await run("同步成员", () => adminRequest("/admin/members/sync", { method: "POST", timeoutMs: 30000 }));
    notify(memberSyncResultMessage(result), result.detail_missing_count > 0 ? "warning" : "success");
    await loadMembers();
  }
});

$("#loadCompanyProfile").addEventListener("click", () => run("读取主页", loadCompanyProfileBundle));
$("#visitorPreviewCompany").addEventListener("click", showCompanyVisitorPreview);
$("#saveCompanyProfile").addEventListener("click", async () => {
  if (!requirePermission("tenant.company.write")) return;
  if (!state.companyProfile) await loadCompanyProfileOnly();
  const profile = await run("保存主页", async () => {
    const savedProfile = await adminRequest("/admin/company-profile", { method: "PUT", body: companyPayloadFromForm() });
    await saveDefaultTemplateBrand();
    return savedProfile;
  });
  fillCompany(profile);
  state.companyDirty = false;
  renderCompanyDirtyState();
  notify("企业主页已保存");
});
async function publishCompanyProfile() {
  if (!requirePermission("tenant.company.write")) return;
  if (!state.companyProfile) await loadCompanyProfileOnly();
  const profile = await run("发布主页", async () => {
    const publishedProfile = await adminRequest("/admin/company-profile", { method: "PUT", body: { ...companyPayloadFromForm(), status: "published" } });
    await saveDefaultTemplateBrand();
    return publishedProfile;
  });
  fillCompany(profile);
  state.companyDirty = false;
  renderCompanyDirtyState();
  closeCompanyPublishDialog();
  notify("企业主页已发布");
}
$("#publishCompanyProfile").addEventListener("click", openCompanyPublishDialog);
$("#closeCompanyPublishDialog").addEventListener("click", closeCompanyPublishDialog);
$("#cancelCompanyPublish").addEventListener("click", closeCompanyPublishDialog);
$("#companyPublishDialog").addEventListener("click", (event) => {
  if (event.target.id === "companyPublishDialog") closeCompanyPublishDialog();
});
$("#confirmCompanyPublish").addEventListener("click", publishCompanyProfile);
$("#companyForm").addEventListener("input", () => {
  markCompanyDirty();
  renderCompanyLogoPreview();
  renderCompanyStructure();
  selectCompanyTab(state.companyActiveTab);
  renderCompanyPreview();
  renderCompanyCompleteness();
});
$("#companyStructure").addEventListener("click", (event) => {
  const toggle = event.target.closest("[data-company-module-visible]");
  if (toggle) {
    const module = companyModuleByKey(toggle.dataset.companyModuleVisible);
    if (module) {
      module.visible = toggle.checked;
      markCompanyDirty();
      renderCompanyEditors();
    }
    return;
  }
  const tab = event.target.closest("[data-company-tab]");
  if (tab) selectCompanyTab(tab.dataset.companyTab);
});
$("#companyStructure").addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const tab = event.target.closest("[data-company-tab]");
  if (!tab) return;
  event.preventDefault();
  selectCompanyTab(tab.dataset.companyTab);
});
$$(".builder-style-card").forEach((node) => {
  node.addEventListener("click", () => {
    state.companyPreviewStyle = node.dataset.companyStyle || "classic";
    applyCompanyPreviewStyle();
  });
});
$$(".builder-swatches button").forEach((node) => {
  node.addEventListener("click", () => {
    if (updateDefaultTemplateBrand(node.dataset.companyBrand || "#5272d6")) {
      markCompanyDirty();
      applyCompanyPreviewStyle();
    }
  });
});
$("#companyBrandColor").addEventListener("input", (event) => {
  const color = normalizeHexColor(event.target.value);
  event.target.classList.toggle("is-invalid", Boolean(event.target.value) && !color);
  if (!color || !updateDefaultTemplateBrand(color)) return;
  markCompanyDirty();
  applyCompanyPreviewStyle();
});
$("#companyEditorPanels").addEventListener("input", () => {
  syncCompanyEditors();
  markCompanyDirty();
  renderCompanyStructure();
  selectCompanyTab(state.companyActiveTab);
  renderCompanyPreview();
  renderCompanyCompleteness();
});
$("#companyEditorPanels").addEventListener("change", (event) => {
  syncCompanyEditors();
  markCompanyDirty();
  if (event.target.matches("[type='checkbox'], [type='radio'], select")) {
    renderCompanyEditors();
    return;
  }
  renderCompanyStructure();
  selectCompanyTab(state.companyActiveTab);
  renderCompanyPreview();
  renderCompanyCompleteness();
});
$("#serviceLayoutChoices").addEventListener("click", (event) => {
  const button = event.target.closest("[data-service-layout]");
  if (!button) return;
  const module = companyModuleByKey("services");
  if (!module) return;
  module.layout = button.dataset.serviceLayout;
  markCompanyDirty();
  renderCompanyEditors();
});
$("#honorLayoutChoices").addEventListener("click", (event) => {
  const button = event.target.closest("[data-honor-layout]");
  if (!button) return;
  const module = companyModuleByKey("honors");
  if (!module) return;
  module.layout = button.dataset.honorLayout;
  markCompanyDirty();
  renderCompanyEditors();
});
$("#uploadCompanyLogo").addEventListener("click", async () => {
  const urls = await chooseAndUploadCompanyImages("logos", false);
  if (!urls.length) return;
  $("#companyForm").logo_url.value = urls[0];
  markCompanyDirty();
  renderCompanyLogoPreview();
  renderCompanyEditors();
});
$("#clearCompanyLogo").addEventListener("click", () => {
  $("#companyForm").logo_url.value = "";
  markCompanyDirty();
  renderCompanyLogoPreview();
  renderCompanyEditors();
});
$("#addService").addEventListener("click", () => {
  if (!state.companyProfile) return;
  syncCompanyEditors();
  state.companyProfile.service_items.push({ id: `service_${Date.now()}`, title: "", description: "", image_url: null, visible: true, sort_order: (state.companyProfile.service_items.length + 1) * 10 });
  markCompanyDirty();
  renderCompanyEditors();
});
$("#addHeading").addEventListener("click", () => addIntro("heading", { text: "新标题" }));
$("#addParagraph").addEventListener("click", () => addIntro("paragraph", { text: "正文" }));
$("#addImage").addEventListener("click", () => addIntro("image", { url: "", caption: "" }));
$("#addGallery").addEventListener("click", () => addIntro("gallery", { images: [] }));
$("#addVideo").addEventListener("click", () => state.videoCapability?.enabled && addIntroVideoBlock());
$("#loadHonors").addEventListener("click", () => run("读取荣誉", async () => {
  const result = await adminRequest("/admin/company-honors");
  state.companyHonors = result.items || [];
  state.deletedHonorIds = [];
  renderHonorEditors();
  return result;
}));
$("#addHonor").addEventListener("click", () => {
  syncHonorEditors();
  state.companyHonors.push({ honor_id: `draft_${Date.now()}`, title: "新荣誉", body: null, sort_order: (state.companyHonors.length + 1) * 10, visible: true, status: "draft", images: [] });
  markCompanyDirty();
  renderHonorEditors();
});
$("#saveHonors").addEventListener("click", () => run("保存荣誉", async () => {
  const result = await saveHonors();
  const profile = await adminRequest("/admin/company-profile", { method: "PUT", body: companyPayloadFromForm() });
  await saveDefaultTemplateBrand();
  fillCompany(profile);
  return result;
}));

$("#loadFieldSettings").addEventListener("click", () => run("读取字段", loadFieldSettings));
$("#saveFieldSettings").addEventListener("click", async () => {
  if (!requirePermission("tenant.config.write")) return;
  const result = await run("保存字段规则", () => adminRequest("/admin/settings/fields", { method: "PUT", body: fieldSettingsPayload() }));
  state.fieldSettings = result.fields || [];
  await loadFieldSettings();
  notify("字段规则已保存");
});
$("#templateForm").addEventListener("submit", (event) => event.preventDefault());
$("#templateForm").addEventListener("input", (event) => {
  if (event.target.id === "templatePrimaryColor") {
    const color = normalizeHexColor(event.target.value);
    event.target.classList.toggle("is-invalid", Boolean(event.target.value) && !color);
    if (!color) return;
  }
  renderTemplateEditor();
});
$("#templateForm").addEventListener("change", renderTemplateEditor);
$("#templateVariantChoices").addEventListener("click", (event) => {
  const button = event.target.closest("[data-template-variant]");
  if (!button) return;
  captureTemplateVariantBackground();
  $("#templateLayoutVariant").value = button.dataset.templateVariant;
  loadTemplateVariantBackground(button.dataset.templateVariant);
  renderTemplateEditor();
});
$("#templateColorChoices").addEventListener("click", (event) => {
  const button = event.target.closest("[data-template-color]");
  if (!button) return;
  $("#templatePrimaryColor").value = button.dataset.templateColor;
  $("#templatePrimaryColor").classList.remove("is-invalid");
  renderTemplateEditor();
});
$("#templateBackgroundPresetChoices").addEventListener("click", (event) => {
  const button = event.target.closest("[data-template-background-preset]");
  if (!button) return;
  const variant = normalizeTemplateVariant($("#templateLayoutVariant").value);
  $("#templateBackgroundUrl").value = "";
  state.templateDraftBackgrounds[variant] = {
    ...(state.templateDraftBackgrounds[variant] || {}),
    background_url: "",
    background_preset_id: button.dataset.templateBackgroundPreset,
    background_opacity: normalizeTemplateOpacity($("#templateBackgroundOpacity").value, 100)
  };
  renderTemplateEditor();
});
$("#templatePrimaryColorPicker").addEventListener("input", (event) => {
  $("#templatePrimaryColor").value = normalizeHexColor(event.target.value, "#5a70c8");
  $("#templatePrimaryColor").classList.remove("is-invalid");
  renderTemplateEditor();
});
async function uploadTemplateAsset(inputSelector, category) {
  if (!requirePermission("tenant.template.write")) return;
  const urls = await chooseAndUploadCompanyImages(category, false, "tenant.template.write");
  if (!urls.length) return;
  $(inputSelector).value = urls[0];
  renderTemplateEditor();
}
$("#uploadTemplateLogo").addEventListener("click", () => uploadTemplateAsset("#templateLogoUrl", "logos"));
$("#uploadTemplateBackground").addEventListener("click", () => uploadTemplateAsset("#templateBackgroundUrl", "templates"));
$("#uploadTemplatePortrait").addEventListener("click", () => uploadTemplateAsset("#templatePortraitUrl", "templates"));
[
  ["#clearTemplateLogo", "#templateLogoUrl"],
  ["#clearTemplateBackground", "#templateBackgroundUrl"],
  ["#clearTemplatePortrait", "#templatePortraitUrl"]
].forEach(([buttonSelector, inputSelector]) => {
  $(buttonSelector).addEventListener("click", () => {
    $(inputSelector).value = "";
    if (inputSelector === "#templateBackgroundUrl") {
      const variant = normalizeTemplateVariant($("#templateLayoutVariant").value);
      state.templateDraftBackgrounds[variant] = {
        ...(state.templateDraftBackgrounds[variant] || {}),
        background_url: "",
        background_preset_id: TEMPLATE_VARIANT_DEFAULT_PRESETS[variant],
        background_opacity: normalizeTemplateOpacity($("#templateBackgroundOpacity").value, 100)
      };
    }
    renderTemplateEditor();
  });
});
$("#loadTemplates").addEventListener("click", () => run("读取模板", loadTemplates));
$("#createTemplate").addEventListener("click", async () => {
  if (!requirePermission("tenant.template.write")) return;
  resetTemplateForm();
  $("#templateName").value = "新名片模板";
  renderTemplateEditor();
  $("#templateName").focus();
});
$("#updateTemplate").addEventListener("click", async () => {
  if (!requirePermission("tenant.template.write")) return;
  const templateId = $("#templateId").value.trim();
  const name = $("#templateName").value.trim();
  if (!name) throw new Error("请填写模板名称");
  const template = await run("保存模板", () => templateId
    ? adminRequest(`/admin/templates/${encodeURIComponent(templateId)}`, { method: "PUT", body: templatePayload(true) })
    : adminRequest("/admin/templates", { method: "POST", body: templatePayload(false) }));
  state.selectedTemplateId = template.template_id;
  fillTemplateForm(template);
  await loadTemplates();
});
$("#setDefaultTemplate").addEventListener("click", async () => {
  if (!requirePermission("tenant.template.write")) return;
  const templateId = $("#templateId").value.trim();
  if (!templateId) throw new Error("请先选择模板");
  const template = await run("设置默认模板", () => adminRequest(`/admin/templates/${encodeURIComponent(templateId)}/default`, { method: "PUT" }));
  state.selectedTemplateId = template.template_id;
  fillTemplateForm(template);
  await loadTemplates();
});

$("#loadSyncEvents").addEventListener("click", () => run("刷新同步事件", loadSyncEvents));
$("#loadWecomSettings").addEventListener("click", () => run("Load WeCom settings", loadWecomSettings));
$("#saveWecomSettings").addEventListener("click", async () => {
  if (!requirePermission("tenant.member.sync")) return;
  const settings = await run("Save WeCom settings", () => adminRequest("/admin/wecom/settings", {
    method: "PUT",
    body: wecomSettingsPayloadFromForm()
  }));
  fillWecomSettings(settings);
  notify("WeCom settings saved");
});
$("#retrySyncEvents").addEventListener("click", async () => {
  if (!requirePermission("tenant.sync.retry")) return;
  const ok = await confirmAction({ title: "确认重试失败事件", body: "系统会重新处理当前企业可重试的失败同步事件。", danger: true });
  if (ok) {
    await run("重试失败事件", () => adminRequest("/admin/sync-events/retry", { method: "POST" }));
    await loadSyncEvents();
  }
});
$("#loadTenantAnalytics").addEventListener("click", () => run("刷新数据分析", () => loadTenantAnalytics()));
$$("#analyticsRange button").forEach((button) => {
  button.addEventListener("click", () => run("切换趋势窗口", () => loadTenantAnalytics(Number(button.dataset.days))));
});
$("#loadTenantCommercial").addEventListener("click", () => run("刷新版本额度", loadTenantCommercial));
$("#billingRenew").addEventListener("click", () => notify("请通过企业微信服务商后台完成购买或续费", "warning"));
$("#loadTenantAdmins").addEventListener("click", () => run("刷新管理员", loadTenantAdmins));
$("#searchTenantAdmins").addEventListener("click", () => run("搜索管理员", loadTenantAdmins));
$("#tenantAdminSearch").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    run("搜索管理员", loadTenantAdmins);
  }
});
$("#tenantAdminStatus").addEventListener("change", () => run("筛选管理员", loadTenantAdmins));
$("#loadTenantAuditEvents").addEventListener("click", () => run("刷新审计", loadTenantAuditPage));
$$("#tenantAuditView button").forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.view === state.auditView) return;
    state.auditView = button.dataset.view;
    run("切换审计视图", loadTenantAuditPage);
  });
});
$("#searchTenantOps").addEventListener("click", () => run("搜索操作审计", () => loadTenantOperationLogs(0)));
$("#tenantOpsSearch").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    run("搜索操作审计", () => loadTenantOperationLogs(0));
  }
});
$("#tenantOpsHours").addEventListener("change", () => run("筛选操作审计", () => loadTenantOperationLogs(0)));
$("#tenantOpsAction").addEventListener("change", () => run("筛选操作审计", () => loadTenantOperationLogs(0)));
$("#tenantOpsPrev").addEventListener("click", () => run("上一页", () => loadTenantOperationLogs(Math.max(0, state.tenantOps.offset - state.tenantOps.limit))));
$("#tenantOpsNext").addEventListener("click", () => run("下一页", () => loadTenantOperationLogs(state.tenantOps.offset + state.tenantOps.limit)));
$("#searchTenantAuditEvents").addEventListener("click", () => run("搜索审计", loadTenantAuditEvents));
$("#tenantAuditSearch").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    run("搜索审计", loadTenantAuditEvents);
  }
});
$("#tenantAuditSource").addEventListener("change", () => run("筛选审计", loadTenantAuditEvents));
$("#tenantAuditStatus").addEventListener("change", () => run("筛选审计", loadTenantAuditEvents));

$("#loadPlatformDashboard").addEventListener("click", () => run("刷新系统总览", loadPlatformDashboard));
$("#loadTenantAuthorizations").addEventListener("click", () => run("刷新企业授权", () => loadTenantAuthorizations(1)));
$("#searchTenantAuthorizations").addEventListener("click", () => run("搜索企业授权", () => loadTenantAuthorizations(1)));
$("#tenantAuthorizationSearch").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    run("搜索企业授权", () => loadTenantAuthorizations(1));
  }
});
$("#tenantAuthorizationStatus").addEventListener("change", () => run("筛选企业授权", () => loadTenantAuthorizations(1)));
$("#tenantAuthorizationPrev").addEventListener("click", () => run("上一页", () => loadTenantAuthorizations(state.tenantAuthorizations.page - 1)));
$("#tenantAuthorizationNext").addEventListener("click", () => run("下一页", () => loadTenantAuthorizations(state.tenantAuthorizations.page + 1)));
$("#createLocalEnterprise").addEventListener("click", () => openCreateLocalEnterprise());
$("#submitCreateLocalEnterprise").addEventListener("click", () => submitCreateLocalEnterprise());
$("#cancelCreateLocalEnterprise").addEventListener("click", () => { $("#createLocalEnterprisePanel").hidden = true; });
$("#closeLocalEnterpriseClaimDialog").addEventListener("click", () => $("#localEnterpriseClaimDialog").close());
$("#copyLocalEnterpriseClaimPath").addEventListener("click", async () => {
  const path = $("#localEnterpriseClaimDialog").dataset.claimPath || "";
  if (!path) return;
  try {
    await navigator.clipboard.writeText(path);
    notify("小程序路径已复制");
  } catch (_) {
    window.prompt("复制小程序路径", path);
  }
});
$("#copyLocalEnterpriseClaimCode").addEventListener("click", async () => {
  const code = $("#localEnterpriseClaimCode").textContent.trim();
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code);
    notify("认领码已复制");
  } catch (_) {
    window.prompt("复制认领码", code);
  }
});
$("#loadPlatformWecomEvents").addEventListener("click", () => run("刷新回调", loadPlatformWecomEvents));
$("#retryPlatformEvents").addEventListener("click", async () => {
  if (!requirePermission("platform.sync.retry")) return;
  const ok = await confirmAction({ title: "确认重试失败事件", body: "将重新处理全平台可重试的失败回调事件。", danger: true });
  if (!ok) return;
  const result = await run("重试失败事件", () => adminRequest("/admin/platform/audit-events/retry", { method: "POST", body: {} }));
  notify(`重试 ${result.retried_count} 条 · 成功 ${result.succeeded_count} · 失败 ${result.failed_count}`);
  await loadPlatformWecomEvents();
});
$("#searchPlatformWecomEvents").addEventListener("click", () => run("搜索回调", loadPlatformWecomEvents));
$("#platformWecomSearch").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    run("搜索回调", loadPlatformWecomEvents);
  }
});
$("#platformWecomSource").addEventListener("change", () => run("筛选回调", loadPlatformWecomEvents));
$("#platformWecomStatus").addEventListener("change", () => run("筛选回调", loadPlatformWecomEvents));
$("#loadPlatformCommercial").addEventListener("click", () => run("刷新商业化", loadPlatformCommercial));
$("#openQuotaDialog").addEventListener("click", () => {
  if (!requirePermission("platform.commercial.write")) return;
  $("#quotaIdempotencyKey").value = `quota-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  $("#quotaDialog").showModal();
});
$("#quotaCancel").addEventListener("click", () => $("#quotaDialog").close());
$("#createQuotaAdjustment").addEventListener("click", async () => {
  if (!requirePermission("platform.commercial.write")) return;
  const body = {
    tenant_id: $("#quotaTenantId").value.trim(),
    quota_type: $("#quotaType").value,
    delta: Number($("#quotaDelta").value),
    reason: $("#quotaReason").value.trim(),
    idempotency_key: $("#quotaIdempotencyKey").value.trim() || `quota-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  };
  if (!body.tenant_id || !body.reason || !Number.isFinite(body.delta) || body.delta === 0) {
    notify("请完整填写企业 ID、非零变化量和原因", "danger");
    return;
  }
  const ok = await confirmAction({
    title: "确认写入额度调整",
    body: "额度调整会写入真实账本并影响企业额度展示，请确认企业 ID、变化量和原因。",
    danger: true
  });
  if (ok) {
    await run("写入额度调整", () => adminRequest("/admin/platform/commercial/quota-adjustments", { method: "POST", body }));
    $("#quotaDialog").close();
    notify("额度调整已写入");
    await loadPlatformCommercial();
  }
});
$("#loadVideoFeatures").addEventListener("click", () => run("读取功能开关", loadVideoFeatures));
$("#searchTenantFeatures").addEventListener("click", () => run("查询企业", loadTenantFeatureCandidates));
$("#tenantFeatureSearch").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    run("查询企业", loadTenantFeatureCandidates);
  }
});
$("#saveVideoFeatures").addEventListener("click", async () => {
  if (!requirePermission("platform.feature.write")) return;
  await run("保存平台功能", () => adminRequest("/admin/platform/features/company-video", {
    method: "PUT",
    body: {
      enabled: $("#platformVideoEnabled").checked,
      default_limit_bytes: Math.round(Number($("#platformVideoLimit").value) * 1048576)
    }
  }));
  await loadVideoFeatures();
  notify("平台功能开关已保存");
});
$("#loadDatabaseMigrations").addEventListener("click", () => {
  if (!requirePermission("platform.database.read")) return;
  run("检测迁移", loadDatabaseMigrations);
});
$("#runDatabaseMigrations").addEventListener("click", async () => {
  if (!requirePermission("platform.database.migrate")) return;
  const ok = await confirmAction({
    title: "确认执行数据库迁移",
    body: "这是高风险运维动作。执行前请确认目标数据库和备份状态。",
    reason: true,
    danger: true
  });
  if (ok) {
    const result = await run("执行迁移", () => adminRequest("/admin/database/migrations/run", { method: "POST", timeoutMs: 130000 }));
    if (result) {
      drawerTitle.textContent = "迁移执行日志";
      drawerSubtitle.textContent = result.ran ? "迁移已执行" : "没有待执行的迁移";
      drawerBody.innerHTML = `<pre class="output">${escapeHtml([result.stdout, result.stderr].filter(Boolean).join("\n\n") || "（无输出）")}</pre>`;
      drawerFooter.replaceChildren();
      showDrawer();
    }
    await loadDatabaseMigrations();
  }
});
$("#loadPlatformAuditEvents").addEventListener("click", () => run("刷新审计", loadPlatformAuditPage));
$$("#platformAuditView button").forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.view === state.platformAuditView) return;
    state.platformAuditView = button.dataset.view;
    run("切换审计视图", loadPlatformAuditPage);
  });
});
$("#searchPlatformOps").addEventListener("click", () => run("搜索操作审计", () => loadPlatformOperationLogs(0)));
$("#platformOpsSearch").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    run("搜索操作审计", () => loadPlatformOperationLogs(0));
  }
});
$("#platformOpsTenantId").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    run("搜索操作审计", () => loadPlatformOperationLogs(0));
  }
});
$("#platformOpsHours").addEventListener("change", () => run("筛选操作审计", () => loadPlatformOperationLogs(0)));
$("#platformOpsAction").addEventListener("change", () => run("筛选操作审计", () => loadPlatformOperationLogs(0)));
$("#platformOpsPrev").addEventListener("click", () => run("上一页", () => loadPlatformOperationLogs(Math.max(0, state.platformOps.offset - state.platformOps.limit))));
$("#platformOpsNext").addEventListener("click", () => run("下一页", () => loadPlatformOperationLogs(state.platformOps.offset + state.platformOps.limit)));
$("#searchPlatformAuditEvents").addEventListener("click", () => run("搜索审计", loadPlatformAuditEvents));
$("#platformAuditSearch").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    run("搜索审计", loadPlatformAuditEvents);
  }
});
$("#platformAuditSource").addEventListener("change", () => run("筛选审计", loadPlatformAuditEvents));
$("#platformAuditStatus").addEventListener("change", () => run("筛选审计", loadPlatformAuditEvents));
$("#loadPlatformAccounts").addEventListener("click", () => run("刷新系统账号", loadPlatformAccounts));
$("#createPlatformAccount").addEventListener("click", createPlatformAccount);
$("#searchPlatformAccounts").addEventListener("click", () => run("搜索系统账号", loadPlatformAccounts));
$("#platformAccountSearch").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    run("搜索系统账号", loadPlatformAccounts);
  }
});
$("#platformAccountStatus").addEventListener("change", () => run("筛选系统账号", loadPlatformAccounts));
$("#closeDrawer").addEventListener("click", closeDrawer);
$("#drawerBackdrop").addEventListener("click", closeDrawer);
$$("[data-go]").forEach((node) => node.addEventListener("click", () => showPage(node.dataset.go)));

if (DEV_MODE) {
  $("#adminToken").value = state.adminToken;
  $("#saveAdminToken").addEventListener("click", () => {
    state.adminToken = $("#adminToken").value.trim();
    sessionStorage.setItem("bc_admin_token", state.adminToken);
    notify("Token 已保存到当前标签页");
  });
  $("#adminQyLogin").addEventListener("click", async () => {
    const code = $("#adminLoginCode").value.trim();
    const claimToken = $("#adminClaimToken").value.trim();
    const body = { code };
    if (claimToken) body.claim_token = claimToken;
    const result = await run("企业微信 Code 登录", () => request("/admin/auth/qy-login", { method: "POST", auth: false, body }));
    completeLogin(result.access_token, result.admin);
  });
  $("#createWecomAuthorizationLink").addEventListener("click", async () => {
    const result = await run("生成授权链接", () => request("/wecom/authorization-links", {
      method: "POST",
      auth: false,
      body: {
        launch_token: $("#wecomLaunchToken").value.trim(),
        redirect_uri: $("#wecomRedirectUri").value.trim()
      }
    }));
    adminOutput.textContent = JSON.stringify(result, null, 2);
  });
}

async function boot() {
  void checkApiHealth();
  if (await completeWecomScanFromLocation()) return;
  const pendingLoginError = sessionStorage.getItem("bc_admin_login_error") || "";
  if (pendingLoginError) sessionStorage.removeItem("bc_admin_login_error");
  if (!state.adminToken) {
    showGate(pendingLoginError);
    return;
  }
  try {
    const result = await request("/admin/session/me", { token: state.adminToken });
    applyAdminIdentity(result.admin);
    showConsole();
  } catch (error) {
    expireAdminSession(error && error.status === 401 ? "登录已过期，请重新登录" : "");
  }
}

fillOperationActionOptions();

void boot();

/* ---- Login hero tilt (additive only) ---- */
(() => {
  const visual = $(".login-visual");
  const card = $("#loginTiltCard");
  if (!visual || !card) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  let raf = 0;
  visual.addEventListener("mousemove", (event) => {
    const rect = visual.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      card.style.transform = `rotateY(${(x * 10).toFixed(2)}deg) rotateX(${(-y * 8).toFixed(2)}deg)`;
    });
  });
  visual.addEventListener("mouseleave", () => {
    cancelAnimationFrame(raf);
    card.style.transform = "";
  });
})();
