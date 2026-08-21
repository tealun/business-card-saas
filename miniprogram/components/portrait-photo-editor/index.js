const PORTRAIT_PHOTO_MIN_WIDTH = 500;
const PORTRAIT_PHOTO_MIN_HEIGHT = 500;
const PORTRAIT_PHOTO_MIN_RATIO = 0.95;
const PORTRAIT_PHOTO_MAX_RATIO = 1.05;
const MIME_TYPES = {
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp"
};
const { showRestriction, showError } = require("../../utils/feedback");

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
    },
    defaultPhotoUrl: {
      type: String,
      value: ""
    }
  },

  data: {
    choosing: false,
    error: ""
  },

  methods: {
    async onChoosePhoto() {
      if (!this.data.editable) {
        showRestriction(this.data.deniedText);
        return;
      }
      if (this.data.choosing) {
        return;
      }
      this.setData({ choosing: true, error: "" });
      try {
        const tempFilePath = await choosePortraitPhoto();
        if (!tempFilePath) {
          return;
        }
        const info = await getImageInfo(tempFilePath);
        validatePortraitPhoto(info);
        const dataUrl = await pathToDataUrl(tempFilePath, imageMime(info));
        this.setData({ error: "" });
        this.triggerEvent("change", { url: dataUrl, dirty: true });
      } catch (error) {
        const message = error && error.message ? error.message : "形象照不符合要求";
        this.setData({ error: message });
        showError(error, message);
      } finally {
        this.setData({ choosing: false });
      }
    },

    onClearPhoto() {
      if (!this.data.editable) {
        showRestriction(this.data.deniedText);
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

function choosePortraitPhoto() {
  return new Promise((resolve) => {
    if (typeof wx.chooseMedia === "function") {
      wx.chooseMedia({
        count: 1,
        mediaType: ["image"],
        sourceType: ["album"],
        sizeType: ["original"],
        success(result) {
          const file = result.tempFiles && result.tempFiles[0];
          resolve(file && file.tempFilePath ? file.tempFilePath : "");
        },
        fail() {
          resolve("");
        }
      });
      return;
    }
    if (typeof wx.chooseImage === "function") {
      wx.chooseImage({
        count: 1,
        sourceType: ["album"],
        sizeType: ["original"],
        success(result) {
          resolve((result.tempFilePaths && result.tempFilePaths[0]) || "");
        },
        fail() {
          resolve("");
        }
      });
      return;
    }
    showRestriction("当前微信版本暂不支持选择图片，请升级微信后重试");
    resolve("");
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
    throw new Error("形象照请使用 1:1 正方形");
  }
  if (info.width < PORTRAIT_PHOTO_MIN_WIDTH || info.height < PORTRAIT_PHOTO_MIN_HEIGHT) {
    throw new Error("形象照请上传不小于 500×500 的图片");
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
