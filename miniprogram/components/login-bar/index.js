const { ensureSession } = require("../../utils/auth");

// 固定底部登录引导条。登录成功后 triggerEvent("success", session)，
// 由宿主页面决定如何刷新自己的数据；失败时 triggerEvent("fail")。
Component({
  properties: {
    text: {
      type: String,
      value: "立即登录"
    }
  },

  data: {
    submitting: false
  },

  methods: {
    async triggerLogin() {
      if (this.data.submitting) {
        return;
      }
      this.setData({ submitting: true });
      try {
        const session = await ensureSession({ force: true });
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
