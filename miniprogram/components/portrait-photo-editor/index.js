const PORTRAIT_PHOTO_MIN_WIDTH = 900;
const PORTRAIT_PHOTO_MIN_HEIGHT = 1200;
const PORTRAIT_PHOTO_MIN_RATIO = 0.72;
const PORTRAIT_PHOTO_MAX_RATIO = 0.78;
const MIME_TYPES = {
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp"
};

Component({
  properties: {
    editable: {
      type: Boolean,
      value: true
    },
    lockedText: {
      type: String,
      value: "企业统一维护"
    },
    deniedText: {
      type: String,
      value: "该字段由企业统一维护"
    },
    url: {
      type: String,
      value: ""
    }
  },

  data: {
    choosing: false,
    error: ""
  },

  methods: {
    onChoosePhoto() {
      if (!this.data.editable) {
        wx.showToast({ title: this.data.deniedText, icon: "none" });
        return;
      }
      if (this.data.choosing) {
        return;
      }
      if (typeof wx.chooseMedia !== "function") {
        wx.showToast({ title: "当前微信版本暂不支持选择图片", icon: "none" });
        return;
      }
      this.setData({ choosing: true, error: "" });
      wx.chooseMedia({
        count: 1,
        mediaType: ["image"],
        sourceType: ["album"],
        sizeType: ["original"],
        success: async (result) => {
          try {
            const file = result.tempFiles && result.tempFiles[0];
            const tempFilePath = file && file.tempFilePath;
            if (!tempFilePath) {
              throw new Error("未读取到图片");
            }
            const info = await getImageInfo(tempFilePath);
            validatePortraitPhoto(info);
            const dataUrl = await pathToDataUrl(tempFilePath, imageMime(info));
            this.setData({ error: "" });
            this.triggerEvent("change", { url: dataUrl, dirty: true });
          } catch (error) {
            const message = error && error.message ? error.message : "形象照不符合要求";
            this.setData({ error: message });
            wx.showToast({ title: message, icon: "none" });
          }
        },
        fail: () => {},
        complete: () => {
          this.setData({ choosing: false });
        }
      });
    },

    onClearPhoto() {
      if (!this.data.editable) {
        wx.showToast({ title: this.data.deniedText, icon: "none" });
        return;
      }
      this.setData({ error: "" });
      this.triggerEvent("change", { url: "", dirty: true });
    }
  }
});

function getImageInfo(src) {
  return new Promise((resolve, reject) => {
    wx.getImageInfo({
      src,
      success: resolve,
      fail: reject
    });
  });
}

function validatePortraitPhoto(info) {
  const mime = imageMime(info);
  if (mime !== "image/png") {
    throw new Error("形象照仅支持 PNG 图片");
  }
  if (!info || !info.width || !info.height) {
    throw new Error("无法读取图片尺寸");
  }
  const ratio = info.width / info.height;
  if (ratio < PORTRAIT_PHOTO_MIN_RATIO || ratio > PORTRAIT_PHOTO_MAX_RATIO) {
    throw new Error("形象照请使用 3:4 竖图");
  }
  if (info.width < PORTRAIT_PHOTO_MIN_WIDTH || info.height < PORTRAIT_PHOTO_MIN_HEIGHT) {
    throw new Error("形象照请上传不小于 900×1200 的图片");
  }
}

function imageMime(info) {
  const type = String(info.type || "").toLowerCase();
  if (MIME_TYPES[type]) {
    return MIME_TYPES[type];
  }
  const match = String(info.path || "").toLowerCase().match(/\.([a-z0-9]+)(?:\?|$)/);
  return match ? MIME_TYPES[match[1]] || "" : "";
}

function pathToDataUrl(path, mime) {
  if (/^data:image\//.test(path) || /^https?:\/\//.test(path)) {
    return Promise.resolve(path);
  }
  return new Promise((resolve, reject) => {
    const fs = wx.getFileSystemManager && wx.getFileSystemManager();
    if (!fs || typeof fs.readFile !== "function") {
      reject(new Error("文件系统不可用"));
      return;
    }
    const filePath = path.startsWith("/") ? path.slice(1) : path;
    fs.readFile({
      filePath,
      encoding: "base64",
      success(result) {
        resolve(`data:${mime};base64,${result.data}`);
      },
      fail: reject
    });
  });
}
