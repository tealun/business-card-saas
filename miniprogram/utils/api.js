const app = getApp();

function apiBase() {
  return app.globalData.apiBase.replace(/\/$/, "");
}

function request(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const isIdempotent = method === "GET" || method === "HEAD";
  const maxRetries = isIdempotent ? 1 : 0;
  const timeout = options.timeout || 15000;

  let lastError;
  const attempt = (retryIndex) => new Promise((resolve, reject) => {
    const headers = {
      "content-type": "application/json",
      ...(options.header || {})
    };
    if (options.auth !== false && app.globalData.token) {
      headers.authorization = `Bearer ${app.globalData.token}`;
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
        reject(new Error(response.data?.message || `HTTP ${response.statusCode}`));
      },
      fail(error) {
        reject(error);
      }
    });
  });

  const run = () => attempt().catch((error) => {
    lastError = error;
    if (maxRetries > 0) {
      return new Promise((resolve) => setTimeout(resolve, 800)).then(attempt);
    }
    throw error;
  });

  return run();
}

function qyLoginCode() {
  return new Promise((resolve, reject) => {
    if (wx.qy && wx.qy.login) {
      wx.qy.login({
        success(result) {
          if (result.code) {
            resolve(result.code);
            return;
          }
          resolve(maybeDemoCode());
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

function maybeDemoCode() {
  if (app.globalData.demoAuthEnabled) {
    return "demo-qy-code";
  }
  return "";
}

module.exports = {
  request,
  qyLoginCode
};
