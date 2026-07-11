const app = getApp();
const { request } = require("../../utils/api");

const demoServiceItems = [
  { title: "数字名片", desc: "员工对外名片展示" },
  { title: "客户留资", desc: "访客行为追踪" },
  { title: "企业形象", desc: "统一品牌展示" },
  { title: "销售获客", desc: "分享链路转化" },
  { title: "内容展示", desc: "图文介绍产品" },
  { title: "数据分析", desc: "访问效果统计" }
];

const demoPublicCard = {
  public_id: "pub_demo0001",
  status: "active",
  card: {
    display_name: "李明",
    title: "销售总监 · 市场部",
    company: "智云科技",
    avatar_url: "",
    fields: {
      mobile: "138 0013 8000",
      phone: "",
      email: "liming@zhiyun.tech",
      wechat_id: "liming-zy",
      address: "深圳市南山区科技园"
    }
  },
  template: {
    color_scheme: { primary: "#2b6cff" },
    layout: {}
  },
  company_profile: {
    name: "智云科技",
    address: "深圳市南山区科技园",
    intro_blocks: [
      { type: "paragraph", text: "智云科技专注企业数字化名片与获客解决方案，为企业提供统一对外形象、员工名片管理与客户转化追踪。" },
      { type: "image", image_url: "", caption: "业务介绍图片" }
    ]
  },
  videos: [],
  honors: []
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
    isOwnCard: false,
    viewCount: 269,
    likeCount: 136,
    serviceItems: demoServiceItems,
    introBlocks: demoPublicCard.company_profile.intro_blocks,
    card: demoPublicCard
  },

  async onLoad(query) {
    const publicId = query.card || query.public_id || "";
    const shareId = query.share || "";
    this.setData({ publicId, shareId });
    if (!publicId) {
      this.applyPublicCard(demoPublicCard, true);
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
      this.applyPublicCard(card, false);
    } catch (error) {
      this.setData({ uiState: "error" });
      wx.showToast({ title: error.message || "名片加载失败", icon: "none" });
    }
  },

  applyPublicCard(rawCard, isDemo) {
    const card = normalizePublicCard(rawCard);
    const disabled = card.status && card.status !== "active";
    const brand = (card.template && card.template.color_scheme && card.template.color_scheme.primary) || "#2b6cff";
    this.setData({
      card,
      themeBrand: brand,
      isDisabled: disabled,
      isOwnCard: this.isOwnPublicCard(card),
      serviceItems: resolveServiceItems(card, isDemo),
      introBlocks: resolveIntroBlocks(card),
      viewCount: isDemo ? 269 : 0,
      likeCount: isDemo ? 136 : 0,
      uiState: disabled ? "disabled" : "ready"
    });
  },

  isOwnPublicCard(card) {
    const currentIdentity = app.globalData.currentIdentity || {};
    return Boolean(
      (this.data.publicId && currentIdentity.public_id === this.data.publicId) ||
      (card && (card.is_owner || card.is_own))
    );
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

  async createVisit() {
    if (!this.data.publicId) {
      return;
    }
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
    } catch (error) {
      console.error("create visit failed", error);
      wx.showToast({ title: "访问记录未上报", icon: "none" });
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
    } catch (error) {
      console.error("derive share failed", error);
      this.setData({ nextShareId: this.data.shareId });
    }
  },

  async recordAction(actionType) {
    if (!app.globalData.visitToken || !this.data.publicId) {
      return;
    }
    try {
      await request(`/public/cards/${this.data.publicId}/actions`, {
        method: "POST",
        header: { authorization: `Bearer ${app.globalData.visitToken}` },
        data: { action_type: actionType }
      });
    } catch (error) {
      console.error(`record action ${actionType} failed`, error);
    }
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

  collectCard() {
    this.recordAction("view_paper_card");
    wx.showToast({ title: "已收下名片", icon: "success" });
  },

  copyEmail() {
    const email = this.data.card.card.fields && this.data.card.card.fields.email;
    if (!email) {
      wx.showToast({ title: "暂无邮箱", icon: "none" });
      return;
    }
    this.recordAction("copy_email");
    wx.setClipboardData({ data: email });
  },

  openMap() {
    const fields = this.data.card.card.fields || {};
    const address = (this.data.card.company_profile || {}).address || fields.address;
    if (!address) {
      wx.showToast({ title: "暂无地址", icon: "none" });
      return;
    }
    this.recordAction("open_map");
    wx.setClipboardData({ data: address, success() { wx.showToast({ title: "地址已复制", icon: "none" }); } });
  },

  copyWechat() {
    const wechat = this.data.card.card.fields && this.data.card.card.fields.wechat_id;
    if (!wechat) {
      wx.showToast({ title: "暂无微信", icon: "none" });
      return;
    }
    wx.setClipboardData({ data: wechat, success() { wx.showToast({ title: "微信号已复制", icon: "none" }); } });
  },

  viewPaperCard() {
    this.recordAction("view_paper_card");
    wx.showToast({ title: "纸质名片信息已记录", icon: "none" });
  },

  previewIntroImage(event) {
    const url = event.currentTarget.dataset.url;
    if (url) {
      wx.previewImage({ urls: [url], current: url });
    }
  },

  onShareAppMessage() {
    const shareId = this.data.nextShareId || this.data.shareId;
    this.recordAction("view_site");
    const shareParam = shareId ? `&share=${shareId}` : "";
    return {
      title: `${this.data.card.card.display_name || "名片"}的名片`,
      path: `/pages/public/card?card=${this.data.publicId}${shareParam}`
    };
  }
});

function normalizePublicCard(card) {
  return {
    public_id: card.public_id || "",
    status: card.status || "active",
    card: Object.assign(
      { display_name: "", title: "", company: "", avatar_url: "", fields: {} },
      card.card || {}
    ),
    template: card.template || { color_scheme: {}, layout: {} },
    company_profile: card.company_profile || { name: "", intro_blocks: [], address: "" },
    videos: card.videos || [],
    honors: card.honors || [],
    is_owner: card.is_owner,
    is_own: card.is_own
  };
}

function resolveServiceItems(card, isDemo) {
  const layout = (card.template && card.template.layout) || {};
  const profile = card.company_profile || {};
  const source =
    layout.service_items ||
    layout.services ||
    profile.service_items ||
    profile.services ||
    [];
  const items = Array.isArray(source)
    ? source
        .map((item) => ({
          title: String(item.title || item.name || "").trim(),
          desc: String(item.desc || item.description || "").trim()
        }))
        .filter((item) => item.title)
        .slice(0, 6)
    : [];
  return items.length ? items : isDemo ? demoServiceItems : [];
}

function resolveIntroBlocks(card) {
  const blocks = ((card.company_profile || {}).intro_blocks || []).map((item) => {
    const type = item.type || (item.image_url ? "image" : "paragraph");
    return {
      type,
      text: item.text || item.content || "",
      image_url: item.image_url || item.url || "",
      caption: item.caption || ""
    };
  });
  return blocks.filter((item) => item.text || item.image_url);
}
