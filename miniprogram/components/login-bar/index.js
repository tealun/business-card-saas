const { ensureSession } = require("../../utils/auth");

// 固定底部登录引导条。登录成功后 triggerEvent("success", session)，
// 由宿主页面决定如何刷新自己的数据；失败时 triggerEvent("fail")。
Component({
  properties: {
    text: {
      type: String,
      value: "开始使用"
    }
  },

  data: {
    submitting: false,
    dialogVisible: false,
    agreementChecked: false
  },

  methods: {
    openDialog() {
      if (!this.data.submitting) this.setData({ dialogVisible: true });
    },

    closeDialog() {
      if (!this.data.submitting) this.setData({ dialogVisible: false });
    },

    stopPropagation() {},

    toggleAgreement() {
      this.setData({ agreementChecked: !this.data.agreementChecked });
    },

    openLegal(event) {
      const type = event.currentTarget.dataset.type === "privacy" ? "privacy" : "agreement";
      wx.navigateTo({ url: `/pages/legal/index?type=${type}` });
    },

    async confirmLogin() {
      if (this.data.submitting) {
        return;
      }
      if (!this.data.agreementChecked) {
        wx.showToast({ title: "请先阅读并同意用户协议和隐私政策", icon: "none" });
        return;
      }
      this.setData({ submitting: true });
      try {
        const session = await ensureSession({ force: true });
        this.setData({ dialogVisible: false });
        this.triggerEvent("success", session);
      } catch (error) {
        const message = (error && error.message) || "登录失败";
        wx.showToast({ title: message, icon: "none" });
        this.triggerEvent("fail", { message });
      } finally {
        this.setData({ submitting: false });
      }
    }
  }
});
