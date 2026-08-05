const { request, qyLoginCode, wxLoginCode, isWeComRuntime } = require("./api");
const SESSION_STORAGE_KEY = "wecomcard.session.v1";

function getGlobalData() {
  try {
    const app = typeof getApp === "function" ? getApp() : null;
    return app && app.globalData ? app.globalData : {};
  } catch (_error) {
    return {};
  }
}

/**
 * 确保当前小程序拥有可用会话。
 *
 * 企业微信环境优先走企业身份登录，失败后回退到普通微信身份；已有 token 且未强制刷新时，
 * 直接复用内存中的当前身份。
 */
async function ensureSession(options = {}) {
  const globalData = getGlobalData();
  if (!options.force && globalData.token && globalData.currentIdentity) {
    return currentSession();
  }

  const errors = [];
  if (isWeComRuntime()) {
    try {
      // 企业微信内优先获得企业身份；qy.login 不可用时仍允许用户进入个人名片。
      return applySession(await loginWithQyCode());
    } catch (error) {
      errors.push(error);
    }
  }

  try {
    return applySession(await loginWithWxCode());
  } catch (error) {
    errors.push(error);
  }

  throw new Error(errors.map((item) => item && item.message).filter(Boolean).join("；") || "登录失败");
}

async function switchIdentity(memberIdentityId) {
  const session = await request("/auth/switch-identity", {
    method: "POST",
    data: { member_identity_id: memberIdentityId }
  });
  return applySession(session);
}

/**
 * 刷新当前账号可切换的身份列表。
 *
 * 保留现有 access_token，只用后端返回的 current_identity/identities 更新身份视图。
 */
async function refreshSessionIdentities() {
  const globalData = getGlobalData();
  if (!globalData.token) {
    throw new Error("请先登录后刷新身份");
  }
  const session = await request("/auth/identities");
  return applySession({
    access_token: globalData.token,
    current_identity: session.current_identity,
    identities: session.identities
  });
}

function currentSession() {
  const globalData = getGlobalData();
  return {
    token: globalData.token,
    currentIdentity: globalData.currentIdentity,
    identities: globalData.identities || []
  };
}

async function loginWithQyCode() {
  const code = await qyLoginCode();
  // 企业微信内同时取 wx.login code，让后端把企业身份归并进微信个人账号；
  // 取不到时退回仅企业登录，不阻断流程。
  let wxCode = "";
  try {
    wxCode = await wxLoginCode();
  } catch (_error) {
    wxCode = "";
  }
  return request("/auth/qy-login", {
    method: "POST",
    auth: false,
    data: wxCode ? { code, wx_code: wxCode } : { code }
  });
}

async function loginWithWxCode() {
  const code = await wxLoginCode();
  return request("/auth/wx-login", {
    method: "POST",
    auth: false,
    data: { code }
  });
}

function applySession(session) {
  const globalData = getGlobalData();
  const currentIdentity = decorateIdentity(session.current_identity);
  // 精确保留后端返回的身份列表；客户端只补展示标签，权限判断仍由服务端负责。
  globalData.token = session.access_token;
  globalData.currentIdentity = currentIdentity;
  globalData.identities = (session.identities || []).map((identity) =>
    decorateIdentity(identity, currentIdentity && currentIdentity.member_identity_id)
  );
  persistSession();
  return currentSession();
}

function persistSession() {
  if (typeof wx === "undefined" || typeof wx.setStorageSync !== "function") {
    return;
  }
  wx.setStorageSync(SESSION_STORAGE_KEY, currentSession());
}

function restoreSession(targetGlobalData) {
  if (typeof wx === "undefined" || typeof wx.getStorageSync !== "function") {
    return null;
  }
  const saved = wx.getStorageSync(SESSION_STORAGE_KEY);
  if (!saved || typeof saved !== "object") {
    return null;
  }
  if (!saved.token || !saved.currentIdentity) {
    return null;
  }

  // onLaunch 阶段 getApp() 可能尚未就绪，允许外部直接传入 globalData 保证内存恢复生效。
  const globalData = targetGlobalData || getGlobalData();
  globalData.token = saved.token;
  globalData.currentIdentity = saved.currentIdentity;
  globalData.identities = Array.isArray(saved.identities) ? saved.identities : [];
  return {
    token: globalData.token,
    currentIdentity: globalData.currentIdentity,
    identities: globalData.identities
  };
}

/**
 * 给后端身份对象补充页面展示字段。
 *
 * 返回值仍保留原始身份字段，新增的 typeLabel/badgeClass/selected 只服务于模板展示，
 * 不能作为权限或身份切换依据。
 */
function decorateIdentity(identity, currentMemberIdentityId) {
  if (!identity) {
    return null;
  }
  const isPersonal = identity.identity_type === "personal";
  const isLocal = identity.identity_type === "local_enterprise";
  // 这些字段只用于 UI 展示，不改变 /auth/switch-identity 使用的契约字段。
  return Object.assign({}, identity, {
    typeLabel: isPersonal ? "个人名片" : (isLocal ? "本地企业" : "企业名片"),
    badgeClass: isPersonal ? "badge--brand" : (isLocal ? "badge--warning" : "badge--success"),
    subtitle: isPersonal ? "微信个人身份" : identity.tenant_name,
    selected: currentMemberIdentityId
      ? identity.member_identity_id === currentMemberIdentityId
      : false
  });
}

module.exports = {
  ensureSession,
  refreshSessionIdentities,
  switchIdentity,
  restoreSession
};
