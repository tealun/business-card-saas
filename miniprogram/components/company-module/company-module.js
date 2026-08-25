Component({
  properties: {
    module: {
      type: Object,
      value: {}
    }
  },
  data: {
    profileExpanded: false,
    activeVideoKey: "",
    failedMedia: {}
  },
  methods: {
    toggleProfile() {
      this.setData({ profileExpanded: !this.data.profileExpanded });
    },
    playVideo(event) {
      const videoKey = event.currentTarget.dataset.videoKey || "";
      if (!videoKey) return;
      this.setData({ activeVideoKey: videoKey }, () => {
        const video = wx.createVideoContext(`company-video-${videoKey}`, this);
        video.play();
      });
    },
    previewImage(event) {
      const urls = event.currentTarget.dataset.urls || [];
      const url = event.currentTarget.dataset.url || urls[0];
      if (!url) return;
      this.triggerEvent("preview", { url, urls: Array.isArray(urls) ? urls : [url] });
    },
    onMediaError(event) {
      const url=String(event.currentTarget.dataset.url||"");
      if(url)this.setData({failedMedia:{...this.data.failedMedia,[url]:true}});
      this.triggerEvent("mediaerror", { url, message: (event.detail && event.detail.errMsg) || "媒体资源加载失败" });
    }
  }
});
