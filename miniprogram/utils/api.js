const app = getApp();

function apiBase() {
  return app.globalData.apiBase.replace(/\/$/, "");
}

function request(path, options = {}) {
  const headers = {
    "content-type": "application/json",
    ...(options.header || {})
  };
  if (options.auth !== false && app.globalData.token) {
    headers.authorization = `Bearer ${app.globalData.token}`;
  }
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${apiBase()}${path}`,
      method: options.method || "GET",
      data: options.data,
      header: headers,
      timeout: options.timeout || 15000,
      success(response) {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(response.data && typeof response.data === "object" && "data" in response.data ? response.data.data : response.data);
          return;
        }
        reject(new Error(response.data?.message || `HTTP ${response.statusCode}`));
      },
      fail: reject
    });
  });
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
