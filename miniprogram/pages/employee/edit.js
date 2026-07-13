const app = getApp();
const { ensureSession } = require("../../utils/auth");
const { request } = require("../../utils/api");
const { setPageTheme } = require("../../utils/theme");

const ALL_EDITABLE_FIELDS = [
  "avatar_url",
  "logo_url",
  "display_name",
  "title",
  "company",
  "company_short_name",
  "department",
  "mobile",
  "phone",
  "email",
  "wechat_id",
  "address",
  "website"
];

Page({
  data: {
    form: {
      avatar_url: "",
      logo_url: "",
      display_name: "",
      title: "",
      company: "",
      company_short_name: "",
      department: "",
      mobile: "",
      phone: "",
      email: "",
      wechat_id: "",
      address: "",
      website: ""
    },
    editable: {},
    themeBrand: "",
    themeStyle: "",
    identityLabel: "",
    tags: [],
    privacy: {
      show_mobile: false,
      show_email: true,
      show_wechat: false
    },
    loading: true,
    error: false,
    submitting: false
  },

  async onLoad() {
    try {
      setPageTheme(this);
      await ensureSession();
      await this.loadCard();
    } catch (error) {
      this.setData({ loading: false, error: true });
      wx.showToast({ title: error.message || "登录失败，请稍后重试", icon: "none" });
    }
  },

  async loadCard() {
    try {
      const card = await request("/employee/cards/current");
      const preview = await request("/employee/cards/current/preview").catch(() => null);
      const editableFields = isPersonalIdentity()
        ? ALL_EDITABLE_FIELDS
        : (Array.isArray(card.editable_fields) ? card.editable_fields : ALL_EDITABLE_FIELDS);
      const fields = card.fields || {};
      const template = preview && preview.template ? preview.template : {};
      this.setData({
        form: {
          avatar_url: card.avatar_url || "",
          logo_url: template.logo_url || "",
          display_name: normalizeDisplayName(card.display_name),
          title: card.title || "",
          company: card.company || fields.company || "",
          company_short_name: card.company_short_name || fields.company_short_name || "",
          department: fields.department || card.department || "",
          mobile: fields.mobile || "",
          phone: fields.phone || "",
          email: fields.email || "",
          wechat_id: fields.wechat_id || "",
          address: fields.address || "",
          website: fields.website || ""
        },
        editable: editableMap(editableFields),
        identityLabel: app.globalData.currentIdentity && app.globalData.currentIdentity.typeLabel
          ? app.globalData.currentIdentity.typeLabel
          : "当前名片",
        privacy: Object.assign({}, this.data.privacy, card.privacy || {}),
        loading: false,
        error: false
      });
    } catch (error) {
      this.setData({ loading: false, error: true });
      wx.showToast({ title: error.message || "名片读取失败，请稍后重试", icon: "none" });
    }
  },

  onInput(event) {
    const key = event.currentTarget.dataset.key;
    if (!this.canEdit(key)) {
      this.lockedTip();
      return;
    }
    this.setData({ [`form.${key}`]: event.detail.value });
  },

  onPrivacy(event) {
    this.setData({ [`privacy.${event.currentTarget.dataset.key}`]: event.detail.value });
  },

  chooseAvatar(event) {
    if (!this.canEdit("avatar_url")) {
      this.lockedTip();
      return;
    }
    const avatarUrl = event.detail && event.detail.avatarUrl;
    if (avatarUrl) {
      this.setAvatarFromPath(avatarUrl);
    }
  },

  chooseAvatarFromAlbum() {
    if (!this.canEdit("avatar_url")) {
      this.lockedTip();
      return;
    }
    if (typeof wx.chooseMedia !== "function") {
      wx.showToast({ title: "当前微信版本暂不支持选择头像", icon: "none" });
      return;
    }
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sourceType: ["album", "camera"],
      sizeType: ["compressed"],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        if (file && file.tempFilePath) {
          this.setAvatarFromPath(file.tempFilePath);
        }
      }
    });
  },

  setAvatarFromPath(path) {
    pathToDataUrl(path)
      .then((avatarUrl) => {
        this.setData({ "form.avatar_url": avatarUrl });
      })
      .catch(() => {
        wx.showToast({ title: "头像读取失败，请重新选择", icon: "none" });
      });
  },

  onAvatarImageError() {
    const avatarUrl = this.data.form.avatar_url;
    if (isTemporaryImageUrl(avatarUrl)) {
      this.setData({ "form.avatar_url": "" });
      wx.showToast({ title: "头像临时文件已失效，请重新选择", icon: "none" });
    }
  },

  clearAvatar() {
    if (!this.canEdit("avatar_url")) {
      this.lockedTip();
      return;
    }
    this.setData({ "form.avatar_url": "" });
  },

  chooseLogoFromAlbum() {
    if (!this.canEdit("logo_url")) {
      this.lockedTip();
      return;
    }
    if (typeof wx.chooseMedia !== "function") {
      wx.showToast({ title: "当前微信版本暂不支持选择LOGO", icon: "none" });
      return;
    }
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sourceType: ["album", "camera"],
      sizeType: ["compressed"],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        if (file && file.tempFilePath) {
          this.setLogoFromPath(file.tempFilePath);
        }
      }
    });
  },

  setLogoFromPath(path) {
    pathToDataUrl(path)
      .then((logoUrl) => {
        this.setData({ "form.logo_url": logoUrl });
      })
      .catch(() => {
        wx.showToast({ title: "LOGO读取失败，请重新选择", icon: "none" });
      });
  },

  clearLogo() {
    if (!this.canEdit("logo_url")) {
      this.lockedTip();
      return;
    }
    this.setData({ "form.logo_url": "" });
  },

  lockedTip() {
    wx.showToast({ title: "该字段由企业统一维护", icon: "none" });
  },

  onLockedFieldTap(event) {
    const key = event.currentTarget.dataset.key;
    if (!this.canEdit(key)) {
      this.lockedTip();
    }
  },

  canEdit(fieldKey) {
    return this.data.editable[fieldKey] !== false;
  },

  async saveCard() {
    if (this.data.submitting) {
      return;
    }
    if (this.data.error) {
      wx.showToast({ title: "名片资料未加载成功，请返回重进后再保存", icon: "none" });
      return;
    }
    this.setData({ submitting: true });
    const form = this.data.form;
    try {
      validateCardForm(form, this.data.editable);
      const card = await request("/employee/cards/current", {
        method: "PUT",
        data: buildPayload(form, this.data.privacy, this.data.editable)
      });
      if (this.data.editable.logo_url) {
        await request("/employee/cards/current/style", {
          method: "PUT",
          data: { logo_url: form.logo_url || null }
        });
      }
      app.globalData.currentCard = card;
      wx.showToast({ title: "已保存", icon: "success" });
      setTimeout(() => wx.navigateBack(), 600);
    } catch (error) {
      wx.showToast({ title: error.message || "保存失败", icon: "none" });
    } finally {
      this.setData({ submitting: false });
    }
  }
});

function editableMap(fields) {
  const map = {};
  ALL_EDITABLE_FIELDS.forEach((field) => {
    map[field] = fields.includes(field);
  });
  return map;
}

function isPersonalIdentity() {
  const identity = app.globalData.currentIdentity || {};
  return identity.identity_type === "personal" || identity.typeLabel === "个人名片";
}

function normalizeDisplayName(displayName) {
  if (isPersonalIdentity() && displayName === "我的名片") {
    return "";
  }
  return displayName || "";
}

function buildPayload(form, privacy, editable) {
  const payload = {
    fields: {},
    privacy: {
      show_mobile: privacy.show_mobile,
      show_email: privacy.show_email,
      show_wechat: privacy.show_wechat
    }
  };
  if (editable.avatar_url) payload.avatar_url = form.avatar_url || null;
  if (editable.display_name) payload.display_name = form.display_name;
  if (editable.title) payload.title = form.title || null;
  if (editable.company) payload.fields.company = form.company || null;
  if (editable.company_short_name) payload.fields.company_short_name = form.company_short_name || null;
  if (editable.department) payload.fields.department = form.department || null;
  if (editable.mobile) payload.fields.mobile = form.mobile || null;
  if (editable.phone) payload.fields.phone = form.phone || null;
  if (editable.email) payload.fields.email = form.email || null;
  if (editable.wechat_id) payload.fields.wechat_id = form.wechat_id || null;
  if (editable.address) payload.fields.address = form.address || null;
  if (editable.website) payload.fields.website = form.website || null;
  return payload;
}

function validateCardForm(form, editable) {
  if (editable.display_name && !String(form.display_name || "").trim()) {
    throw new Error("姓名不能为空");
  }
  const email = String(form.email || "").trim();
  if (editable.email && email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("邮箱格式不正确");
  }
  const phoneFields = [editable.mobile ? form.mobile : "", editable.phone ? form.phone : ""].filter(Boolean);
  if (phoneFields.some((value) => !/^[0-9+\-\s()]{5,32}$/.test(String(value)))) {
    throw new Error("电话格式不正确");
  }
  const website = String(form.website || "").trim();
  if (editable.website && website && !/^https?:\/\/[^\s]+$/i.test(website)) {
    throw new Error("官网地址需以 http:// 或 https:// 开头");
  }
}

function pathToDataUrl(path) {
  if (/^data:image\//.test(path) || (/^https?:\/\//.test(path) && !isTemporaryImageUrl(path))) {
    return Promise.resolve(path);
  }
  return new Promise((resolve, reject) => {
    const fs = wx.getFileSystemManager && wx.getFileSystemManager();
    if (!fs || typeof fs.readFile !== "function") {
      reject(new Error("file system unavailable"));
      return;
    }
    fs.readFile({
      filePath: path,
      encoding: "base64",
      success(result) {
        resolve(`data:image/jpeg;base64,${result.data}`);
      },
      fail: reject
    });
  });
}

function isTemporaryImageUrl(value) {
  const source = String(value || "");
  return /^(?:wxfile:\/\/|https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\/(?:\*\*tmp\*\*|tmp)\/)/i.test(source);
}
