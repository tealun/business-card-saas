const SESSION_STORAGE_KEY = "wecomcard.session.v1";

function getAppInstance() {
  try {
    return typeof getApp === "function" ? getApp() : null;
  } catch (_error) {
    return null;
  }
}

function apiBase() {
  const app = getAppInstance();
  const globalData = app && app.globalData ? app.globalData : {};
  if (globalData.configError) {
    throw new Error(`本地配置加载失败：${globalData.configError}`);
  }
  const extConfig = typeof wx.getExtConfigSync === "function" ? wx.getExtConfigSync() : {};
  const base = String(extConfig.apiBase || globalData.apiBase || "").trim().replace(/\/$/, "");
  if (!base) {
    throw new Error("API Base 未配置");
  }
  const envVersion = typeof wx.getAccountInfoSync === "function"
    ? wx.getAccountInfoSync()?.miniProgram?.envVersion
    : "develop";
  if (envVersion !== "develop" && !base.startsWith("https://")) {
    throw new Error("体验版/正式版 API Base 必须使用 HTTPS");
  }
  return base;
}

function request(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const isIdempotent = method === "GET" || method === "HEAD";
  const maxRetries = isIdempotent ? 1 : 0;
  const timeout = options.timeout || 15000;

  const attempt = () => new Promise((resolve, reject) => {
    const app = getAppInstance();
    const globalData = app && app.globalData ? app.globalData : {};
    const headers = {
      "content-type": "application/json",
      ...(options.header || {})
    };
    if (options.auth !== false && globalData.token) {
      headers.authorization = `Bearer ${globalData.token}`;
    }

    wx.request({
      url: `${apiBase()}${path}`,
      method,
      data: options.data,
      header: headers,
      timeout,
      success(response) {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(response.data && typeof response.data === "object" && "data" in response.data ? response.data.data : response.data);
          return;
        }
        if (response.statusCode === 401) {
          clearSessionState();
        }
        reject(new Error(response.data?.message || `HTTP ${response.statusCode}`));
      },
      fail(error) {
        reject(error);
      }
    });
  });

  const run = () => attempt().catch((error) => {
    if (maxRetries > 0) {
      return new Promise((resolve) => setTimeout(resolve, 800)).then(attempt);
    }
    throw error;
  });

  return run();
}

function clearSessionState() {
  const app = getAppInstance();
  if (app && app.globalData) {
    app.globalData.token = "";
    app.globalData.currentIdentity = null;
    app.globalData.identities = [];
    app.globalData.currentCard = null;
    app.globalData.shareId = "";
  }
  if (typeof wx !== "undefined" && typeof wx.removeStorageSync === "function") {
    wx.removeStorageSync(SESSION_STORAGE_KEY);
  }
}

function qyLoginCode() {
  return new Promise((resolve, reject) => {
    if (isWeComRuntime()) {
      wx.qy.login({
        success(result) {
          if (result.code) {
            resolve(result.code);
            return;
          }
          const demo = maybeDemoCode();
          if (demo) {
            resolve(demo);
            return;
          }
          reject(new Error("wx.qy.login did not return code"));
        },
        fail(error) {
          const demo = maybeDemoCode();
          if (demo) {
            resolve(demo);
            return;
          }
          reject(error);
        }
      });
      return;
    }
    const demo = maybeDemoCode();
    if (demo) {
      resolve(demo);
      return;
    }
    reject(new Error("wx.qy.login is not available"));
  });
}

function wxLoginCode() {
  return new Promise((resolve, reject) => {
    if (typeof wx.login !== "function") {
      const demo = maybeDemoCode("wx");
      if (demo) {
        resolve(demo);
        return;
      }
      reject(new Error("wx.login is not available"));
      return;
    }
    wx.login({
      success(result) {
        if (result.code) {
          resolve(result.code);
          return;
        }
        const demo = maybeDemoCode("wx");
        if (demo) {
          resolve(demo);
          return;
        }
        reject(new Error("wx.login did not return code"));
      },
      fail(error) {
        const demo = maybeDemoCode("wx");
        if (demo) {
          resolve(demo);
          return;
        }
        reject(error);
      }
    });
  });
}

function isWeComRuntime() {
  return Boolean(wx.qy && typeof wx.qy.login === "function");
}

function maybeDemoCode(type = "qy") {
  const app = getAppInstance();
  const globalData = app && app.globalData ? app.globalData : {};
  if (globalData.demoAuthEnabled) {
    return type === "wx" ? "demo-wx-code" : "demo-qy-code";
  }
  return "";
}

module.exports = {
  request,
  qyLoginCode,
  wxLoginCode,
  isWeComRuntime
};
