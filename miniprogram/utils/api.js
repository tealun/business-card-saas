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

/**
 * 发起业务 API 请求，并统一处理基础地址、鉴权头、响应包裹和登录失效。
 *
 * GET/HEAD 会做一次轻量重试；POST/PUT/DELETE 等写操作不自动重试，避免重复创建
 * 名片、会话或审计记录。
 */
function request(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const isIdempotent = method === "GET" || method === "HEAD";
  // 只重试读类请求；写请求是否可重放必须由业务调用方判断。
  const maxRetries = isIdempotent ? 1 : 0;
  const timeout = options.timeout || 15000;
  const baseUrl = apiBase();
  const requestData = options.data === undefined && !isIdempotent ? {} : options.data;

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
      data: requestData,
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
          // 任一鉴权 API 返回 401，都说明本地身份缓存不再可信；在传输层清理，避免页面继续渲染旧租户/成员。
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

/**
 * 读取本地或开发者工具临时文件为 ArrayBuffer。
 *
 * 微信环境下图片可能来自 wxfile/http://tmp/本地路径，上传前统一转成二进制，
 * 并把底层错误整理成可展示给用户的错误消息。
 */
function readFileAsArrayBuffer(filePath) {
  return readFileWithFileSystem(filePath).catch((firstError) => {
    if (isHttpTemporaryFilePath(filePath) && typeof wx.request === "function") {
      // 开发者工具有时把选中文件暴露为 http://tmp/...；文件系统读不到，但 wx.request 能取回字节。
      return readFileWithRequest(filePath).catch((secondError) => {
        throw readableFileError(secondError, firstError);
      });
    }
    throw readableFileError(firstError);
  });
}

function readFileWithFileSystem(filePath) {
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

function readFileWithRequest(filePath) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: filePath,
      method: "GET",
      responseType: "arraybuffer",
      success(response) {
        if (response.statusCode >= 200 && response.statusCode < 300 && response.data) {
          resolve(response.data);
          return;
        }
        reject(new Error(`HTTP ${response.statusCode || 0}`));
      },
      fail: reject
    });
  });
}

function isHttpTemporaryFilePath(filePath) {
  return /^https?:\/\/tmp\//i.test(String(filePath || ""));
}

function readableFileError(error, fallbackError) {
  const message = errorMessage(error) || errorMessage(fallbackError) || "临时文件读取失败";
  return new Error(message);
}

function errorMessage(error) {
  return String((error && (error.message || error.errMsg)) || "").trim();
}

/**
 * 清洗 API 返回数据中的临时本地文件地址。
 *
 * 微信和开发者工具会把图片暴露成 wxfile、http://tmp 或本地回环 tmp URL，
 * 这些地址只在当前进程有效；在 API 边界清洗，防止页面把历史临时地址交给渲染层。
 */
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
    // token 过期后回到显式演示身份，避免内存里残留半清理的真实租户上下文。
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

/**
 * 获取微信小程序登录 code。
 *
 * 正常环境使用 wx.login；开发版启用演示登录时返回固定演示 code，便于本地联调。
 */
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
    // 演示登录只允许 develop 版使用，避免体验版/正式版用固定 code 换取会话。
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
