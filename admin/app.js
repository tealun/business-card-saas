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
  "tenant-design": ["企业后台", "字段与模板", "名片字段规则和模板"],
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
    ["tenant-design", "字段与模板", "tenant.design"],
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
  analyticsDays: 7,
  selectedMemberId: "",
  memberCard: null,
  companyProfile: null,
  companyHonors: [],
  deletedHonorIds: [],
  videoCapability: null,
  fieldSettings: [],
  templates: [],
  wecomSettings: null,
  selectedTemplateId: "",
  tenantFeatures: [],
  tenantAuthorizations: { items: [], total: 0, page: 1, pageSize: 20 },
  auditView: "operations",
  platformAuditView: "operations",
  tenantOps: { offset: 0, limit: 50, total: 0 },
  platformOps: { offset: 0, limit: 50, total: 0 }
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const apiBaseInput = $("#apiBase");
const authGate = $("#authGate");
const adminShell = $("#adminShell");
const navList = $("#navList");
const pageTitle = $("#pageTitle");
const pageSubtitle = $("#pageSubtitle");
const breadcrumb = $("#breadcrumb");
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
  gateError.textContent = message;
}

function showConsole() {
  authGate.classList.add("hidden");
  adminShell.classList.remove("hidden");
}

function completeLogin(accessToken, admin) {
  state.adminToken = accessToken;
  sessionStorage.setItem("bc_admin_token", accessToken);
  const adminTokenInput = $("#adminToken");
  if (adminTokenInput) adminTokenInput.value = accessToken;
  applyAdminIdentity(admin);
  $("#gatePassword").value = "";
  $("#gateTokenInput").value = "";
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
  applyPermissionState("#saveCompanyProfile", "tenant.company.write");
  applyPermissionState("#publishCompanyProfile", "tenant.company.write");
  applyPermissionState("#saveFieldSettings", "tenant.config.write");
  applyPermissionState("#createTemplate", "tenant.template.write");
  applyPermissionState("#updateTemplate", "tenant.template.write");
  applyPermissionState("#setDefaultTemplate", "tenant.template.write");
  applyPermissionState("#saveWecomSettings", "tenant.member.sync");
  applyPermissionState("#retrySyncEvents", "tenant.sync.retry");
  applyPermissionState("#saveVideoFeatures", "platform.feature.write");
  applyPermissionState("#createQuotaAdjustment", "platform.commercial.write");
  applyPermissionState("#openQuotaDialog", "platform.commercial.write");
  applyPermissionState("#retryPlatformEvents", "platform.sync.retry");
  applyPermissionState("#loadDatabaseMigrations", "platform.database.read");
  applyPermissionState("#runDatabaseMigrations", "platform.database.migrate");
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
    "tenant-design": loadDesignBundle,
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
  if (loader) run("加载页面", loader);
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
  const result = await adminRequest(adminMemberListPath());
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
    linkButton("编辑", () => openMemberDrawer(item))
  ]);
  return result;
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
  drawerSubtitle.textContent = "成员名片编辑";
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
  drawerFooter.replaceChildren(actionButton("保存名片", saveMemberCard, "secondary", "tenant.member.card.write"));
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

async function loadCompanyProfileBundle() {
  const [profile, capability, honors] = await Promise.all([
    adminRequest("/admin/company-profile"),
    adminRequest("/admin/features/company-video").catch(() => null),
    adminRequest("/admin/company-honors").catch(() => ({ items: [] }))
  ]);
  state.videoCapability = capability;
  state.companyHonors = honors.items || [];
  state.deletedHonorIds = [];
  fillCompany(profile);
  renderHonorEditors();
  return { profile, capability, honors };
}

async function loadCompanyProfileOnly() {
  const profile = await adminRequest("/admin/company-profile");
  fillCompany(profile);
  return profile;
}

function fillCompany(profile) {
  state.companyProfile = structuredClone(profile);
  const form = $("#companyForm");
  form.display_name.value = profile.display_name || "";
  form.short_name.value = profile.short_name || "";
  form.logo_url.value = profile.logo_url || "";
  form.website_url.value = profile.website_url || "";
  form.address.value = profile.address || "";
  form.status.value = profile.status || "draft";
  form.visible.checked = Boolean(profile.visible);
  renderCompanyEditors();
  renderCompanyPreview();
  renderCompanyCompleteness();
  applyCompanyPermission();
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

function renderCompanyEditors() {
  const profile = state.companyProfile || { display_modules: [], service_items: [], intro_blocks: [] };
  const modules = $("#moduleEditor");
  modules.replaceChildren(...[...profile.display_modules].sort((a, b) => a.sort_order - b.sort_order).map((item, index) => {
    const row = document.createElement("div");
    row.className = "editor-row";
    const name = document.createElement("strong");
    name.textContent = item.key;
    const title = input(item.title, "title", index, "module", "模块标题");
    const layout = input(item.layout, "layout", index, "module", "布局");
    const visible = input("", "visible", index, "module", "", "checkbox");
    visible.checked = item.visible;
    const label = document.createElement("label");
    label.className = "check-line";
    label.append(visible, document.createTextNode("可见"));
    row.append(name, title, layout, label);
    return row;
  }));
  const services = $("#serviceEditor");
  services.replaceChildren(...profile.service_items.map((item, index) => {
    const row = document.createElement("div");
    row.className = "editor-row service";
    row.append(
      input(item.title, "title", index, "service", "服务标题"),
      input(item.description, "description", index, "service", "服务描述", "textarea"),
      input(item.image_url, "image_url", index, "service", "图片 URL"),
      actionButton("删除", () => { profile.service_items.splice(index, 1); renderCompanyEditors(); }, "secondary danger-lite")
    );
    return row;
  }));
  const intro = $("#introEditor");
  intro.replaceChildren(...profile.intro_blocks.map((item, index) => {
    const row = document.createElement("div");
    row.className = "editor-row intro";
    const type = document.createElement("strong");
    type.textContent = item.type;
    if (item.type === "heading" || item.type === "paragraph" || item.type === "quote") {
      row.append(type, input(item.text, "text", index, "intro", "内容", "textarea"));
    } else if (item.type === "image") {
      row.append(type, input(item.url, "url", index, "intro", "图片 URL"), input(item.caption, "caption", index, "intro", "说明"));
    } else if (item.type === "gallery") {
      row.append(type, input((item.images || []).map((image) => `${image.url}|${image.caption || ""}`).join("\n"), "images", index, "intro", "每行 URL|说明", "textarea"));
    } else if (item.type === "video") {
      row.append(type, input(item.video_id, "video_id", index, "intro", "视频 ID"));
    }
    row.append(actionButton("删除", () => { profile.intro_blocks.splice(index, 1); renderCompanyEditors(); }, "secondary danger-lite"));
    return row;
  }));
  const videoHint = $("#videoCapabilityHint");
  const addVideo = $("#addVideo");
  addVideo.disabled = !state.videoCapability?.enabled;
  videoHint.textContent = state.videoCapability?.enabled
    ? `视频能力已开通，上限 ${state.videoCapability.effective_limit_mb} MB`
    : "视频是高级功能，当前企业未开通时不会提交视频模块。";
  renderVideoPanel();
  renderCompanyPreview();
  renderCompanyCompleteness();
  applyCompanyPermission();
}

function syncCompanyEditors() {
  const profile = state.companyProfile;
  $$('[data-group="module"]').forEach((node) => {
    const item = [...profile.display_modules].sort((a, b) => a.sort_order - b.sort_order)[Number(node.dataset.index)];
    item[node.dataset.key] = node.type === "checkbox" ? node.checked : node.value;
  });
  $$('[data-group="service"]').forEach((node) => {
    const item = profile.service_items[Number(node.dataset.index)];
    item[node.dataset.key] = node.value || null;
  });
  $$('[data-group="intro"]').forEach((node) => {
    const item = profile.intro_blocks[Number(node.dataset.index)];
    if (node.dataset.key === "images") {
      item.images = node.value.split(/\n/).filter(Boolean).map((line) => {
        const [url, ...caption] = line.split("|");
        return { url: url.trim(), caption: caption.join("|").trim() };
      });
    } else {
      item[node.dataset.key] = node.value;
    }
  });
}

function companyPayloadFromForm() {
  syncCompanyEditors();
  const form = $("#companyForm");
  return {
    display_name: form.display_name.value.trim(),
    short_name: form.short_name.value.trim() || null,
    logo_url: form.logo_url.value.trim() || null,
    website_url: form.website_url.value.trim() || null,
    address: form.address.value.trim() || null,
    visible: form.visible.checked,
    status: form.status.value,
    intro_blocks: state.companyProfile.intro_blocks,
    service_items: state.companyProfile.service_items,
    display_modules: state.companyProfile.display_modules
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
    logo.src = logoUrl;
    logo.classList.remove("hidden");
  } else {
    logo.removeAttribute("src");
    logo.classList.add("hidden");
  }
  $("#previewCompanyInitial").textContent = (name || "企").charAt(0);
  const profile = state.companyProfile || {};
  const textBlock = (profile.intro_blocks || []).find((block) => ["heading", "paragraph", "quote"].includes(block.type) && String(block.text || "").trim());
  $("#previewCompanyIntro").textContent = textBlock ? String(textBlock.text).slice(0, 80) : form.address.value.trim() || "主页资料读取后展示预览。";
  $("#previewServiceCount").textContent = String((profile.service_items || []).length);
  $("#previewHonorCount").textContent = String((state.companyHonors || []).length);
  const root = $("#previewModules");
  const modules = [...(profile.display_modules || [])].sort((a, b) => a.sort_order - b.sort_order);
  root.replaceChildren(...modules.filter((item) => item.visible).map((item) => {
    const div = document.createElement("div");
    div.textContent = item.title;
    return div;
  }));
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
  const videoBlocks = (state.companyProfile?.intro_blocks || []).filter((block) => block.type === "video");
  root.innerHTML = `
    <div class="video-status">${tag("已开启", "success")}<span class="hint">单视频上限 ${escapeHtml(String(capability.effective_limit_mb))} MB</span></div>
    <p>当前已在「介绍」中配置 <strong>${videoBlocks.length}</strong> 个视频块。</p>
    <p class="hint">视频块在「介绍」标签页中添加与排序；未填写视频 ID 的块不会展示在主页。</p>`;
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
    root.innerHTML = `<p class="hint">暂无荣誉资质</p>`;
    return;
  }
  root.replaceChildren(...honors.map((honor, index) => {
    const row = document.createElement("div");
    row.className = "editor-row honor";
    row.append(
      input(honor.title, "title", index, "honor", "荣誉标题"),
      input(honor.body || "", "body", index, "honor", "说明", "textarea"),
      input(honor.sort_order, "sort_order", index, "honor", "排序", "number"),
      actionButton("删除", () => {
        if (!String(honor.honor_id).startsWith("draft_")) state.deletedHonorIds.push(honor.honor_id);
        honors.splice(index, 1);
        renderHonorEditors();
      }, "secondary danger-lite")
    );
    return row;
  }));
  renderCompanyPreview();
  renderCompanyCompleteness();
  applyCompanyPermission();
}

function syncHonorEditors() {
  $$('[data-group="honor"]').forEach((node) => {
    const item = state.companyHonors[Number(node.dataset.index)];
    item[node.dataset.key] = node.dataset.key === "sort_order" ? Number(node.value || 0) : node.value;
  });
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

async function loadDesignBundle() {
  const [fields, templates] = await Promise.all([loadFieldSettings(), loadTemplates()]);
  return { fields, templates };
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
  renderTemplates();
  return result;
}

function renderTemplates() {
  const root = $("#templateCards");
  if (!state.templates.length) {
    root.innerHTML = `<p class="hint">暂无模板，请在下方新建。</p>`;
    return;
  }
  root.replaceChildren(...state.templates.map((item) => {
    const card = document.createElement("article");
    card.className = "template-card";
    const primary = item.color_scheme?.primary || "#2563eb";
    const surface = item.color_scheme?.surface || "#ffffff";
    const swatch = document.createElement("div");
    swatch.className = "template-swatch";
    swatch.style.background = `linear-gradient(135deg, ${primary}, ${surface})`;
    if (item.logo_url || item.background_url) {
      const thumbs = document.createElement("div");
      thumbs.className = "template-thumbs";
      [item.logo_url, item.background_url].filter(Boolean).forEach((url) => {
        const img = document.createElement("img");
        img.src = url;
        img.alt = "";
        img.loading = "lazy";
        thumbs.append(img);
      });
      swatch.append(thumbs);
    }
    const body = document.createElement("div");
    body.className = "template-card-body";
    const title = document.createElement("strong");
    title.textContent = item.name;
    const meta = document.createElement("div");
    meta.className = "template-card-meta";
    meta.innerHTML = `${item.is_default ? tag("当前默认", "brand") : ""}${tag(item.status === "active" ? "启用" : "停用", statusTone(item.status))}`;
    const actions = document.createElement("div");
    actions.className = "inline-actions";
    actions.append(actionButton("编辑", () => fillTemplateForm(item), "secondary"));
    if (!item.is_default) {
      actions.append(actionButton("设为默认", async () => {
        if (!requirePermission("tenant.template.write")) return;
        await run("设置默认模板", () => adminRequest(`/admin/templates/${encodeURIComponent(item.template_id)}/default`, { method: "PUT" }));
        await loadTemplates();
      }, "secondary", "tenant.template.write"));
    }
    body.append(title, meta, actions);
    card.append(swatch, body);
    return card;
  }));
}


function fillTemplateForm(template) {
  state.selectedTemplateId = template.template_id;
  $("#templateId").value = template.template_id;
  $("#templateName").value = template.name || "";
  $("#templateStatus").value = template.status || "active";
  $("#templateBackgroundUrl").value = template.background_url || "";
  $("#templateLogoUrl").value = template.logo_url || "";
  $("#templatePrimaryColor").value = template.color_scheme?.primary || "#2563eb";
  $("#templateSurfaceColor").value = template.color_scheme?.surface || "#ffffff";
  $("#templateLayoutVariant").value = template.layout?.variant || "horizontal-business";
}

function templatePayload(includeStatus = false) {
  const payload = {
    name: $("#templateName").value.trim(),
    background_url: $("#templateBackgroundUrl").value.trim() || null,
    logo_url: $("#templateLogoUrl").value.trim() || null,
    color_scheme: {
      primary: $("#templatePrimaryColor").value.trim() || "#2563eb",
      surface: $("#templateSurfaceColor").value.trim() || "#ffffff"
    },
    layout: {
      variant: $("#templateLayoutVariant").value.trim() || "horizontal-business"
    }
  };
  if (includeStatus) payload.status = $("#templateStatus").value;
  return payload;
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
    item.status === "active"
      ? linkButton("禁用", () => updateAccountStatus(item, "disabled"), "link-btn danger-link")
      : linkButton("启用", () => updateAccountStatus(item, "active"))
  ]);
  $("#platformAccountTotal").textContent = `${result.total || 0} 个账号`;
  return result;
}

async function updateAccountStatus(item, status) {
  if (!requirePermission("platform.account.write")) return;
  const label = status === "disabled" ? "禁用" : "启用";
  const ok = await confirmAction({
    title: `确认${label}账号`,
    body: `将${label}平台账号「${item.username}」。${status === "disabled" ? "禁用后该账号将无法登录系统后台。" : ""}`,
    danger: status === "disabled"
  });
  if (!ok) return;
  await run(`${label}账号`, () => adminRequest(`/admin/platform/accounts/${encodeURIComponent(item.admin_id)}`, { method: "PATCH", body: { status } }));
  notify(`账号已${label}`);
  await loadPlatformAccounts();
}

function roleLabel(role) {
  return ({ owner: "Owner", admin: "Admin", operator: "Operator", auditor: "Auditor" })[role] || role;
}

function roleTone(role) {
  return ({ owner: "brand", admin: "success", operator: "warning", auditor: "muted" })[role] || "muted";
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
  renderRows($("#tenantAuthorizationRows"), current.items, 8, (item) => [
    `<strong>${escapeHtml(item.tenant_name)}</strong>`,
    `<code>${escapeHtml(item.open_corpid)}</code>`,
    tag(item.auth_status === "active" ? "授权有效" : "已取消授权", statusTone(item.auth_status)),
    item.authorization_healthy === undefined
      ? tag("未知", "muted")
      : item.authorization_healthy
        ? tag("正常", "success")
        : tag("需检查", "warning"),
    `${item.active_member_count} / ${item.member_count}`,
    `${item.active_card_count} / ${item.card_count}`,
    formatDate(item.authorized_at),
    linkButton("查看详情", () => openTenantDetail(item.tenant_id))
  ]);
  const totalPages = Math.max(1, Math.ceil(current.total / current.pageSize));
  $("#tenantAuthorizationPage").textContent = `第 ${current.page} / ${totalPages} 页`;
  $("#tenantAuthorizationPrev").disabled = current.page <= 1;
  $("#tenantAuthorizationNext").disabled = current.page >= totalPages;
  $("#tenantAuthorizationTotal").textContent = `${current.total} 家企业`;
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
  drawerTitle.textContent = item.tenant_name;
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
      <h3>企业规模</h3>
      <div class="drawer-metrics">
        <div class="drawer-metric"><span>成员</span><strong>${item.active_member_count}<small> / ${item.member_count}</small></strong></div>
        <div class="drawer-metric"><span>名片</span><strong>${item.active_card_count}<small> / ${item.card_count}</small></strong></div>
        <div class="drawer-metric"><span>管理员</span><strong>${item.active_admin_count}<small> / ${item.admin_count}</small></strong></div>
      </div>
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
      await run("重新同步", () => adminRequest(`/admin/platform/tenants/${encodeURIComponent(tenantId)}/sync`, { method: "POST", timeoutMs: 60000 }));
      notify("重新同步已完成");
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

async function loadVideoFeatures() {
  const search = $("#tenantFeatureSearch").value.trim();
  const [platform, tenants] = await Promise.all([
    adminRequest("/admin/platform/features/company-video"),
    adminRequest(`/admin/platform/features/company-video/tenants?search=${encodeURIComponent(search)}`)
  ]);
  $("#platformVideoEnabled").checked = platform.enabled;
  $("#platformVideoLimit").value = platform.default_limit_mb;
  state.tenantFeatures = tenants.items || [];
  const overrideCount = state.tenantFeatures.filter((item) => item.source === "tenant_override").length;
  $("#platformVideoOverrideCount").textContent = search.trim() ? `${overrideCount}+` : String(overrideCount);
  renderTenantFeatures();
  return { platform, tenants };
}

function renderTenantFeatures() {
  const root = $("#tenantFeatureEditor");
  if (!state.tenantFeatures.length) {
    root.innerHTML = `<p class="hint">暂无企业 override</p>`;
    return;
  }
  root.replaceChildren(...state.tenantFeatures.map((item, index) => {
    const row = document.createElement("div");
    row.className = "editor-row";
    const name = document.createElement("strong");
    name.textContent = item.tenant_name;
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
    confirmReasonLabel.classList.toggle("hidden", !reason);
    confirmReason.value = "";
    $("#confirmOk").className = danger ? "danger-lite secondary" : "";
    const handler = (event) => {
      confirmDialog.removeEventListener("close", handler);
      resolve(confirmDialog.returnValue === "ok" ? (reason ? confirmReason.value.trim() : true) : false);
    };
    confirmDialog.addEventListener("close", handler);
    confirmDialog.showModal();
  });
}

function addIntro(type, value) {
  if (!state.companyProfile) return;
  state.companyProfile.intro_blocks.push({ type, ...value });
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

$("#gatePasswordForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const username = $("#gateUsername").value.trim();
  const password = $("#gatePassword").value;
  if (!username || !password) {
    gateError.textContent = "请输入账号和密码";
    return;
  }
  $("#gatePasswordLogin").disabled = true;
  try {
    const result = await request("/admin/auth/login", { method: "POST", auth: false, body: { username, password } });
    completeLogin(result.access_token, result.admin);
  } catch (error) {
    gateError.textContent = error.message || "登录失败";
  } finally {
    $("#gatePasswordLogin").disabled = false;
  }
});

$("#gateLogin").addEventListener("click", async () => {
  const code = $("#gateLoginCode").value.trim();
  const claimToken = $("#gateClaimToken").value.trim();
  if (!code) {
    gateError.textContent = "请输入企业微信登录 Code";
    return;
  }
  const body = { code };
  if (claimToken) body.claim_token = claimToken;
  try {
    const result = await request("/admin/auth/qy-login", { method: "POST", auth: false, body });
    completeLogin(result.access_token, result.admin);
  } catch (error) {
    gateError.textContent = error.message || "登录失败";
  }
});

$("#gateTokenLogin").addEventListener("click", async () => {
  const token = $("#gateTokenInput").value.trim();
  if (!token) {
    gateError.textContent = "请输入访问令牌";
    return;
  }
  try {
    const result = await request("/admin/session/me", { token });
    completeLogin(token, result.admin);
  } catch (error) {
    gateError.textContent = error.message || "令牌无效";
  }
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
$("#syncMembers").addEventListener("click", async () => {
  if (!requirePermission("tenant.member.sync")) return;
  const ok = await confirmAction({
    title: "确认同步成员",
    body: "同步会从企业微信拉取通讯录并更新当前企业成员状态。",
    danger: true
  });
  if (ok) {
    await run("同步成员", () => adminRequest("/admin/members/sync", { method: "POST", timeoutMs: 30000 }));
    await loadMembers();
  }
});

$("#loadCompanyProfile").addEventListener("click", () => run("读取主页", loadCompanyProfileBundle));
$("#saveCompanyProfile").addEventListener("click", async () => {
  if (!requirePermission("tenant.company.write")) return;
  if (!state.companyProfile) await loadCompanyProfileOnly();
  const profile = await run("保存主页", () => adminRequest("/admin/company-profile", { method: "PUT", body: companyPayloadFromForm() }));
  fillCompany(profile);
  notify("企业主页已保存");
});
$("#publishCompanyProfile").addEventListener("click", async () => {
  if (!requirePermission("tenant.company.write")) return;
  if (!state.companyProfile) await loadCompanyProfileOnly();
  const profile = await run("发布主页", () => adminRequest("/admin/company-profile", { method: "PUT", body: { ...companyPayloadFromForm(), status: "published" } }));
  fillCompany(profile);
  notify("企业主页已发布");
});
$("#companyForm").addEventListener("input", () => {
  renderCompanyPreview();
  renderCompanyCompleteness();
});
$$("[data-company-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    $$("[data-company-tab]").forEach((node) => node.classList.toggle("active", node === button));
    $$("[data-company-panel]").forEach((node) => node.classList.toggle("active", node.dataset.companyPanel === button.dataset.companyTab));
    $("#companyTabTitle").textContent = button.textContent;
  });
});
$("#addService").addEventListener("click", () => {
  if (!state.companyProfile) return;
  state.companyProfile.service_items.push({ id: `service_${Date.now()}`, title: "", description: "", image_url: null, visible: true, sort_order: (state.companyProfile.service_items.length + 1) * 10 });
  renderCompanyEditors();
});
$("#addHeading").addEventListener("click", () => addIntro("heading", { text: "新标题" }));
$("#addParagraph").addEventListener("click", () => addIntro("paragraph", { text: "正文" }));
$("#addImage").addEventListener("click", () => addIntro("image", { url: "https://", caption: "" }));
$("#addGallery").addEventListener("click", () => addIntro("gallery", { images: [] }));
$("#addVideo").addEventListener("click", () => state.videoCapability?.enabled && addIntro("video", { video_id: "" }));
$("#loadHonors").addEventListener("click", () => run("读取荣誉", async () => {
  const result = await adminRequest("/admin/company-honors");
  state.companyHonors = result.items || [];
  state.deletedHonorIds = [];
  renderHonorEditors();
  return result;
}));
$("#addHonor").addEventListener("click", () => {
  state.companyHonors.push({ honor_id: `draft_${Date.now()}`, title: "新荣誉", body: null, sort_order: (state.companyHonors.length + 1) * 10, visible: true, status: "draft", images: [] });
  renderHonorEditors();
});
$("#saveHonors").addEventListener("click", () => run("保存荣誉", saveHonors));

$("#loadFieldSettings").addEventListener("click", () => run("读取字段", loadFieldSettings));
$("#saveFieldSettings").addEventListener("click", async () => {
  if (!requirePermission("tenant.config.write")) return;
  const result = await run("保存字段规则", () => adminRequest("/admin/settings/fields", { method: "PUT", body: fieldSettingsPayload() }));
  state.fieldSettings = result.fields || [];
  await loadFieldSettings();
  notify("字段规则已保存");
});
$("#templateForm").addEventListener("submit", (event) => event.preventDefault());
$("#loadTemplates").addEventListener("click", () => run("读取模板", loadTemplates));
$("#createTemplate").addEventListener("click", async () => {
  if (!requirePermission("tenant.template.write")) return;
  const template = await run("新增模板", () => adminRequest("/admin/templates", { method: "POST", body: templatePayload(false) }));
  fillTemplateForm(template);
  await loadTemplates();
});
$("#updateTemplate").addEventListener("click", async () => {
  if (!requirePermission("tenant.template.write")) return;
  const templateId = $("#templateId").value.trim();
  if (!templateId) throw new Error("请先选择模板");
  const template = await run("保存模板", () => adminRequest(`/admin/templates/${encodeURIComponent(templateId)}`, { method: "PUT", body: templatePayload(true) }));
  fillTemplateForm(template);
  await loadTemplates();
});
$("#setDefaultTemplate").addEventListener("click", async () => {
  if (!requirePermission("tenant.template.write")) return;
  const templateId = $("#templateId").value.trim();
  if (!templateId) throw new Error("请先选择模板");
  const template = await run("设置默认模板", () => adminRequest(`/admin/templates/${encodeURIComponent(templateId)}/default`, { method: "PUT" }));
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
$("#searchTenantFeatures").addEventListener("click", () => run("搜索企业功能", loadVideoFeatures));
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
  if (!state.adminToken) {
    showGate("");
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

/* ---- UI enhancement bindings (additive only) ---- */
(() => {
  const loginForm = $(".login-form");
  const accountLabel = $("#gateAccountLabel");
  const usernameInput = $("#gateUsername");
  const roleCopy = {
    tenant: { label: "企业管理员账号", placeholder: "请输入手机号/邮箱" },
    platform: { label: "平台账号", placeholder: "请输入平台账号" }
  };
  $$("[data-login-role]").forEach((tab) => {
    tab.addEventListener("click", () => {
      $$("[data-login-role]").forEach((node) => {
        const active = node === tab;
        node.classList.toggle("active", active);
        node.setAttribute("aria-selected", active ? "true" : "false");
      });
      const copy = roleCopy[tab.dataset.loginRole] || roleCopy.tenant;
      if (accountLabel) accountLabel.textContent = copy.label;
      if (usernameInput) usernameInput.placeholder = copy.placeholder;
    });
  });

  const pwdInput = $("#gatePassword");
  const pwdToggle = $("#gatePasswordToggle");
  if (pwdInput && pwdToggle) {
    pwdToggle.addEventListener("click", () => {
      const visible = pwdInput.type === "password";
      pwdInput.type = visible ? "text" : "password";
      pwdToggle.setAttribute("aria-label", visible ? "隐藏密码" : "显示密码");
      $("#gatePwdEyeOpen")?.classList.toggle("hidden", visible);
      $("#gatePwdEyeClosed")?.classList.toggle("hidden", !visible);
    });
  }

  const remember = $("#gateRemember");
  if (remember) {
    remember.addEventListener("click", () => {
      remember.setAttribute("aria-pressed", remember.getAttribute("aria-pressed") === "true" ? "false" : "true");
    });
  }

  const submitButton = $("#gatePasswordLogin");
  if (submitButton) {
    const label = submitButton.querySelector("span:last-child");
    new MutationObserver(() => {
      if (label) label.textContent = submitButton.disabled ? "登录中…" : "登录";
    }).observe(submitButton, { attributes: true, attributeFilter: ["disabled"] });
  }

  if (loginForm && gateError) {
    new MutationObserver(() => {
      loginForm.classList.toggle("has-error", Boolean(gateError.textContent.trim()));
    }).observe(gateError, { childList: true, characterData: true, subtree: true });
  }

  const avatar = $("#accountAvatar");
  if (avatar) {
    const render = () => {
      const text = (topbarAdmin.textContent || "").trim();
      avatar.textContent = text && text !== "未登录" ? text.charAt(0) : "·";
    };
    new MutationObserver(render).observe(topbarAdmin, { childList: true, characterData: true, subtree: true });
    render();
  }
})();

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
