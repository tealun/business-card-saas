const app = getApp();
const { request } = require("../../utils/api");

Page({
  data: {
    uiState: "loading", // loading | ready | error | disabled
    publicId: "",
    shareId: "",
    nextShareId: "",
    visitId: "",
    themeBrand: "#2b6cff",
    isDisabled: false,
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
    const publicId = query.card || query.public_id || "";
    const shareId = query.share || "";
    this.setData({
      publicId,
      shareId
    });
    if (!publicId) {
      this.setData({ uiState: "error" });
      wx.showToast({ title: "名片链接无效", icon: "none" });
      return;
    }
    await this.loadPublicCard();
    await this.createVisit();
  },

  async loadPublicCard() {
    try {
      const card = await request(`/public/cards/${this.data.publicId}`, { auth: false });
      const disabled = card.status && card.status !== "active";
      const brand = (card.template && card.template.color_scheme && card.template.color_scheme.primary) || "#2b6cff";
      this.setData({
        card,
        themeBrand: brand,
        isDisabled: disabled,
        uiState: disabled ? "disabled" : "ready"
      });
    } catch (error) {
      this.setData({ uiState: "error" });
      wx.showToast({ title: error.message || "名片加载失败", icon: "none" });
    }
  },

  reload() {
    this.setData({ uiState: "loading" });
    this.loadPublicCard().then(() => this.createVisit());
  },

  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
    } else {
      wx.switchTab({ url: "/pages/employee/index", fail() {} });
    }
  },

  goCompany() {
    wx.switchTab({ url: "/pages/company-card/index", fail() {} });
  },

  async createVisit() {
    try {
      const data = {
        anon_id: app.globalData.anonId || undefined
      };
      if (this.data.shareId) {
        data.share = this.data.shareId;
      }
      const visit = await request(`/public/cards/${this.data.publicId}/visit`, {
        method: "POST",
        auth: false,
        data
      });
      app.globalData.visitToken = visit.visit_token;
      app.globalData.anonId = visit.anon_id;
      this.setData({ visitId: visit.visit_id });
      await this.prepareDerivedShare();
    } catch (error) {
      // visit 统计失败不阻塞浏览
    }
  },

  async prepareDerivedShare() {
    if (!app.globalData.visitToken || !this.data.shareId) {
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
      return;
    }
    try {
      await request(`/public/cards/${this.data.publicId}/actions`, {
        method: "POST",
        header: { authorization: `Bearer ${app.globalData.visitToken}` },
        data: { action_type: actionType }
      });
    } catch (_error) {
      // 埋点失败静默
    }
  },

  callPhone() {
    const fields = this.data.card.card.fields;
    const number = fields.mobile || fields.phone;
    if (!number) {
      return;
    }
    this.recordAction("call_phone");
    wx.makePhoneCall({ phoneNumber: number, fail() {} });
  },

  saveContact() {
    const c = this.data.card.card;
    this.recordAction("save_phone");
    wx.addPhoneContact({
      firstName: c.display_name || "联系人",
      mobilePhoneNumber: c.fields.mobile || "",
      workPhoneNumber: c.fields.phone || "",
      email: c.fields.email || "",
      organization: c.company || "",
      title: c.title || "",
      fail() {}
    });
  },

  copyEmail() {
    const email = this.data.card.card.fields.email;
    if (!email) {
      return;
    }
    this.recordAction("copy_email");
    wx.setClipboardData({ data: email });
  },

  openMap() {
    this.recordAction("open_map");
    const address = this.data.card.company_profile.address || this.data.card.card.fields.address;
    if (address) {
      wx.setClipboardData({ data: address, success() { wx.showToast({ title: "地址已复制", icon: "none" }); } });
    }
  },

  copyWechat() {
    const wechat = this.data.card.card.fields.wechat_id;
    if (!wechat) {
      return;
    }
    wx.setClipboardData({ data: wechat, success() { wx.showToast({ title: "微信号已复制", icon: "none" }); } });
  },

  addWecom() {
    this.recordAction("add_wecom");
    wx.showToast({ title: "正在跳转企业微信", icon: "none" });
  },

  viewPaperCard() {
    this.recordAction("view_paper_card");
  },

  expandIntro() {
    this.recordAction("expand_company_intro");
  },

  playVideo() {
    this.recordAction("play_company_video");
    const video = this.data.card.videos[0];
    if (video && video.video_url) {
      if (wx.previewMedia) {
        wx.previewMedia({
          sources: [
            {
              url: video.video_url,
              type: "video",
              poster: video.cover_url || undefined
            }
          ],
          fail() {
            wx.setClipboardData({ data: video.video_url });
          }
        });
      } else {
        wx.setClipboardData({ data: video.video_url });
      }
    }
  },

  previewHonor(event) {
    const url = event.currentTarget.dataset.url;
    this.recordAction("view_honor_image");
    if (url) {
      wx.previewImage({ urls: [url], current: url });
    }
  },

  onShareAppMessage() {
    const shareId = this.data.nextShareId || this.data.shareId;
    this.recordAction("view_site");
    const shareParam = shareId ? `&share=${shareId}` : "";
    return {
      title: `${this.data.card.card.display_name || "企业名片"}`,
      path: `/pages/public/card?card=${this.data.publicId}${shareParam}`
    };
  }
});
