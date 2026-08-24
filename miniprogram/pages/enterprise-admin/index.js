const { ensureSession } = require("../../utils/auth");
const { request, uploadBinary } = require("../../utils/api");
const { DEFAULT_PORTRAIT_PHOTO_URL } = require("../../utils/card-assets");
const { DEFAULT_BRAND, buildTheme, setPageTheme, themeStyle: buildThemeStyle } = require("../../utils/theme");
const { normalizeWebsiteUrl } = require("../../utils/website-url");
const { showRestriction } = require("../../utils/feedback");
const ADMIN_BOOTSTRAP_STORAGE_KEY = "wecomcard.admin.bootstrap.v1";

const ROLE_LABELS = {
  owner: "Owner",
  admin: "管理员",
  operator: "运营",
  auditor: "审计"
};

const ROLE_RANK = {
  auditor: 1,
  operator: 2,
  admin: 3,
  owner: 4
};

const TEMPLATE_VARIANTS = [
  { value: "horizontal-business", label: "横版商务", desc: "企业级默认模板" },
  { value: "minimal", label: "极简", desc: "信息更克制" },
  { value: "brand-image", label: "品牌图", desc: "适合强品牌露出" },
  { value: "portrait-photo", label: "照片版", desc: "形象照 · PNG 500×500 以上" },
  { value: "dark", label: "深色", desc: "高对比展示" },
  { value: "campaign", label: "活动版", desc: "短期推广使用" }
];
const STYLE_TEMPLATES = [
  { id: "tpl_horizontal_business", name: "横版商务", desc: "企业级默认模板" },
  { id: "tpl_minimal", name: "极简", desc: "信息更克制" },
  { id: "tpl_brand_image", name: "品牌图", desc: "适合强品牌露出" },
  { id: "tpl_portrait_photo", name: "照片版", desc: "形象照 · PNG 500×500 以上" },
  { id: "tpl_dark", name: "深色", desc: "高对比展示" },
  { id: "tpl_campaign", name: "活动版", desc: "短期推广使用" }
];

const COLOR_SWATCHES = ["#5272d6", "#0f766e", "#c2410c", "#7c3aed", "#111827"];
const MODULE_LAYOUTS = [
  { value: "graphic", label: "图文" },
  { value: "carousel", label: "轮播" },
  { value: "grid", label: "宫格" },
  { value: "text", label: "文字" },
  { value: "image", label: "图片" }
];
const INTRO_CONTENT_SECTIONS = [
  { value: "profile", label: "简介" },
  { value: "services", label: "服务" },
  { value: "videos", label: "视频" },
  { value: "honors", label: "荣誉" }
];
const INTRO_BLOCK_TYPES = [
  { value: "paragraph", label: "段落" },
  { value: "heading", label: "标题" },
  { value: "list", label: "列表" },
  { value: "quote", label: "引用" },
  { value: "image", label: "图片" },
  { value: "gallery", label: "图集" },
  { value: "video", label: "视频" }
];
const BACKGROUND_LIMIT_BYTES = 2 * 1024 * 1024;
const BACKGROUND_MIN_RATIO = 1.5;
const BACKGROUND_MAX_RATIO = 2;
const DEFAULT_BACKGROUND_OPACITY = 100;
const BACKGROUND_TYPES = {
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp"
};
const BACKGROUND_PRESETS = [
  { id: "light-wave", name: "浅色波纹", url: "/assets/card-backgrounds/bg-light-wave.png" },
  { id: "light-geometry", name: "浅色几何", url: "/assets/card-backgrounds/bg-light-geometry.png" },
  { id: "light-cubes", name: "浅色立方", url: "/assets/card-backgrounds/bg-light-cubes.png" },
  { id: "blue-dot", name: "蓝色点阵", url: "/assets/card-backgrounds/bg-blue-dot.png" },
  { id: "dark-dot", name: "深色点阵", url: "/assets/card-backgrounds/bg-dark-dot.png" }
];
const TEMPLATE_BACKGROUND_PRESET_IDS = {
  "horizontal-business": ["light-wave", "light-cubes"],
  minimal: ["light-geometry", "light-wave"],
  "brand-image": ["blue-dot", "light-cubes"],
  "portrait-photo": ["light-cubes", "light-wave"],
  dark: ["dark-dot"],
  campaign: ["light-cubes", "blue-dot"]
};
const TEMPLATE_STYLE_META = {
  "horizontal-business": { className: "biz-card--horizontal", backgroundId: "light-wave" },
  minimal: { className: "biz-card--minimal", backgroundId: "light-geometry" },
  "brand-image": { className: "biz-card--brand-image", backgroundId: "blue-dot", opacity: 100 },
  "portrait-photo": { className: "biz-card--portrait", backgroundId: "light-cubes" },
  dark: { className: "biz-card--dark", backgroundId: "dark-dot", opacity: 100 },
  campaign: { className: "biz-card--campaign", backgroundId: "light-cubes", opacity: 100 }
};

Page({
  data: {
    themeStyle: "",
    loading: true,
    refreshing: false,
    saving: false,
    uploading: false,
    error: "",
    stage: "loading",
    tenants: [],
    tenant: null,
    adminToken: "",
    permissions: { canAdmin: false, canOperator: false },
    activeTab: "overview",
    tabs: [
      { key: "overview", label: "总览" },
      { key: "members", label: "人员" },
      { key: "settings", label: "配置" }
    ],
    overview: null,
    profile: null,
    templates: [],
    members: [],
    joinRequests: [],
    honors: [],
    videos: [],
    publishedVideos: [],
    videoFeature: null,
    homeModules: [],
    homeCompleteness: { percent: 0, done: 0, total: 6 },
    introSectionTitle: "企业简介",
    memberSearch: "",
    memberStatus: "all",
    panel: "",
    panelDirty: false,
    leaveGuardVisible: false,
    profileDraft: {},
    templateDraft: {},
    templateId: "",
    styleTemplateId: "tpl_horizontal_business",
    templateClass: "biz-card--horizontal",
    primary: DEFAULT_BRAND,
    customColor: DEFAULT_BRAND,
    customHex: DEFAULT_BRAND,
    customHexError: "",
    customColorExpanded: false,
    card: { display_name: "", title: "", company: "", company_short_name: "", fields: {}, show_avatar: true },
    logoUrl: "",
    backgroundUrl: "",
    backgroundPresetId: "",
    templateBackgrounds: {},
    backgroundPresets: backgroundPresetsForVariant("horizontal-business"),
    backgroundOpacity: DEFAULT_BACKGROUND_OPACITY,
    backgroundPreviewStyle: "",
    backgroundError: "",
    portraitPhotoUrl: "",
    defaultPortraitPhotoUrl: DEFAULT_PORTRAIT_PHOTO_URL,
    presets: [DEFAULT_BRAND, "#c1666b", "#8d7ec7", "#4c8868", "#d68a4e", "#3f9999"],
    introDraft: emptyIntroDraft(),
    memberDraft: {},
    memberActionId: "",
    joinCode: null,
    joinCodeSheetVisible: false,
    joinCodeSheetTitle: "入企码",
    joinCodeLoading: false,
    joinCodeError: "",
    joinCodeSaving: false,
    joinCodeCardImageUrl: "",
    joinCodeThemeStyle: buildThemeStyle(buildTheme(DEFAULT_BRAND)),
    canSyncMembers: false,
    styleTemplates: STYLE_TEMPLATES,
    colorSwatches: COLOR_SWATCHES,
    moduleLayouts: MODULE_LAYOUTS,
    introSections: INTRO_CONTENT_SECTIONS,
    introBlockTypes: INTRO_BLOCK_TYPES,
    memberStatusOptions: [
      { value: "all", label: "全部" },
      { value: "active", label: "启用" },
      { value: "disabled", label: "停用" }
    ]
  },

  /**
   * 初始化企业管理台入口参数和管理员引导令牌。
   */
  onLoad(options) {
    this.targetTenantId = String(options && options.tenant_id ? options.tenant_id : "");
    this.directAdminToken = String(options && options.admin_token ? options.admin_token : "");
    this.directTenantName = String(options && options.tenant_name ? options.tenant_name : "");
    if (!this.directAdminToken && typeof wx.getStorageSync === "function") {
      const bootstrap = wx.getStorageSync(ADMIN_BOOTSTRAP_STORAGE_KEY);
      if (bootstrap && bootstrap.tenant_id && (!this.targetTenantId || String(bootstrap.tenant_id) === this.targetTenantId)) {
        this.directAdminToken = String(bootstrap.admin_access_token || "");
        this.directTenantName = String(bootstrap.tenant_name || this.directTenantName || "");
        this.targetTenantId = String(bootstrap.tenant_id || this.targetTenantId);
        try {
          wx.removeStorageSync(ADMIN_BOOTSTRAP_STORAGE_KEY);
        } catch (_error) {
          // 本地引导缓存清理失败不影响进入管理台。
        }
      }
    }
    this.prepare();
  },

  /**
   * 页面展示时同步主题，并准备当前管理工作台。
   */
  onShow() {
    setPageTheme(this);
  },

  /**
   * 准备管理员上下文。
   * 会优先使用扫码/认领引导信息，再回落到当前账号可管理企业列表。
   */
  async prepare() {
    this.setData({ loading: true, error: "", stage: "loading" });
    try {
      if (this.directAdminToken && this.targetTenantId) {
        const tenant = decorateTenant({
          tenant_id: this.targetTenantId,
          tenant_name: this.directTenantName || "企业管理",
          role: "owner"
        });
        this.adminToken = this.directAdminToken;
        this.setData({
          tenant,
          permissions: permissionsFor(tenant.role),
          adminToken: this.directAdminToken,
          stage: "manage",
          loading: false,
          tenants: [tenant]
        });
        await this.loadWorkspace();
        return;
      }
      await ensureSession();
      const result = await request("/local-enterprises/admin-tenants");
      const tenants = (result.items || []).map(decorateTenant);
      if (!tenants.length) {
        this.setData({ loading: false, stage: "empty", tenants: [] });
        return;
      }
      const target = this.targetTenantId
        ? tenants.find((item) => item.tenant_id === this.targetTenantId)
        : null;
      if (target || tenants.length === 1) {
        await this.enterTenant((target || tenants[0]).tenant_id, tenants);
        return;
      }
      this.setData({ loading: false, stage: "select", tenants });
    } catch (error) {
      this.setData({ loading: false, stage: "error", error: formatError(error, "无法打开企业管理") });
    }
  },

  /**
   * 从可管理企业列表中选择一个租户进入。
   */
  selectTenant(event) {
    this.enterTenant(String(event.currentTarget.dataset.id || ""), this.data.tenants);
  },

  /**
   * 进入指定租户管理空间。
   * 会合并已知租户展示信息，并清理一次性管理员引导令牌。
   */
  async enterTenant(tenantId, knownTenants) {
    const tenants = knownTenants || this.data.tenants;
    const tenant = tenants.find((item) => item.tenant_id === tenantId) || null;
    this.setData({ loading: true, error: "" });
    try {
      const session = await request("/local-enterprises/admin-session", {
        method: "POST",
        data: { tenant_id: tenantId }
      });
      const selected = decorateTenant({
        ...(tenant || {}),
        tenant_id: session.tenant_id,
        tenant_name: session.tenant_name || (tenant && tenant.tenant_name) || "企业管理",
        role: (tenant && tenant.role) || "auditor",
        creation_source: session.creation_source ?? (tenant && tenant.creation_source),
        open_corpid: session.open_corpid ?? (tenant && tenant.open_corpid),
        auth_status: session.auth_status ?? (tenant && tenant.auth_status),
        wecom_bound: session.wecom_bound ?? (tenant && tenant.wecom_bound)
      });
      const permissions = permissionsFor(selected.role);
      this.adminToken = session.admin_access_token;
      this.setData({
        tenant: selected,
        permissions,
        adminToken: session.admin_access_token,
        stage: "manage",
        tenants,
        loading: false
      });
      await this.loadWorkspace();
    } catch (error) {
      this.setData({ loading: false, stage: "error", error: formatError(error, "无法进入所选企业") });
    }
  },

  /**
   * 加载企业管理台工作区数据。
   * 同步概览、资料、成员、模板、内容模块和加入申请等核心状态。
   */
  async loadWorkspace() {
    if (!(this.adminToken || this.data.adminToken)) return;
    this.setData({ refreshing: true, error: "" });
    try {
      const joinRequestsPromise = this.data.permissions.canAdmin
        ? this.adminRequest("/admin/local-enterprises/join-requests").catch(() => ({ items: [] }))
        : Promise.resolve({ items: [] });
      const [overview, profile, templates, members, joinRequests, honors, videos, videoFeature] = await Promise.all([
        this.adminRequest("/admin/overview"),
        this.adminRequest("/admin/company-profile"),
        this.adminRequest("/admin/templates"),
        this.loadMembersData(),
        joinRequestsPromise,
        this.adminRequest("/admin/company-honors").catch(() => ({ items: [] })),
        this.adminRequest("/admin/company-videos").catch(() => ({ items: [] })),
        this.adminRequest("/admin/features/company-video").catch(() => null)
      ]);
      const tenant = mergeTenantStatus(this.data.tenant, overview);
      const decoratedTemplates = decorateTemplates(templates.items || []);
      const joinCodeTheme = buildTheme(activeTemplatePrimary(decoratedTemplates));
      const decoratedHonors = decorateHonors(honors.items || []);
      const decoratedVideos = decorateVideos(videos.items || []);
      const publishedVideos = publishedCompanyVideos(decoratedVideos);
      this.setData({
        overview,
        tenant,
        profile,
        templates: decoratedTemplates,
        members: decorateMembers(members.items || []),
        joinRequests: decorateJoinRequests(joinRequests.items || []),
        honors: decoratedHonors,
        videos: decoratedVideos,
        publishedVideos,
        videoFeature,
        homeModules: buildHomeModules(profile, decoratedHonors, decoratedVideos, videoFeature),
        homeCompleteness: homeCompleteness(profile, decoratedHonors, decoratedVideos, videoFeature),
        canSyncMembers: canSyncMembersForTenant(tenant, overview),
        joinCodeThemeStyle: buildThemeStyle(joinCodeTheme)
      });
    } catch (error) {
      this.setData({ error: formatError(error, "企业管理数据加载失败") });
    } finally {
      this.setData({ refreshing: false, loading: false });
    }
  },

  /**
   * 发起企业管理端请求。
   * 统一携带当前 tenantId 和管理员引导 token，避免各方法重复拼装权限上下文。
   */
  adminRequest(path, options = {}) {
    const token = this.adminToken || this.data.adminToken;
    return request(path, {
      method: options.method || "GET",
      data: options.data,
      auth: false,
      header: { authorization: `Bearer ${token}` }
    });
  },

  /**
   * 选择并上传单张图片素材。
   * 素材分类决定后端目录，上传成功后由回调写入具体草稿字段。
   */
  async uploadSingleImage(category, onUploaded) {
    if (!this.requireAdmin() || this.data.uploading) return;
    const files = await chooseLocalMedia(["image"], 1).catch(() => []);
    const file = files[0];
    const filePath = tempFilePath(file);
    if (!filePath) return;
    this.setData({ uploading: true });
    try {
      const uploaded = await this.uploadMediaFile({
        path: filePath,
        fileName: fileNameFromPath(filePath, "image.jpg"),
        contentType: imageContentType(filePath),
        endpoint: "images",
        category,
        timeout: 120000
      });
      onUploaded(uploaded.url);
      wx.showToast({ title: "图片已上传", icon: "success" });
    } catch (error) {
      wx.showToast({ title: formatError(error, "图片上传失败"), icon: "none" });
    } finally {
      this.setData({ uploading: false });
    }
  },

  /**
   * 选择并批量上传多张图片素材。
   * 每张图片独立上传，最终把成功列表交给业务回调。
   */
  async uploadMultipleImages(category, onUploaded) {
    if (!this.requireAdmin() || this.data.uploading) return;
    const files = await chooseLocalMedia(["image"], 9).catch(() => []);
    if (!files.length) return;
    this.setData({ uploading: true });
    try {
      const urls = [];
      for (const file of files) {
        const filePath = tempFilePath(file);
        if (!filePath) continue;
        const uploaded = await this.uploadMediaFile({
          path: filePath,
          fileName: fileNameFromPath(filePath, "image.jpg"),
          contentType: imageContentType(filePath),
          endpoint: "images",
          category,
          timeout: 120000
        });
        urls.push(uploaded.url);
      }
      if (urls.length) {
        onUploaded(urls);
        wx.showToast({ title: "图片已上传", icon: "success" });
      }
    } catch (error) {
      wx.showToast({ title: formatError(error, "图片上传失败"), icon: "none" });
    } finally {
      this.setData({ uploading: false });
    }
  },

  /**
   * 选择并上传单个视频素材。
   * 上传前使用本地媒体选择结果，上传后由回调写入视频草稿。
   */
  async uploadSingleVideo(onUploaded) {
    if (!this.requireAdmin() || this.data.uploading) return;
    if (this.data.videoFeature && !this.data.videoFeature.enabled) {
      showRestriction("当前企业未开通视频功能，请联系平台管理员开通后使用");
      return;
    }
    const files = await chooseLocalMedia(["video"], 1).catch(() => []);
    const file = files[0];
    const filePath = tempFilePath(file);
    if (!filePath) return;
    const limit = this.data.videoFeature && this.data.videoFeature.effective_limit_bytes;
    if (limit && file.size && file.size > limit) {
      wx.showToast({ title: "视频超过企业上限", icon: "none" });
      return;
    }
    this.setData({ uploading: true });
    try {
      const uploaded = await this.uploadMediaFile({
        path: filePath,
        fileName: fileNameFromPath(filePath, "video.mp4"),
        contentType: videoContentType(filePath),
        endpoint: "videos",
        timeout: 300000
      });
      onUploaded(uploaded.url);
      wx.showToast({ title: "视频已上传", icon: "success" });
    } catch (error) {
      wx.showToast({ title: formatError(error, "视频上传失败"), icon: "none" });
    } finally {
      this.setData({ uploading: false });
    }
  },

  /**
   * 将本地媒体文件上传到企业素材接口。
   * 统一封装文件路径、文件名、类型和租户权限参数。
   */
  uploadMediaFile(input) {
    const token = this.adminToken || this.data.adminToken;
    const query = [
      input.category ? `category=${encodeURIComponent(input.category)}` : "",
      `file_name=${encodeURIComponent(input.fileName || "upload")}`
    ].filter(Boolean).join("&");
    return uploadBinary(`/admin/uploads/${input.endpoint}?${query}`, input.path, {
      auth: false,
      contentType: input.contentType || "application/octet-stream",
      timeout: input.timeout || 120000,
      header: { authorization: `Bearer ${token}` }
    });
  },

  /**
   * 从已加载工作区数据刷新成员列表展示。
   */
  loadMembersData() {
    const search = encodeURIComponent(this.data.memberSearch || "");
    const status = encodeURIComponent(this.data.memberStatus || "all");
    return this.adminRequest(`/admin/members?limit=50&offset=0&status=${status}&search=${search}`);
  },

  /**
   * 切换管理台功能标签页。
   */
  switchTab(event) {
    this.setData({ activeTab: event.currentTarget.dataset.key, memberActionId: "" });
  },

  /**
   * 手动刷新当前企业工作区。
   */
  async refresh() {
    await this.loadWorkspace();
    wx.showToast({ title: "已刷新", icon: "success" });
  },

  /**
   * 更新成员搜索关键词并重新过滤成员列表。
   */
  onMemberSearch(event) {
    this.setData({ memberSearch: event.detail.value });
  },

  /**
   * 更新成员编辑草稿中的状态字段。
   */
  setMemberStatus(event) {
    this.setData({ memberStatus: event.currentTarget.dataset.status || "all", memberActionId: "" });
    this.refreshMembers();
  },

  /**
   * 重新拉取成员列表并保持当前搜索条件。
   */
  async refreshMembers() {
    try {
      const members = await this.loadMembersData();
      this.setData({ members: decorateMembers(members.items || []), memberActionId: "" });
    } catch (error) {
      wx.showToast({ title: formatError(error, "人员加载失败"), icon: "none" });
    }
  },

  /**
   * 展开或收起单个成员的操作菜单。
   */
  toggleMemberActionMenu(event) {
    const memberId = String(event.currentTarget.dataset.id || "");
    this.setData({ memberActionId: this.data.memberActionId === memberId ? "" : memberId });
  },

  /**
   * 打开企业资料编辑面板，并用当前资料生成草稿。
   */
  openProfilePanel() {
    const profile = this.data.profile || {};
    this.setData({
      panel: "profile",
      panelDirty: false,
      leaveGuardVisible: false,
      profileDraft: {
        display_name: profile.display_name || "",
        short_name: profile.short_name || "",
        logo_url: profile.logo_url || "",
        website_url: profile.website_url || "",
        address: profile.address || "",
        visible: profile.visible !== false
      }
    });
  },

  /**
   * 更新企业资料草稿字段。
   */
  onProfileInput(event) {
    const key = event.currentTarget.dataset.key;
    this.setData({ profileDraft: { ...this.data.profileDraft, [key]: event.detail.value } });
    this.markPanelDirty();
  },

  /**
   * 更新企业资料草稿中的可见性开关。
   */
  onProfileVisible(event) {
    this.setData({ profileDraft: { ...this.data.profileDraft, visible: event.detail.value } });
    this.markPanelDirty();
  },

  /**
   * 上传企业 logo 并写入资料草稿。
   */
  uploadProfileLogo() {
    this.uploadSingleImage("logos", (url) => {
      this.setData({ "profileDraft.logo_url": url, panelDirty: true });
    });
  },

  /**
   * 清空企业 logo 草稿。
   */
  clearProfileLogo() {
    this.setData({ "profileDraft.logo_url": "", panelDirty: true });
  },

  /**
   * 保存企业基础资料。
   * 只提交资料面板字段，服务项目、介绍和模板配置由各自流程保存。
   */
  async saveProfile() {
    if (!this.requireAdmin()) return;
    const draft = this.data.profileDraft;
    await this.saveWithToast(async () => {
      const profile = await this.adminRequest("/admin/company-profile", {
        method: "PUT",
        data: {
          display_name: textOrNull(draft.display_name) || "企业",
          short_name: textOrNull(draft.short_name),
          logo_url: textOrNull(draft.logo_url),
          website_url: normalizeWebsiteUrl(draft.website_url),
          address: textOrNull(draft.address),
          visible: Boolean(draft.visible)
        }
      });
      this.setData({
        profile,
        panel: "",
        panelDirty: false,
        leaveGuardVisible: false,
        homeModules: buildHomeModules(profile, this.data.honors, this.data.videos, this.data.videoFeature),
        homeCompleteness: homeCompleteness(profile, this.data.honors, this.data.videos, this.data.videoFeature)
      });
    }, "企业信息已保存");
  },

  /**
   * 发布企业主页当前草稿，让访客端可见最新已保存内容。
   */
  async publishCompanyHome() {
    if (!this.requireAdmin()) return;
    await this.saveWithToast(async () => {
      const profile = await this.adminRequest("/admin/company-profile", {
        method: "PUT",
        data: { status: "published", visible: true }
      });
      this.setData({
        profile,
        homeModules: buildHomeModules(profile, this.data.honors, this.data.videos, this.data.videoFeature),
        homeCompleteness: homeCompleteness(profile, this.data.honors, this.data.videos, this.data.videoFeature)
      });
    }, "企业主页已发布");
  },

  /**
   * 从企业主页维护卡片进入对应编辑流。
   */
  openHomeModule(event) {
    const dataset = event.currentTarget.dataset || {};
    if (dataset.key === "base") {
      this.openProfilePanel();
      return;
    }
    this.openIntroPanelSection(event);
  },

  /**
   * 打开名片模板编辑面板，并构造企业预览卡片。
   */
  openTemplatePanel() {
    const selected = this.data.templates.find((item) => item.is_default) || this.data.templates[0] || {};
    this.applyTemplateEditor(selected);
  },

  /**
   * 选择模板风格，并同步模板编辑器状态。
   */
  chooseTemplate(event) {
    const template = this.data.templates.find((item) => item.template_id === event.currentTarget.dataset.id);
    if (template) this.applyTemplateEditor(template);
  },

  /**
   * 兼容旧版 variant 选择事件，复用模板选择逻辑。
   */
  chooseVariant(event) {
    if (!this.requireAdmin()) return;
    const detail = event.detail || {};
    const dataset = event.currentTarget ? event.currentTarget.dataset : {};
    const variant = normalizeTemplateVariant(detail.templateId || dataset.variant);
    const templateBackgrounds = withCurrentVariantBackground(this.data);
    const backgroundState = backgroundStateForVariant(variant, templateBackgrounds);
    this.setData({
      templateDraft: { ...this.data.templateDraft, variant },
      styleTemplateId: templateIdForVariant(variant),
      templateClass: templateClassForVariant(variant),
      backgroundUrl: backgroundState.backgroundUrl,
      backgroundPresetId: backgroundState.backgroundPresetId,
      templateBackgrounds,
      backgroundPresets: backgroundState.backgroundPresets,
      backgroundOpacity: backgroundState.backgroundOpacity,
      backgroundPreviewStyle: backgroundStyle(backgroundState.backgroundUrl, backgroundState.backgroundOpacity, variant),
      backgroundError: "",
      panelDirty: true
    });
  },

  /**
   * 将模板草稿应用到编辑器。
   * 同时刷新颜色、背景、照片模板和预览卡片状态。
   */
  applyTemplateEditor(template) {
    const state = buildTemplateEditorState(template, this.data.profile, this.data.members, this.data.tenant);
    this.setData({
      panel: "template",
      panelDirty: false,
      leaveGuardVisible: false,
      ...state
    });
  },

  /**
   * 从模板色板中选择企业品牌主色。
   */
  chooseColor(event) {
    if (!this.requireAdmin()) return;
    const detail = event.detail || {};
    const dataset = event.currentTarget ? event.currentTarget.dataset : {};
    this.previewTemplateColor(String(detail.color || dataset.color || DEFAULT_BRAND), {
      customHexError: "",
      customColorExpanded: false
    });
  },

  /**
   * 处理模板自定义 HEX 颜色输入。
   */
  onCustomHexInput(event) {
    if (!this.requireAdmin()) return;
    const customHex = String(event.detail.value || "").trim();
    const normalized = normalizeHexInput(customHex);
    if (!normalized) {
      this.setData({ customHex, customHexError: customHex ? "请输入 6 位 HEX 色值" : "" });
      return;
    }
    this.previewTemplateColor(normalized, {
      customColor: normalized,
      customHex: normalized,
      customHexError: "",
      customColorExpanded: true
    });
  },

  /**
   * 确认使用自定义品牌色并更新模板预览。
   */
  selectCustomColor() {
    if (!this.requireAdmin()) return;
    const normalized = normalizeHexInput(this.data.customHex) || this.data.customColor || DEFAULT_BRAND;
    this.previewTemplateColor(normalized, {
      customColor: normalized,
      customHex: normalized,
      customHexError: "",
      customColorExpanded: true
    });
  },

  /**
   * 预览企业模板品牌色。
   * 只更新前端草稿，不立即保存到后端。
   */
  previewTemplateColor(primary, extra = {}) {
    const theme = buildTheme(primary);
    const patch = {
      primary: theme.themeBrand,
      ...theme,
      themeStyle: buildThemeStyle(theme),
      ...extra
    };
    if (!extra.templateDraft) {
      patch.templateDraft = { ...this.data.templateDraft, primary: theme.themeBrand };
    }
    this.setData(patch);
    this.markPanelDirty();
  },

  /**
   * 响应选择自定义模板背景图事件。
   */
  onChooseBackgroundImage() {
    this.chooseBackgroundImage();
  },

  /**
   * 选择并校验企业模板背景图。
   * 图片通过素材上传接口保存，成功后写入当前模板背景草稿。
   */
  async chooseBackgroundImage() {
    if (!this.requireAdmin() || this.data.uploading) {
      return;
    }
    this.setData({ uploading: true, backgroundError: "" });
    try {
      const files = await chooseLocalMedia(["image"], 1).catch(() => []);
      const file = files[0];
      const filePath = tempFilePath(file);
      if (!filePath) {
        return;
      }
      if (file && file.size && file.size > BACKGROUND_LIMIT_BYTES) {
        throw new Error("图片不能超过 2MB");
      }
      const info = await getImageInfo(filePath);
      validateBackgroundImage(info);
      const uploaded = await this.uploadMediaFile({
        path: filePath,
        fileName: fileNameFromPath(filePath, "background.jpg"),
        contentType: imageContentType(filePath),
        endpoint: "images",
        category: "templates",
        timeout: 120000
      });
      const templateBackgrounds = withCurrentVariantBackground(this.data, {
        backgroundUrl: uploaded.url,
        backgroundPresetId: "",
        backgroundOpacity: this.data.backgroundOpacity
      });
      this.setData({
        backgroundUrl: uploaded.url,
        backgroundPresetId: "",
        templateBackgrounds,
        backgroundPreviewStyle: backgroundStyle(uploaded.url, this.data.backgroundOpacity, this.data.templateDraft.variant),
        backgroundError: "",
        panelDirty: true
      });
      wx.showToast({ title: "背景图已上传", icon: "success" });
    } catch (error) {
      const message = error && error.message ? error.message : "图片不符合要求";
      this.setData({ backgroundError: message });
      wx.showToast({ title: message, icon: "none" });
    } finally {
      this.setData({ uploading: false });
    }
  },

  /**
   * 选择当前模板允许的内置背景预设。
   */
  onSelectPresetBackground(event) {
    if (!this.requireAdmin()) return;
    const detail = event.detail || {};
    const dataset = event.currentTarget ? event.currentTarget.dataset : {};
    const presetId = detail.presetId || dataset.id;
    const preset = BACKGROUND_PRESETS.find((item) => item.id === presetId);
    if (!preset || !isPresetAllowedForVariant(preset.id, this.data.templateDraft.variant)) {
      return;
    }
    const templateBackgrounds = withCurrentVariantBackground(this.data, {
      backgroundUrl: "",
      backgroundPresetId: preset.id,
      backgroundOpacity: this.data.backgroundOpacity
    });
    this.setData({
      backgroundUrl: preset.url,
      backgroundPresetId: preset.id,
      templateBackgrounds,
      backgroundPreviewStyle: backgroundStyle(preset.url, this.data.backgroundOpacity, this.data.templateDraft.variant),
      backgroundError: "",
      panelDirty: true
    });
  },

  /**
   * 响应清除模板背景事件。
   */
  onClearBackgroundImage() {
    this.clearBackgroundImage();
  },

  /**
   * 将当前模板背景恢复为默认配置。
   */
  clearBackgroundImage() {
    if (!this.requireAdmin()) return;
    const backgroundState = defaultBackgroundState(this.data.templateDraft.variant);
    const templateBackgrounds = withCurrentVariantBackground(this.data, {
      backgroundUrl: "",
      backgroundPresetId: backgroundState.backgroundPresetId,
      backgroundOpacity: backgroundState.backgroundOpacity
    });
    this.setData({
      backgroundUrl: backgroundState.backgroundUrl,
      backgroundPresetId: backgroundState.backgroundPresetId,
      templateBackgrounds,
      backgroundPresets: backgroundState.backgroundPresets,
      backgroundOpacity: backgroundState.backgroundOpacity,
      backgroundPreviewStyle: backgroundStyle(backgroundState.backgroundUrl, backgroundState.backgroundOpacity, this.data.templateDraft.variant),
      backgroundError: "",
      panelDirty: true
    });
  },

  /**
   * 更新当前模板背景透明度。
   */
  onBackgroundOpacityChange(event) {
    if (!this.requireAdmin()) return;
    const backgroundOpacity = normalizeOpacity(event.detail.value, DEFAULT_BACKGROUND_OPACITY);
    const templateBackgrounds = withCurrentVariantBackground(this.data, { backgroundOpacity });
    this.setData({
      backgroundOpacity,
      templateBackgrounds,
      backgroundPreviewStyle: backgroundStyle(this.data.backgroundUrl, backgroundOpacity, this.data.templateDraft.variant),
      panelDirty: true
    });
  },

  /**
   * 更新照片模板使用的人像图片地址。
   */
  onPortraitPhotoChange(event) {
    if (!this.requireAdmin()) return;
    this.setData({
      portraitPhotoUrl: String(event.detail && event.detail.url ? event.detail.url : ""),
      panelDirty: true
    });
  },

  /**
   * 保存企业名片模板配置。
   * 包含模板风格、品牌色、背景、人像图和模块布局等展示层设置。
   */
  async saveTemplate() {
    if (!this.requireAdmin()) return false;
    const draft = this.data.templateDraft;
    if (!draft.template_id) return false;
    return this.saveWithToast(async () => {
      const templateBackgrounds = withCurrentVariantBackground(this.data);
      const primary = buildTheme(this.data.primary || DEFAULT_BRAND).themeBrand;
      const variant = draft.variant || "horizontal-business";
      const activeBackground = backgroundStateForVariant(variant, templateBackgrounds);
      const backgroundUrl = await backgroundUrlForSave(activeBackground.backgroundUrl);
      const layout = {
        variant,
        background_opacity: activeBackground.backgroundOpacity,
        background_preset_id: activeBackground.backgroundPresetId || null,
        template_backgrounds: templateBackgroundsForSave(templateBackgrounds)
      };
      if (isPortraitVariant(variant)) {
        layout.portrait_photo_url = this.data.portraitPhotoUrl || null;
      }
      const template = await this.adminRequest(`/admin/templates/${encodeURIComponent(draft.template_id)}`, {
        method: "PUT",
        data: {
          name: textOrNull(draft.name) || "企业名片模板",
          background_url: backgroundUrl || null,
          color_scheme: { primary, surface: draft.surface || "#ffffff" },
          layout,
          status: draft.status || "active"
        }
      });
      this.mergeTemplate(template);
      this.applyTemplateEditor(template);
    }, "模板已保存");
  },

  /**
   * 将后端返回模板合并到当前模板状态并刷新编辑器。
   */
  mergeTemplate(template) {
    const templates = decorateTemplates(this.data.templates.map((item) =>
      item.template_id === template.template_id
        ? template
        : { ...item, is_default: template.is_default ? false : item.is_default }
    ));
    this.setData({ templates, joinCodeThemeStyle: buildThemeStyle(buildTheme(activeTemplatePrimary(templates))) });
  },

  /**
   * 打开企业介绍内容面板，并把当前企业资料拆成可编辑草稿。
   */
  openIntroPanel(event) {
    const dataset = event && event.currentTarget ? event.currentTarget.dataset || {} : {};
    const section = dataset.section || "profile";
    const profile = this.data.profile || {};
    const modules = decorateModules(profile.display_modules || []);
    const draft = withActiveIntroModule({
      ...emptyIntroDraft(),
      activeSection: section,
      display_modules: modules,
      intro_blocks: decorateIntroBlocks(profile.intro_blocks || []),
      service_items: decorateServices(profile.service_items || [])
    });
    this.setData({
      panel: "intro",
      panelDirty: false,
      leaveGuardVisible: false,
      introDraft: draft,
      introSectionTitle: introSectionTitle(section)
    });
  },

  /**
   * 从企业主页卡片直接进入指定模块维护。
   */
  openIntroPanelSection(event) {
    this.openIntroPanel(event);
  },

  /**
   * 切换企业介绍面板中的内容分区。
   */
  switchIntroSection(event) {
    const section = event.currentTarget.dataset.section || "profile";
    this.setData({
      introDraft: withActiveIntroModule({
        ...this.data.introDraft,
        activeSection: section
      }),
      introSectionTitle: introSectionTitle(section)
    });
  },

  /**
   * 开关企业展示模块可见性。
   */
  toggleIntroModule(event) {
    const index = Number(event.currentTarget.dataset.index);
    const modules = cloneArray(this.data.introDraft.display_modules);
    if (!modules[index]) return;
    modules[index].visible = event.detail.value;
    this.setData({ introDraft: withActiveIntroModule({ ...this.data.introDraft, display_modules: modules }), panelDirty: true });
  },

  /**
   * 选择企业展示模块布局。
   */
  chooseModuleLayout(event) {
    const index = Number(event.currentTarget.dataset.index);
    const layoutIndex = Number(event.detail.value);
    const modules = cloneArray(this.data.introDraft.display_modules);
    if (!modules[index] || !MODULE_LAYOUTS[layoutIndex]) return;
    modules[index].layout = MODULE_LAYOUTS[layoutIndex].value;
    modules[index].layoutLabel = MODULE_LAYOUTS[layoutIndex].label;
    this.setData({ introDraft: withActiveIntroModule({ ...this.data.introDraft, display_modules: modules }), panelDirty: true });
  },

  /**
   * 选择介绍内容块要引用的已发布视频。
   */
  selectIntroVideo(event) {
    const videoId = String(event.currentTarget.dataset.id || "");
    if (!videoId) return;
    this.setData({
      "introDraft.videoId": videoId,
      panelDirty: this.data.introDraft.activeSection === "profile" ? true : this.data.panelDirty
    });
  },

  /**
   * 更新企业介绍基础草稿字段。
   */
  onIntroInput(event) {
    const key = event.currentTarget.dataset.key;
    this.setData({ introDraft: { ...this.data.introDraft, [key]: event.detail.value } });
    this.markPanelDirty();
  },

  /**
   * 上传企业介绍主图并写入草稿。
   */
  uploadIntroImage() {
    this.uploadSingleImage("company-images", (url) => {
      this.setData({ "introDraft.imageUrl": url, panelDirty: true });
    });
  },

  /**
   * 清空企业介绍主图草稿。
   */
  clearIntroImage() {
    this.setData({ "introDraft.imageUrl": "", panelDirty: true });
  },

  /**
   * 上传企业介绍图库图片并追加到当前图集草稿。
   */
  uploadIntroGallery() {
    this.uploadMultipleImages("company-images", (urls) => {
      const images = normalizeGalleryImages(this.data.introDraft.galleryImages)
        .concat(urls.map((url) => ({ url, caption: "" })))
        .slice(0, 12);
      this.setData({ "introDraft.galleryImages": images, panelDirty: true });
    });
  },

  /**
   * 更新图集图片标题或说明。
   */
  onGalleryImageInput(event) {
    const index = Number(event.currentTarget.dataset.index);
    const key = event.currentTarget.dataset.key || "caption";
    const images = normalizeGalleryImages(this.data.introDraft.galleryImages);
    if (!images[index]) return;
    images[index] = { ...images[index], [key]: event.detail.value };
    this.setData({ "introDraft.galleryImages": images, panelDirty: true });
  },

  /**
   * 从当前介绍块图集中移除一张图片。
   */
  removeGalleryImage(event) {
    const index = Number(event.currentTarget.dataset.index);
    const images = normalizeGalleryImages(this.data.introDraft.galleryImages);
    if (!images[index]) return;
    images.splice(index, 1);
    this.setData({ "introDraft.galleryImages": images, panelDirty: true });
  },

  /**
   * 切换企业介绍正文块类型，并重置对应字段结构。
   */
  setIntroBlockType(event) {
    this.setData({
      introDraft: {
        ...this.data.introDraft,
        blockType: event.currentTarget.dataset.type || "paragraph"
      },
      panelDirty: true
    });
  },

  /**
   * 将已有介绍块载入编辑草稿。
   */
  editIntroBlock(event) {
    const index = Number(event.currentTarget.dataset.index);
    const draft = this.data.introDraft;
    const block = stripIntroBlockRuntime([draft.intro_blocks[index]])[0];
    if (!block) return;
    this.setData({
      introDraft: {
        ...draft,
        ...emptyIntroBlockFields(block.type),
        ...introBlockFieldsFromBlock(block),
        editingBlockIndex: index,
        blockType: block.type
      }
    });
  },

  /**
   * 取消正文块编辑并恢复空草稿。
   */
  cancelIntroBlockEdit() {
    this.setData({
      introDraft: {
        ...this.data.introDraft,
        ...emptyIntroBlockFields(this.data.introDraft.blockType),
        editingBlockIndex: -1
      }
    });
  },

  /**
   * 新增或更新企业介绍正文块。
   */
  upsertIntroBlock() {
    const draft = this.data.introDraft;
    const block = buildIntroBlock(draft, this.data.videoFeature, this.data.videos);
    if (!block) return;
    const blocks = stripIntroBlockRuntime(draft.intro_blocks);
    if (draft.editingBlockIndex >= 0 && blocks[draft.editingBlockIndex]) {
      blocks[draft.editingBlockIndex] = block;
    } else {
      blocks.push(block);
    }
    this.setData({
      introDraft: {
        ...draft,
        ...emptyIntroBlockFields(draft.blockType),
        editingBlockIndex: -1,
        intro_blocks: decorateIntroBlocks(blocks)
      },
      panelDirty: true
    });
  },

  /**
   * 调整企业介绍正文块排序。
   */
  moveIntroBlock(event) {
    const index = Number(event.currentTarget.dataset.index);
    const direction = event.currentTarget.dataset.direction === "up" ? -1 : 1;
    const blocks = stripIntroBlockRuntime(this.data.introDraft.intro_blocks);
    const nextIndex = index + direction;
    if (!blocks[index] || !blocks[nextIndex]) return;
    [blocks[index], blocks[nextIndex]] = [blocks[nextIndex], blocks[index]];
    this.setData({ introDraft: { ...this.data.introDraft, intro_blocks: decorateIntroBlocks(blocks) }, panelDirty: true });
  },

  /**
   * 删除企业介绍正文块。
   */
  removeIntroBlock(event) {
    const index = Number(event.currentTarget.dataset.index);
    const blocks = stripIntroBlockRuntime(this.data.introDraft.intro_blocks);
    blocks.splice(index, 1);
    this.setData({ introDraft: { ...this.data.introDraft, intro_blocks: decorateIntroBlocks(blocks) }, panelDirty: true });
  },

  /**
   * 更新服务项目草稿字段。
   */
  onServiceInput(event) {
    const key = event.currentTarget.dataset.key;
    this.setData({
      introDraft: {
        ...this.data.introDraft,
        serviceDraft: { ...this.data.introDraft.serviceDraft, [key]: event.detail.value }
      },
      panelDirty: true
    });
  },

  /**
   * 更新服务项目可见性。
   */
  onServiceVisible(event) {
    this.setData({
      introDraft: {
        ...this.data.introDraft,
        serviceDraft: { ...this.data.introDraft.serviceDraft, visible: event.detail.value }
      },
      panelDirty: true
    });
  },

  /**
   * 上传服务项目图片并写入草稿。
   */
  uploadServiceImage() {
    this.uploadSingleImage("company-images", (url) => {
      this.setData({ "introDraft.serviceDraft.image_url": url, panelDirty: true });
    });
  },

  /**
   * 清空服务项目图片草稿。
   */
  clearServiceImage() {
    this.setData({ "introDraft.serviceDraft.image_url": "", panelDirty: true });
  },

  /**
   * 将已有服务项目载入编辑草稿。
   */
  editServiceItem(event) {
    const index = Number(event.currentTarget.dataset.index);
    const item = stripServiceRuntime([this.data.introDraft.service_items[index]])[0];
    if (!item) return;
    this.setData({
      introDraft: {
        ...this.data.introDraft,
        editingServiceIndex: index,
        serviceDraft: serviceDraftFromItem(item)
      }
    });
  },

  /**
   * 取消服务项目编辑并恢复空草稿。
   */
  cancelServiceEdit() {
    this.setData({
      introDraft: {
        ...this.data.introDraft,
        editingServiceIndex: -1,
        serviceDraft: emptyServiceDraft()
      }
    });
  },

  /**
   * 新增或更新服务项目。
   */
  upsertServiceItem() {
    const draft = this.data.introDraft;
    const item = buildServiceItem(draft.serviceDraft, draft.service_items.length);
    if (!item) return;
    const services = stripServiceRuntime(draft.service_items);
    if (draft.editingServiceIndex >= 0 && services[draft.editingServiceIndex]) {
      services[draft.editingServiceIndex] = item;
    } else {
      services.push(item);
    }
    this.setData({
      introDraft: {
        ...draft,
        editingServiceIndex: -1,
        serviceDraft: emptyServiceDraft(),
        service_items: decorateServices(services)
      },
      panelDirty: true
    });
  },

  /**
   * 调整服务项目排序。
   */
  moveServiceItem(event) {
    const index = Number(event.currentTarget.dataset.index);
    const direction = event.currentTarget.dataset.direction === "up" ? -1 : 1;
    const services = stripServiceRuntime(this.data.introDraft.service_items);
    const nextIndex = index + direction;
    if (!services[index] || !services[nextIndex]) return;
    [services[index], services[nextIndex]] = [services[nextIndex], services[index]];
    this.setData({ introDraft: { ...this.data.introDraft, service_items: decorateServices(resequenceSort(services)) }, panelDirty: true });
  },

  /**
   * 删除服务项目。
   */
  removeServiceItem(event) {
    const index = Number(event.currentTarget.dataset.index);
    const services = stripServiceRuntime(this.data.introDraft.service_items);
    services.splice(index, 1);
    this.setData({ introDraft: { ...this.data.introDraft, service_items: decorateServices(resequenceSort(services)) }, panelDirty: true });
  },

  /**
   * 进入新增企业视频草稿状态。
   */
  startCreateVideo() {
    this.setData({
      introDraft: {
        ...this.data.introDraft,
        editingVideoId: "",
        videoDraft: emptyVideoDraft()
      }
    });
  },

  /**
   * 将已有视频载入编辑草稿。
   */
  editVideoItem(event) {
    const videoId = String(event.currentTarget.dataset.id || "");
    const video = this.data.videos.find((item) => item.video_id === videoId);
    if (!video) return;
    this.setData({
      introDraft: {
        ...this.data.introDraft,
        editingVideoId: videoId,
        videoDraft: videoDraftFromItem(video)
      }
    });
  },

  /**
   * 取消视频编辑并恢复空草稿。
   */
  cancelVideoEdit() {
    this.setData({
      introDraft: {
        ...this.data.introDraft,
        editingVideoId: "",
        videoDraft: emptyVideoDraft()
      }
    });
  },

  /**
   * 更新视频草稿字段。
   */
  onVideoInput(event) {
    const key = event.currentTarget.dataset.key;
    this.setData({
      introDraft: {
        ...this.data.introDraft,
        videoDraft: { ...this.data.introDraft.videoDraft, [key]: event.detail.value }
      },
      panelDirty: true
    });
  },

  /**
   * 更新视频可见性。
   */
  onVideoVisible(event) {
    this.setData({
      introDraft: {
        ...this.data.introDraft,
        videoDraft: { ...this.data.introDraft.videoDraft, visible: event.detail.value }
      },
      panelDirty: true
    });
  },

  /**
   * 更新视频发布状态。
   */
  setVideoStatus(event) {
    this.setData({
      introDraft: {
        ...this.data.introDraft,
        videoDraft: { ...this.data.introDraft.videoDraft, status: event.currentTarget.dataset.status || "draft" }
      },
      panelDirty: true
    });
  },

  /**
   * 上传视频文件并写入视频草稿。
   */
  uploadVideoFile() {
    this.uploadSingleVideo((url) => {
      this.setData({ "introDraft.videoDraft.video_url": url, panelDirty: true });
    });
  },

  /**
   * 清空视频文件草稿。
   */
  clearVideoFile() {
    this.setData({ "introDraft.videoDraft.video_url": "", panelDirty: true });
  },

  /**
   * 上传视频封面图并写入视频草稿。
   */
  uploadVideoCover() {
    this.uploadSingleImage("company-images", (url) => {
      this.setData({ "introDraft.videoDraft.cover_url": url, panelDirty: true });
    });
  },

  /**
   * 清空视频封面草稿。
   */
  clearVideoCover() {
    this.setData({ "introDraft.videoDraft.cover_url": "", panelDirty: true });
  },

  /**
   * 保存企业视频草稿。
   * 新视频走创建接口，已有视频走更新接口。
   */
  async saveVideoDraft() {
    if (!this.requireAdmin()) return;
    if (this.data.videoFeature && !this.data.videoFeature.enabled) {
      showRestriction("当前企业未开通视频功能，请联系平台管理员开通后使用");
      return;
    }
    const draft = this.data.introDraft.videoDraft;
    const payload = buildVideoPayload(draft);
    if (!payload) return;
    await this.saveWithToast(async () => {
      const video = await this.adminRequest(
        this.data.introDraft.editingVideoId
          ? `/admin/company-videos/${encodeURIComponent(this.data.introDraft.editingVideoId)}`
          : "/admin/company-videos",
        {
          method: this.data.introDraft.editingVideoId ? "PUT" : "POST",
          data: payload
        }
      );
      const videos = upsertById(this.data.videos, video, "video_id");
      const decoratedVideos = decorateVideos(videos);
      this.setData({
        videos: decoratedVideos,
        publishedVideos: publishedCompanyVideos(decoratedVideos),
        homeModules: buildHomeModules(this.data.profile, this.data.honors, decoratedVideos, this.data.videoFeature),
        homeCompleteness: homeCompleteness(this.data.profile, this.data.honors, decoratedVideos, this.data.videoFeature),
        introDraft: {
          ...this.data.introDraft,
          editingVideoId: "",
          videoDraft: emptyVideoDraft()
        },
        panelDirty: false,
        leaveGuardVisible: false
      });
    }, "视频已保存");
  },

  /**
   * 删除企业视频，并刷新工作区内容。
   */
  async deleteVideoItem(event) {
    if (!this.requireAdmin()) return;
    const videoId = String(event.currentTarget.dataset.id || "");
    const ok = await confirm("删除视频", "删除后该视频将不再展示。");
    if (!ok) return;
    await this.saveWithToast(async () => {
      await this.adminRequest(`/admin/company-videos/${encodeURIComponent(videoId)}`, { method: "DELETE" });
      const decoratedVideos = this.data.videos.filter((item) => item.video_id !== videoId);
      this.setData({
        videos: decoratedVideos,
        publishedVideos: publishedCompanyVideos(decoratedVideos),
        homeModules: buildHomeModules(this.data.profile, this.data.honors, decoratedVideos, this.data.videoFeature),
        homeCompleteness: homeCompleteness(this.data.profile, this.data.honors, decoratedVideos, this.data.videoFeature)
      });
    }, "视频已删除");
  },

  /**
   * 将视频列表中的视频插入企业介绍正文块。
   */
  addVideoBlockFromList(event) {
    const videoId = String(event.currentTarget.dataset.id || "");
    this.addVideoBlockById(videoId);
  },

  addSelectedVideoBlock() {
    this.addVideoBlockById(String(this.data.introDraft.videoId || ""));
  },

  addVideoBlockById(videoId) {
    if (!videoId) return;
    const draft = this.data.introDraft;
    const blocks = stripIntroBlockRuntime(draft.intro_blocks);
    if (blocks.some((block) => block.type === "video" && block.video_id === videoId)) {
      wx.showToast({ title: "该视频已在简介中", icon: "none" });
      return;
    }
    blocks.push({ type: "video", video_id: videoId });
    this.setData({
      introDraft: {
        ...draft,
        activeSection: "profile",
        intro_blocks: decorateIntroBlocks(blocks)
      },
      panelDirty: true
    });
  },

  /**
   * 进入新增企业荣誉草稿状态。
   */
  startCreateHonor() {
    this.setData({
      introDraft: {
        ...this.data.introDraft,
        editingHonorId: "",
        honorDraft: emptyHonorDraft()
      }
    });
  },

  /**
   * 将已有荣誉载入编辑草稿。
   */
  editHonorItem(event) {
    const honorId = String(event.currentTarget.dataset.id || "");
    const honor = this.data.honors.find((item) => item.honor_id === honorId);
    if (!honor) return;
    this.setData({
      introDraft: {
        ...this.data.introDraft,
        editingHonorId: honorId,
        honorDraft: honorDraftFromItem(honor)
      }
    });
  },

  /**
   * 取消荣誉编辑并恢复空草稿。
   */
  cancelHonorEdit() {
    this.setData({
      introDraft: {
        ...this.data.introDraft,
        editingHonorId: "",
        honorDraft: emptyHonorDraft()
      }
    });
  },

  /**
   * 更新荣誉草稿字段。
   */
  onHonorInput(event) {
    const key = event.currentTarget.dataset.key;
    this.setData({
      introDraft: {
        ...this.data.introDraft,
        honorDraft: { ...this.data.introDraft.honorDraft, [key]: event.detail.value }
      },
      panelDirty: true
    });
  },

  /**
   * 更新荣誉可见性。
   */
  onHonorVisible(event) {
    this.setData({
      introDraft: {
        ...this.data.introDraft,
        honorDraft: { ...this.data.introDraft.honorDraft, visible: event.detail.value }
      },
      panelDirty: true
    });
  },

  /**
   * 更新荣誉发布状态。
   */
  setHonorStatus(event) {
    this.setData({
      introDraft: {
        ...this.data.introDraft,
        honorDraft: { ...this.data.introDraft.honorDraft, status: event.currentTarget.dataset.status || "draft" }
      },
      panelDirty: true
    });
  },

  /**
   * 批量上传荣誉图片并追加到草稿。
   */
  uploadHonorImages() {
    this.uploadMultipleImages("honors", (urls) => {
      const images = normalizeHonorImages(this.data.introDraft.honorDraft.images)
        .concat(urls.map((url) => ({ image_url: url, title: "", caption: "" })))
        .slice(0, 12);
      this.setData({
        "introDraft.honorDraft.images": resequenceHonorImages(images),
        panelDirty: true
      });
    });
  },

  /**
   * 更新荣誉图片标题或说明。
   */
  onHonorImageInput(event) {
    const index = Number(event.currentTarget.dataset.index);
    const key = event.currentTarget.dataset.key || "caption";
    const images = normalizeHonorImages(this.data.introDraft.honorDraft.images);
    if (!images[index]) return;
    images[index] = { ...images[index], [key]: event.detail.value };
    this.setData({ "introDraft.honorDraft.images": resequenceHonorImages(images), panelDirty: true });
  },

  /**
   * 从荣誉草稿中移除图片并重排顺序。
   */
  removeHonorImage(event) {
    const index = Number(event.currentTarget.dataset.index);
    const images = normalizeHonorImages(this.data.introDraft.honorDraft.images);
    if (!images[index]) return;
    images.splice(index, 1);
    this.setData({ "introDraft.honorDraft.images": resequenceHonorImages(images), panelDirty: true });
  },

  /**
   * 保存企业荣誉草稿。
   * 新荣誉走创建接口，已有荣誉走更新接口。
   */
  async saveHonorDraft() {
    if (!this.requireAdmin()) return;
    const payload = buildHonorPayload(this.data.introDraft.honorDraft);
    if (!payload) return;
    await this.saveWithToast(async () => {
      const honor = await this.adminRequest(
        this.data.introDraft.editingHonorId
          ? `/admin/company-honors/${encodeURIComponent(this.data.introDraft.editingHonorId)}`
          : "/admin/company-honors",
        {
          method: this.data.introDraft.editingHonorId ? "PUT" : "POST",
          data: payload
        }
      );
      const honors = upsertById(this.data.honors, honor, "honor_id");
      const decoratedHonors = decorateHonors(honors);
      this.setData({
        honors: decoratedHonors,
        homeModules: buildHomeModules(this.data.profile, decoratedHonors, this.data.videos, this.data.videoFeature),
        homeCompleteness: homeCompleteness(this.data.profile, decoratedHonors, this.data.videos, this.data.videoFeature),
        panelDirty: false,
        leaveGuardVisible: false,
        introDraft: {
          ...this.data.introDraft,
          editingHonorId: "",
          honorDraft: emptyHonorDraft()
        }
      });
    }, "荣誉已保存");
  },

  /**
   * 删除企业荣誉，并刷新工作区内容。
   */
  async deleteHonorItem(event) {
    if (!this.requireAdmin()) return;
    const honorId = String(event.currentTarget.dataset.id || "");
    const ok = await confirm("删除荣誉", "删除后该荣誉资质将不再展示。");
    if (!ok) return;
    await this.saveWithToast(async () => {
      await this.adminRequest(`/admin/company-honors/${encodeURIComponent(honorId)}`, { method: "DELETE" });
      const decoratedHonors = this.data.honors.filter((item) => item.honor_id !== honorId);
      this.setData({
        honors: decoratedHonors,
        homeModules: buildHomeModules(this.data.profile, decoratedHonors, this.data.videos, this.data.videoFeature),
        homeCompleteness: homeCompleteness(this.data.profile, decoratedHonors, this.data.videos, this.data.videoFeature)
      });
    }, "荣誉已删除");
  },

  async moveHonorItem(event) {
    if (!this.requireAdmin()) return;
    const index = Number(event.currentTarget.dataset.index);
    const direction = event.currentTarget.dataset.direction === "up" ? -1 : 1;
    const nextIndex = index + direction;
    const honors = stripHonorRuntime(this.data.honors);
    if (!honors[index] || !honors[nextIndex]) return;
    [honors[index], honors[nextIndex]] = [honors[nextIndex], honors[index]];
    const resequenced = honors.map((item, itemIndex) => ({ ...item, sort_order: (itemIndex + 1) * 10 }));
    const payloads = resequenced.map((item) => ({
      item,
      payload: buildHonorPayload(honorDraftFromItem(item))
    }));
    if (payloads.some((entry) => !entry.payload)) return;
    await this.saveWithToast(async () => {
      await Promise.all(payloads.map(({ item, payload }) =>
        this.adminRequest(`/admin/company-honors/${encodeURIComponent(item.honor_id)}`, {
          method: "PUT",
          data: payload
        })
      ));
      const decoratedHonors = decorateHonors(resequenced);
      this.setData({
        honors: decoratedHonors,
        homeModules: buildHomeModules(this.data.profile, decoratedHonors, this.data.videos, this.data.videoFeature),
        homeCompleteness: homeCompleteness(this.data.profile, decoratedHonors, this.data.videos, this.data.videoFeature)
      });
    }, "荣誉排序已更新");
  },

  /**
   * 保存企业介绍、服务项目和模块展示配置。
   */
  async saveIntro() {
    if (!this.requireAdmin()) return;
    const draft = this.data.introDraft;
    await this.saveWithToast(async () => {
      const profile = await this.adminRequest("/admin/company-profile", {
        method: "PUT",
        data: {
          intro_blocks: stripIntroBlockRuntime(draft.intro_blocks),
          service_items: stripServiceRuntime(draft.service_items),
          display_modules: stripModuleLabels(draft.display_modules)
        }
      });
      this.setData({
        profile,
        panel: "",
        panelDirty: false,
        leaveGuardVisible: false,
        homeModules: buildHomeModules(profile, this.data.honors, this.data.videos, this.data.videoFeature),
        homeCompleteness: homeCompleteness(profile, this.data.honors, this.data.videos, this.data.videoFeature)
      });
    }, "企业介绍已保存");
  },

  /**
   * 打开成员编辑器。
   * 可编辑现有成员，也可用空草稿创建新成员。
   */
  async openMemberEditor(event) {
    if (!this.data.permissions.canOperator) {
      showRestriction("当前角色无权编辑人员，请联系企业 Owner 或管理员");
      return;
    }
    const memberId = event.currentTarget.dataset.id;
    this.setData({ memberActionId: "" });
    try {
      const card = await this.adminRequest(`/admin/members/${encodeURIComponent(memberId)}/card`);
      this.setData({
        panel: "member",
        panelDirty: false,
        leaveGuardVisible: false,
        memberDraft: {
          member_identity_id: memberId,
          display_name: card.display_name || "",
          title: card.title || "",
          department: (card.fields && card.fields.department) || "",
          mobile: (card.fields && card.fields.mobile) || "",
          email: (card.fields && card.fields.email) || "",
          status: card.status || "active"
        }
      });
    } catch (error) {
      wx.showToast({ title: formatError(error, "无法打开人员名片"), icon: "none" });
    }
  },

  /**
   * 更新成员草稿字段。
   */
  onMemberDraftInput(event) {
    const key = event.currentTarget.dataset.key;
    this.setData({ memberDraft: { ...this.data.memberDraft, [key]: event.detail.value } });
    this.markPanelDirty();
  },

  /**
   * 更新成员草稿状态。
   */
  setMemberDraftStatus(event) {
    this.setData({ memberDraft: { ...this.data.memberDraft, status: event.currentTarget.dataset.status }, panelDirty: true });
  },

  /**
   * 保存成员资料。
   * 新成员走创建接口，已有成员走更新接口，并随后刷新成员列表。
   */
  async saveMember() {
    if (!this.data.permissions.canOperator) return;
    const draft = this.data.memberDraft;
    await this.saveWithToast(async () => {
      await this.adminRequest(`/admin/members/${encodeURIComponent(draft.member_identity_id)}/card`, {
        method: "PUT",
        data: {
          display_name: textOrNull(draft.display_name) || "成员",
          title: textOrNull(draft.title),
          fields: {
            department: textOrNull(draft.department),
            mobile: textOrNull(draft.mobile),
            email: textOrNull(draft.email)
          },
          status: draft.status === "disabled" ? "disabled" : "active"
        }
      });
      this.setData({ panel: "", panelDirty: false, leaveGuardVisible: false });
      await this.refreshMembers();
    }, "人员名片已保存");
  },

  /**
   * 快速启用或停用成员。
   */
  async toggleMemberStatus(event) {
    if (!this.data.permissions.canOperator) {
      showRestriction("当前角色无权操作人员，请联系企业 Owner 或管理员");
      return;
    }
    const memberId = event.currentTarget.dataset.id;
    const status = event.currentTarget.dataset.status === "active" ? "disabled" : "active";
    this.setData({ memberActionId: "" });
    await this.saveWithToast(async () => {
      await this.adminRequest(`/admin/members/${encodeURIComponent(memberId)}/card`, {
        method: "PUT",
        data: { status }
      });
      await this.refreshMembers();
    }, status === "active" ? "名片已启用" : "名片已停用");
  },

  /**
   * 删除企业成员，执行前要求用户确认。
   */
  async deleteMember(event) {
    if (!this.requireAdmin()) return;
    const memberId = event.currentTarget.dataset.id;
    this.setData({ memberActionId: "" });
    const ok = await confirm("删除成员", "删除后该成员名片将不可访问。");
    if (!ok) return;
    await this.saveWithToast(async () => {
      await this.adminRequest(`/admin/members/${encodeURIComponent(memberId)}`, { method: "DELETE" });
      await this.refreshMembers();
    }, "成员已删除");
  },

  /**
   * 从企业微信同步成员。
   * 仅具备同步能力的企业租户开放该操作。
   */
  async syncMembers() {
    if (!this.requireAdmin()) return;
    if (!this.data.canSyncMembers) {
      wx.showToast({ title: "本地企业未绑定企业微信", icon: "none" });
      return;
    }
    this.setData({ memberActionId: "" });
    await this.saveWithToast(async () => {
      await this.adminRequest("/admin/members/sync", { method: "POST" });
      await this.refreshMembers();
    }, "成员同步已发起");
  },

  /**
   * 创建员工加入码，并准备分享卡片素材。
   */
  async createJoinCode(event) {
    if (!this.requireAdmin()) return;
    const dataset = event && event.currentTarget && event.currentTarget.dataset ? event.currentTarget.dataset : {};
    const sheetTitle = dataset.mode === "invite" ? "邀请成员" : "入企码";
    if (this.data.joinCodeLoading) {
      this.setData({ joinCodeSheetVisible: true, joinCodeSheetTitle: sheetTitle });
      return;
    }
    this.setData({
      memberActionId: "",
      joinCodeSheetVisible: true,
      joinCodeSheetTitle: sheetTitle,
      joinCode: null,
      joinCodeLoading: true,
      joinCodeError: "",
      joinCodeCardImageUrl: ""
    });
    try {
      const joinCode = await this.adminRequest("/admin/local-enterprises/join-code", { method: "POST" });
      const normalizedJoinCode = normalizeJoinCode(joinCode);
      this.setData({
        joinCode: normalizedJoinCode,
        joinCodeLoading: false,
        joinCodeError: normalizedJoinCode.qr_code_error || ""
      });
      this.prepareJoinCodeCardImage(normalizedJoinCode);
      wx.showToast({ title: sheetTitle === "邀请成员" ? "邀请已生成" : "入企码已生成", icon: "success" });
    } catch (error) {
      const message = formatError(error, sheetTitle === "邀请成员" ? "邀请生成失败" : "入企码生成失败");
      this.setData({ joinCode: null, joinCodeLoading: false, joinCodeError: message });
      wx.showToast({ title: message, icon: "none" });
    } finally {
      this.setData({ joinCodeLoading: false });
    }
  },

  /**
   * 关闭加入码弹层。
   */
  closeJoinCodeSheet() {
    this.setData({ joinCodeSheetVisible: false });
  },

  /**
   * 为加入码生成可保存的卡片图片。
   */
  async prepareJoinCodeCardImage(joinCode = this.data.joinCode) {
    if (!joinCode || !joinCode.qr_code_data_url) return;
    try {
      const { buildJoinCodeCardImage } = require("../../utils/join-code-card-image");
      const imagePath = await buildJoinCodeCardImage(this, this.joinCodeCardOptions(joinCode));
      if (imagePath) {
        this.setData({ joinCodeCardImageUrl: imagePath });
      }
    } catch (_error) {
      this.setData({ joinCodeCardImageUrl: "" });
    }
  },

  /**
   * 将加入码卡片保存到系统相册。
   */
  async saveJoinCodeCardImage() {
    const codeLabel = this.data.joinCodeSheetTitle === "邀请成员" ? "邀请码" : "入企码";
    if (this.data.joinCodeLoading) {
      wx.showToast({ title: `${codeLabel}生成中`, icon: "none" });
      return;
    }
    if (!this.data.joinCode || !this.data.joinCode.qr_code_data_url) {
      wx.showToast({ title: `${codeLabel}尚未生成`, icon: "none" });
      return;
    }
    if (this.data.joinCodeSaving) return;
    this.setData({ joinCodeSaving: true });
    try {
      let imagePath = this.data.joinCodeCardImageUrl;
      if (!imagePath) {
        const { buildJoinCodeCardImage } = require("../../utils/join-code-card-image");
        imagePath = await buildJoinCodeCardImage(this, this.joinCodeCardOptions(this.data.joinCode));
      }
      if (!imagePath) {
        throw new Error(`${codeLabel}卡片生成失败`);
      }
      this.setData({ joinCodeCardImageUrl: imagePath });
      await saveImageToAlbum(imagePath);
      wx.showToast({ title: "已保存到相册", icon: "success" });
    } catch (error) {
      wx.showToast({ title: error.message || "保存失败", icon: "none" });
    } finally {
      this.setData({ joinCodeSaving: false });
    }
  },

  /**
   * 组装加入码卡片生成所需的展示参数。
   */
  joinCodeCardOptions(joinCode) {
    const theme = buildTheme(activeTemplatePrimary(this.data.templates));
    const isInvite = this.data.joinCodeSheetTitle === "邀请成员";
    return {
      tenant: this.data.tenant || {},
      overview: this.data.overview || {},
      joinCode,
      title: isInvite ? "扫码加入企业名片" : "扫码提交加入申请",
      description: isInvite ? "打开后提交信息，管理员审核通过即可加入" : "管理员审核通过后创建企业名片",
      theme
    };
  },

  /**
   * 审核员工加入申请。
   */
  async reviewJoinRequest(event) {
    if (!this.requireAdmin()) return;
    const id = event.currentTarget.dataset.id;
    const decision = event.currentTarget.dataset.decision;
    await this.saveWithToast(async () => {
      await this.adminRequest(`/admin/local-enterprises/join-requests/${encodeURIComponent(id)}/review`, {
        method: "POST",
        data: { decision }
      });
      const result = await this.adminRequest("/admin/local-enterprises/join-requests");
      this.setData({ joinRequests: decorateJoinRequests(result.items || []) });
      await this.refreshMembers();
    }, decision === "approved" ? "已通过申请" : "已拒绝申请");
  },

  /**
   * 生成企业加入码的微信转发配置。
   */
  onShareAppMessage(event) {
    const dataset = event && event.target && event.target.dataset ? event.target.dataset : {};
    const joinCode = this.data.joinCode || {};
    if (dataset.share === "join-code" && joinCode.join_path) {
      const tenantName = (this.data.tenant && this.data.tenant.tenant_name) || "企业";
      const message = {
        title: `${tenantName}邀请你加入企业名片`,
        path: `/${String(joinCode.join_path || "").replace(/^\/+/, "")}`
      };
      if (this.data.joinCodeCardImageUrl) {
        message.imageUrl = this.data.joinCodeCardImageUrl;
      }
      return message;
    }
    return {
      title: "企业名片管理",
      path: "/pages/employee/index"
    };
  },

  /**
   * 关闭当前编辑面板并清理面板态。
   */
  closePanel() {
    if (this.data.panelDirty) {
      this.setData({ leaveGuardVisible: true });
      return;
    }
    this.forceClosePanel();
  },

  forceClosePanel() {
    setPageTheme(this);
    this.setData({ panel: "", panelDirty: false, leaveGuardVisible: false });
  },

  markPanelDirty() {
    if (!this.data.panelDirty) this.setData({ panelDirty: true });
  },

  dismissLeaveGuard() {
    this.setData({ leaveGuardVisible: false });
  },

  discardPanelChanges() {
    this.forceClosePanel();
  },

  noop() {},

  async saveDraftAndLeave() {
    const panel = this.data.panel;
    if (panel === "profile") {
      await this.saveProfile();
      return;
    }
    if (panel === "template") {
      const saved = await this.saveTemplate();
      if (saved) this.forceClosePanel();
      return;
    }
    if (panel === "intro") {
      await this.saveIntro();
      return;
    }
    if (panel === "member") {
      await this.saveMember();
      return;
    }
    this.forceClosePanel();
  },

  /**
   * 校验当前页面是否已进入可管理租户。
   */
  requireAdmin() {
    if (this.data.permissions.canAdmin) return true;
    showRestriction("当前角色无权执行该操作，请联系企业 Owner 或管理员");
    return false;
  },

  /**
   * 包装保存类动作的 loading、toast 和错误提示。
   */
  async saveWithToast(action, title) {
    this.setData({ saving: true, error: "" });
    try {
      await action();
      wx.showToast({ title, icon: "success" });
      return true;
    } catch (error) {
      wx.showToast({ title: formatError(error, "保存失败"), icon: "none" });
      return false;
    } finally {
      this.setData({ saving: false });
    }
  },

  /**
   * 返回员工首页。
   */
  goHome() {
    wx.switchTab({ url: "/pages/employee/index" });
  }
});

/**
 * 创建企业介绍面板的空草稿。
 */
function emptyIntroDraft() {
  return {
    activeSection: "profile",
    display_modules: [],
    intro_blocks: [],
    service_items: [],
    editingBlockIndex: -1,
    ...emptyIntroBlockFields("paragraph"),
    editingServiceIndex: -1,
    serviceDraft: emptyServiceDraft(),
    editingVideoId: "",
    videoDraft: emptyVideoDraft(),
    editingHonorId: "",
    honorDraft: emptyHonorDraft()
  };
}

/**
 * 根据正文块类型创建对应的空字段结构。
 */
function emptyIntroBlockFields(type = "paragraph") {
  return {
    blockType: type,
    text: "",
    listText: "",
    imageUrl: "",
    imageCaption: "",
    galleryImages: [],
    videoId: ""
  };
}

/**
 * 创建服务项目空草稿。
 */
function emptyServiceDraft() {
  return {
    id: "",
    title: "",
    description: "",
    image_url: "",
    sort_order: "",
    visible: true
  };
}

/**
 * 创建企业视频空草稿。
 */
function emptyVideoDraft() {
  return {
    title: "",
    video_url: "",
    cover_url: "",
    duration_seconds: "",
    sort_order: "",
    visible: true,
    status: "draft"
  };
}

/**
 * 创建企业荣誉空草稿。
 */
function emptyHonorDraft() {
  return {
    title: "",
    body: "",
    images: [],
    sort_order: "",
    visible: true,
    status: "published"
  };
}

/**
 * 将已保存的介绍正文块转换为编辑表单字段。
 */
function introBlockFieldsFromBlock(block) {
  if (["heading", "paragraph", "quote"].includes(block.type)) {
    return { text: block.text || "" };
  }
  if (block.type === "list") {
    return { listText: (block.items || []).join("\n") };
  }
  if (block.type === "image") {
    return { imageUrl: block.url || "", imageCaption: block.caption || "" };
  }
  if (block.type === "gallery") {
    return { galleryImages: normalizeGalleryImages(block.images || []) };
  }
  if (block.type === "video") {
    return { videoId: block.video_id || "" };
  }
  return {};
}

/**
 * 将介绍正文块草稿构造成可保存结构。
 * 视频块会校验企业视频功能和已选视频是否存在。
 */
function buildIntroBlock(draft, videoFeature, videos = []) {
  const type = draft.blockType || "paragraph";
  if (["heading", "paragraph", "quote"].includes(type)) {
    const text = String(draft.text || "").trim();
    if (!text) {
      wx.showToast({ title: "请填写内容", icon: "none" });
      return null;
    }
    return { type, text };
  }
  if (type === "list") {
    const items = parseLines(draft.listText).slice(0, 20);
    if (!items.length) {
      wx.showToast({ title: "请填写列表内容", icon: "none" });
      return null;
    }
    return { type: "list", items };
  }
  if (type === "image") {
    const url = textOrNull(draft.imageUrl);
    if (!url || !isBackendAssetSource(url)) {
      wx.showToast({ title: "请上传正文图片", icon: "none" });
      return null;
    }
    return { type: "image", url, caption: textOrNull(draft.imageCaption) || "" };
  }
  if (type === "gallery") {
    const images = normalizeGalleryImages(draft.galleryImages);
    if (images.some((image) => !isBackendAssetSource(image.url))) {
      wx.showToast({ title: "图集图片地址异常", icon: "none" });
      return null;
    }
    if (!images.length) {
      wx.showToast({ title: "请上传图集图片", icon: "none" });
      return null;
    }
    return { type: "gallery", images };
  }
  if (type === "video") {
    if (videoFeature && !videoFeature.enabled) {
      showRestriction("当前企业未开通视频功能，请联系平台管理员开通后使用");
      return null;
    }
    const videoId = String(draft.videoId || "").trim();
    if (!/^\d+$/.test(videoId)) {
      wx.showToast({ title: "请选择已发布视频", icon: "none" });
      return null;
    }
    const match = videos.find((item) => String(item.video_id || "") === videoId);
    if (!match) {
      wx.showToast({ title: "未找到该视频", icon: "none" });
      return null;
    }
    if (match.visible === false || match.status !== "published") {
      wx.showToast({ title: "请引用已发布视频", icon: "none" });
      return null;
    }
    return { type: "video", video_id: videoId };
  }
  return null;
}

/**
 * 为介绍正文块补充前端运行态字段。
 */
function decorateIntroBlocks(blocks) {
  return stripIntroBlockRuntime(blocks).map((block) => {
    const label = introBlockLabel(block.type);
    if (block.type === "list") {
      return { ...block, _label: label, _summary: (block.items || []).join(" / ") };
    }
    if (block.type === "image") {
      return { ...block, _label: label, _summary: block.caption || "已上传图片", _cover: block.url };
    }
    if (block.type === "gallery") {
      const images = block.images || [];
      return {
        ...block,
        _label: label,
        _summary: `${images.length} 张图片`,
        _cover: images[0] && images[0].url ? images[0].url : ""
      };
    }
    if (block.type === "video") {
      return { ...block, _label: label, _summary: block.video_id ? "已选择视频" : "未选择视频" };
    }
    return { ...block, _label: label, _summary: block.text || "" };
  });
}

/**
 * 保存前移除介绍正文块的前端运行态字段。
 */
function stripIntroBlockRuntime(blocks) {
  return cloneArray(blocks).filter((block) => block && typeof block === "object").map((block) => {
    const { _label, _summary, _cover, ...rest } = block;
    return rest;
  });
}

/**
 * 返回介绍正文块类型的中文名称。
 */
function introBlockLabel(type) {
  const found = INTRO_BLOCK_TYPES.find((item) => item.value === type);
  return found ? found.label : type || "内容";
}

/**
 * 将服务项目转换为编辑草稿。
 */
function serviceDraftFromItem(item) {
  return {
    id: item.id || "",
    title: item.title || "",
    description: item.description || "",
    image_url: item.image_url || "",
    sort_order: item.sort_order || "",
    visible: item.visible !== false
  };
}

/**
 * 将服务项目草稿构造成可保存结构。
 * 图片必须来自后端素材地址，避免保存临时本地路径。
 */
function buildServiceItem(draft, index) {
  const title = String(draft.title || "").trim();
  const imageUrl = textOrNull(draft.image_url);
  if (!title && !imageUrl) {
    wx.showToast({ title: "请填写服务标题或图片", icon: "none" });
    return null;
  }
  if (imageUrl && !isBackendAssetSource(imageUrl)) {
    wx.showToast({ title: "服务图片地址异常", icon: "none" });
    return null;
  }
  const rawId = String(draft.id || "");
  return {
    id: /^service_[A-Za-z0-9_-]{1,64}$/.test(rawId) ? rawId : `service_${Date.now()}`,
    title,
    description: String(draft.description || "").trim(),
    image_url: imageUrl,
    visible: draft.visible !== false,
    sort_order: numberOrDefault(draft.sort_order, (index + 1) * 10)
  };
}

/**
 * 为服务项目列表补充前端排序和编辑态字段。
 */
function decorateServices(items) {
  return stripServiceRuntime(items)
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
    .map((item) => ({
      ...item,
      _cover: item.image_url || "",
      _summary: item.description || (item.image_url ? "已上传服务图片" : "未填写描述"),
      _visibleLabel: item.visible === false ? "隐藏" : "展示"
    }));
}

/**
 * 保存前移除服务项目的前端运行态字段。
 */
function stripServiceRuntime(items) {
  return cloneArray(items).filter((item) => item && typeof item === "object").map((item) => {
    const { _cover, _summary, _visibleLabel, ...rest } = item;
    return rest;
  });
}

/**
 * 将视频条目转换为编辑草稿。
 */
function videoDraftFromItem(item) {
  return {
    title: item.title || "",
    video_url: item.video_url || "",
    cover_url: item.cover_url || "",
    duration_seconds: item.duration_seconds === null || item.duration_seconds === undefined ? "" : String(item.duration_seconds),
    sort_order: item.sort_order || "",
    visible: item.visible !== false,
    status: item.status || "draft"
  };
}

/**
 * 将视频草稿构造成后端保存载荷。
 * 视频地址必须来自后端素材，封面也不能是本地临时路径。
 */
function buildVideoPayload(draft) {
  const title = String(draft.title || "").trim();
  const videoUrl = textOrNull(draft.video_url);
  const coverUrl = textOrNull(draft.cover_url);
  if (!title || !videoUrl) {
    wx.showToast({ title: "请填写标题并上传视频", icon: "none" });
    return null;
  }
  if (!isBackendAssetSource(videoUrl)) {
    wx.showToast({ title: "视频地址不正确", icon: "none" });
    return null;
  }
  if (coverUrl && !isBackendAssetSource(coverUrl)) {
    wx.showToast({ title: "封面地址异常", icon: "none" });
    return null;
  }
  return {
    title,
    video_url: videoUrl,
    cover_url: coverUrl,
    duration_seconds: numberOrNull(draft.duration_seconds),
    sort_order: numberOrDefault(draft.sort_order, 0),
    visible: draft.visible !== false,
    status: draft.status === "published" ? "published" : "draft"
  };
}

/**
 * 为视频列表补充前端展示 key 和默认值。
 */
function decorateVideos(items) {
  return cloneArray(items)
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
    .map((item) => ({
      ...item,
      _cover: item.cover_url || "",
      _summary: item.duration_seconds ? `时长 ${item.duration_seconds} 秒` : "已上传视频",
      statusLabel: item.status === "published" ? "已发布" : "草稿",
      statusClass: item.status === "published" ? "badge--success" : "badge--warning",
      _visibleLabel: item.visible === false ? "隐藏" : "展示"
    }));
}

/**
 * 将荣誉条目转换为编辑草稿。
 */
function honorDraftFromItem(item) {
  return {
    title: item.title || "",
    body: item.body || "",
    images: normalizeHonorImages(item.images || []),
    sort_order: item.sort_order || "",
    visible: item.visible !== false,
    status: item.status || "draft"
  };
}

/**
 * 将荣誉草稿构造成后端保存载荷。
 * 至少需要标题，图片必须来自后端素材。
 */
function buildHonorPayload(draft) {
  const title = String(draft.title || "").trim();
  if (!title) {
    wx.showToast({ title: "请填写荣誉标题", icon: "none" });
    return null;
  }
  const images = normalizeHonorImages(draft.images);
  if (images.some((image) => !isBackendAssetSource(image.image_url))) {
    wx.showToast({ title: "荣誉图片地址异常", icon: "none" });
    return null;
  }
  return {
    title,
    body: textOrNull(draft.body),
    sort_order: numberOrDefault(draft.sort_order, 0),
    visible: draft.visible !== false,
    status: draft.status === "published" ? "published" : "draft",
    images: resequenceHonorImages(images)
  };
}

/**
 * 为荣誉列表补充图片预览和排序字段。
 */
function decorateHonors(items) {
  return cloneArray(items)
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
    .map((item) => {
      const images = item.images || [];
      return {
        ...item,
        _cover: images[0] && images[0].image_url ? images[0].image_url : "",
        _summary: item.body || `${images.length} 张图片`,
        statusLabel: item.status === "published" ? "已发布" : "草稿",
        statusClass: item.status === "published" ? "badge--success" : "badge--warning",
        _visibleLabel: item.visible === false ? "隐藏" : "展示"
      };
    });
}

function stripHonorRuntime(items) {
  return cloneArray(items).filter((item) => item && typeof item === "object").map((item) => {
    const { _cover, _summary, statusLabel, statusClass, _visibleLabel, ...rest } = item;
    return rest;
  });
}

/**
 * 返回企业主页维护首页的 5 张模块卡片。
 */
function buildHomeModules(profile = {}, honors = [], videos = [], videoFeature = null) {
  const blocks = profile.intro_blocks || [];
  const services = profile.service_items || [];
  const publishedVideos = publishedCompanyVideos(videos);
  return [
    {
      key: "base",
      title: "企业信息",
      desc: profile.display_name || "名称、Logo、官网与地址",
      action: "编辑",
      statusLabel: profile.display_name && profile.logo_url ? "已完善" : "待完善",
      statusClass: profile.display_name && profile.logo_url ? "badge--success" : "badge--warning",
      icon: "icon-building",
      panel: "profile"
    },
    {
      key: "profile",
      title: "企业简介",
      desc: blocks.length ? `${blocks.length} 个内容块` : "段落、图片、引用和图集",
      action: "编辑",
      statusLabel: blocks.length ? "已完善" : "待完善",
      statusClass: blocks.length ? "badge--success" : "badge--warning",
      icon: "icon-text",
      section: "profile"
    },
    {
      key: "services",
      title: "服务项目",
      desc: services.length ? `${services.length} 项服务` : "服务列表与展示布局",
      action: "编辑",
      statusLabel: services.length ? "已完善" : "待完善",
      statusClass: services.length ? "badge--success" : "badge--warning",
      icon: "icon-style",
      section: "services"
    },
    {
      key: "videos",
      title: "企业视频",
      desc: videoFeature && !videoFeature.enabled ? "视频能力未开通" : (publishedVideos.length ? `${publishedVideos.length} 个已发布视频` : "未选择视频，发布后不展示"),
      action: videoFeature && !videoFeature.enabled ? "查看" : "去选择",
      statusLabel: videoFeature && !videoFeature.enabled ? "未开通" : (publishedVideos.length ? "已完善" : "待完善"),
      statusClass: videoFeature && !videoFeature.enabled ? "badge--muted" : (publishedVideos.length ? "badge--success" : "badge--warning"),
      icon: "icon-video",
      section: "videos"
    },
    {
      key: "honors",
      title: "荣誉资质",
      desc: honors.length ? `${honors.length} 项荣誉` : "证书、奖项与资质图片",
      action: "编辑",
      statusLabel: honors.length ? "已完善" : "待完善",
      statusClass: honors.length ? "badge--success" : "badge--warning",
      icon: "icon-paper",
      section: "honors"
    }
  ];
}

/**
 * 企业主页完整度，保持与后台六项基础检查一致。
 */
function homeCompleteness(profile = {}, honors = [], videos = [], videoFeature = null) {
  const checks = [
    Boolean(profile.display_name),
    Boolean(profile.logo_url),
    Boolean(profile.website_url),
    Boolean(profile.address),
    (profile.intro_blocks || []).length > 0,
    (profile.service_items || []).length > 0
  ];
  const done = checks.filter(Boolean).length;
  const warnings = [];
  if (videoFeature && videoFeature.enabled && !publishedCompanyVideos(videos).length) warnings.push("企业视频待选择");
  if (!honors.length) warnings.push("荣誉资质待完善");
  return {
    done,
    total: checks.length,
    percent: Math.round((done / checks.length) * 100),
    warnings: warnings.join(" · ")
  };
}

/**
 * 小程序端只让用户选择已发布且可见的视频。
 */
function publishedCompanyVideos(videos = []) {
  return cloneArray(videos).filter((item) => item.visible !== false && item.status === "published");
}

function introSectionTitle(section) {
  const found = INTRO_CONTENT_SECTIONS.find((item) => item.value === section);
  return found ? found.label : "企业简介";
}

function introModuleKey(section) {
  return {
    profile: "profile",
    services: "services",
    videos: "videos",
    honors: "honors"
  }[section || "profile"] || "profile";
}

function withActiveIntroModule(draft) {
  const moduleKey = introModuleKey(draft.activeSection);
  const index = (draft.display_modules || []).findIndex((item) => item.key === moduleKey);
  const module = index >= 0 ? draft.display_modules[index] : null;
  return {
    ...draft,
    activeModuleIndex: index,
    activeModule: module
  };
}

/**
 * 将多行文本拆成非空条目列表。
 */
function parseLines(value) {
  return String(value || "")
    .split(/\n|；|;/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * 规范化介绍图集图片结构。
 */
function normalizeGalleryImages(value) {
  return cloneArray(value).slice(0, 12).map((image) => ({
    url: String((image && image.url) || "").trim(),
    caption: String((image && image.caption) || "").trim()
  })).filter((image) => image.url);
}

/**
 * 规范化荣誉图片结构。
 */
function normalizeHonorImages(value) {
  return cloneArray(value).slice(0, 12).map((image, index) => ({
    image_url: String((image && image.image_url) || "").trim(),
    title: textOrNull(image && image.title),
    caption: textOrNull(image && image.caption),
    sort_order: numberOrDefault(image && image.sort_order, (index + 1) * 10)
  })).filter((image) => image.image_url);
}

/**
 * 重新计算荣誉图片排序。
 */
function resequenceHonorImages(images) {
  return normalizeHonorImages(images).map((image, index) => ({
    ...image,
    sort_order: (index + 1) * 10
  }));
}

/**
 * 判断素材地址是否已经来自后端资产管道。
 */
function isBackendAssetSource(value) {
  const text = String(value || "").trim();
  return /^https?:\/\//.test(text) || text.startsWith("/api/v1/storage/") || text.startsWith("/api/v1/demo-assets/");
}

/**
 * 将输入转换为数字，空值或非法值返回 null。
 */
function numberOrNull(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : null;
}

/**
 * 将输入转换为数字，非法时使用默认值。
 */
function numberOrDefault(value, fallback) {
  const number = numberOrNull(value);
  return number === null ? fallback : number;
}

/**
 * 按当前数组顺序重排 sort_order。
 */
function resequenceSort(items) {
  return items.map((item, index) => ({ ...item, sort_order: (index + 1) * 10 }));
}

/**
 * 按 ID 更新或追加列表项。
 */
function upsertById(items, item, key) {
  const next = cloneArray(items);
  const index = next.findIndex((current) => current[key] === item[key]);
  if (index >= 0) {
    next[index] = item;
  } else {
    next.push(item);
  }
  return next.sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
}

/**
 * 选择本地图片或视频素材。
 * 兼容 chooseMedia 和 chooseImage，返回统一文件列表结构。
 */
function chooseLocalMedia(mediaType, count) {
  return new Promise((resolve, reject) => {
    if (typeof wx.chooseMedia === "function") {
      wx.chooseMedia({
        count,
        mediaType,
        sourceType: ["album", "camera"],
        sizeType: ["compressed"],
        success(result) {
          resolve(result.tempFiles || []);
        },
        fail: reject
      });
      return;
    }
    if (mediaType.includes("image") && typeof wx.chooseImage === "function") {
      wx.chooseImage({
        count,
        sourceType: ["album", "camera"],
        sizeType: ["compressed"],
        success(result) {
          const paths = result.tempFilePaths || [];
          resolve(paths.map((path, index) => ({
            tempFilePath: path,
            size: result.tempFiles && result.tempFiles[index] ? result.tempFiles[index].size : 0
          })));
        },
        fail: reject
      });
      return;
    }
    showRestriction("当前微信版本暂不支持选择媒体，请升级微信后重试");
    resolve([]);
  });
}

/**
 * 将获取图片信息封装为 Promise，用于上传前校验尺寸和类型。
 */
function getImageInfo(src) {
  return new Promise((resolve, reject) => {
    wx.getImageInfo({
      src,
      success: resolve,
      fail: reject
    });
  });
}

/**
 * 校验模板背景图片格式和比例。
 */
function validateBackgroundImage(info) {
  const mime = imageMime(info);
  if (!mime) {
    throw new Error("仅支持 JPG、PNG、WebP 图片");
  }
  const ratio = info.width / info.height;
  if (ratio < BACKGROUND_MIN_RATIO || ratio > BACKGROUND_MAX_RATIO) {
    throw new Error("图片比例需在 1.5:1 到 2:1 之间");
  }
}

/**
 * 从微信图片信息或路径后缀推断图片 MIME 类型。
 */
function imageMime(info) {
  const type = String(info.type || "").toLowerCase();
  if (BACKGROUND_TYPES[type]) {
    return BACKGROUND_TYPES[type];
  }
  const match = String(info.path || "").toLowerCase().match(/\.([a-z0-9]+)(?:\?|$)/);
  return match ? BACKGROUND_TYPES[match[1]] || "" : "";
}

/**
 * 从微信媒体文件对象中提取临时文件路径。
 */
function tempFilePath(file) {
  return file && (file.tempFilePath || file.path || "");
}

/**
 * 从本地路径推断上传文件名。
 */
function fileNameFromPath(filePath, fallback) {
  const clean = String(filePath || "").split("?")[0] || "";
  const name = clean.split(/[\\/]/).filter(Boolean).pop() || "";
  return name.includes(".") ? name : fallback;
}

/**
 * 根据图片路径后缀推断上传 Content-Type。
 */
function imageContentType(filePath) {
  const ext = extensionFromPath(filePath);
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}

/**
 * 根据视频路径后缀推断上传 Content-Type。
 */
function videoContentType(filePath) {
  const ext = extensionFromPath(filePath);
  return ext === "mp4" ? "video/mp4" : "video/mp4";
}

/**
 * 从文件路径中提取扩展名。
 */
function extensionFromPath(filePath) {
  const match = String(filePath || "").toLowerCase().match(/\.([a-z0-9]+)(?:\?|$)/);
  return match ? match[1] : "";
}

/**
 * 规范化可管理企业展示信息。
 */
function decorateTenant(item) {
  const name = item.tenant_name || "企业";
  const authStatus = item.auth_status || null;
  const openCorpid = item.open_corpid || null;
  return {
    tenant_id: String(item.tenant_id || ""),
    tenant_name: name,
    role: item.role || "auditor",
    roleLabel: ROLE_LABELS[item.role] || item.role || "管理员",
    initial: name.slice(0, 1) || "企",
    creation_source: item.creation_source || null,
    open_corpid: openCorpid,
    auth_status: authStatus,
    wecom_bound: item.wecom_bound === true || Boolean(openCorpid && authStatus === "active")
  };
}

/**
 * 将工作区概览中的租户状态合并到当前租户对象。
 */
function mergeTenantStatus(tenant, overview) {
  const source = overview || {};
  return decorateTenant({
    ...(tenant || {}),
    tenant_id: source.tenant_id || (tenant && tenant.tenant_id),
    tenant_name: source.tenant_name || (tenant && tenant.tenant_name),
    role: (tenant && tenant.role) || "auditor",
    creation_source: source.creation_source ?? (tenant && tenant.creation_source),
    open_corpid: source.open_corpid ?? (tenant && tenant.open_corpid),
    auth_status: source.auth_status ?? (tenant && tenant.auth_status),
    wecom_bound: source.wecom_bound ?? (tenant && tenant.wecom_bound)
  });
}

/**
 * 判断当前租户是否支持企业微信成员同步。
 */
function canSyncMembersForTenant(tenant, overview) {
  return Boolean((overview && overview.wecom_bound) || (tenant && tenant.wecom_bound));
}

/**
 * 根据管理员角色生成前端权限开关。
 */
function permissionsFor(role) {
  const rank = ROLE_RANK[role] || 0;
  return {
    canAdmin: rank >= ROLE_RANK.admin,
    canOperator: rank >= ROLE_RANK.operator
  };
}

/**
 * 规范化模板列表并补充选中态。
 */
function decorateTemplates(items) {
  return items.map((item) => ({
    ...item,
    variant: normalizeTemplateVariant((item.layout && item.layout.variant) || item.variant || "horizontal-business"),
    variantLabel: variantLabel((item.layout && item.layout.variant) || item.variant || "horizontal-business"),
    primary: (item.color_scheme && item.color_scheme.primary) || "#5272d6"
  }));
}

/**
 * 从模板列表中读取当前生效主色。
 */
function activeTemplatePrimary(templates) {
  const selected = (templates || []).find((item) => item.is_default) || (templates || [])[0] || {};
  return (selected.color_scheme && selected.color_scheme.primary) || selected.primary || DEFAULT_BRAND;
}

/**
 * 规范化加入码结构，补充展示文本和分享路径。
 */
function normalizeJoinCode(joinCode = {}) {
  const token = String(joinCode.join_token || "").trim();
  const joinPath = String(joinCode.join_path || (token ? `pages/enterprise-join/index?token=${encodeURIComponent(token)}` : "")).replace(/^\/+/, "");
  const expiresAtText = formatDateTime(joinCode.expires_at);
  return {
    ...joinCode,
    join_token: token,
    join_path: joinPath,
    qr_code_data_url: String(joinCode.qr_code_data_url || "").trim(),
    qr_code_error: String(joinCode.qr_code_error || "").trim(),
    expires_at: expiresAtText,
    expiresAtText
  };
}

/**
 * 规范化成员列表展示字段。
 */
function decorateMembers(items) {
  return items.map((item) => ({
    ...item,
    initial: (item.display_name || "成").slice(0, 1),
    statusLabel: item.card_status === "active" ? "名片启用" : "名片停用",
    statusClass: item.card_status === "active" ? "badge--success" : "badge--warning"
  }));
}

/**
 * 规范化员工加入申请列表。
 */
function decorateJoinRequests(items) {
  return items.map((item) => ({
    ...item,
    createdAt: formatDateTime(item.createdAt)
  }));
}

/**
 * 将模板记录转换为模板编辑草稿。
 */
function draftFromTemplate(template) {
  const layout = template && template.layout && typeof template.layout === "object" ? template.layout : {};
  const variant = normalizeTemplateVariant((layout && layout.variant) || template.variant || "horizontal-business");
  return {
    template_id: template.template_id || "",
    name: template.name || "",
    logo_url: template.logo_url || "",
    background_url: template.background_url || "",
    primary: (template.color_scheme && template.color_scheme.primary) || template.primary || "#5272d6",
    surface: (template.color_scheme && template.color_scheme.surface) || "#ffffff",
    variant,
    background_opacity: normalizeOpacity(layout.background_opacity, templateStyleMeta(variant).opacity || DEFAULT_BACKGROUND_OPACITY),
    background_preset_id: typeof layout.background_preset_id === "string" ? layout.background_preset_id : "",
    status: template.status || "active",
    is_default: Boolean(template.is_default)
  };
}

/**
 * 构造模板编辑器完整状态。
 * 包含预览名片、可选背景、主题色和模板背景映射。
 */
function buildTemplateEditorState(template, profile, members, tenant) {
  const draft = draftFromTemplate(template || {});
  const layout = template && template.layout && typeof template.layout === "object" ? template.layout : {};
  const variant = draft.variant || "horizontal-business";
  const templateBackgrounds = templateBackgroundsFromLayout(layout, variant, {
    backgroundUrl: draft.background_url,
    backgroundPresetId: draft.background_preset_id,
    backgroundOpacity: draft.background_opacity
  });
  const backgroundState = backgroundStateForVariant(variant, templateBackgrounds);
  const primary = normalizeHexInput(draft.primary) || DEFAULT_BRAND;
  const theme = buildTheme(primary);
  const card = buildTemplatePreviewCard(profile, members, tenant);
  return {
    templateDraft: { ...draft, primary },
    templateId: draft.template_id,
    styleTemplateId: templateIdForVariant(variant),
    templateClass: templateClassForVariant(variant),
    primary: theme.themeBrand,
    ...theme,
    themeStyle: buildThemeStyle(theme),
    customColor: primary,
    customHex: primary,
    customHexError: "",
    customColorExpanded: ![DEFAULT_BRAND, "#c1666b", "#8d7ec7", "#4c8868", "#d68a4e", "#3f9999"].includes(primary),
    card,
    logoUrl: (profile && profile.logo_url) || draft.logo_url || "",
    portraitPhotoUrl: isPortraitVariant(variant) ? layoutImageUrl(layout, "portrait_photo_url") : "",
    defaultPortraitPhotoUrl: DEFAULT_PORTRAIT_PHOTO_URL,
    backgroundUrl: backgroundState.backgroundUrl,
    backgroundPresetId: backgroundState.backgroundPresetId,
    templateBackgrounds,
    backgroundPresets: backgroundState.backgroundPresets,
    backgroundOpacity: backgroundState.backgroundOpacity,
    backgroundPreviewStyle: backgroundStyle(backgroundState.backgroundUrl, backgroundState.backgroundOpacity, variant),
    backgroundError: ""
  };
}

/**
 * 从模板 layout 中安全读取图片地址字段。
 */
function layoutImageUrl(layout, key) {
  const value = layout && layout[key];
  return typeof value === "string" ? value.trim() : "";
}

/**
 * 根据企业资料和成员样本生成模板预览名片。
 */
function buildTemplatePreviewCard(profile, members, tenant) {
  const currentMember = Array.isArray(members) && members.length ? members[0] : null;
  const companyName = (profile && profile.display_name) || (tenant && tenant.tenant_name) || "企业";
  const companyShortName = (profile && profile.short_name) || "";
  const mobile = currentMember && currentMember.mobile ? currentMember.mobile : "";
  return {
    display_name: (currentMember && currentMember.display_name) || "姓名",
    title: (currentMember && currentMember.title) || "职位",
    company: companyName,
    company_short_name: companyShortName,
    avatar_url: (currentMember && currentMember.avatar_url) || "",
    fields: { mobile: mobile || "" },
    show_avatar: currentMember ? currentMember.show_avatar !== false : true
  };
}

/**
 * 返回模板风格的中文标签。
 */
function variantLabel(value) {
  const found = TEMPLATE_VARIANTS.find((item) => item.value === normalizeTemplateVariant(value));
  return found ? found.label : "横版商务";
}

/**
 * 返回模板风格元数据。
 */
function templateStyleMeta(variant) {
  return TEMPLATE_STYLE_META[normalizeTemplateVariant(variant)] || TEMPLATE_STYLE_META["horizontal-business"];
}

/**
 * 将模板风格映射为卡片样式 class。
 */
function templateClassForVariant(variant) {
  return templateStyleMeta(variant).className;
}

/**
 * 将模板风格转换为后端模板 ID。
 */
function templateIdForVariant(variant) {
  const normalized = normalizeTemplateVariant(variant);
  const map = {
    "horizontal-business": "tpl_horizontal_business",
    minimal: "tpl_minimal",
    "brand-image": "tpl_brand_image",
    "portrait-photo": "tpl_portrait_photo",
    dark: "tpl_dark",
    campaign: "tpl_campaign"
  };
  return map[normalized] || "tpl_horizontal_business";
}

/**
 * 统一历史模板别名和当前模板风格。
 */
function normalizeTemplateVariant(value) {
  if (value === "tpl_demo_business" || value === "tpl_horizontal_business" || value === "horizontal-business") {
    return "horizontal-business";
  }
  if (value === "tpl_minimal") {
    return "minimal";
  }
  if (value === "tpl_brand_image") {
    return "brand-image";
  }
  if (value === "tpl_portrait_photo" || value === "tpl_photo_portrait" || value === "portrait-photo" || value === "photo-portrait") {
    return "portrait-photo";
  }
  if (value === "tpl_dark") {
    return "dark";
  }
  if (value === "tpl_campaign") {
    return "campaign";
  }
  return TEMPLATE_STYLE_META[value] ? value : "horizontal-business";
}

/**
 * 判断模板风格是否为照片人像模板。
 */
function isPortraitVariant(value) {
  return normalizeTemplateVariant(value) === "portrait-photo";
}

/**
 * 将背景透明度限制在 0-100 的整数范围。
 */
function normalizeOpacity(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.max(0, Math.min(100, Math.round(number)));
}

/**
 * 返回模板风格允许使用的背景预设。
 */
function backgroundPresetsForVariant(variant) {
  const normalized = normalizeTemplateVariant(variant);
  const ids = TEMPLATE_BACKGROUND_PRESET_IDS[normalized] || TEMPLATE_BACKGROUND_PRESET_IDS["horizontal-business"];
  return ids
    .map((id) => BACKGROUND_PRESETS.find((item) => item.id === id))
    .filter(Boolean);
}

/**
 * 判断背景预设是否允许用于指定模板风格。
 */
function isPresetAllowedForVariant(presetId, variant) {
  return backgroundPresetsForVariant(variant).some((item) => item.id === presetId);
}

/**
 * 生成模板风格默认背景状态。
 */
function defaultBackgroundState(variant) {
  const normalized = normalizeTemplateVariant(variant);
  const meta = templateStyleMeta(normalized);
  const backgroundPresets = backgroundPresetsForVariant(normalized);
  const preset = backgroundPresets.find((item) => item.id === meta.backgroundId) || backgroundPresets[0] || null;
  const backgroundOpacity = normalizeOpacity(meta.opacity, DEFAULT_BACKGROUND_OPACITY);
  return {
    backgroundUrl: preset ? preset.url : "",
    backgroundPresetId: preset ? preset.id : "",
    backgroundPresets,
    backgroundOpacity
  };
}

/**
 * 合并已保存背景配置与模板默认背景。
 */
function backgroundStateForVariant(variant, templateBackgrounds) {
  const normalized = normalizeTemplateVariant(variant);
  const saved = normalizeTemplateBackgroundConfig(normalized, templateBackgrounds && templateBackgrounds[normalized]);
  const defaults = defaultBackgroundState(normalized);
  if (!saved) {
    return defaults;
  }
  const customUrl = isBundledBackground(saved.background_url) ? "" : saved.background_url;
  if (customUrl) {
    return {
      ...defaults,
      backgroundUrl: customUrl,
      backgroundPresetId: "",
      backgroundOpacity: normalizeOpacity(saved.background_opacity, defaults.backgroundOpacity)
    };
  }
  const preset = backgroundPresetsForVariant(normalized).find((item) => item.id === saved.background_preset_id)
    || presetFromUrl(saved.background_url)
    || backgroundPresetsForVariant(normalized).find((item) => item.id === defaults.backgroundPresetId)
    || null;
  return {
    ...defaults,
    backgroundUrl: preset ? preset.url : defaults.backgroundUrl,
    backgroundPresetId: preset ? preset.id : defaults.backgroundPresetId,
    backgroundOpacity: normalizeOpacity(saved.background_opacity, defaults.backgroundOpacity)
  };
}

/**
 * 从后端 layout 还原各模板风格背景配置。
 */
function templateBackgroundsFromLayout(layout, activeVariant, legacy = {}) {
  const rawMap = layout && typeof layout.template_backgrounds === "object" && !Array.isArray(layout.template_backgrounds)
    ? layout.template_backgrounds
    : {};
  const templateBackgrounds = {};
  Object.keys(TEMPLATE_STYLE_META).forEach((variant) => {
    const normalized = normalizeTemplateBackgroundConfig(variant, rawMap[variant] || rawMap[templateIdForVariant(variant)]);
    if (normalized) {
      templateBackgrounds[variant] = normalized;
    }
  });
  const active = normalizeTemplateVariant(activeVariant);
  if (!templateBackgrounds[active]) {
    const legacyBackgroundUrl = typeof legacy.backgroundUrl === "string" ? legacy.backgroundUrl : "";
    templateBackgrounds[active] = legacyBackgroundUrl && !isBundledBackground(legacyBackgroundUrl)
      ? (normalizeTemplateBackgroundConfig(active, {
          background_url: legacyBackgroundUrl,
          background_preset_id: "",
          background_opacity: legacy.backgroundOpacity
        }) || backgroundConfigForSave(active, defaultBackgroundState(active)))
      : backgroundConfigForSave(active, defaultBackgroundState(active));
  }
  return templateBackgrounds;
}

/**
 * 将当前模板风格背景写回背景配置映射。
 */
function withCurrentVariantBackground(data, patch = {}) {
  const variant = normalizeTemplateVariant(data.templateDraft && data.templateDraft.variant);
  return {
    ...(data.templateBackgrounds || {}),
    [variant]: backgroundConfigForSave(variant, {
      backgroundUrl: patch.backgroundUrl !== undefined ? patch.backgroundUrl : data.backgroundUrl,
      backgroundPresetId: patch.backgroundPresetId !== undefined ? patch.backgroundPresetId : data.backgroundPresetId,
      backgroundOpacity: patch.backgroundOpacity !== undefined ? patch.backgroundOpacity : data.backgroundOpacity
    })
  };
}

/**
 * 整理所有模板风格的背景保存结构。
 */
function templateBackgroundsForSave(templateBackgrounds) {
  const result = {};
  Object.keys(TEMPLATE_STYLE_META).forEach((variant) => {
    const state = backgroundStateForVariant(variant, templateBackgrounds);
    result[variant] = backgroundConfigForSave(variant, state);
  });
  return result;
}

/**
 * 生成单个模板风格的背景保存结构。
 */
function backgroundConfigForSave(variant, state) {
  const defaults = defaultBackgroundState(variant);
  const customUrl = isBundledBackground(state.backgroundUrl) ? "" : String(state.backgroundUrl || "");
  return {
    background_url: customUrl,
    background_preset_id: customUrl ? "" : (state.backgroundPresetId || defaults.backgroundPresetId || null),
    background_opacity: normalizeOpacity(state.backgroundOpacity, defaults.backgroundOpacity)
  };
}

/**
 * 校验并规范化单个模板背景配置。
 */
function normalizeTemplateBackgroundConfig(variant, value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const defaults = defaultBackgroundState(variant);
  const backgroundUrl = typeof value.background_url === "string" ? value.background_url.trim() : "";
  const presetFromBackground = presetFromUrl(backgroundUrl);
  const rawPresetId = typeof value.background_preset_id === "string" ? value.background_preset_id : "";
  const presetId = isPresetAllowedForVariant(rawPresetId, variant)
    ? rawPresetId
    : (presetFromBackground && isPresetAllowedForVariant(presetFromBackground.id, variant) ? presetFromBackground.id : "");
  return {
    background_url: presetFromBackground ? "" : backgroundUrl,
    background_preset_id: presetId || defaults.backgroundPresetId || null,
    background_opacity: normalizeOpacity(value.background_opacity, defaults.backgroundOpacity)
  };
}

/**
 * 根据内置背景 URL 反查预设。
 */
function presetFromUrl(url) {
  const normalized = String(url || "").replace(/\.webp$/i, ".png");
  return BACKGROUND_PRESETS.find((item) => item.url === normalized) || null;
}

/**
 * 判断背景 URL 是否为小程序内置资源。
 */
function isBundledBackground(url) {
  return Boolean(presetFromUrl(String(url || ""))) || String(url || "").startsWith("/assets/card-backgrounds/");
}

/**
 * 规范化 HEX 颜色输入。
 */
function normalizeHexInput(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }
  const prefixed = raw.startsWith("#") ? raw : `#${raw}`;
  return /^#[0-9a-fA-F]{6}$/.test(prefixed) ? prefixed.toLowerCase() : "";
}

/**
 * 生成模板背景预览样式。
 */
function backgroundStyle(url, opacity = DEFAULT_BACKGROUND_OPACITY, variant = "horizontal-business") {
  if (!url) {
    return "";
  }
  const alpha = 1 - normalizeOpacity(opacity, DEFAULT_BACKGROUND_OPACITY) / 100;
  const normalizedVariant = normalizeTemplateVariant(variant);
  const overlay = normalizedVariant === "brand-image" || normalizedVariant === "dark"
    ? `rgba(0,0,0,${(alpha * 0.48).toFixed(2)})`
    : `rgba(255,255,255,${alpha.toFixed(2)})`;
  return `background: linear-gradient(${overlay}, ${overlay}), url("${url}") center / cover no-repeat;`;
}

/**
 * 将背景 URL 转为后端保存值。
 * 内置资源保存为空，自定义远程资源保留原 URL。
 */
function backgroundUrlForSave(url) {
  if (!url) {
    return Promise.resolve("");
  }
  if (String(url).startsWith("/assets/")) {
    return Promise.resolve("");
  }
  return Promise.resolve(String(url).trim());
}

/**
 * 保存前移除模块中的前端标签字段。
 */
function stripModuleLabels(modules) {
  return modules.map((item) => ({
    key: item.key,
    title: item.title,
    visible: Boolean(item.visible),
    sort_order: Number(item.sort_order || 0),
    layout: item.layout || "graphic"
  }));
}

/**
 * 为企业展示模块补充前端标签。
 */
function decorateModules(modules) {
  return cloneArray(modules).map((item) => {
    const layout = MODULE_LAYOUTS.find((layoutItem) => layoutItem.value === item.layout);
    return { ...item, layoutLabel: layout ? layout.label : "图文" };
  });
}

/**
 * 克隆数组输入，非数组返回空数组。
 */
function cloneArray(value) {
  return JSON.parse(JSON.stringify(value || []));
}

/**
 * 将文本输入规范为字符串或 null。
 */
function textOrNull(value) {
  const text = String(value || "").trim();
  return text || null;
}

/**
 * 提取错误消息并提供默认提示。
 */
function formatError(error, fallback) {
  return error && error.message ? error.message : fallback;
}

/**
 * 格式化加入码和申请列表中的时间展示。
 */
function formatDateTime(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return value || "";
  const pad = (num) => String(num).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * 将微信确认弹窗封装为 Promise。
 */
function confirm(title, content) {
  return new Promise((resolve) => {
    wx.showModal({
      title,
      content,
      confirmText: "确认",
      confirmColor: "#d92d20",
      success: (result) => resolve(Boolean(result.confirm)),
      fail: () => resolve(false)
    });
  });
}

/**
 * 保存图片到系统相册，并处理隐私授权弹窗。
 */
function saveImageToAlbum(filePath) {
  return new Promise((resolve, reject) => {
    if (typeof wx.saveImageToPhotosAlbum !== "function") {
      reject(new Error("当前微信版本暂不支持保存图片"));
      return;
    }
    wx.saveImageToPhotosAlbum({
      filePath,
      success: resolve,
      fail(error) {
        const message = String((error && error.errMsg) || "");
        if (isPrivacyAgreementError(error)) {
          wx.showModal({
            title: "隐私指引未配置",
            content: "请先在小程序后台声明保存图片到相册用途。",
            showCancel: false
          });
          reject(new Error("隐私指引未配置"));
          return;
        }
        if (/auth deny|authorize/i.test(message) && typeof wx.openSetting === "function") {
          wx.showModal({
            title: "需要相册权限",
            content: "请允许保存图片到相册。",
            confirmText: "去设置",
            success(result) {
              if (result.confirm) {
                wx.openSetting({});
              }
            }
          });
        }
        reject(new Error(message || "保存到相册失败"));
      }
    });
  });
}

/**
 * 判断保存相册失败是否由微信隐私协议未同意导致。
 */
function isPrivacyAgreementError(error) {
  return /privacy agreement|scope is not declared|privacy/i.test(String(error && error.errMsg || error && error.message || ""));
}
