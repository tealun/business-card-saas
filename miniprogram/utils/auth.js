const app = getApp();
const { request, qyLoginCode, wxLoginCode, isWeComRuntime } = require("./api");

async function ensureSession(options = {}) {
  if (!options.force && app.globalData.token && app.globalData.currentIdentity) {
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
  return {
    token: app.globalData.token,
    currentIdentity: app.globalData.currentIdentity,
    identities: app.globalData.identities || []
  };
}

async function loginWithQyCode() {
  const code = await qyLoginCode();
  return request("/auth/qy-login", {
    method: "POST",
    auth: false,
    data: { code }
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
  const currentIdentity = decorateIdentity(session.current_identity);
  app.globalData.token = session.access_token;
  app.globalData.currentIdentity = currentIdentity;
  app.globalData.identities = (session.identities || []).map((identity) =>
    decorateIdentity(identity, currentIdentity && currentIdentity.member_identity_id)
  );
  return currentSession();
}

function decorateIdentity(identity, currentMemberIdentityId) {
  if (!identity) {
    return null;
  }
  const isPersonal = identity.identity_type === "personal";
  return Object.assign({}, identity, {
    typeLabel: isPersonal ? "个人名片" : "企业名片",
    badgeClass: isPersonal ? "badge--brand" : "badge--success",
    subtitle: isPersonal ? "微信个人身份" : identity.tenant_name,
    selected: currentMemberIdentityId
      ? identity.member_identity_id === currentMemberIdentityId
      : false
  });
}

module.exports = {
  ensureSession,
  switchIdentity
};
