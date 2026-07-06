const { request } = require("../../utils/api");

Page({
  data: {
    primary: "#1677ff"
  },

  onPrimary(event) {
    this.setData({ primary: event.detail.value });
  },

  async applyStyle() {
    try {
      await request("/employee/cards/current/style", {
        method: "PUT",
        data: {
          template_id: "tpl_demo_business",
          color_scheme: {
            primary: this.data.primary,
            surface: "#ffffff"
          },
          layout: {
            variant: "horizontal-business"
          }
        }
      });
      wx.showToast({ title: "已应用", icon: "success" });
      wx.navigateBack();
    } catch (error) {
      wx.showToast({ title: error.message || "保存失败", icon: "none" });
    }
  }
});
