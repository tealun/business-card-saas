const app = getApp();
const { request } = require("../../utils/api");

const demoPublicCard = {
  status: "active",
  card: {
    display_name: "李明",
    title: "销售总监 · 市场部",
    company: "智云科技",
    avatar_url: "",
    fields: {
      mobile: "138 0013 8000",
      phone: "0755-8888 0000",
      email: "liming@zhiyun.tech",
      wechat_id: "liming-zy",
      address: "深圳市南山区科技园"
    }
  },
  company_profile: {
    name: "智云科技（深圳）有限公司",
    address: "深圳市南山区科技园",
    intro_blocks: [
      { text: "智云科技成立于 2016 年，专注为制造业与商贸企业提供数字化经营工具，服务企业客户 3,000+ 家。核心产品覆盖数字名片、客户管理与营销转化。" }
    ]
  },
  videos: [{ title: "智云科技企业宣传片", video_url: "", cover_url: "" }],
  honors: [
    { honor_id: "h1", title: "国家高新技术企业", body: "2023-2025 连续认定", images: [] },
    { honor_id: "h2", title: "等保三级认证", body: "数据安全合规", images: [] }
  ]
};

Page({
  data: {
    uiState: "loading",
    publicId: "",
    shareId: "",
    nextShareId: "",
    visitId: "",
    themeBrand: "#2b6cff",
    isDisabled: false,
    card: demoPublicCard
  },

  async onLoad(query) {
    const publicId = query.card || query.public_id || "";
    const shareId = query.share || "";
    this.setData({ publicId, shareId });
    if (!publicId) {
      this.setData({ uiState: "ready", card: demoPublicCard });
      wx.showToast({ title: "当前展示演示名片", icon: "none" });
      return;
    }
    try {
      await this.loadPublicCard();
      await this.createVisit();
    } catch (_error) {
      this.setData({ uiState: "error" });
    }
  },

  async loadPublicCard() {
    try {
      const card = await request(`/public/cards/${this.data.publicId}`, { auth: false });
      const disabled = card.status && card.status !== "active";
      const brand = (card.template && card.template.color_scheme && card.template.color_scheme.primary) || "#2b6cff";
      this.setData({
        card: Object.assign({}, demoPublicCard, card),
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
    this.loadPublicCard()
      .then(() => this.createVisit())
      .catch(() => this.setData({ uiState: "error" }));
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
      const data = { anon_id: app.globalData.anonId || undefined };
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
    } catch (_error) {}
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
    } catch (_error) {}
  },

  callPhone() {
    const fields = this.data.card.card.fields || {};
    const number = fields.mobile || fields.phone;
    if (!number) {
      wx.showToast({ title: "暂无可拨打电话", icon: "none" });
      return;
    }
    this.recordAction("call_phone");
    wx.makePhoneCall({ phoneNumber: number, fail() {} });
  },

  saveContact() {
    const c = this.data.card.card;
    const fields = c.fields || {};
    this.recordAction("save_phone");
    wx.addPhoneContact({
      firstName: c.display_name || "联系人",
      mobilePhoneNumber: fields.mobile || "",
      workPhoneNumber: fields.phone || "",
      email: fields.email || "",
      organization: c.company || "",
      title: c.title || "",
      fail() {}
    });
  },

  copyEmail() {
    const email = this.data.card.card.fields && this.data.card.card.fields.email;
    if (!email) return;
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
    const wechat = this.data.card.card.fields && this.data.card.card.fields.wechat_id;
    if (!wechat) return;
    wx.setClipboardData({ data: wechat, success() { wx.showToast({ title: "微信号已复制", icon: "none" }); } });
  },

  addWecom() {
    this.recordAction("add_wecom");
    wx.showToast({ title: "正在跳转企业微信", icon: "none" });
  },

  viewPaperCard() {
    this.recordAction("view_paper_card");
    wx.showToast({ title: "纸质名片信息已记录", icon: "none" });
  },

  expandIntro() {
    this.recordAction("expand_company_intro");
    wx.showToast({ title: "已展开公司介绍", icon: "none" });
  },

  playVideo() {
    this.recordAction("play_company_video");
    const video = this.data.card.videos[0];
    if (video && video.video_url) {
      if (wx.previewMedia) {
        wx.previewMedia({
          sources: [{ url: video.video_url, type: "video", poster: video.cover_url || undefined }],
          fail() { wx.setClipboardData({ data: video.video_url }); }
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
