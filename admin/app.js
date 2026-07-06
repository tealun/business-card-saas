const state = {
  token: "",
  adminToken: localStorage.getItem("bc_admin_token") || "",
  card: null,
  fieldSettings: [],
  templates: [],
  selectedTemplateId: "",
  adminMemberId: "",
  shareId: "",
  visitToken: "",
  anonId: ""
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

apiBaseInput.value = localStorage.getItem("bc_api_base") || "http://localhost:3000/api/v1";
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
  return apiBaseInput.value.trim().replace(/\/$/, "");
}

async function request(path, options = {}) {
  const headers = {
    "content-type": "application/json",
    ...(options.headers || {})
  };
  const token = options.token === undefined ? state.token : options.token;
  if (options.auth !== false && token) {
    headers.authorization = `Bearer ${token}`;
  }
  const response = await fetch(`${apiBase()}${path}`, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(body?.message || `${response.status} ${response.statusText}`);
  }
  return body && typeof body === "object" && "data" in body ? body.data : body;
}

function adminRequest(path, options = {}) {
  state.adminToken = adminTokenInput.value.trim();
  return request(path, { ...options, token: state.adminToken });
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
  if (adminCardStatusInput) {
    adminCardStatusInput.value = card.status || "active";
  }
}

function cardPayloadFromForm() {
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
      show_wechat: cardForm.show_wechat.checked
    }
  };
}

function fillCompany(profile) {
  companyForm.display_name.value = profile.display_name || "";
  companyForm.short_name.value = profile.short_name || "";
  companyForm.logo_url.value = profile.logo_url || "";
  companyForm.website_url.value = profile.website_url || "";
  companyForm.address.value = profile.address || "";
  companyForm.intro_blocks.value = JSON.stringify(profile.intro_blocks || [], null, 2);
  companyForm.visible.checked = Boolean(profile.visible);
  companyForm.status.value = profile.status || "draft";
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
  return value || null;
}

function templatePayloadFromForm(options = {}) {
  const payload = {
    name: templateNameInput.value.trim() || "商务蓝模板",
    background_url: nullableUrlFromInput(templateBackgroundUrlInput),
    logo_url: nullableUrlFromInput(templateLogoUrlInput),
    color_scheme: {
      primary: templatePrimaryColorInput.value.trim() || "#1677ff",
      surface: templateSurfaceColorInput.value.trim() || "#ffffff"
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
  let introBlocks;
  try {
    introBlocks = JSON.parse(companyForm.intro_blocks.value || "[]");
  } catch (_) {
    throw new Error("简介块 JSON 格式不正确");
  }
  if (!Array.isArray(introBlocks)) {
    throw new Error("简介块 JSON 必须是数组");
  }
  return {
    display_name: companyForm.display_name.value.trim(),
    short_name: companyForm.short_name.value.trim() || null,
    logo_url: companyForm.logo_url.value.trim() || null,
    website_url: companyForm.website_url.value.trim() || null,
    address: companyForm.address.value.trim() || null,
    intro_blocks: introBlocks,
    visible: companyForm.visible.checked,
    status: companyForm.status.value
  };
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
  localStorage.setItem("bc_admin_token", state.adminToken);
  adminStatus.textContent = state.adminToken ? "已保存" : "未连接";
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
  localStorage.setItem("bc_admin_token", state.adminToken);
  adminStatus.textContent = `${result.admin.role} · ${result.admin.tenant_name}`;
  state.adminMemberId = result.admin.member_identity_id || "";
  adminMemberIdInput.value = state.adminMemberId;
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
  adminStatus.textContent = `${result.admin.role} · ${result.admin.tenant_name}`;
  state.adminMemberId = result.admin.member_identity_id || "";
  adminMemberIdInput.value = state.adminMemberId;
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
  const profile = await run("loading company profile", companyOutput, async () => adminRequest("/admin/company-profile"));
  fillCompany(profile);
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
  if (button.dataset.templateAction === "default") {
    const result = await run("setting default template", configOutput, async () =>
      adminRequest(`/admin/templates/${encodeURIComponent(templateId)}/default`, { method: "PUT" })
    );
    state.selectedTemplateId = result.template_id;
    fillTemplateForm(result);
    await loadTemplates();
  }
});

document.querySelector("#checkHealth").click();
