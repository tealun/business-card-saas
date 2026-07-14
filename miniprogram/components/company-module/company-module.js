Component({
  properties: {
    module: {
      type: Object,
      value: {}
    }
  },
  methods: {
    previewImage(event) {
      const urls = event.currentTarget.dataset.urls || [];
      const url = event.currentTarget.dataset.url || urls[0];
      if (!url) return;
      this.triggerEvent("preview", { url, urls: Array.isArray(urls) ? urls : [url] });
    }
  }
});
