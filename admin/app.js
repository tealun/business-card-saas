const state = {
  token: "",
  card: null,
  shareId: "",
  visitToken: "",
  anonId: ""
};

const apiBaseInput = document.querySelector("#apiBase");
const apiStatus = document.querySelector("#apiStatus");
const loginStatus = document.querySelector("#loginStatus");
const shareStatus = document.querySelector("#shareStatus");
const sessionOutput = document.querySelector("#sessionOutput");
const publicOutput = document.querySelector("#publicOutput");
const cardForm = document.querySelector("#cardForm");
const sharePath = document.querySelector("#sharePath");

apiBaseInput.value = localStorage.getItem("bc_api_base") || "http://localhost:3000/api/v1";
apiBaseInput.addEventListener("change", () => localStorage.setItem("bc_api_base", apiBaseInput.value.trim()));

function apiBase() {
  return apiBaseInput.value.trim().replace(/\/$/, "");
}

async function request(path, options = {}) {
  const headers = {
    "content-type": "application/json",
    ...(options.headers || {})
  };
  if (options.auth !== false && state.token) {
    headers.authorization = `Bearer ${state.token}`;
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
    body: {
      display_name: cardForm.display_name.value,
      title: cardForm.title.value,
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
    }
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

document.querySelector("#checkHealth").click();
