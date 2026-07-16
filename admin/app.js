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
    ["tenant-dashboard", "总览"],
    ["tenant-members", "成员与名片"],
    ["tenant-company", "企业主页"],
    ["tenant-design", "字段与模板"],
    ["tenant-sync", "同步与回调"],
    ["tenant-billing", "版本与额度"],
    ["tenant-admins", "管理员"],
    ["tenant-audit", "审计日志"]
  ],
  platform: [
    ["platform-dashboard", "总览"],
    ["platform-tenants", "企业"],
    ["platform-wecom", "授权与回调"],
    ["platform-commercial", "商业化"],
    ["platform-features", "功能开关"],
    ["platform-ops", "运维"],
    ["platform-audit", "审计"],
    ["platform-accounts", "系统账号"]
  ]
};

const state = {
  adminToken: sessionStorage.getItem("bc_admin_token") || "",
  admin: null,
  mode: "tenant",
  page: "tenant-dashboard",
  members: [],
  selectedMemberId: "",
  memberCard: null,
  companyProfile: null,
  companyHonors: [],
  deletedHonorIds: [],
  videoCapability: null,
  fieldSettings: [],
  templates: [],
  selectedTemplateId: "",
  tenantFeatures: [],
  tenantAuthorizations: { items: [], total: 0, page: 1, pageSize: 20 }
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
  state.page = state.mode === "platform" ? "platform-dashboard" : "tenant-dashboard";
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

function renderNav() {
  navList.replaceChildren();
  const navItems = [...NAVS[state.mode]];
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
  state.page = page;
  $$(".page").forEach((node) => node.classList.toggle("active", node.dataset.page === page));
  $$("[data-page-target]").forEach((node) => node.classList.toggle("active", node.dataset.pageTarget === page));
  const [crumb, title, subtitle] = PAGE_META[page] || ["后台", "管理后台", ""];
  breadcrumb.textContent = crumb;
  pageTitle.textContent = title;
  pageSubtitle.textContent = subtitle;
  closeDrawer();
  if (options.load !== false) loadCurrentPage();
}

function loadCurrentPage() {
  const loaders = {
    "tenant-dashboard": loadTenantDashboard,
    "tenant-members": loadMembers,
    "tenant-company": loadCompanyProfileBundle,
    "tenant-design": loadDesignBundle,
    "tenant-sync": loadSyncEvents,
    "platform-dashboard": loadPlatformDashboard,
    "platform-tenants": () => loadTenantAuthorizations(),
    "platform-features": loadVideoFeatures,
    "platform-ops": loadDatabaseMigrations
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

function renderRows(tbody, rows, colSpan, render) {
  tbody.replaceChildren();
  if (!rows.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = colSpan;
    td.textContent = "暂无数据";
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
  const [overview, capability] = await Promise.all([
    adminRequest("/admin/overview"),
    adminRequest("/admin/features/company-video").catch(() => null)
  ]);
  $("#metricMembers").textContent = overview.member_count;
  $("#metricCards").textContent = overview.card_count;
  $("#metricActiveCards").textContent = overview.active_card_count;
  $("#metricVideo").textContent = capability?.enabled ? `${capability.effective_limit_mb} MB` : "未开通";
  state.videoCapability = capability;
  renderTenantTodos(overview, capability);
  return { overview, capability };
}

function renderTenantTodos(overview, capability) {
  const root = $("#tenantTodoList");
  const todos = [
    {
      tone: overview.member_count > 0 ? "success" : "warning",
      title: overview.member_count > 0 ? "成员已同步" : "尚未同步成员",
      action: "成员与名片",
      page: "tenant-members"
    },
    {
      tone: overview.active_card_count > 0 ? "success" : "warning",
      title: overview.active_card_count > 0 ? "已有启用名片" : "尚无启用名片",
      action: "编辑名片",
      page: "tenant-members"
    },
    {
      tone: capability?.enabled ? "success" : "muted",
      title: capability?.enabled ? "企业视频能力已启用" : "企业视频能力未开通",
      action: "查看主页",
      page: "tenant-company"
    }
  ];
  root.replaceChildren(...todos.map(taskItem));
}

function taskItem(item) {
  const row = document.createElement("div");
  row.className = "task-item";
  const dot = document.createElement("span");
  dot.className = `risk-dot ${item.tone}`;
  const title = document.createElement("strong");
  title.textContent = item.title;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "secondary";
  button.textContent = item.action;
  button.addEventListener("click", () => showPage(item.page));
  row.append(dot, title, button);
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
  renderRows($("#membersRows"), state.members, 5, (item) => [
    `<strong>${escapeHtml(item.display_name)}</strong><br><code>${escapeHtml(item.member_identity_id)}</code>`,
    tag(item.status === "active" ? "启用" : "停用", statusTone(item.status)),
    `<code>${escapeHtml(item.public_id)}</code>`,
    `${escapeHtml(item.userid || "--")}<br><code>${escapeHtml(item.open_userid || "--")}</code>`,
    actionButton("编辑名片", () => openMemberDrawer(item))
  ]);
  return result;
}

function actionButton(label, handler, className = "secondary") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
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
  drawerFooter.replaceChildren(actionButton("保存名片", saveMemberCard));
  drawer.classList.remove("hidden");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

async function saveMemberCard() {
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
  $("#previewCompanyName").textContent = form.display_name.value || "企业名称";
  $("#previewCompanyIntro").textContent = form.short_name.value || form.address.value || "主页资料读取后展示预览。";
  const root = $("#previewModules");
  const modules = [...(state.companyProfile?.display_modules || [])].sort((a, b) => a.sort_order - b.sort_order);
  root.replaceChildren(...modules.filter((item) => item.visible).map((item) => {
    const div = document.createElement("div");
    div.textContent = item.title;
    return div;
  }));
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
  renderRows($("#fieldRows"), state.fieldSettings, 4, (field) => [
    `<strong>${escapeHtml(field.label)}</strong><br><code>${escapeHtml(field.field_key)}</code>`,
    checkboxCell(field.locked, field.field_key, "locked"),
    checkboxCell(field.employee_editable, field.field_key, "employee_editable"),
    checkboxCell(field.default_visible, field.field_key, "default_visible")
  ]);
  return result;
}

function checkboxCell(checked, key, prop) {
  const label = document.createElement("label");
  label.className = "check-line";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  input.dataset.fieldKey = key;
  input.dataset.fieldProp = prop;
  label.append(input);
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
  renderRows($("#templateRows"), state.templates, 4, (item) => [
    `<strong>${escapeHtml(item.name)}</strong><br><code>${escapeHtml(item.template_id)}</code>`,
    item.is_default ? tag("默认", "brand") : tag("可选", "muted"),
    tag(item.status === "active" ? "启用" : "停用", statusTone(item.status)),
    templateActions(item)
  ]);
}

function templateActions(item) {
  const wrap = document.createElement("div");
  wrap.className = "inline-actions";
  wrap.append(
    actionButton("选择", () => fillTemplateForm(item), "secondary"),
    actionButton("设默认", async () => {
      await run("设置默认模板", () => adminRequest(`/admin/templates/${encodeURIComponent(item.template_id)}/default`, { method: "PUT" }));
      await loadTemplates();
    }, "secondary")
  );
  return wrap;
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

async function loadPlatformDashboard() {
  const [tenants, video, migrations] = await Promise.all([
    adminRequest("/admin/platform/tenants?page=1&page_size=20&status=all"),
    adminRequest("/admin/platform/features/company-video").catch(() => null),
    adminRequest("/admin/database/migrations").catch(() => null)
  ]);
  const active = (tenants.items || []).filter((item) => item.auth_status === "active").length;
  $("#platformTenantCount").textContent = tenants.total || 0;
  $("#platformActiveTenantCount").textContent = active;
  $("#platformVideoStatus").textContent = video?.enabled ? "已启用" : "未启用";
  $("#platformPendingMigrations").textContent = migrations?.pending?.length ?? "--";
  renderPlatformRisks(tenants, video, migrations);
  return { tenants, video, migrations };
}

function renderPlatformRisks(tenants, video, migrations) {
  const risks = [];
  const cancelled = (tenants.items || []).filter((item) => item.auth_status !== "active").length;
  risks.push({ tone: cancelled > 0 ? "warning" : "success", title: cancelled > 0 ? `${cancelled} 家企业授权需检查` : "授权企业状态正常", action: "企业授权", page: "platform-tenants" });
  risks.push({ tone: video?.enabled ? "success" : "muted", title: video?.enabled ? "平台视频能力已启用" : "平台视频能力未启用", action: "功能开关", page: "platform-features" });
  const pending = migrations?.pending?.length ?? 0;
  risks.push({ tone: pending > 0 ? "danger" : "success", title: pending > 0 ? `${pending} 个数据库迁移待执行` : "数据库迁移已同步", action: "运维", page: "platform-ops" });
  $("#platformRiskList").replaceChildren(...risks.map(taskItem));
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
  renderRows($("#tenantAuthorizationRows"), current.items, 6, (item) => [
    `<strong>${escapeHtml(item.tenant_name)}</strong><br><code>${escapeHtml(item.open_corpid)}</code>`,
    tag(item.auth_status === "active" ? "授权有效" : item.auth_status, statusTone(item.auth_status)),
    `${item.active_member_count} / ${item.member_count}`,
    `${item.active_card_count} / ${item.card_count}`,
    formatDate(item.authorized_at),
    actionButton("查看详情", () => openTenantDetail(item.tenant_id), "secondary")
  ]);
  const totalPages = Math.max(1, Math.ceil(current.total / current.pageSize));
  $("#tenantAuthorizationPage").textContent = `第 ${current.page} / ${totalPages} 页`;
  $("#tenantAuthorizationPrev").disabled = current.page <= 1;
  $("#tenantAuthorizationNext").disabled = current.page >= totalPages;
  $("#tenantAuthorizationTotal").textContent = `${current.total} 家企业`;
}

async function openTenantDetail(tenantId) {
  const item = await run("读取企业授权详情", () => adminRequest(`/admin/platform/tenants/${encodeURIComponent(tenantId)}`));
  drawerTitle.textContent = item.tenant_name;
  drawerSubtitle.textContent = item.open_corpid;
  const fields = [
    ["授权健康", item.authorization_healthy ? "正常" : "需要检查"],
    ["授权状态", item.auth_status],
    ["AgentID", item.agent_id || "--"],
    ["安装时间", formatDate(item.authorized_at)],
    ["取消时间", formatDate(item.cancel_auth_time)],
    ["成员", `${item.active_member_count} 活跃 / ${item.member_count} 总数`],
    ["管理员", `${item.active_admin_count} 活跃 / ${item.admin_count} 总数`],
    ["名片", `${item.active_card_count} 启用 / ${item.card_count} 总数`],
    ["永久授权码", item.permanent_code_configured ? "已安全保存" : "未配置"],
    ["企业 Token", item.corp_token_cached ? `已缓存，${formatDate(item.corp_token_expires_at)} 到期` : "未缓存"],
    ["最近回调", item.last_callback ? `${item.last_callback.event_type} · ${item.last_callback.status}` : "暂无"],
    ["回调时间", formatDate(item.last_callback?.received_at)]
  ];
  drawerBody.innerHTML = `<div class="detail-grid">${fields.map(([label, value]) => `
    <div class="detail-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>
  `).join("")}</div><h3 style="margin-top:16px">授权范围</h3><pre class="output">${escapeHtml(JSON.stringify(item.auth_scope || {}, null, 2))}</pre>`;
  drawerFooter.replaceChildren();
  drawer.classList.remove("hidden");
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
      const updated = await run("保存企业功能", () => adminRequest(`/admin/platform/features/company-video/tenants/${encodeURIComponent(item.tenant_id)}`, {
        method: "PUT",
        body: {
          enabled: enabled.checked,
          limit_bytes: limit.value ? Math.round(Number(limit.value) * 1048576) : null
        }
      }));
      state.tenantFeatures[index] = updated;
      renderTenantFeatures();
    });
    row.append(name, enabledLabel, limit, save);
    return row;
  }));
}

async function loadDatabaseMigrations() {
  const result = await adminRequest("/admin/database/migrations");
  const pending = result.pending_migrations || [];
  const files = result.migration_files || [];
  $("#databaseDir").textContent = result.database_dir || result.databaseDir || "--";
  $("#databaseMigrationFiles").textContent = String(files.length);
  $("#databasePendingCount").textContent = String(result.pending_count ?? pending.length);
  const rows = files.length ? files.map((file) => ({
    name: String(file).replace(/\.sql$/, ""),
    file: String(file),
    status: pending.some((p) => p.file_name === file || p.name === String(file).replace(/\.sql$/, "")) ? "pending" : "applied"
  })) : pending.map((item) => ({ name: item.name, file: item.file_name, status: "pending" }));
  renderRows($("#databaseMigrationRows"), rows, 3, (item) => [
    escapeHtml(item.name),
    `<code>${escapeHtml(item.file)}</code>`,
    tag(item.status === "pending" ? "待执行" : "已执行", item.status === "pending" ? "warning" : "success")
  ]);
  return result;
}

function closeDrawer() {
  drawer.classList.add("hidden");
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
  if (!state.companyProfile) await loadCompanyProfileOnly();
  const profile = await run("保存主页", () => adminRequest("/admin/company-profile", { method: "PUT", body: companyPayloadFromForm() }));
  fillCompany(profile);
  notify("企业主页已保存");
});
$("#companyForm").addEventListener("input", renderCompanyPreview);
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
  const result = await run("保存字段规则", () => adminRequest("/admin/settings/fields", { method: "PUT", body: fieldSettingsPayload() }));
  state.fieldSettings = result.fields || [];
  await loadFieldSettings();
  notify("字段规则已保存");
});
$("#templateForm").addEventListener("submit", (event) => event.preventDefault());
$("#loadTemplates").addEventListener("click", () => run("读取模板", loadTemplates));
$("#createTemplate").addEventListener("click", async () => {
  const template = await run("新增模板", () => adminRequest("/admin/templates", { method: "POST", body: templatePayload(false) }));
  fillTemplateForm(template);
  await loadTemplates();
});
$("#updateTemplate").addEventListener("click", async () => {
  const templateId = $("#templateId").value.trim();
  if (!templateId) throw new Error("请先选择模板");
  const template = await run("保存模板", () => adminRequest(`/admin/templates/${encodeURIComponent(templateId)}`, { method: "PUT", body: templatePayload(true) }));
  fillTemplateForm(template);
  await loadTemplates();
});
$("#setDefaultTemplate").addEventListener("click", async () => {
  const templateId = $("#templateId").value.trim();
  if (!templateId) throw new Error("请先选择模板");
  const template = await run("设置默认模板", () => adminRequest(`/admin/templates/${encodeURIComponent(templateId)}/default`, { method: "PUT" }));
  fillTemplateForm(template);
  await loadTemplates();
});

$("#loadSyncEvents").addEventListener("click", () => run("刷新同步事件", loadSyncEvents));
$("#retrySyncEvents").addEventListener("click", async () => {
  const ok = await confirmAction({ title: "确认重试失败事件", body: "系统会重新处理当前企业可重试的失败同步事件。", danger: true });
  if (ok) {
    await run("重试失败事件", () => adminRequest("/admin/sync-events/retry", { method: "POST" }));
    await loadSyncEvents();
  }
});

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
$("#loadVideoFeatures").addEventListener("click", () => run("读取功能开关", loadVideoFeatures));
$("#searchTenantFeatures").addEventListener("click", () => run("搜索企业功能", loadVideoFeatures));
$("#saveVideoFeatures").addEventListener("click", async () => {
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
$("#loadDatabaseMigrations").addEventListener("click", () => run("检测迁移", loadDatabaseMigrations));
$("#runDatabaseMigrations").addEventListener("click", async () => {
  const ok = await confirmAction({
    title: "确认执行数据库迁移",
    body: "这是高风险运维动作。执行前请确认目标数据库和备份状态。",
    reason: true,
    danger: true
  });
  if (ok) {
    await run("执行迁移", () => adminRequest("/admin/database/migrations/run", { method: "POST", timeoutMs: 130000 }));
    await loadDatabaseMigrations();
  }
});
$("#closeDrawer").addEventListener("click", closeDrawer);
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

void boot();
