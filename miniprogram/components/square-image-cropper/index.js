const OUTPUT_SIZE = 900;

Component({
  properties: {
    visible: { type: Boolean, value: false, observer: "onVisibleChange" },
    src: { type: String, value: "", observer: "onSourceChange" },
    title: { type: String, value: "裁切照片" },
    fileType: { type: String, value: "jpg" }
  },

  data: {
    ready: false,
    exporting: false,
    viewportSize: 0,
    naturalWidth: 0,
    naturalHeight: 0,
    imageWidth: 0,
    imageHeight: 0,
    imageX: 0,
    imageY: 0,
    imageScale: 1
  },

  methods: {
    noop() {},

    onVisibleChange(visible) {
      if (!visible) {
        this.setData({ ready: false, exporting: false });
        return;
      }
      this.scheduleInitialize();
    },

    onSourceChange(src) {
      if (src && this.data.visible) this.scheduleInitialize();
    },

    scheduleInitialize() {
      clearTimeout(this._initializeTimer);
      this._initializeTimer = setTimeout(() => {
        if (this.data.visible && this.data.src) this.initialize();
      }, 50);
    },

    initialize() {
      Promise.all([getImageInfo(this.data.src), this.measureViewport()])
        .then(([info, viewportSize]) => {
          const baseScale = Math.max(viewportSize / info.width, viewportSize / info.height);
          const imageWidth = info.width * baseScale;
          const imageHeight = info.height * baseScale;
          this.setData({
            ready: true,
            viewportSize,
            naturalWidth: info.width,
            naturalHeight: info.height,
            imageWidth,
            imageHeight,
            imageX: (viewportSize - imageWidth) / 2,
            imageY: (viewportSize - imageHeight) / 2,
            imageScale: 1
          });
        })
        .catch((error) => this.triggerEvent("error", { error }));
    },

    measureViewport() {
      return new Promise((resolve, reject) => {
        this.createSelectorQuery().select("#cropViewport").boundingClientRect((rect) => {
          rect && rect.width ? resolve(rect.width) : reject(new Error("裁切区域初始化失败"));
        }).exec();
      });
    },

    onImageMove(event) {
      if (event.detail.source) {
        this.data.imageX = Number(event.detail.x) || 0;
        this.data.imageY = Number(event.detail.y) || 0;
      }
    },

    onImageScale(event) {
      this.data.imageScale = Number(event.detail.scale) || 1;
      if (Number.isFinite(event.detail.x)) this.data.imageX = event.detail.x;
      if (Number.isFinite(event.detail.y)) this.data.imageY = event.detail.y;
    },

    onCancel() {
      if (!this.data.exporting) this.triggerEvent("cancel");
    },

    async onConfirm() {
      if (!this.data.ready || this.data.exporting) return;
      this.setData({ exporting: true });
      try {
        const tempFilePath = await this.exportCrop();
        this.triggerEvent("confirm", { tempFilePath });
      } catch (error) {
        this.triggerEvent("error", { error });
      } finally {
        this.setData({ exporting: false });
      }
    },

    exportCrop() {
      return new Promise((resolve, reject) => {
        this.createSelectorQuery().select("#cropCanvas").fields({ node: true, size: true }, (result) => {
          if (!result || !result.node) {
            reject(new Error("裁切画布初始化失败"));
            return;
          }
          const canvas = result.node;
          const ctx = canvas.getContext("2d");
          canvas.width = OUTPUT_SIZE;
          canvas.height = OUTPUT_SIZE;
          const image = canvas.createImage();
          image.onload = () => {
            const scale = this.data.imageScale || 1;
            const renderedWidth = this.data.imageWidth * scale;
            const renderedHeight = this.data.imageHeight * scale;
            const sourcePerPixelX = this.data.naturalWidth / renderedWidth;
            const sourcePerPixelY = this.data.naturalHeight / renderedHeight;
            const cropWidth = Math.min(this.data.naturalWidth, this.data.viewportSize * sourcePerPixelX);
            const cropHeight = Math.min(this.data.naturalHeight, this.data.viewportSize * sourcePerPixelY);
            const sourceX = clamp(-this.data.imageX * sourcePerPixelX, 0, this.data.naturalWidth - cropWidth);
            const sourceY = clamp(-this.data.imageY * sourcePerPixelY, 0, this.data.naturalHeight - cropHeight);
            ctx.clearRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
            ctx.drawImage(image, sourceX, sourceY, cropWidth, cropHeight, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
            wx.canvasToTempFilePath({
              canvas,
              fileType: this.data.fileType === "png" ? "png" : "jpg",
              quality: .9,
              success: (output) => resolve(output.tempFilePath || ""),
              fail: reject
            }, this);
          };
          image.onerror = reject;
          image.src = this.data.src;
        }).exec();
      });
    }
  }
});

function getImageInfo(src) {
  return new Promise((resolve, reject) => {
    wx.getImageInfo({ src, success: resolve, fail: reject });
  });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
