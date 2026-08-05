const { request, isWeComRuntime } = require("../../utils/api");

Page({
  data: {
    loading: true,
    error: "",
    authorizationUrl: ""
  },

  /**
   * 初始化企业微信敏感资料授权页。
   * 仅企业微信运行环境允许发起授权 URL 获取。
   */
  async onLoad() {
    if (!isWeComRuntime()) {
      this.setData({ loading: false, error: "请在企业微信中打开小程序完成授权。" });
      return;
    }
    try {
      const result = await request("/wecom/member-sensitive/authorization-url", {
        method: "POST",
        data: {}
      });
      this.setData({ loading: false, authorizationUrl: result.authorization_url || "" });
      if (!result.authorization_url) throw new Error("企业微信未返回授权地址");
    } catch (error) {
      this.setData({ loading: false, error: error.message || "敏感信息授权发起失败" });
    }
  },

  /**
   * 重置错误态并重新发起授权 URL 获取。
   */
  retry() {
    this.setData({ loading: true, error: "", authorizationUrl: "" });
    this.onLoad();
  }
});
