const app = getApp();
const { request } = require("../../utils/api");

const demoCard = {
  display_name: "李明",
  title: "销售总监 · 市场部",
  company: "智云科技",
  avatar_url: "",
  fields: {
    mobile: "138 0013 8000",
    email: "liming@zhiyun.tech"
  },
  status: "active"
};

Page({
  data: {
    loading: false,
    loggedIn: false,
    demoMode: true,
    isPersonal: false,
    hasEnterpriseIdentity: false,
    currentIdentity: null,
    card: demoCard
  },

  onLoginSuccess() {
    this.onShow();
  },

  onShow() {
    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }
    this.bootstrap();
  },

  async bootstrap() {
    const currentIdentity = app.globalData.currentIdentity;
    const identities = app.globalData.identities || [];
    const loggedIn = Boolean(app.globalData.token && currentIdentity);

    if (!loggedIn) {
      this.setData({
        loading: false,
        loggedIn: false,
        demoMode: true,
        isPersonal: false,
        hasEnterpriseIdentity: false,
        currentIdentity: null,
        card: demoCard
      });
      return;
    }

    const isPersonal = currentIdentity.identity_type === "personal";
    const hasEnterpriseIdentity = identities.some((item) => item.identity_type !== "personal");
    this.setData({
      loading: true,
      loggedIn: true,
      demoMode: false,
      isPersonal,
      hasEnterpriseIdentity,
      currentIdentity
    });

    await this.loadCurrentCard(currentIdentity);
  },

  async loadCurrentCard(currentIdentity) {
    try {
      const preview = await request("/employee/cards/current/preview");
      const card = Object.assign({ fields: {}, status: preview.status }, preview.card || {});
      app.globalData.currentCard = card;
      this.setData({ card, loading: false });
    } catch (error) {
      const fallbackCard = this.cardFromIdentity(currentIdentity);
      this.setData({ card: fallbackCard, loading: false });
      wx.showToast({ title: error.message || "名片读取失败", icon: "none" });
    }
  },

  cardFromIdentity(identity) {
    return {
      display_name: identity && identity.display_name ? identity.display_name : "我的名片",
      title: "职位未设置",
      company: identity && identity.tenant_name ? identity.tenant_name : "企业名片",
      avatar_url: "",
      fields: {},
      status: "active"
    };
  },

  openGuide() {
    wx.showModal({
      title: "企业名片开通说明",
      content: "企业名片由企业微信管理员授权安装应用后生成。完成授权后，员工重新登录小程序即可看到企业名片身份。",
      showCancel: false,
      confirmText: "知道了"
    });
  }
});
