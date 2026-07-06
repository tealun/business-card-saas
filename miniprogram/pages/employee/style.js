const app = getApp();
const { request } = require("../../utils/api");

Page({
  data: {
    primary: "#2b6cff",
    templateId: "tpl_horizontal_business",
    card: { display_name: "", title: "", company: "", fields: {} },
    templates: [
      { id: "tpl_horizontal_business", name: "横版商务" },
      { id: "tpl_vertical_modern", name: "竖版现代" },
      { id: "tpl_minimal", name: "极简" },
      { id: "tpl_gradient", name: "渐变" },
      { id: "tpl_classic", name: "经典" }
    ],
    presets: ["#2b6cff", "#e5484d", "#7c5cfc", "#1f8a5b", "#f5820d", "#0e9c9c"]
  },

  onLoad() {
    const current = app.globalData.currentCard;
    if (current) {
      this.setData({ card: current });
    } else {
      this.loadCard();
    }
  },

  async loadCard() {
    try {
      const card = await request("/employee/cards/current");
      this.setData({ card });
    } catch (_error) {
      // 预览失败不阻塞样式选择
    }
  },

  selectTemplate(event) {
    this.setData({ templateId: event.currentTarget.dataset.id });
  },

  selectColor(event) {
    this.setData({ primary: event.currentTarget.dataset.color });
  },

  async applyStyle() {
    try {
      await request("/employee/cards/current/style", {
        method: "PUT",
        data: {
          template_id: this.data.templateId,
          color_scheme: {
            primary: this.data.primary,
            surface: "#ffffff"
          },
          layout: {
            variant: this.data.templateId
          }
        }
      });
      wx.showToast({ title: "已应用", icon: "success" });
      setTimeout(() => wx.navigateBack(), 600);
    } catch (error) {
      wx.showToast({ title: error.message || "保存失败", icon: "none" });
    }
  }
});
