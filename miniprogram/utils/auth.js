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

async function ensureSession(options = {}) {
  const globalData = getGlobalData();
  if (!options.force && globalData.token && globalData.currentIdentity) {
    return currentSession();
  }

  const errors = [];
  if (isWeComRuntime()) {
    try {
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

function decorateIdentity(identity, currentMemberIdentityId) {
  if (!identity) {
    return null;
  }
  const isPersonal = identity.identity_type === "personal";
  const isLocal = identity.identity_type === "local_enterprise";
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
  switchIdentity,
  restoreSession
};
