const PORTRAIT_PHOTO_MIN_WIDTH = 500;
const MIME_TYPES = {
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp"
};
const { showRestriction, showError } = require("../../utils/feedback");
const { imagePathToDataUrl } = require("../../utils/image-data");

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
    error: "",
    cropVisible: false,
    cropSource: "",
    cropFileType: "jpg"
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
        const sourceInfo = await getImageInfo(tempFilePath);
        validatePortraitSource(sourceInfo);
        const sourceMime = imageMime(sourceInfo);
        this.setData({
          cropVisible: true,
          cropSource: tempFilePath,
          cropFileType: sourceMime === "image/png" ? "png" : "jpg"
        });
      } catch (error) {
        const message = error && error.message ? error.message : "形象照不符合要求";
        this.setData({ error: message });
        showError(error, message);
      } finally {
        this.setData({ choosing: false });
      }
    },

    onCropCancel() {
      this.setData({ cropVisible: false, cropSource: "", choosing: false });
    },

    async onCropConfirm(event) {
      const croppedPath = String(event.detail && event.detail.tempFilePath || "");
      if (!croppedPath) return;
      try {
        const sourceMime = this.data.cropFileType === "png" ? "image/png" : "image/jpeg";
        const optimizedPath = await compressPortraitPhoto(croppedPath, sourceMime);
        const info = await getImageInfo(optimizedPath).catch(() => null);
        const dataUrl = await imagePathToDataUrl(optimizedPath, info ? imageMime(info) : sourceMime);
        this.setData({ cropVisible: false, cropSource: "", choosing: false, error: "" });
        this.triggerEvent("change", { url: dataUrl, dirty: true });
      } catch (error) {
        this.setData({ cropVisible: false, cropSource: "", choosing: false, error: error.message || "形象照处理失败" });
        showError(error, "形象照处理失败，请重新选择");
      }
    },

    onCropError(event) {
      const error = event.detail && event.detail.error;
      this.setData({ choosing: false });
      showError(error, "形象照裁切失败，请重新选择");
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

function validatePortraitSource(info) {
  const mime = imageMime(info);
  if (!mime) {
    throw new Error("形象照仅支持 JPG、PNG、WebP 图片");
  }
  if (!info || !info.width || !info.height) {
    throw new Error("无法读取图片尺寸");
  }
  if (Math.min(info.width, info.height) < PORTRAIT_PHOTO_MIN_WIDTH) {
    throw new Error("形象照较短边不能小于 500 像素");
  }
}

function compressPortraitPhoto(src, sourceMime) {
  // PNG 形象照通常依赖透明背景，跳过压缩以免透明通道被转换丢失。
  if (sourceMime === "image/png" || typeof wx.compressImage !== "function") return Promise.resolve(src);
  return new Promise((resolve, reject) => {
    wx.compressImage({
      src,
      quality: 82,
      compressedWidth: 900,
      compressedHeight: 900,
      success: (result) => resolve(result.tempFilePath || src),
      fail: reject
    });
  });
}

function imageMime(info) {
  const type = String(info.type || "").toLowerCase();
  if (MIME_TYPES[type]) {
    return MIME_TYPES[type];
  }
  const match = String(info.path || "").toLowerCase().match(/\.([a-z0-9]+)(?:\?|$)/);
  return match ? MIME_TYPES[match[1]] || "" : "";
}
