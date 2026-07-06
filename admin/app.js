const state = {
  token: "",
  adminToken: localStorage.getItem("bc_admin_token") || "",
  card: null,
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
const adminMemberIdInput = document.querySelector("#adminMemberId");
const adminCardStatusInput = document.querySelector("#adminCardStatus");
const templateNameInput = document.querySelector("#templateName");

apiBaseInput.value = localStorage.getItem("bc_api_base") || "http://localhost:3000/api/v1";
adminTokenInput.value = state.adminToken;
apiBaseInput.addEventListener("change", () => localStorage.setItem("bc_api_base", apiBaseInput.value.trim()));

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
  companyForm.website_url.value = profile.website_url || "";
  companyForm.address.value = profile.address || "";
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

document.querySelector("#loadAdminMe").addEventListener("click", async () => {
  const result = await run("loading admin session", adminOutput, async () => adminRequest("/admin/session/me"));
  adminStatus.textContent = `${result.admin.role} · ${result.admin.tenant_name}`;
  state.adminMemberId = result.admin.member_identity_id || "";
  adminMemberIdInput.value = state.adminMemberId;
});

document.querySelector("#loadOverview").addEventListener("click", async () => {
  await run("loading overview", adminOutput, async () => adminRequest("/admin/overview"));
});

document.querySelector("#loadMembers").addEventListener("click", async () => {
  const result = await run("loading members", adminOutput, async () => adminRequest("/admin/members"));
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
  await run("loading sync events", adminOutput, async () => adminRequest("/admin/sync-events"));
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
    body: {
      display_name: companyForm.display_name.value,
      website_url: companyForm.website_url.value || null,
      address: companyForm.address.value || null
    }
  }));
  fillCompany(profile);
});

document.querySelector("#loadFieldSettings").addEventListener("click", async () => {
  await run("loading field settings", configOutput, async () => adminRequest("/admin/settings/fields"));
});

document.querySelector("#loadTemplates").addEventListener("click", async () => {
  await run("loading templates", configOutput, async () => adminRequest("/admin/templates"));
});

document.querySelector("#createTemplate").addEventListener("click", async () => {
  await run("creating template", configOutput, async () => adminRequest("/admin/templates", {
    method: "POST",
    body: {
      name: templateNameInput.value || "商务模板",
      color_scheme: { primary: "#1677ff", surface: "#ffffff" },
      layout: { variant: "horizontal-business" }
    }
  }));
});

document.querySelector("#checkHealth").click();
