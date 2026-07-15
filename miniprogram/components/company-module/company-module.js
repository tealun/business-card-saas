Component({
  properties: {
    module: {
      type: Object,
      value: {}
    }
  },
  data: {
    profileExpanded: false
  },
  methods: {
    toggleProfile() {
      this.setData({ profileExpanded: !this.data.profileExpanded });
    },
    previewImage(event) {
      const urls = event.currentTarget.dataset.urls || [];
      const url = event.currentTarget.dataset.url || urls[0];
      if (!url) return;
      this.triggerEvent("preview", { url, urls: Array.isArray(urls) ? urls : [url] });
    }
  }
});
