const app = getApp();
const { request } = require("../../utils/api");

Page({
  data: {
    primary: "#2b6cff",
    templateId: "tpl_horizontal_business",
    card: { display_name: "", title: "", company: "", fields: {} },
    templates: [
      { id: "tpl_horizontal_business", name: "横版商务", desc: "企业级默认模板" },
      { id: "tpl_minimal", name: "极简", desc: "信息更克制" },
      { id: "tpl_brand_image", name: "品牌图", desc: "适合强品牌露出" },
      { id: "tpl_dark", name: "深色", desc: "高对比展示" },
      { id: "tpl_campaign", name: "活动版", desc: "短期推广使用" }
    ],
    presets: ["#2b6cff", "#e5484d", "#7c5cfc", "#1f8a5b", "#f5820d", "#0e9c9c"],
    submitting: false
  },

  onLoad() {
    const current = app.globalData.currentCard;
    if (current) {
      this.setData({ card: Object.assign({ fields: {} }, current) });
    } else {
      this.loadCard();
    }
  },

  async loadCard() {
    try {
      const card = await request("/employee/cards/current");
      this.setData({ card: Object.assign({ fields: {} }, card) });
    } catch (_error) {
      wx.showToast({ title: "名片信息加载失败，预览可能不完整", icon: "none" });
    }
  },

  selectTemplate(event) {
    this.setData({ templateId: event.currentTarget.dataset.id });
  },

  selectColor(event) {
    this.setData({ primary: event.currentTarget.dataset.color });
  },

  async applyStyle() {
    if (this.data.submitting) {
      return;
    }
    this.setData({ submitting: true });
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
    } finally {
      this.setData({ submitting: false });
    }
  }
});
