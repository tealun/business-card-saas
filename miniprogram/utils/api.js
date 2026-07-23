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
  let envVersion = "develop";
  if (typeof wx.getAccountInfoSync === "function") {
    const accountInfo = wx.getAccountInfoSync();
    envVersion = accountInfo && accountInfo.miniProgram && accountInfo.miniProgram.envVersion
      ? accountInfo.miniProgram.envVersion
      : "develop";
  }
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
  const baseUrl = apiBase();

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
      url: `${baseUrl}${path}`,
      method,
      data: options.data,
      header: headers,
      timeout,
      success(response) {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          const payload = response.data && typeof response.data === "object" && "data" in response.data
            ? response.data.data
            : response.data;
          resolve(sanitizeApiData(payload, baseUrl));
          return;
        }
        if (response.statusCode === 401) {
          clearSessionState();
        }
        reject(new Error((response.data && response.data.message) || `HTTP ${response.statusCode}`));
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

function uploadBinary(path, filePath, options = {}) {
  const baseUrl = apiBase();
  const timeout = options.timeout || 120000;

  return readFileAsArrayBuffer(filePath).then((buffer) => new Promise((resolve, reject) => {
    const app = getAppInstance();
    const globalData = app && app.globalData ? app.globalData : {};
    const headers = {
      "content-type": options.contentType || "application/octet-stream",
      ...(options.header || {})
    };
    if (options.auth !== false && globalData.token) {
      headers.authorization = `Bearer ${globalData.token}`;
    }

    wx.request({
      url: `${baseUrl}${path}`,
      method: "POST",
      data: buffer,
      header: headers,
      timeout,
      success(response) {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          const payload = response.data && typeof response.data === "object" && "data" in response.data
            ? response.data.data
            : response.data;
          resolve(sanitizeApiData(payload, baseUrl));
          return;
        }
        if (response.statusCode === 401) {
          clearSessionState();
        }
        reject(new Error((response.data && response.data.message) || `HTTP ${response.statusCode}`));
      },
      fail: reject
    });
  }));
}

function readFileAsArrayBuffer(filePath) {
  return new Promise((resolve, reject) => {
    const fs = wx.getFileSystemManager && wx.getFileSystemManager();
    if (!fs || typeof fs.readFile !== "function") {
      reject(new Error("文件系统不可用"));
      return;
    }
    fs.readFile({
      filePath,
      success(result) {
        resolve(result.data);
      },
      fail: reject
    });
  });
}

// WeChat and DevTools expose selected images through http://tmp, wxfile, or a
// loopback /**tmp**/ URL. Those URLs belong to one process and become invalid after the temp file is
// cleared. Filter historical values at the API boundary so no page can hand a
// stale local URL to the rendering layer.
function sanitizeApiData(value, baseUrl = "") {
  if (typeof value === "string") {
    if (isTemporaryLocalFileUrl(value)) return "";
    return rewriteLoopbackStorageUrl(value, baseUrl);
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeApiData(item, baseUrl));
  }
  if (value && typeof value === "object") {
    const sanitized = {};
    Object.keys(value).forEach((key) => {
      sanitized[key] = sanitizeApiData(value[key], baseUrl);
    });
    return sanitized;
  }
  return value;
}

function rewriteLoopbackStorageUrl(value, baseUrl) {
  const match = /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?(\/api\/v1\/(?:storage|demo-assets)\/.*)$/i.exec(value);
  const apiOrigin = /^(https?:\/\/[^/]+)/i.exec(String(baseUrl || ""));
  const storagePath = match ? match[1] : /^\/api\/v1\/(?:storage|demo-assets)\//.test(value) ? value : "";
  return storagePath && apiOrigin ? `${apiOrigin[1]}${storagePath}` : value;
}

function isTemporaryLocalFileUrl(value) {
  return /^(?:wxfile:\/\/|https?:\/\/(?:tmp\/|(?:127\.0\.0\.1|localhost)(?::\d+)?\/(?:\*\*tmp\*\*|tmp)\/))/i.test(
    String(value || "")
  );
}

function clearSessionState() {
  const app = getAppInstance();
  if (app && app.globalData) {
    const { demoIdentity } = require("./demo-card");
    const demo = demoIdentity(true);
    app.globalData.token = "";
    app.globalData.currentIdentity = demo;
    app.globalData.identities = [demo];
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
  let isDevelop = false;
  try {
    const accountInfo = typeof wx.getAccountInfoSync === "function" ? wx.getAccountInfoSync() : null;
    isDevelop = accountInfo && accountInfo.miniProgram && accountInfo.miniProgram.envVersion === "develop";
  } catch (_error) {
    isDevelop = false;
  }
  if (globalData.demoAuthEnabled && isDevelop) {
    return type === "wx" ? "demo-wx-code" : "demo-qy-code";
  }
  return "";
}

module.exports = {
  request,
  uploadBinary,
  qyLoginCode,
  wxLoginCode,
  isWeComRuntime,
  sanitizeApiData
};
