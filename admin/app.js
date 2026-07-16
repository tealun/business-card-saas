// Dev mode unlocks the debug surfaces (API Base override, 授权与联调 panel).
// Production visitors get the login gate and a fixed same-origin API base only.
const DEV_MODE = (() => {
  try {
    if (new URLSearchParams(window.location.search).has("dev")) {
      return true;
    }
  } catch (_) {
    /* ignore */
  }
  return (
    window.location.protocol === "file:" ||
    ["localhost", "127.0.0.1"].includes(window.location.hostname)
  );
})();

const state = {
  token: "",
  adminToken: sessionStorage.getItem("bc_admin_token") || "",
  card: null,
  fieldSettings: [],
  templates: [],
  selectedTemplateId: "",
  adminMemberId: "",
  shareId: "",
  visitToken: "",
  anonId: ""
  ,companyProfile: null,
  companyHonors: [],
  deletedHonorIds: [],
  videoCapability: { enabled: false },
  tenantFeatures: [],
  tenantAuthorizations: { items: [], total: 0, page: 1, pageSize: 20 }
};

const apiBaseInput = document.querySelector("#apiBase");
const apiStatus = document.querySelector("#apiStatus");
const loginStatus = document.querySelector("#loginStatus");
const adminStatus = document.querySelector("#adminStatus");
const shareStatus = document.querySelector("#shareStatus");
const sessionOutput = document.querySelector("#sessionOutput");
const publicOutput = document.querySelector("#publicOutput");
const adminOutput = document.querySelector("#adminOutput");
const adminCardOutput = document.querySelector("#adminCardOutput");
const companyOutput = document.querySelector("#companyOutput");
const configOutput = document.querySelector("#configOutput");
const cardForm = document.querySelector("#cardForm");
const companyForm = document.querySelector("#companyForm");
const sharePath = document.querySelector("#sharePath");
const adminTokenInput = document.querySelector("#adminToken");
const adminLoginCodeInput = document.querySelector("#adminLoginCode");
const adminClaimTokenInput = document.querySelector("#adminClaimToken");
const wecomLaunchTokenInput = document.querySelector("#wecomLaunchToken");
const wecomRedirectUriInput = document.querySelector("#wecomRedirectUri");
const adminMemberIdInput = document.querySelector("#adminMemberId");
const adminCardStatusInput = document.querySelector("#adminCardStatus");
const templateForm = document.querySelector("#templateForm");
const templateIdInput = document.querySelector("#templateId");
const templateNameInput = document.querySelector("#templateName");
const templateStatusInput = document.querySelector("#templateStatus");
const templateBackgroundUrlInput = document.querySelector("#templateBackgroundUrl");
const templateLogoUrlInput = document.querySelector("#templateLogoUrl");
const templatePrimaryColorInput = document.querySelector("#templatePrimaryColor");
const templateSurfaceColorInput = document.querySelector("#templateSurfaceColor");
const templateLayoutVariantInput = document.querySelector("#templateLayoutVariant");
const metricMembers = document.querySelector("#metricMembers");
const metricCards = document.querySelector("#metricCards");
const metricActiveCards = document.querySelector("#metricActiveCards");
const membersTotal = document.querySelector("#membersTotal");
const memberSearchInput = document.querySelector("#memberSearch");
const memberStatusFilterInput = document.querySelector("#memberStatusFilter");
const memberLimitInput = document.querySelector("#memberLimit");
const memberOffsetInput = document.querySelector("#memberOffset");
const membersRows = document.querySelector("#membersRows");
const fieldRows = document.querySelector("#fieldRows");
const templateRows = document.querySelector("#templateRows");
const syncEventRows = document.querySelector("#syncEventRows");
const databaseDirText = document.querySelector("#databaseDir");
const databaseMigrationFilesText = document.querySelector("#databaseMigrationFiles");
const databasePendingCountText = document.querySelector("#databasePendingCount");
const databaseMigrationRows = document.querySelector("#databaseMigrationRows");
const databaseOutput = document.querySelector("#databaseOutput");
const authGate = document.querySelector("#authGate");
const adminShell = document.querySelector("#adminShell");
const gateLoginCodeInput = document.querySelector("#gateLoginCode");
const gateClaimTokenInput = document.querySelector("#gateClaimToken");
const gateLoginButton = document.querySelector("#gateLogin");
const gateError = document.querySelector("#gateError");
const topbarAdmin = document.querySelector("#topbarAdmin");
const logoutButton = document.querySelector("#logoutButton");
const moduleEditor = document.querySelector("#moduleEditor");
const serviceEditor = document.querySelector("#serviceEditor");
const introEditor = document.querySelector("#introEditor");
const honorEditor = document.querySelector("#honorEditor");
const featureOutput = document.querySelector("#featureOutput");
const tenantAuthorizationRows = document.querySelector("#tenantAuthorizationRows");
const tenantAuthorizationOutput = document.querySelector("#tenantAuthorizationOutput");
const tenantAuthorizationDetailPanel = document.querySelector("#tenantAuthorizationDetailPanel");
const tenantAuthorizationDetail = document.querySelector("#tenantAuthorizationDetail");
const tenantAuthorizationScope = document.querySelector("#tenantAuthorizationScope");

apiBaseInput.value = defaultApiBase();
adminTokenInput.value = state.adminToken;
apiBaseInput.addEventListener("change", () => localStorage.setItem("bc_api_base", apiBaseInput.value.trim()));
templateForm.addEventListener("submit", (event) => event.preventDefault());

document.querySelectorAll("[data-view-target]").forEach((button) => {
  button.addEventListener("click", () => {
    const target = button.getAttribute("data-view-target");
    document.querySelectorAll("[data-view]").forEach((view) => {
      view.classList.toggle("active", view.getAttribute("data-view") === target);
    });
    document.querySelectorAll("[data-view-target]").forEach((item) => {
      item.classList.toggle("active", item === button);
    });
  });
});

function apiBase() {
  if (!DEV_MODE) {
    // Production API base comes from the operator-managed config.js (absent =>
    // same origin). Never from user input, so tokens cannot be redirected.
    const configured = String(window.BC_ADMIN_CONFIG?.apiBase || "").trim().replace(/\/$/, "");
    if (configured && /^https:\/\//.test(configured)) {
      return configured;
    }
    return `${window.location.origin}/api/v1`;
  }
  const value = apiBaseInput.value.trim().replace(/\/$/, "");
  if (!value) {
    throw new Error("请先配置 API Base");
  }
  if (!/^https?:\/\//.test(value)) {
    throw new Error("API Base 必须是 http(s) URL");
  }
  return value;
}

function defaultApiBase() {
  const saved = localStorage.getItem("bc_api_base");
  if (saved) {
    return saved;
  }
  if (window.location.protocol === "http:" || window.location.protocol === "https:") {
    return `${window.location.origin}/api/v1`;
  }
  return "";
}

async function request(path, options = {}) {
  const isIdempotent = (options.method || "GET").toUpperCase() === "GET";
  const maxRetries = isIdempotent ? 1 : 0;
  const timeoutMs = options.timeoutMs || (isIdempotent ? 10_000 : 15_000);

  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const result = await fetchOnce(path, options, controller.signal);
      clearTimeout(timeoutId);
      return result;
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error;
      if (!isIdempotent || attempt === maxRetries) {
        throw error;
      }
    }
  }
  throw lastError;
}

async function fetchOnce(path, options, signal) {
  const hasBody = Object.prototype.hasOwnProperty.call(options, "body");
  const headers = {
    ...(options.headers || {})
  };
  if (hasBody && !headers["content-type"]) {
    headers["content-type"] = "application/json";
  }
  const token = options.token === undefined ? state.token : options.token;
  if (options.auth !== false && token) {
    headers.authorization = `Bearer ${token}`;
  }
  const response = await fetch(`${apiBase()}${path}`, {
    ...options,
    headers,
    signal,
    body: hasBody ? JSON.stringify(options.body) : undefined
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { message: `服务响应异常 (${response.status} ${response.statusText})` };
  }
  if (!response.ok) {
    const error = new Error(body?.message || `${response.status} ${response.statusText}`);
    error.status = response.status;
    throw error;
  }
  return body && typeof body === "object" && "data" in body ? body.data : body;
}

async function adminRequest(path, options = {}) {
  const inputToken = adminTokenInput.value.trim();
  if (inputToken) {
    state.adminToken = inputToken;
  }
  try {
    return await request(path, { ...options, token: state.adminToken });
  } catch (error) {
    if (error && error.status === 401) {
      expireAdminSession("登录已过期，请重新登录");
    }
    throw error;
  }
}

function setAuthedUi(admin) {
  topbarAdmin.textContent = admin ? `${admin.tenant_name} · ${admin.role}` : "未登录";
}

function showGate(message) {
  authGate.classList.remove("hidden");
  adminShell.classList.add("hidden");
  gateError.textContent = message || "";
}

function showConsole() {
  authGate.classList.add("hidden");
  adminShell.classList.remove("hidden");
}

function expireAdminSession(message) {
  state.adminToken = "";
  sessionStorage.removeItem("bc_admin_token");
  adminTokenInput.value = "";
  adminStatus.textContent = "未连接";
  setAuthedUi(null);
  showGate(message);
}

function applyAdminIdentity(admin) {
  adminStatus.textContent = `${admin.role} · ${admin.tenant_name}`;
  setAuthedUi(admin);
  state.adminMemberId = admin.member_identity_id || "";
  adminMemberIdInput.value = state.adminMemberId;
  document.querySelector("#featuresNav").classList.toggle("hidden", admin.account_type !== "platform");
  document.querySelector("#tenantAuthorizationsNav").classList.toggle("hidden", admin.account_type !== "platform");
}

function write(target, value) {
  target.textContent = JSON.stringify(value, null, 2);
}

function fillCard(card) {
  state.card = card;
  cardForm.display_name.value = card.display_name || "";
  cardForm.title.value = card.title || "";
  cardForm.mobile.value = card.fields?.mobile || "";
  cardForm.phone.value = card.fields?.phone || "";
  cardForm.email.value = card.fields?.email || "";
  cardForm.wechat_id.value = card.fields?.wechat_id || "";
  cardForm.address.value = card.fields?.address || "";
  cardForm.show_mobile.checked = Boolean(card.privacy?.show_mobile);
  cardForm.show_email.checked = Boolean(card.privacy?.show_email);
  cardForm.show_wechat.checked = Boolean(card.privacy?.show_wechat);
  cardForm.allow_forward.checked = card.privacy?.allow_forward !== false;
  if (adminCardStatusInput) {
    adminCardStatusInput.value = card.status || "active";
  }
}

function cardPayloadFromForm() {
  assertRequired(cardForm.display_name.value, "姓名");
  validateOptionalPhone(cardForm.mobile.value, "手机");
  validateOptionalPhone(cardForm.phone.value, "座机");
  validateOptionalEmail(cardForm.email.value, "邮箱");
  return {
    display_name: cardForm.display_name.value,
    title: cardForm.title.value || null,
    fields: {
      mobile: cardForm.mobile.value || null,
      phone: cardForm.phone.value || null,
      email: cardForm.email.value || null,
      wechat_id: cardForm.wechat_id.value || null,
      address: cardForm.address.value || null
    },
    privacy: {
      show_mobile: cardForm.show_mobile.checked,
      show_email: cardForm.show_email.checked,
      show_wechat: cardForm.show_wechat.checked,
      allow_forward: cardForm.allow_forward.checked
    }
  };
}

function fillCompany(profile) {
  state.companyProfile = structuredClone(profile);
  companyForm.display_name.value = profile.display_name || "";
  companyForm.short_name.value = profile.short_name || "";
  companyForm.logo_url.value = profile.logo_url || "";
  companyForm.website_url.value = profile.website_url || "";
  companyForm.address.value = profile.address || "";
  companyForm.visible.checked = Boolean(profile.visible);
  companyForm.status.value = profile.status || "draft";
  renderCompanyEditors();
}

function inputField(value, placeholder, key, index, group, type = "text") {
  const input = document.createElement(type === "textarea" ? "textarea" : "input");
  if (type !== "textarea") input.type = type;
  input.value = value ?? ""; input.placeholder = placeholder; input.dataset.key = key; input.dataset.index = index; input.dataset.group = group;
  return input;
}

function renderCompanyEditors() {
  const profile = state.companyProfile || { display_modules: [], service_items: [], intro_blocks: [] };
  moduleEditor.replaceChildren();
  [...profile.display_modules].sort((a,b)=>a.sort_order-b.sort_order).forEach((item,index,array)=>{
    const row=document.createElement("div"); row.className="editor-row module-row"; row.dataset.key=item.key;
    const title=inputField(item.title,"模块标题","title",index,"module");
    const visible=inputField("","","visible",index,"module","checkbox"); visible.checked=item.visible;
    const layout=document.createElement("select"); layout.dataset.key="layout"; layout.dataset.index=index; layout.dataset.group="module";
    ["text","image","graphic","grid","carousel"].forEach((value)=>{const option=document.createElement("option");option.value=value;option.textContent=value;option.selected=value===item.layout;layout.append(option);});
    const up=document.createElement("button");up.type="button";up.textContent="上移";up.disabled=index===0;up.onclick=()=>moveModule(item.key,-1);
    const down=document.createElement("button");down.type="button";down.textContent="下移";down.disabled=index===array.length-1;down.onclick=()=>moveModule(item.key,1);
    const name=document.createElement("strong");name.textContent=item.key;
    row.append(name,title,visible,layout,up,down);moduleEditor.append(row);
  });
  serviceEditor.replaceChildren();
  profile.service_items.forEach((item,index)=>{const row=document.createElement("div");row.className="editor-row service-edit-row";[inputField(item.title,"标题","title",index,"service"),inputField(item.description,"描述","description",index,"service","textarea"),inputField(item.image_url,"图片 URL","image_url",index,"service")].forEach((node)=>row.append(node));const visible=inputField("","","visible",index,"service","checkbox");visible.checked=item.visible!==false;row.append(visible);const remove=document.createElement("button");remove.type="button";remove.textContent="删除";remove.onclick=()=>{profile.service_items.splice(index,1);renderCompanyEditors();};row.append(remove);serviceEditor.append(row);});
  introEditor.replaceChildren();
  profile.intro_blocks.forEach((item,index)=>{const row=document.createElement("div");row.className="editor-row intro-edit-row";const label=document.createElement("strong");label.textContent=item.type;row.append(label);if(["heading","paragraph","quote"].includes(item.type))row.append(inputField(item.text,"内容","text",index,"intro","textarea"));else if(item.type==="image")row.append(inputField(item.url,"图片 URL","url",index,"intro"),inputField(item.caption,"说明","caption",index,"intro"));else if(item.type==="gallery")row.append(inputField(item.images.map(x=>`${x.url}|${x.caption||""}`).join("\n"),"每行 URL|说明","images",index,"intro","textarea"));else if(item.type==="video")row.append(inputField(item.video_id,"视频 ID","video_id",index,"intro"));const remove=document.createElement("button");remove.type="button";remove.textContent="删除";remove.onclick=()=>{profile.intro_blocks.splice(index,1);renderCompanyEditors();};row.append(remove);introEditor.append(row);});
  const addVideo=document.querySelector("#addVideo");addVideo.disabled=!state.videoCapability.enabled;document.querySelector("#videoCapabilityHint").textContent=state.videoCapability.enabled?`视频已开通，上限 ${state.videoCapability.effective_limit_mb} MB`:"视频是高级功能，请联系平台开通";
  renderHonorEditors();
}

function moveModule(key,direction){const items=[...state.companyProfile.display_modules].sort((a,b)=>a.sort_order-b.sort_order);const index=items.findIndex(x=>x.key===key);const target=index+direction;if(target<0||target>=items.length)return;[items[index],items[target]]=[items[target],items[index]];items.forEach((item,i)=>item.sort_order=(i+1)*10);state.companyProfile.display_modules=items;renderCompanyEditors();}

function syncCompanyEditors() {
  document.querySelectorAll('[data-group="module"]').forEach((node)=>{const item=[...state.companyProfile.display_modules].sort((a,b)=>a.sort_order-b.sort_order)[Number(node.dataset.index)];item[node.dataset.key]=node.type==="checkbox"?node.checked:node.value;});
  document.querySelectorAll('[data-group="service"]').forEach((node)=>{const item=state.companyProfile.service_items[Number(node.dataset.index)];item[node.dataset.key]=node.type==="checkbox"?node.checked:node.value||null;});
  document.querySelectorAll('[data-group="intro"]').forEach((node)=>{const item=state.companyProfile.intro_blocks[Number(node.dataset.index)];if(node.dataset.key==="images")item.images=node.value.split(/\n/).filter(Boolean).map(line=>{const [url,...caption]=line.split("|");return{url:url.trim(),caption:caption.join("|").trim()};});else item[node.dataset.key]=node.value;});
}

function honorInput(value, placeholder, key, honorIndex, imageIndex = "") {
  const input = document.createElement(key === "body" || key === "images_text" ? "textarea" : "input");
  if (key === "visible") input.type = "checkbox";
  else if (key === "sort_order") input.type = "number";
  input.value = value ?? "";
  input.placeholder = placeholder;
  input.dataset.group = imageIndex === "" ? "honor" : "honor-image";
  input.dataset.key = key;
  input.dataset.honorIndex = honorIndex;
  if (imageIndex !== "") input.dataset.imageIndex = imageIndex;
  return input;
}

function renderHonorEditors() {
  if (!honorEditor) return;
  const honors = state.companyHonors || [];
  honorEditor.replaceChildren();
  if (!honors.length) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "暂无荣誉资质";
    honorEditor.append(empty);
    return;
  }
  honors.sort((a, b) => Number(a.sort_order) - Number(b.sort_order));
  honors.forEach((honor, honorIndex) => {
    const block = document.createElement("div");
    block.className = "honor-edit-block";
    const row = document.createElement("div");
    row.className = "editor-row honor-edit-row";
    const title = honorInput(honor.title, "荣誉标题", "title", honorIndex);
    const body = honorInput(honor.body || "", "说明", "body", honorIndex);
    const sort = honorInput(honor.sort_order ?? (honorIndex + 1) * 10, "排序", "sort_order", honorIndex);
    const status = document.createElement("select");
    status.dataset.group = "honor";
    status.dataset.key = "status";
    status.dataset.honorIndex = honorIndex;
    ["draft", "published"].forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      option.selected = (honor.status || "draft") === value;
      status.append(option);
    });
    const visible = honorInput("", "", "visible", honorIndex);
    visible.checked = honor.visible !== false;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "移除";
    remove.onclick = () => {
      if (honor.honor_id && !String(honor.honor_id).startsWith("draft_")) {
        state.deletedHonorIds.push(String(honor.honor_id));
      }
      honors.splice(honorIndex, 1);
      renderHonorEditors();
    };
    row.append(title, body, sort, status, visible, remove);
    block.append(row);

    const images = document.createElement("div");
    images.className = "honor-image-list";
    (honor.images || []).forEach((image, imageIndex) => {
      const imageRow = document.createElement("div");
      imageRow.className = "editor-row honor-image-row";
      imageRow.append(
        honorInput(image.image_url, "图片 URL", "image_url", honorIndex, imageIndex),
        honorInput(image.title || "", "图片标题", "title", honorIndex, imageIndex),
        honorInput(image.caption || "", "图片说明", "caption", honorIndex, imageIndex),
        honorInput(image.sort_order ?? (imageIndex + 1) * 10, "排序", "sort_order", honorIndex, imageIndex)
      );
      const removeImage = document.createElement("button");
      removeImage.type = "button";
      removeImage.textContent = "删图";
      removeImage.onclick = () => { honor.images.splice(imageIndex, 1); renderHonorEditors(); };
      imageRow.append(removeImage);
      images.append(imageRow);
    });
    const addImage = document.createElement("button");
    addImage.type = "button";
    addImage.className = "secondary mini-button";
    addImage.textContent = "添加图片";
    addImage.onclick = () => {
      honor.images = honor.images || [];
      if (honor.images.length >= 12) return;
      honor.images.push({ image_url: "", title: null, caption: null, sort_order: (honor.images.length + 1) * 10 });
      renderHonorEditors();
    };
    block.append(images, addImage);
    honorEditor.append(block);
  });
}

function syncHonorEditors() {
  document.querySelectorAll('[data-group="honor"]').forEach((node) => {
    const honor = state.companyHonors[Number(node.dataset.honorIndex)];
    if (!honor) return;
    honor[node.dataset.key] = node.type === "checkbox"
      ? node.checked
      : node.dataset.key === "sort_order" ? Number(node.value || 0) : node.value || null;
  });
  document.querySelectorAll('[data-group="honor-image"]').forEach((node) => {
    const honor = state.companyHonors[Number(node.dataset.honorIndex)];
    const image = honor?.images?.[Number(node.dataset.imageIndex)];
    if (!image) return;
    image[node.dataset.key] = node.dataset.key === "sort_order" ? Number(node.value || 0) : node.value || null;
  });
  state.companyHonors.forEach((honor, honorIndex) => {
    honor.sort_order = Number(honor.sort_order || (honorIndex + 1) * 10);
    honor.images = (honor.images || [])
      .filter((image) => String(image.image_url || "").trim())
      .map((image, imageIndex) => ({
        ...image,
        image_url: String(image.image_url || "").trim(),
        title: image.title ? String(image.title).trim() : null,
        caption: image.caption ? String(image.caption).trim() : null,
        sort_order: Number(image.sort_order || (imageIndex + 1) * 10)
      }));
  });
}

function text(value) {
  if (value === null || value === undefined || value === "") {
    return "--";
  }
  if (typeof value === "boolean") {
    return value ? "是" : "否";
  }
  return String(value);
}

function renderRows(tbody, rows, colSpan, cells) {
  tbody.replaceChildren();
  if (!rows?.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = colSpan;
    cell.textContent = "暂无数据";
    row.append(cell);
    tbody.append(row);
    return;
  }
  rows.forEach((item) => {
    const row = document.createElement("tr");
    cells(item).forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = text(value);
      row.append(cell);
    });
    tbody.append(row);
  });
}

function renderOverview(result) {
  metricMembers.textContent = text(result.member_count);
  metricCards.textContent = text(result.card_count);
  metricActiveCards.textContent = text(result.active_card_count);
}

function renderMembers(result) {
  membersTotal.textContent = text(result.total);
  renderRows(membersRows, result.items, 4, (member) => [
    member.display_name,
    member.status === "active" ? "启用" : "停用",
    member.public_id,
    member.userid || member.open_userid
  ]);
}

function adminMemberListPath() {
  const params = new URLSearchParams();
  const search = memberSearchInput.value.trim();
  const limit = Math.min(Math.max(Number(memberLimitInput.value) || 50, 1), 100);
  const offset = Math.max(Number(memberOffsetInput.value) || 0, 0);
  if (search) {
    params.set("search", search);
  }
  params.set("status", memberStatusFilterInput.value || "all");
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  memberLimitInput.value = String(limit);
  memberOffsetInput.value = String(offset);
  return `/admin/members?${params.toString()}`;
}

function renderSyncEvents(result) {
  renderRows(syncEventRows, result.items, 5, (event) => [
    event.event_type,
    event.change_type,
    event.status,
    event.retry_count,
    event.processed_at || event.received_at
  ]);
}

function renderDatabaseMigrations(result) {
  databaseDirText.textContent = result.database_dir || (result.configured ? "--" : "未配置");
  databaseMigrationFilesText.textContent = text(result.migration_files?.length || 0);
  databasePendingCountText.textContent = text(result.pending_count);
  const rows = result.pending_migrations?.length
    ? result.pending_migrations
    : (result.migration_files || []).map((fileName) => ({
        name: fileName.replace(/\.(js|sql)$/, ""),
        file_name: fileName,
        applied: true
      }));
  renderRows(databaseMigrationRows, rows, 3, (migration) => [
    migration.name,
    migration.file_name,
    migration.applied ? "已执行" : "待执行"
  ]);
}

function renderFieldSettings(result) {
  state.fieldSettings = result.fields || [];
  fieldRows.replaceChildren();
  if (!state.fieldSettings.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 4;
    cell.textContent = "暂无数据";
    row.append(cell);
    fieldRows.append(row);
    return;
  }
  state.fieldSettings.forEach((field) => {
    const row = document.createElement("tr");
    row.dataset.fieldKey = field.field_key;
    row.dataset.label = field.label;
    const labelCell = document.createElement("td");
    labelCell.textContent = field.label;
    row.append(labelCell);
    ["locked", "employee_editable", "default_visible"].forEach((key) => {
      const cell = document.createElement("td");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = Boolean(field[key]);
      checkbox.dataset.fieldProp = key;
      cell.append(checkbox);
      row.append(cell);
    });
    fieldRows.append(row);
  });
}

function renderTemplates(result) {
  state.templates = result.items || [];
  templateRows.replaceChildren();
  if (!state.templates.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 5;
    cell.textContent = "暂无数据";
    row.append(cell);
    templateRows.append(row);
    return;
  }
  const selectedTemplate =
    state.templates.find((template) => template.template_id === state.selectedTemplateId) ||
    state.templates.find((template) => template.is_default) ||
    state.templates[0];
  if (selectedTemplate) {
    fillTemplateForm(selectedTemplate);
  }
  state.templates.forEach((template) => {
    const row = document.createElement("tr");
    row.dataset.templateId = template.template_id;
    row.classList.toggle("selected-row", template.template_id === state.selectedTemplateId);

    const nameCell = document.createElement("td");
    const name = document.createElement("strong");
    name.textContent = template.name;
    const id = document.createElement("span");
    id.className = "muted-line";
    id.textContent = template.template_id;
    nameCell.append(name, id);
    row.append(nameCell);

    const defaultCell = document.createElement("td");
    defaultCell.textContent = template.is_default ? "是" : "否";
    row.append(defaultCell);

    const statusCell = document.createElement("td");
    statusCell.textContent = template.status;
    row.append(statusCell);

    const colorCell = document.createElement("td");
    colorCell.append(
      colorSwatch(String(template.color_scheme?.primary || "#1677ff")),
      colorSwatch(String(template.color_scheme?.surface || "#ffffff"))
    );
    row.append(colorCell);

    const actionCell = document.createElement("td");
    actionCell.className = "table-actions";
    actionCell.append(
      templateActionButton("选择", "select", template.template_id),
      templateActionButton("默认", "default", template.template_id)
    );
    row.append(actionCell);
    templateRows.append(row);
  });
}

function fieldSettingsPayloadFromTable() {
  const rows = [...fieldRows.querySelectorAll("tr[data-field-key]")];
  if (!rows.length) {
    throw new Error("请先加载字段规则");
  }
  return {
    fields: rows.map((row) => {
      const locked = row.querySelector('[data-field-prop="locked"]');
      const employeeEditable = row.querySelector('[data-field-prop="employee_editable"]');
      const defaultVisible = row.querySelector('[data-field-prop="default_visible"]');
      const fieldKey = row.dataset.fieldKey;
      const label = row.dataset.label;
      if (
        !fieldKey ||
        !label ||
        !(locked instanceof HTMLInputElement) ||
        !(employeeEditable instanceof HTMLInputElement) ||
        !(defaultVisible instanceof HTMLInputElement)
      ) {
        throw new Error("字段规则表格状态异常");
      }
      return {
        field_key: fieldKey,
        label,
        locked: locked.checked,
        employee_editable: employeeEditable.checked,
        default_visible: defaultVisible.checked
      };
    })
  };
}

function colorSwatch(color) {
  const swatch = document.createElement("span");
  swatch.className = "color-swatch";
  swatch.style.backgroundColor = color;
  swatch.title = color;
  return swatch;
}

function templateActionButton(label, action, templateId) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "secondary mini-button";
  button.dataset.templateAction = action;
  button.dataset.templateId = templateId;
  button.textContent = label;
  return button;
}

function fillTemplateForm(template) {
  state.selectedTemplateId = template.template_id;
  templateIdInput.value = template.template_id;
  templateNameInput.value = template.name;
  templateStatusInput.value = template.status;
  templateBackgroundUrlInput.value = template.background_url || "";
  templateLogoUrlInput.value = template.logo_url || "";
  templatePrimaryColorInput.value = String(template.color_scheme?.primary || "#1677ff");
  templateSurfaceColorInput.value = String(template.color_scheme?.surface || "#ffffff");
  templateLayoutVariantInput.value = String(template.layout?.variant || "horizontal-business");
}

function nullableUrlFromInput(input) {
  const value = input.value.trim();
  validateOptionalUrl(value, input.name || "URL");
  return value || null;
}

function isValidColor(value) {
  return /^#[0-9A-Fa-f]{6}$/.test(value) || /^#[0-9A-Fa-f]{3}$/.test(value);
}

function templatePayloadFromForm(options = {}) {
  const primary = templatePrimaryColorInput.value.trim() || "#1677ff";
  const surface = templateSurfaceColorInput.value.trim() || "#ffffff";
  if (!isValidColor(primary)) {
    throw new Error(`primary 颜色格式错误: ${primary}`);
  }
  if (!isValidColor(surface)) {
    throw new Error(`surface 颜色格式错误: ${surface}`);
  }
  const payload = {
    name: templateNameInput.value.trim() || "商务蓝模板",
    background_url: nullableUrlFromInput(templateBackgroundUrlInput),
    logo_url: nullableUrlFromInput(templateLogoUrlInput),
    color_scheme: {
      primary,
      surface
    },
    layout: {
      variant: templateLayoutVariantInput.value.trim() || "horizontal-business"
    }
  };
  if (options.includeStatus) {
    payload.status = templateStatusInput.value;
  }
  return payload;
}

function selectedTemplateIdFromForm() {
  const templateId = templateIdInput.value.trim();
  if (!templateId) {
    throw new Error("请先选择模板");
  }
  return templateId;
}

function companyProfilePayloadFromForm() {
  syncCompanyEditors();
  assertRequired(companyForm.display_name.value, "企业名称");
  validateOptionalUrl(companyForm.logo_url.value, "企业 Logo");
  validateOptionalUrl(companyForm.website_url.value, "企业官网");
  return {
    display_name: companyForm.display_name.value.trim(),
    short_name: companyForm.short_name.value.trim() || null,
    logo_url: companyForm.logo_url.value.trim() || null,
    website_url: companyForm.website_url.value.trim() || null,
    address: companyForm.address.value.trim() || null,
    intro_blocks: state.companyProfile.intro_blocks,
    service_items: state.companyProfile.service_items.map((item,index)=>({...item,id:item.id||`service_${Date.now()}_${index}`,sort_order:(index+1)*10})),
    display_modules: state.companyProfile.display_modules,
    visible: companyForm.visible.checked,
    status: companyForm.status.value
  };
}

function assertRequired(value, label) {
  if (!String(value || "").trim()) {
    throw new Error(`${label}不能为空`);
  }
}

function validateOptionalEmail(value, label) {
  const normalized = String(value || "").trim();
  if (normalized && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error(`${label}格式不正确`);
  }
}

function validateOptionalPhone(value, label) {
  const normalized = String(value || "").trim();
  if (normalized && !/^[0-9+\-\s()]{5,32}$/.test(normalized)) {
    throw new Error(`${label}格式不正确`);
  }
}

function validateOptionalUrl(value, label) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return;
  }
  try {
    const url = new URL(normalized);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error("invalid protocol");
    }
  } catch (_) {
    throw new Error(`${label}必须是有效的 http(s) URL`);
  }
}

async function run(label, target, fn) {
  target.textContent = `${label}...`;
  try {
    const result = await fn();
    write(target, result);
    return result;
  } catch (error) {
    target.textContent = error instanceof Error ? error.message : String(error);
    throw error;
  }
}

document.querySelector("#checkHealth").addEventListener("click", async () => {
  await run("checking", sessionOutput, async () => {
    const result = await request("/health", { auth: false });
    apiStatus.textContent = result.ok ? "正常" : "异常";
    return result;
  });
});

document.querySelector("#demoLogin").addEventListener("click", async () => {
  const result = await run("logging in", sessionOutput, async () => request("/auth/qy-login", {
    method: "POST",
    auth: false,
    body: { code: "demo-qy-code" }
  }));
  state.token = result.access_token;
  loginStatus.textContent = result.current_identity.display_name;
});

document.querySelector("#loadCard").addEventListener("click", async () => {
  const card = await run("loading card", sessionOutput, async () => request("/employee/cards/current"));
  fillCard(card);
});

document.querySelector("#saveCard").addEventListener("click", async () => {
  const card = await run("saving card", sessionOutput, async () => request("/employee/cards/current", {
    method: "PUT",
    body: cardPayloadFromForm()
  }));
  fillCard(card);
});

document.querySelector("#createShare").addEventListener("click", async () => {
  const share = await run("creating share", publicOutput, async () => request("/employee/cards/current/share", {
    method: "POST"
  }));
  state.shareId = share.share_id;
  shareStatus.textContent = share.share_id;
  sharePath.textContent = share.path;
});

document.querySelector("#loadPublic").addEventListener("click", async () => {
  const publicId = state.card?.public_id || "pub_demo0001";
  await run("loading public card", publicOutput, async () => request(`/public/cards/${publicId}`, { auth: false }));
});

document.querySelector("#createVisit").addEventListener("click", async () => {
  const publicId = state.card?.public_id || "pub_demo0001";
  const result = await run("creating visit", publicOutput, async () => request(`/public/cards/${publicId}/visit`, {
    method: "POST",
    auth: false,
    body: {
      share: state.shareId || "shr_demo0001",
      anon_id: state.anonId || undefined
    }
  }));
  state.visitToken = result.visit_token;
  state.anonId = result.anon_id;
});

document.querySelector("#deriveShare").addEventListener("click", async () => {
  const publicId = state.card?.public_id || "pub_demo0001";
  await run("deriving share", publicOutput, async () => request(`/public/cards/${publicId}/shares/derive`, {
    method: "POST",
    headers: { authorization: `Bearer ${state.visitToken}` },
    body: { parent_share_id: state.shareId || "shr_demo0001" }
  }));
});

document.querySelector("#saveAdminToken").addEventListener("click", () => {
  state.adminToken = adminTokenInput.value.trim();
  sessionStorage.setItem("bc_admin_token", state.adminToken);
  adminStatus.textContent = state.adminToken ? "已保存（当前标签页）" : "未连接";
});

document.querySelector("#adminQyLogin").addEventListener("click", async () => {
  const code = adminLoginCodeInput.value.trim();
  const claimToken = adminClaimTokenInput.value.trim();
  const body = { code };
  if (claimToken) {
    body.claim_token = claimToken;
  }
  const result = await run("admin logging in", adminOutput, async () =>
    request("/admin/auth/qy-login", {
      method: "POST",
      auth: false,
      body
    })
  );
  state.adminToken = result.access_token;
  adminTokenInput.value = state.adminToken;
  sessionStorage.setItem("bc_admin_token", state.adminToken);
  applyAdminIdentity(result.admin);
  showConsole();
});

gateLoginButton.addEventListener("click", async () => {
  const code = gateLoginCodeInput.value.trim();
  if (!code) {
    gateError.textContent = "请输入企业微信登录 code";
    return;
  }
  gateLoginButton.disabled = true;
  gateError.textContent = "登录中...";
  try {
    const body = { code };
    const claimToken = gateClaimTokenInput.value.trim();
    if (claimToken) {
      body.claim_token = claimToken;
    }
    const result = await request("/admin/auth/qy-login", { method: "POST", auth: false, body });
    state.adminToken = result.access_token;
    sessionStorage.setItem("bc_admin_token", state.adminToken);
    adminTokenInput.value = state.adminToken;
    applyAdminIdentity(result.admin);
    gateError.textContent = "";
    gateLoginCodeInput.value = "";
    gateClaimTokenInput.value = "";
    showConsole();
  } catch (error) {
    gateError.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    gateLoginButton.disabled = false;
  }
});

logoutButton.addEventListener("click", () => {
  expireAdminSession("");
});

const gateTokenInput = document.querySelector("#gateTokenInput");
const gateTokenLoginButton = document.querySelector("#gateTokenLogin");
const gatePasswordForm = document.querySelector("#gatePasswordForm");
const gateUsernameInput = document.querySelector("#gateUsername");
const gatePasswordInput = document.querySelector("#gatePassword");
const gatePasswordLoginButton = document.querySelector("#gatePasswordLogin");

function completeLogin(accessToken, admin) {
  state.adminToken = accessToken;
  sessionStorage.setItem("bc_admin_token", accessToken);
  adminTokenInput.value = accessToken;
  applyAdminIdentity(admin);
  gateError.textContent = "";
  gatePasswordInput.value = "";
  showConsole();
}

gatePasswordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const username = gateUsernameInput.value.trim();
  const password = gatePasswordInput.value;
  if (!username || !password) {
    gateError.textContent = "请输入账号和密码";
    return;
  }
  gatePasswordLoginButton.disabled = true;
  gateError.textContent = "登录中...";
  try {
    const result = await request("/admin/auth/login", {
      method: "POST",
      auth: false,
      body: { username, password }
    });
    completeLogin(result.access_token, result.admin);
  } catch (error) {
    gateError.textContent = error && error.status === 401
      ? "账号或密码错误"
      : error instanceof Error ? error.message : String(error);
  } finally {
    gatePasswordLoginButton.disabled = false;
  }
});

const passwordDialog = document.querySelector("#passwordDialog");
const pwdOldInput = document.querySelector("#pwdOld");
const pwdNewInput = document.querySelector("#pwdNew");
const pwdConfirmInput = document.querySelector("#pwdConfirm");
const pwdError = document.querySelector("#pwdError");

document.querySelector("#changePasswordButton").addEventListener("click", () => {
  pwdOldInput.value = "";
  pwdNewInput.value = "";
  pwdConfirmInput.value = "";
  pwdError.textContent = "";
  passwordDialog.showModal();
});

document.querySelector("#pwdCancel").addEventListener("click", () => {
  passwordDialog.close();
});

document.querySelector("#pwdSave").addEventListener("click", async () => {
  const oldPassword = pwdOldInput.value;
  const newPassword = pwdNewInput.value;
  if (!oldPassword || !newPassword) {
    pwdError.textContent = "请填写当前密码和新密码";
    return;
  }
  if (newPassword.length < 8) {
    pwdError.textContent = "新密码至少 8 位";
    return;
  }
  if (newPassword !== pwdConfirmInput.value) {
    pwdError.textContent = "两次输入的新密码不一致";
    return;
  }
  pwdError.textContent = "保存中...";
  try {
    await adminRequest("/admin/auth/password", {
      method: "PUT",
      body: { old_password: oldPassword, new_password: newPassword }
    });
    passwordDialog.close();
    adminOutput.textContent = "密码已修改";
  } catch (error) {
    pwdError.textContent = error instanceof Error ? error.message : String(error);
  }
});

gateTokenLoginButton.addEventListener("click", async () => {
  const token = gateTokenInput.value.trim();
  if (!token) {
    gateError.textContent = "请粘贴访问令牌";
    return;
  }
  gateTokenLoginButton.disabled = true;
  gateError.textContent = "校验令牌...";
  try {
    const result = await request("/admin/session/me", { token });
    state.adminToken = token;
    sessionStorage.setItem("bc_admin_token", token);
    adminTokenInput.value = token;
    applyAdminIdentity(result.admin);
    gateError.textContent = "";
    gateTokenInput.value = "";
    showConsole();
  } catch (error) {
    gateError.textContent = error && error.status === 401
      ? "令牌无效或已过期"
      : error instanceof Error ? error.message : String(error);
  } finally {
    gateTokenLoginButton.disabled = false;
  }
});

document.querySelector("#createWecomAuthorizationLink").addEventListener("click", async () => {
  const redirectUri = wecomRedirectUriInput.value.trim();
  const body = {};
  if (redirectUri) {
    body.redirect_uri = redirectUri;
  }
  await run("creating WeCom authorization link", adminOutput, async () =>
    request("/wecom/authorization-links", {
      method: "POST",
      auth: false,
      headers: {
        "x-wecom-launch-token": wecomLaunchTokenInput.value.trim()
      },
      body
    })
  );
});

document.querySelector("#loadAdminMe").addEventListener("click", async () => {
  const result = await run("loading admin session", adminOutput, async () => adminRequest("/admin/session/me"));
  applyAdminIdentity(result.admin);
});

document.querySelector("#loadOverview").addEventListener("click", async () => {
  const result = await run("loading overview", adminOutput, async () => adminRequest("/admin/overview"));
  renderOverview(result);
});

document.querySelector("#loadMembers").addEventListener("click", async () => {
  const result = await run("loading members", adminOutput, async () => adminRequest(adminMemberListPath()));
  renderMembers(result);
  const first = result.items?.[0];
  if (first?.member_identity_id) {
    state.adminMemberId = first.member_identity_id;
    adminMemberIdInput.value = first.member_identity_id;
  }
});

document.querySelector("#syncMembers").addEventListener("click", async () => {
  await run("syncing members", adminOutput, async () => adminRequest("/admin/members/sync", { method: "POST" }));
  document.querySelector("#loadMembers").click();
});

document.querySelector("#loadSyncEvents").addEventListener("click", async () => {
  const result = await run("loading sync events", adminOutput, async () => adminRequest("/admin/sync-events"));
  renderSyncEvents(result);
});

document.querySelector("#retrySyncEvents").addEventListener("click", async () => {
  await run("retrying failed sync events", adminOutput, async () =>
    adminRequest("/admin/sync-events/retry", { method: "POST" })
  );
  document.querySelector("#loadSyncEvents").click();
});

document.querySelector("#loadDatabaseMigrations").addEventListener("click", async () => {
  const result = await run("loading database migrations", databaseOutput, async () =>
    adminRequest("/admin/database/migrations")
  );
  renderDatabaseMigrations(result);
});

document.querySelector("#runDatabaseMigrations").addEventListener("click", async () => {
  if (!window.confirm("确认执行数据库迁移？执行前请确认已备份生产数据库。")) {
    return;
  }
  const result = await run("running database migrations", databaseOutput, async () =>
    adminRequest("/admin/database/migrations/run", {
      method: "POST",
      timeoutMs: 130_000
    })
  );
  renderDatabaseMigrations(result.after || result.before);
});

document.querySelector("#loadAdminCard").addEventListener("click", async () => {
  state.adminMemberId = adminMemberIdInput.value.trim();
  const card = await run("loading admin card", adminCardOutput, async () =>
    adminRequest(`/admin/members/${encodeURIComponent(state.adminMemberId)}/card`)
  );
  fillCard(card);
});

document.querySelector("#saveAdminCard").addEventListener("click", async () => {
  state.adminMemberId = adminMemberIdInput.value.trim();
  const card = await run("saving admin card", adminCardOutput, async () =>
    adminRequest(`/admin/members/${encodeURIComponent(state.adminMemberId)}/card`, {
      method: "PUT",
      body: {
        ...cardPayloadFromForm(),
        status: adminCardStatusInput?.value || "active"
      }
    })
  );
  fillCard(card);
});

document.querySelector("#loadCompanyProfile").addEventListener("click", async () => {
  const [profile, capability, honors] = await Promise.all([run("loading company profile", companyOutput, async () => adminRequest("/admin/company-profile")),adminRequest("/admin/features/company-video"),adminRequest("/admin/company-honors")]);
  state.videoCapability = capability;
  state.companyHonors = honors.items || [];
  state.deletedHonorIds = [];
  fillCompany(profile);
});

document.querySelector("#addService").addEventListener("click",()=>{if(state.companyProfile.service_items.length>=30)return;state.companyProfile.service_items.push({id:`service_${Date.now()}`,title:"",description:"",image_url:null,visible:true,sort_order:(state.companyProfile.service_items.length+1)*10});renderCompanyEditors();});
function addIntro(type,value){state.companyProfile.intro_blocks.push({type,...value});renderCompanyEditors();}
document.querySelector("#addHeading").addEventListener("click",()=>addIntro("heading",{text:"新标题"}));
document.querySelector("#addParagraph").addEventListener("click",()=>addIntro("paragraph",{text:"正文"}));
document.querySelector("#addImage").addEventListener("click",()=>addIntro("image",{url:"https://",caption:""}));
document.querySelector("#addGallery").addEventListener("click",()=>addIntro("gallery",{images:[]}));
document.querySelector("#addVideo").addEventListener("click",()=>{if(state.videoCapability.enabled)addIntro("video",{video_id:""});});
document.querySelector("#loadHonors").addEventListener("click",()=>run("loading honors",companyOutput,async()=>{const result=await adminRequest("/admin/company-honors");state.companyHonors=result.items||[];state.deletedHonorIds=[];renderHonorEditors();return result;}));
document.querySelector("#addHonor").addEventListener("click",()=>{state.companyHonors.push({honor_id:`draft_${Date.now()}`,title:"新荣誉",body:null,sort_order:(state.companyHonors.length+1)*10,visible:true,status:"draft",images:[]});renderHonorEditors();});
document.querySelector("#saveHonors").addEventListener("click",()=>run("saving honors",companyOutput,async()=>{syncHonorEditors();state.companyHonors.forEach((honor)=>{assertRequired(honor.title,"荣誉标题");(honor.images||[]).forEach((image)=>validateOptionalUrl(image.image_url,"荣誉图片"));});const saved=[];for(const honorId of [...new Set(state.deletedHonorIds)])await adminRequest(`/admin/company-honors/${encodeURIComponent(honorId)}`,{method:"DELETE"});for(const honor of state.companyHonors){const payload={title:String(honor.title||"").trim(),body:honor.body||null,sort_order:Number(honor.sort_order||0),visible:honor.visible!==false,status:honor.status||"draft",images:honor.images||[]};if(String(honor.honor_id).startsWith("draft_"))saved.push(await adminRequest("/admin/company-honors",{method:"POST",body:payload}));else saved.push(await adminRequest(`/admin/company-honors/${encodeURIComponent(honor.honor_id)}`,{method:"PUT",body:payload}));}const result=await adminRequest("/admin/company-honors");state.deletedHonorIds=[];state.companyHonors=result.items||saved;renderHonorEditors();return result;}));

async function loadVideoFeatures(){const [platform,tenants]=await Promise.all([adminRequest("/admin/platform/features/company-video"),adminRequest(`/admin/platform/features/company-video/tenants?search=${encodeURIComponent(document.querySelector("#tenantFeatureSearch").value.trim())}`)]);document.querySelector("#platformVideoEnabled").checked=platform.enabled;document.querySelector("#platformVideoLimit").value=platform.default_limit_mb;state.tenantFeatures=tenants.items;renderTenantFeatures();write(featureOutput,{platform,total:tenants.total});}
function renderTenantFeatures(){const root=document.querySelector("#tenantFeatureEditor");root.replaceChildren();state.tenantFeatures.forEach((item,index)=>{const row=document.createElement("div");row.className="editor-row";const name=document.createElement("strong");name.textContent=item.tenant_name;const enabled=inputField("","","enabled",index,"tenant","checkbox");enabled.checked=item.enabled;const limit=inputField(item.limit_bytes===null?"":item.limit_bytes/1048576,"继承默认 MB","limit",index,"tenant","number");const status=document.createElement("span");status.textContent=`生效 ${Math.round(item.effective_limit_bytes/1048576)} MB · ${item.source==="platform_default"?"继承":"独立"}`;const save=document.createElement("button");save.type="button";save.textContent="保存";save.onclick=async()=>{const updated=await adminRequest(`/admin/platform/features/company-video/tenants/${item.tenant_id}`,{method:"PUT",body:{enabled:enabled.checked,limit_bytes:limit.value?Math.round(Number(limit.value)*1048576):null}});state.tenantFeatures[index]=updated;renderTenantFeatures();};row.append(name,enabled,limit,status,save);root.append(row);});}
document.querySelector("#loadVideoFeatures").addEventListener("click",()=>run("loading video features",featureOutput,loadVideoFeatures));
document.querySelector("#searchTenantFeatures").addEventListener("click",()=>run("loading tenants",featureOutput,loadVideoFeatures));
document.querySelector("#saveVideoFeatures").addEventListener("click",()=>run("saving video features",featureOutput,async()=>{const result=await adminRequest("/admin/platform/features/company-video",{method:"PUT",body:{enabled:document.querySelector("#platformVideoEnabled").checked,default_limit_bytes:Math.round(Number(document.querySelector("#platformVideoLimit").value)*1048576)}});await loadVideoFeatures();return result;}));

async function loadTenantAuthorizations(page = state.tenantAuthorizations.page) {
  const search = document.querySelector("#tenantAuthorizationSearch").value.trim();
  const status = document.querySelector("#tenantAuthorizationStatus").value;
  const params = new URLSearchParams({
    search,
    status,
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
  tenantAuthorizationRows.replaceChildren();
  const current = state.tenantAuthorizations;
  document.querySelector("#tenantAuthorizationTotal").textContent = String(current.total);
  const totalPages = Math.max(1, Math.ceil(current.total / current.pageSize));
  document.querySelector("#tenantAuthorizationPage").textContent = `第 ${current.page} / ${totalPages} 页`;
  document.querySelector("#tenantAuthorizationPrev").disabled = current.page <= 1;
  document.querySelector("#tenantAuthorizationNext").disabled = current.page >= totalPages;
  if (!current.items.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 6;
    cell.textContent = "没有找到符合条件的企业授权";
    row.append(cell);
    tenantAuthorizationRows.append(row);
    return;
  }
  current.items.forEach((item) => {
    const row = document.createElement("tr");
    const enterprise = document.createElement("td");
    const name = document.createElement("strong");
    name.textContent = item.tenant_name;
    const corpid = document.createElement("code");
    corpid.textContent = item.open_corpid;
    enterprise.append(name, corpid);
    const status = document.createElement("td");
    const statusPill = document.createElement("span");
    statusPill.className = `auth-status auth-status--${item.auth_status === "active" ? "active" : "inactive"}`;
    statusPill.textContent = item.auth_status === "active" ? "授权有效" : item.auth_status;
    status.append(statusPill);
    const members = document.createElement("td");
    members.textContent = `${item.active_member_count} / ${item.member_count}`;
    const cards = document.createElement("td");
    cards.textContent = `${item.active_card_count} / ${item.card_count}`;
    const installedAt = document.createElement("td");
    installedAt.textContent = formatAdminDate(item.authorized_at);
    const action = document.createElement("td");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary";
    button.textContent = "查看详情";
    button.addEventListener("click", () => run("loading tenant authorization", tenantAuthorizationOutput, () => loadTenantAuthorizationDetail(item.tenant_id)));
    action.append(button);
    row.append(enterprise, status, members, cards, installedAt, action);
    tenantAuthorizationRows.append(row);
  });
}

async function loadTenantAuthorizationDetail(tenantId) {
  const item = await adminRequest(`/admin/platform/tenants/${encodeURIComponent(tenantId)}`);
  document.querySelector("#tenantAuthorizationDetailTitle").textContent = item.tenant_name;
  document.querySelector("#tenantAuthorizationDetailSubtitle").textContent = item.open_corpid;
  tenantAuthorizationDetail.replaceChildren();
  const fields = [
    ["授权健康", item.authorization_healthy ? "正常" : "需要检查"],
    ["授权状态", item.auth_status],
    ["AgentID", item.agent_id || "未返回"],
    ["安装时间", formatAdminDate(item.authorized_at)],
    ["取消时间", formatAdminDate(item.cancel_auth_time)],
    ["成员", `${item.active_member_count} 活跃 / ${item.member_count} 总数`],
    ["管理员", `${item.active_admin_count} 活跃 / ${item.admin_count} 总数`],
    ["名片", `${item.active_card_count} 启用 / ${item.card_count} 总数`],
    ["永久授权码", item.permanent_code_configured ? "已安全保存" : "未配置"],
    ["企业 Token", item.corp_token_cached ? `已缓存，${formatAdminDate(item.corp_token_expires_at)}到期` : "尚未缓存"],
    ["最近回调", item.last_callback ? `${item.last_callback.event_type} · ${item.last_callback.status}` : "暂无"],
    ["回调时间", formatAdminDate(item.last_callback?.received_at)]
  ];
  fields.forEach(([label, value]) => {
    const card = document.createElement("div");
    card.className = "tenant-detail-item";
    const term = document.createElement("span");
    term.textContent = label;
    const description = document.createElement("strong");
    description.textContent = String(value);
    card.append(term, description);
    tenantAuthorizationDetail.append(card);
  });
  tenantAuthorizationScope.textContent = JSON.stringify(item.auth_scope || {}, null, 2);
  tenantAuthorizationDetailPanel.classList.remove("hidden");
  tenantAuthorizationDetailPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  return item;
}

function formatAdminDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

document.querySelector("#loadTenantAuthorizations").addEventListener("click", () => run("loading tenant authorizations", tenantAuthorizationOutput, () => loadTenantAuthorizations()));
document.querySelector("#searchTenantAuthorizations").addEventListener("click", () => run("searching tenant authorizations", tenantAuthorizationOutput, () => loadTenantAuthorizations(1)));
document.querySelector("#tenantAuthorizationSearch").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    document.querySelector("#searchTenantAuthorizations").click();
  }
});
document.querySelector("#tenantAuthorizationPrev").addEventListener("click", () => run("loading tenant authorizations", tenantAuthorizationOutput, () => loadTenantAuthorizations(state.tenantAuthorizations.page - 1)));
document.querySelector("#tenantAuthorizationNext").addEventListener("click", () => run("loading tenant authorizations", tenantAuthorizationOutput, () => loadTenantAuthorizations(state.tenantAuthorizations.page + 1)));
document.querySelector("#closeTenantAuthorizationDetail").addEventListener("click", () => tenantAuthorizationDetailPanel.classList.add("hidden"));
document.querySelector("#tenantAuthorizationsNav").addEventListener("click", () => {
  if (!state.tenantAuthorizations.items.length) {
    document.querySelector("#loadTenantAuthorizations").click();
  }
});

document.querySelector("#saveCompanyProfile").addEventListener("click", async () => {
  const profile = await run("saving company profile", companyOutput, async () => adminRequest("/admin/company-profile", {
    method: "PUT",
    body: companyProfilePayloadFromForm()
  }));
  fillCompany(profile);
});

document.querySelector("#loadFieldSettings").addEventListener("click", async () => {
  const result = await run("loading field settings", configOutput, async () => adminRequest("/admin/settings/fields"));
  renderFieldSettings(result);
});

document.querySelector("#saveFieldSettings").addEventListener("click", async () => {
  const result = await run("saving field settings", configOutput, async () =>
    adminRequest("/admin/settings/fields", {
      method: "PUT",
      body: fieldSettingsPayloadFromTable()
    })
  );
  renderFieldSettings(result);
});

async function loadTemplates() {
  const result = await run("loading templates", configOutput, async () => adminRequest("/admin/templates"));
  renderTemplates(result);
  return result;
}

document.querySelector("#loadTemplates").addEventListener("click", async () => {
  await loadTemplates();
});

document.querySelector("#createTemplate").addEventListener("click", async () => {
  const template = await run("creating template", configOutput, async () =>
    adminRequest("/admin/templates", {
      method: "POST",
      body: templatePayloadFromForm()
    })
  );
  state.selectedTemplateId = template.template_id;
  fillTemplateForm(template);
  await loadTemplates();
});

document.querySelector("#updateTemplate").addEventListener("click", async () => {
  const templateId = selectedTemplateIdFromForm();
  const template = await run("saving template", configOutput, async () =>
    adminRequest(`/admin/templates/${encodeURIComponent(templateId)}`, {
      method: "PUT",
      body: templatePayloadFromForm({ includeStatus: true })
    })
  );
  state.selectedTemplateId = template.template_id;
  fillTemplateForm(template);
  await loadTemplates();
});

document.querySelector("#setDefaultTemplate").addEventListener("click", async () => {
  const templateId = selectedTemplateIdFromForm();
  const template = await run("setting default template", configOutput, async () =>
    adminRequest(`/admin/templates/${encodeURIComponent(templateId)}/default`, { method: "PUT" })
  );
  state.selectedTemplateId = template.template_id;
  fillTemplateForm(template);
  await loadTemplates();
});

let templateActionInProgress = false;

function setTemplateActionsDisabled(disabled) {
  templateRows.querySelectorAll("button[data-template-action]").forEach((button) => {
    button.disabled = disabled;
  });
}

templateRows.addEventListener("click", async (event) => {
  if (!(event.target instanceof Element)) {
    return;
  }
  const button = event.target.closest("button[data-template-action]");
  if (!(button instanceof HTMLButtonElement)) {
    return;
  }
  const templateId = button.dataset.templateId || "";
  const template = state.templates.find((item) => item.template_id === templateId);
  if (!template) {
    configOutput.textContent = "模板不存在，请重新加载列表";
    return;
  }
  if (button.dataset.templateAction === "select") {
    fillTemplateForm(template);
    renderTemplates({ items: state.templates });
    return;
  }
  if (templateActionInProgress) {
    configOutput.textContent = "模板操作进行中，请稍候";
    return;
  }
  templateActionInProgress = true;
  setTemplateActionsDisabled(true);
  try {
    if (button.dataset.templateAction === "default") {
      const result = await run("setting default template", configOutput, async () =>
        adminRequest(`/admin/templates/${encodeURIComponent(templateId)}/default`, { method: "PUT" })
      );
      state.selectedTemplateId = result.template_id;
      fillTemplateForm(result);
      await loadTemplates();
    }
  } finally {
    templateActionInProgress = false;
    setTemplateActionsDisabled(false);
  }
});

async function boot() {
  if (DEV_MODE) {
    document.body.classList.add("dev-mode");
  }
  if (!state.adminToken) {
    // Dev keeps the old workflow: console opens directly so the 授权与联调 panel
    // (demo login / token paste) stays reachable. Production always gates.
    if (DEV_MODE) {
      showConsole();
    } else {
      showGate("");
    }
  } else {
    try {
      const result = await request("/admin/session/me", { token: state.adminToken });
      applyAdminIdentity(result.admin);
      showConsole();
    } catch (error) {
      expireAdminSession(error && error.status === 401 ? "登录已过期，请重新登录" : "");
    }
  }
  if (DEV_MODE) {
    document.querySelector("#checkHealth").click();
  }
}

void boot();
