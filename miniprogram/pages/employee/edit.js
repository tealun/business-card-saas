const app = getApp();
const { ensureSession } = require("../../utils/auth");
const { request } = require("../../utils/api");
const { setPageTheme } = require("../../utils/theme");
const { showRestriction, showError } = require("../../utils/feedback");
const { imagePathToDataUrl } = require("../../utils/image-data");

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
    avatarCropVisible: false,
    avatarCropSource: "",
    avatarCropFileType: "jpg",
    loading: true,
    error: false,
    submitting: false
  },

  /**
   * 页面初始化：恢复主题、确认隐私授权状态、确保登录会话，并拉取当前名片。
   */
  async onLoad() {
    try {
      setPageTheme(this);
      await this.refreshPrivacySetting();
      await ensureSession();
      await this.loadCard();
    } catch (error) {
      this.setData({ loading: false, error: true });
      showError(error, "登录失败，请稍后重试");
    }
  },

  onShow() {
    this.refreshPrivacySetting();
  },

  /**
   * 拉取当前身份名片和预览模板，并根据后端 editability 生成可编辑字段映射。
   *
   * 企业名片的企业资料字段始终由租户侧维护，即使后端返回缺省字段也不能在员工端放开。
   */
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
        // 企业资料字段来自租户配置，不能被陈旧或缺省的 editable_fields 重新打开。
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
      showError(error, "名片读取失败，请稍后重试");
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
      showRestriction("当前微信版本暂不支持查看隐私指引，请升级微信后重试");
      return;
    }
    wx.openPrivacyContract({
      fail: () => {
        showError(null, "隐私指引打开失败，请稍后重试");
      }
    });
  },

  onAgreePrivacyAuthorization(event) {
    const errMsg = String(event.detail && event.detail.errMsg || "");
    if (errMsg && errMsg.indexOf("ok") === -1) {
      showRestriction("同意隐私指引后才能设置头像");
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
        const info = await getImageInfo(tempFilePath).catch(() => null);
        this.setData({
          avatarCropVisible: true,
          avatarCropSource: tempFilePath,
          avatarCropFileType: info && imageMime(info) === "image/png" ? "png" : "jpg"
        });
      }
    } catch (error) {
      if (!isCancelError(error)) showError(error, "头像选择失败，请重新选择");
    }
  },

  async setAvatarFromPath(path, expectedMime = "") {
    try {
      let info = null;
      try {
        info = await getImageInfo(path);
      } catch (_error) {}
      const avatarUrl = await imagePathToDataUrl(path, expectedMime || (info ? imageMime(info) : "image/jpeg"));
      this.setData({ "form.avatar_url": avatarUrl });
    } catch (error) {
      showError(error, "头像读取失败，请重新选择");
    }
  },

  onAvatarImageError() {
    const avatarUrl = this.data.form.avatar_url;
    if (isTemporaryImageUrl(avatarUrl)) {
      this.setData({ "form.avatar_url": "" });
      showError(null, "头像临时文件已失效，请重新选择");
    }
  },

  chooseLogoFromAlbum() {
    if (!this.canEdit("logo_url")) {
      this.lockedTip();
      return;
    }
    if (typeof wx.chooseMedia !== "function") {
      showRestriction("当前微信版本暂不支持选择LOGO，请升级微信后重试");
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

  onAvatarCropCancel() {
    this.setData({ avatarCropVisible: false, avatarCropSource: "", avatarCropFileType: "jpg" });
  },

  async onAvatarCropConfirm(event) {
    const croppedPath = String(event.detail && event.detail.tempFilePath || "");
    if (!croppedPath) return;
    const preserveTransparency = this.data.avatarCropFileType === "png";
    this.setData({ avatarCropVisible: false, avatarCropSource: "", avatarCropFileType: "jpg" });
    try {
      const outputPath = preserveTransparency ? croppedPath : await compressWebAvatar(croppedPath);
      await this.setAvatarFromPath(outputPath, preserveTransparency ? "image/png" : "image/jpeg");
    } catch (error) {
      showError(error, "头像处理失败，请重新选择");
    }
  },

  onAvatarCropError(event) {
    const error = event.detail && event.detail.error;
    showError(error, "头像裁切失败，请重新选择");
  },

  async chooseWechatQrCode() {
    if (!this.canEdit("wechat_id")) {
      this.lockedTip();
      return;
    }
    try {
      const path = await chooseImageFromAlbum();
      if (!path) return;
      const info = await getImageInfo(path).catch(() => null);
      const dataUrl = await imagePathToDataUrl(path, info ? imageMime(info) : "image/jpeg");
      await request("/employee/cards/current/wechat-qrcode", { method: "PUT", data: { qrcode_url: dataUrl } });
      wx.showToast({ title: "二维码已识别并保存", icon: "success" });
    } catch (error) {
      if (!isCancelError(error)) showError(error, "微信二维码识别失败");
    }
  },

  setLogoFromPath(path) {
    getImageInfo(path)
      .catch(() => null)
      .then((info) => imagePathToDataUrl(path, info ? imageMime(info) : "image/jpeg"))
      .then((logoUrl) => {
        this.setData({ "form.logo_url": logoUrl });
      })
      .catch((error) => {
        showError(error, "LOGO读取失败，请重新选择");
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
    showRestriction("该字段由企业统一维护，当前账号不能修改");
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

  /**
   * 保存当前名片。
   *
   * 只提交允许员工编辑的字段和自助配置允许的隐私/分享设置；被锁定字段不会进入 payload，
   * 避免页面展示值覆盖企业统一维护的数据。
   */
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
        // 根据可编辑/自助开关构造 payload，被禁用字段直接省略。
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

/**
 * 按后端可编辑字段和员工自助开关构造保存 payload。
 *
 * 返回值只包含允许写入的字段；未允许编辑的字段即使在表单中存在，也不会发送给后端。
 */
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
  // 以下每个赋值都受后端 editability 保护，前端镜像服务端契约以减少误写。
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
        sizeType: ["original"],
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
        sizeType: ["original"],
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

function compressWebAvatar(src) {
  if (typeof wx.compressImage !== "function") return Promise.resolve(src);
  return new Promise((resolve, reject) => {
    wx.compressImage({
      src,
      quality: 78,
      compressedWidth: 720,
      compressedHeight: 720,
      success: (result) => resolve(result.tempFilePath || src),
      fail: reject
    });
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
