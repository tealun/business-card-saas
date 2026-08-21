/**
 * 将微信本地图片转成可提交的 data URL。
 * 开发者工具可能返回 http://tmp/...，此时文件系统不可读，需要通过 wx.request 取回字节。
 */
function imagePathToDataUrl(path, mime = "image/jpeg") {
  if (/^data:image\//i.test(path) || (/^https?:\/\//i.test(path) && !isHttpTemporaryPath(path))) {
    return Promise.resolve(path);
  }
  return readBase64(path).then((data) => `data:${mime};base64,${data}`);
}

function readBase64(path) {
  return readBase64WithFileSystem(path).catch((fileError) => {
    if (!isHttpTemporaryPath(path) || typeof wx.request !== "function") {
      throw fileError;
    }
    return readBase64WithRequest(path).catch(() => {
      throw fileError;
    });
  });
}

function readBase64WithFileSystem(path) {
  return new Promise((resolve, reject) => {
    const fs = wx.getFileSystemManager && wx.getFileSystemManager();
    if (!fs || typeof fs.readFile !== "function") {
      reject(new Error("文件系统不可用"));
      return;
    }
    fs.readFile({
      filePath: path,
      encoding: "base64",
      success(result) {
        resolve(result.data);
      },
      fail: reject
    });
  });
}

function readBase64WithRequest(path) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: path,
      method: "GET",
      responseType: "arraybuffer",
      success(response) {
        if (response.statusCode >= 200 && response.statusCode < 300 && response.data) {
          if (typeof wx.arrayBufferToBase64 !== "function") {
            reject(new Error("当前微信版本无法读取临时图片"));
            return;
          }
          resolve(wx.arrayBufferToBase64(response.data));
          return;
        }
        reject(new Error(`HTTP ${response.statusCode || 0}`));
      },
      fail: reject
    });
  });
}

function isHttpTemporaryPath(path) {
  return /^https?:\/\/(?:tmp\/|(?:127\.0\.0\.1|localhost)(?::\d+)?\/(?:\*\*tmp\*\*|tmp)\/)/i.test(String(path || ""));
}

module.exports = { imagePathToDataUrl };
