const app = getApp();
const { request } = require("../../utils/api");

Page({
  data: {
    publicId: "pub_demo0001",
    shareId: "shr_demo0001",
    nextShareId: "",
    visitId: "",
    card: {
      card: {
        fields: {}
      },
      company_profile: {
        intro_blocks: []
      },
      videos: [],
      honors: []
    }
  },

  async onLoad(query) {
    this.setData({
      publicId: query.card || query.public_id || "pub_demo0001",
      shareId: query.share || "shr_demo0001"
    });
    await this.loadPublicCard();
    await this.createVisit();
  },

  async loadPublicCard() {
    try {
      const card = await request(`/public/cards/${this.data.publicId}`, { auth: false });
      this.setData({ card });
    } catch (error) {
      wx.showToast({ title: error.message || "名片加载失败", icon: "none" });
    }
  },

  async createVisit() {
    try {
      const visit = await request(`/public/cards/${this.data.publicId}/visit`, {
        method: "POST",
        auth: false,
        data: {
          share: this.data.shareId,
          anon_id: app.globalData.anonId || undefined
        }
      });
      app.globalData.visitToken = visit.visit_token;
      app.globalData.anonId = visit.anon_id;
      this.setData({ visitId: visit.visit_id });
      await this.prepareDerivedShare();
    } catch (error) {
      wx.showToast({ title: "访问统计稍后重试", icon: "none" });
    }
  },

  async prepareDerivedShare() {
    if (!app.globalData.visitToken) {
      return;
    }
    try {
      const derived = await request(`/public/cards/${this.data.publicId}/shares/derive`, {
        method: "POST",
        header: { authorization: `Bearer ${app.globalData.visitToken}` },
        data: { parent_share_id: this.data.shareId }
      });
      this.setData({ nextShareId: derived.share_id });
    } catch (_error) {
      this.setData({ nextShareId: this.data.shareId });
    }
  },

  async recordAction(actionType) {
    if (!app.globalData.visitToken) {
      wx.showToast({ title: "visit 未就绪", icon: "none" });
      return;
    }
    try {
      await request(`/public/cards/${this.data.publicId}/actions`, {
        method: "POST",
        header: { authorization: `Bearer ${app.globalData.visitToken}` },
        data: { action_type: actionType }
      });
      wx.showToast({ title: "已记录", icon: "success" });
    } catch (error) {
      wx.showToast({ title: error.message || "记录失败", icon: "none" });
    }
  },

  recordSave() {
    this.recordAction("save_phone");
  },

  recordCall() {
    this.recordAction("call_phone");
  },

  recordExpandIntro() {
    this.recordAction("expand_company_intro");
  },

  recordPlayVideo() {
    this.recordAction("play_company_video");
  },

  previewHonor(event) {
    const url = event.currentTarget.dataset.url;
    if (url) {
      wx.previewImage({ urls: [url], current: url });
    }
    this.recordAction("view_honor_image");
  },

  onShareAppMessage() {
    const shareId = this.data.nextShareId || this.data.shareId;
    return {
      title: `${this.data.card.card.display_name || "企业名片"}`,
      path: `/pages/public/card?card=${this.data.publicId}&share=${shareId}`
    };
  }
});
