const { showRestriction } = require("../../utils/feedback");

Component({
  properties: {
    accountType: {
      type: String,
      value: "personal"
    },
    templateClass: {
      type: String,
      value: "biz-card--horizontal"
    },
    backgroundPreviewStyle: {
      type: String,
      value: ""
    },
    card: {
      type: Object,
      value: { fields: {}, show_avatar: true }
    },
    logoUrl: {
      type: String,
      value: ""
    },
    templateId: {
      type: String,
      value: ""
    },
    templates: {
      type: Array,
      value: []
    },
    primary: {
      type: String,
      value: ""
    },
    presets: {
      type: Array,
      value: []
    },
    customColorExpanded: {
      type: Boolean,
      value: false
    },
    customHex: {
      type: String,
      value: ""
    },
    customHexError: {
      type: String,
      value: ""
    },
    backgroundUrl: {
      type: String,
      value: ""
    },
    backgroundPresetId: {
      type: String,
      value: ""
    },
    backgroundPresets: {
      type: Array,
      value: []
    },
    backgroundOpacity: {
      type: Number,
      value: 100
    },
    backgroundError: {
      type: String,
      value: ""
    },
    portraitPhotoUrl: {
      type: String,
      value: ""
    },
    defaultPortraitPhotoUrl: {
      type: String,
      value: ""
    },
    canEditTemplates: {
      type: Boolean,
      value: true
    },
    canEditColors: {
      type: Boolean,
      value: true
    },
    canEditBackground: {
      type: Boolean,
      value: true
    },
    canEditPortraitPhoto: {
      type: Boolean,
      value: true
    }
  },

  methods: {
    onTemplateTap(event) {
      if (!this.ensureAllowed("canEditTemplates")) return;
      this.triggerEvent("templatechange", {
        templateId: String(event.currentTarget.dataset.id || "")
      });
    },

    onColorTap(event) {
      if (!this.ensureAllowed("canEditColors")) return;
      this.triggerEvent("colorchange", {
        color: String(event.currentTarget.dataset.color || "")
      });
    },

    onCustomColorTap() {
      if (!this.ensureAllowed("canEditColors")) return;
      this.triggerEvent("customcolorselect");
    },

    onCustomHexInput(event) {
      if (!this.data.canEditColors) {
        return;
      }
      this.triggerEvent("customhexinput", {
        value: String(event.detail.value || "")
      });
    },

    onChooseBackground() {
      if (!this.ensureAllowed("canEditBackground")) return;
      this.triggerEvent("backgroundchoose");
    },

    onPresetTap(event) {
      if (!this.ensureAllowed("canEditBackground")) return;
      this.triggerEvent("backgroundpresetselect", {
        presetId: String(event.currentTarget.dataset.id || "")
      });
    },

    onClearBackground() {
      if (!this.ensureAllowed("canEditBackground")) return;
      this.triggerEvent("backgroundclear");
    },

    onBackgroundOpacity(event) {
      if (!this.data.canEditBackground) {
        return;
      }
      this.triggerEvent("backgroundopacitychange", {
        value: event.detail.value
      });
    },

    onPortraitPhotoChange(event) {
      this.triggerEvent("portraitphotochange", event.detail || {});
    },

    ensureAllowed(key) {
      if (this.data[key]) {
        return true;
      }
      showRestriction(this.data.accountType === "enterprise" ? "当前账号无权限修改此项" : "暂无权限修改");
      return false;
    }
  }
});
