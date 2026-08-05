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
const ENTERPRISE_EDITABLE_FIELDS = [
  "avatar_url",
  "display_name",
  "title",
  "department",
  "mobile",
  "phone",
  "email",
  "wechat_id"
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
      website: "",
      share_title: ""
    },
    editable: {},
    themeBrand: "",
    themeStyle: "",
    companyInfoLocked: false,
    identityLabel: "",
    tags: [],
    privacy: {
      show_mobile: false,
      show_email: true,
      show_wechat: false,
      allow_forward: true,
      show_avatar: true
    },
    selfService: {
      allow_privacy_edit: true,
      allow_share_edit: true,
      allow_wecom_qrcode_upload: true,
      qrcode_source: "enterprise_first"
    },
    privacyNeedAuthorization: false,
    privacyContractName: "用户隐私保护指引",
    privacyModalVisible: false,
    loading: true,
    error: false,
    submitting: false
  },

  async onLoad() {
    try {
      setPageTheme(this);
      await this.refreshPrivacySetting();
      await ensureSession();
      await this.loadCard();
    } catch (error) {
      this.setData({ loading: false, error: true });
      wx.showToast({ title: error.message || "登录失败，请稍后重试", icon: "none" });
    }
  },

  onShow() {
    this.refreshPrivacySetting();
  },

  async loadCard() {
    try {
      const card = await request("/employee/cards/current");
      const preview = await request("/employee/cards/current/preview").catch(() => null);
      const enterpriseCard = isEnterpriseCard(card);
      const editableFields = Array.isArray(card.editable_fields)
        ? card.editable_fields
        : (enterpriseCard ? ENTERPRISE_EDITABLE_FIELDS : ALL_EDITABLE_FIELDS);
      const editable = editableMap(editableFields);
      if (enterpriseCard) {
        // Enterprise-owned profile fields come from tenant configuration and
        // should not be re-enabled by stale or missing editable_fields responses.
        lockCompanyFields(editable);
      }
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
          website: fields.website || "",
          share_title: (card.privacy && card.privacy.share_title) || ""
        },
        editable,
        selfService: Object.assign({}, this.data.selfService, card.employee_self_service || {}),
        companyInfoLocked: enterpriseCard,
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
    if (!this.canEdit(event.currentTarget.dataset.key)) {
      this.lockedTip();
      return;
    }
    this.setData({ [`privacy.${event.currentTarget.dataset.key}`]: event.detail.value });
  },

  refreshPrivacySetting() {
    if (typeof wx.getPrivacySetting !== "function") {
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      wx.getPrivacySetting({
        success: (result) => {
          this.setData({
            privacyNeedAuthorization: Boolean(result.needAuthorization),
            privacyContractName: result.privacyContractName || this.data.privacyContractName
          });
          resolve(result);
        },
        fail: () => {
          resolve(null);
        }
      });
    });
  },

  openAvatarPrivacyModal() {
    if (!this.canEdit("avatar_url")) {
      this.lockedTip();
      return;
    }
    this.setData({ privacyModalVisible: true });
  },

  closeAvatarPrivacyModal() {
    this.setData({ privacyModalVisible: false });
  },

  noop() {},

  openPrivacyContract() {
    if (typeof wx.openPrivacyContract !== "function") {
      wx.showToast({ title: "当前微信版本暂不支持查看隐私指引", icon: "none" });
      return;
    }
    wx.openPrivacyContract({
      fail: () => {
        wx.showToast({ title: "隐私指引打开失败，请稍后重试", icon: "none" });
      }
    });
  },

  onAgreePrivacyAuthorization(event) {
    const errMsg = String(event.detail && event.detail.errMsg || "");
    if (errMsg && errMsg.indexOf("ok") === -1) {
      wx.showToast({ title: "同意隐私指引后才能设置头像", icon: "none" });
      return;
    }
    this.setData({
      privacyNeedAuthorization: false,
      privacyModalVisible: false
    }, () => {
      this.chooseProfileImage();
    });
  },

  async chooseProfileImage() {
    if (!this.canEdit("avatar_url")) {
      this.lockedTip();
      return;
    }
    if (this.data.privacyNeedAuthorization) {
      this.openAvatarPrivacyModal();
      return;
    }
    try {
      const tempFilePath = await chooseImageFromAlbum();
      if (tempFilePath) {
        await this.setAvatarFromPath(tempFilePath);
      }
    } catch (error) {
      wx.showToast({ title: error.message || "头像选择失败，请重新选择", icon: "none" });
    }
  },

  async setAvatarFromPath(path) {
    try {
      let info = null;
      try {
        info = await getImageInfo(path);
      } catch (_error) {}
      const avatarUrl = await pathToDataUrl(path, info ? imageMime(info) : "image/jpeg");
      this.setData({ "form.avatar_url": avatarUrl });
    } catch (error) {
      wx.showToast({ title: error.message || "头像读取失败，请重新选择", icon: "none" });
    }
  },

  onAvatarImageError() {
    const avatarUrl = this.data.form.avatar_url;
    if (isTemporaryImageUrl(avatarUrl)) {
      this.setData({ "form.avatar_url": "" });
      wx.showToast({ title: "头像临时文件已失效，请重新选择", icon: "none" });
    }
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
    getImageInfo(path)
      .catch(() => null)
      .then((info) => pathToDataUrl(path, info ? imageMime(info) : "image/jpeg"))
      .then((logoUrl) => {
        this.setData({ "form.logo_url": logoUrl });
      })
      .catch((error) => {
        wx.showToast({ title: error.message || "LOGO读取失败，请重新选择", icon: "none" });
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
    if (fieldKey === "share_title" || fieldKey === "allow_forward") {
      return this.data.selfService.allow_share_edit !== false;
    }
    if (fieldKey === "show_mobile" || fieldKey === "show_email" || fieldKey === "show_wechat" || fieldKey === "show_avatar") {
      return this.data.selfService.allow_privacy_edit !== false;
    }
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
        // Build the payload from editable/self-service flags so disabled fields
        // are omitted instead of being overwritten with whatever is visible.
        data: buildPayload(form, this.data.privacy, this.data.editable, this.data.selfService)
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

function lockCompanyFields(editable) {
  ["logo_url", "company", "company_short_name", "address", "website"].forEach((field) => {
    editable[field] = false;
  });
}

function isEnterpriseCard(card) {
  if (card && card.identity_type) {
    return card.identity_type !== "personal";
  }
  return !isPersonalIdentity();
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

function buildPayload(form, privacy, editable, selfService) {
  const payload = { fields: {} };
  const privacyPayload = {};
  if (selfService.allow_privacy_edit !== false) {
    privacyPayload.show_mobile = privacy.show_mobile;
    privacyPayload.show_email = privacy.show_email;
    privacyPayload.show_wechat = privacy.show_wechat;
    privacyPayload.show_avatar = privacy.show_avatar;
  }
  if (selfService.allow_share_edit !== false) {
    privacyPayload.allow_forward = privacy.allow_forward;
    privacyPayload.share_title = String(form.share_title || "").trim() || null;
  }
  if (Object.keys(privacyPayload).length) {
    payload.privacy = privacyPayload;
  }
  // Every assignment below is guarded by backend-provided editability. This page
  // mirrors the server contract to avoid accidental writes from locked controls.
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

function pathToDataUrl(path, mime = "image/jpeg") {
  if (/^data:image\//.test(path) || (/^https?:\/\//.test(path) && !isTemporaryImageUrl(path))) {
    // Persisted CDN/API URLs and existing data URLs are already durable enough;
    // only ephemeral WeChat file handles need to be inlined before save.
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
        resolve(`data:${mime};base64,${result.data}`);
      },
      fail: reject
    });
  });
}

function getImageInfo(src) {
  return new Promise((resolve, reject) => {
    wx.getImageInfo({
      src,
      success: resolve,
      fail: reject
    });
  });
}

function chooseImageFromAlbum() {
  return new Promise((resolve, reject) => {
    const onFail = (error) => {
      if (isCancelError(error)) {
        resolve("");
        return;
      }
      if (isPrivacyScopeError(error)) {
        reject(new Error("请先在小程序后台声明相册图片用途"));
        return;
      }
      reject(error);
    };
    if (typeof wx.chooseMedia === "function") {
      wx.chooseMedia({
        count: 1,
        mediaType: ["image"],
        sourceType: ["album"],
        sizeType: ["compressed"],
        success(result) {
          const file = result.tempFiles && result.tempFiles[0];
          resolve(file && file.tempFilePath ? file.tempFilePath : "");
        },
        fail: onFail
      });
      return;
    }
    if (typeof wx.chooseImage === "function") {
      wx.chooseImage({
        count: 1,
        sourceType: ["album"],
        sizeType: ["compressed"],
        success(result) {
          const file = result.tempFiles && result.tempFiles[0];
          resolve(
            (file && (file.tempFilePath || file.path)) ||
            (result.tempFilePaths && result.tempFilePaths[0]) ||
            ""
          );
        },
        fail: onFail
      });
      return;
    }
    reject(new Error("当前微信版本暂不支持选择头像"));
  });
}

function imageMime(info) {
  const type = String(info && info.type || "").toLowerCase();
  if (type === "png") return "image/png";
  if (type === "jpg" || type === "jpeg") return "image/jpeg";
  if (type === "webp") return "image/webp";
  const path = String(info && info.path || "").toLowerCase();
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  if (path.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

function isTemporaryImageUrl(value) {
  const source = String(value || "");
  return /^(?:wxfile:\/\/|https?:\/\/(?:tmp\/|(?:127\.0\.0\.1|localhost)(?::\d+)?\/(?:\*\*tmp\*\*|tmp)\/))/i.test(source);
}

function isCancelError(error) {
  return /cancel/i.test(String(error && error.errMsg || error && error.message || ""));
}

function isPrivacyScopeError(error) {
  return /privacy agreement|scope is not declared|privacy/i.test(String(error && error.errMsg || error && error.message || ""));
}
