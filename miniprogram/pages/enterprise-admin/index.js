const { ensureSession } = require("../../utils/auth");
const { request, uploadBinary } = require("../../utils/api");
const { setPageTheme } = require("../../utils/theme");
const { normalizeWebsiteUrl } = require("../../utils/website-url");
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
  { value: "horizontal-business", label: "商务横版" },
  { value: "minimal", label: "极简留白" },
  { value: "brand-image", label: "品牌封面" },
  { value: "dark", label: "深色质感" },
  { value: "campaign", label: "活动推广" }
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
    videoFeature: null,
    memberSearch: "",
    memberStatus: "all",
    panel: "",
    profileDraft: {},
    templateDraft: {},
    introDraft: emptyIntroDraft(),
    memberDraft: {},
    inviteDraft: { displayName: "", token: "", expiresAt: "" },
    joinCode: null,
    templateVariants: TEMPLATE_VARIANTS,
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
          // ignore storage cleanup failures
        }
      }
    }
    this.prepare();
  },

  onShow() {
    setPageTheme(this);
  },

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

  selectTenant(event) {
    this.enterTenant(String(event.currentTarget.dataset.id || ""), this.data.tenants);
  },

  async enterTenant(tenantId, knownTenants) {
    const tenants = knownTenants || this.data.tenants;
    const tenant = tenants.find((item) => item.tenant_id === tenantId) || null;
    this.setData({ loading: true, error: "" });
    try {
      const session = await request("/local-enterprises/admin-session", {
        method: "POST",
        data: { tenant_id: tenantId }
      });
      const selected = tenant || decorateTenant({
        tenant_id: session.tenant_id,
        tenant_name: "企业管理",
        role: "auditor"
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
      this.setData({
        overview,
        profile,
        templates: decorateTemplates(templates.items || []),
        members: decorateMembers(members.items || []),
        joinRequests: decorateJoinRequests(joinRequests.items || []),
        honors: decorateHonors(honors.items || []),
        videos: decorateVideos(videos.items || []),
        videoFeature
      });
    } catch (error) {
      this.setData({ error: formatError(error, "企业管理数据加载失败") });
    } finally {
      this.setData({ refreshing: false, loading: false });
    }
  },

  adminRequest(path, options = {}) {
    const token = this.adminToken || this.data.adminToken;
    return request(path, {
      method: options.method || "GET",
      data: options.data,
      auth: false,
      header: { authorization: `Bearer ${token}` }
    });
  },

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

  async uploadSingleVideo(onUploaded) {
    if (!this.requireAdmin() || this.data.uploading) return;
    if (this.data.videoFeature && !this.data.videoFeature.enabled) {
      wx.showToast({ title: "当前企业未开通视频功能", icon: "none" });
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

  loadMembersData() {
    const search = encodeURIComponent(this.data.memberSearch || "");
    const status = encodeURIComponent(this.data.memberStatus || "all");
    return this.adminRequest(`/admin/members?limit=50&offset=0&status=${status}&search=${search}`);
  },

  switchTab(event) {
    this.setData({ activeTab: event.currentTarget.dataset.key });
  },

  async refresh() {
    await this.loadWorkspace();
    wx.showToast({ title: "已刷新", icon: "success" });
  },

  onMemberSearch(event) {
    this.setData({ memberSearch: event.detail.value });
  },

  setMemberStatus(event) {
    this.setData({ memberStatus: event.currentTarget.dataset.status || "all" });
    this.refreshMembers();
  },

  async refreshMembers() {
    try {
      const members = await this.loadMembersData();
      this.setData({ members: decorateMembers(members.items || []) });
    } catch (error) {
      wx.showToast({ title: formatError(error, "人员加载失败"), icon: "none" });
    }
  },

  openProfilePanel() {
    const profile = this.data.profile || {};
    this.setData({
      panel: "profile",
      profileDraft: {
        display_name: profile.display_name || "",
        short_name: profile.short_name || "",
        logo_url: profile.logo_url || "",
        website_url: profile.website_url || "",
        address: profile.address || "",
        visible: profile.visible !== false,
        status: profile.status || "draft"
      }
    });
  },

  onProfileInput(event) {
    const key = event.currentTarget.dataset.key;
    this.setData({ profileDraft: { ...this.data.profileDraft, [key]: event.detail.value } });
  },

  onProfileVisible(event) {
    this.setData({ profileDraft: { ...this.data.profileDraft, visible: event.detail.value } });
  },

  setProfileStatus(event) {
    this.setData({ profileDraft: { ...this.data.profileDraft, status: event.currentTarget.dataset.status } });
  },

  uploadProfileLogo() {
    this.uploadSingleImage("logos", (url) => {
      this.setData({ "profileDraft.logo_url": url });
    });
  },

  clearProfileLogo() {
    this.setData({ "profileDraft.logo_url": "" });
  },

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
          visible: Boolean(draft.visible),
          status: draft.status === "published" ? "published" : "draft"
        }
      });
      this.setData({ profile, panel: "" });
    }, "企业信息已保存");
  },

  openTemplatePanel() {
    const selected = this.data.templates.find((item) => item.is_default) || this.data.templates[0] || {};
    this.setData({ panel: "template", templateDraft: draftFromTemplate(selected) });
  },

  chooseTemplate(event) {
    const template = this.data.templates.find((item) => item.template_id === event.currentTarget.dataset.id);
    if (template) this.setData({ templateDraft: draftFromTemplate(template) });
  },

  onTemplateInput(event) {
    const key = event.currentTarget.dataset.key;
    this.setData({ templateDraft: { ...this.data.templateDraft, [key]: event.detail.value } });
  },

  chooseVariant(event) {
    this.setData({ templateDraft: { ...this.data.templateDraft, variant: event.currentTarget.dataset.variant } });
  },

  chooseColor(event) {
    this.setData({ templateDraft: { ...this.data.templateDraft, primary: event.currentTarget.dataset.color } });
  },

  uploadTemplateLogo() {
    this.uploadSingleImage("logos", (url) => {
      this.setData({ "templateDraft.logo_url": url });
    });
  },

  clearTemplateLogo() {
    this.setData({ "templateDraft.logo_url": "" });
  },

  uploadTemplateBackground() {
    this.uploadSingleImage("templates", (url) => {
      this.setData({ "templateDraft.background_url": url });
    });
  },

  clearTemplateBackground() {
    this.setData({ "templateDraft.background_url": "" });
  },

  async saveTemplate() {
    if (!this.requireAdmin()) return;
    const draft = this.data.templateDraft;
    if (!draft.template_id) return;
    await this.saveWithToast(async () => {
      const template = await this.adminRequest(`/admin/templates/${encodeURIComponent(draft.template_id)}`, {
        method: "PUT",
        data: {
          name: textOrNull(draft.name) || "企业名片模板",
          logo_url: textOrNull(draft.logo_url),
          background_url: textOrNull(draft.background_url),
          color_scheme: { primary: draft.primary || "#5272d6", surface: draft.surface || "#ffffff" },
          layout: { variant: draft.variant || "horizontal-business" },
          status: draft.status || "active"
        }
      });
      this.mergeTemplate(template);
      this.setData({ templateDraft: draftFromTemplate(template) });
    }, "模板已保存");
  },

  async setDefaultTemplate() {
    if (!this.requireAdmin()) return;
    const draft = this.data.templateDraft;
    if (!draft.template_id) return;
    await this.saveWithToast(async () => {
      const template = await this.adminRequest(`/admin/templates/${encodeURIComponent(draft.template_id)}/default`, {
        method: "PUT"
      });
      this.mergeTemplate(template);
      this.setData({ templateDraft: draftFromTemplate(template) });
    }, "默认模板已更新");
  },

  mergeTemplate(template) {
    const templates = decorateTemplates(this.data.templates.map((item) =>
      item.template_id === template.template_id
        ? template
        : { ...item, is_default: template.is_default ? false : item.is_default }
    ));
    this.setData({ templates });
  },

  openIntroPanel() {
    const profile = this.data.profile || {};
    this.setData({
      panel: "intro",
      introDraft: {
        ...emptyIntroDraft(),
        display_modules: decorateModules(profile.display_modules || []),
        intro_blocks: decorateIntroBlocks(profile.intro_blocks || []),
        service_items: decorateServices(profile.service_items || [])
      }
    });
  },

  switchIntroSection(event) {
    this.setData({
      introDraft: {
        ...this.data.introDraft,
        activeSection: event.currentTarget.dataset.section || "profile"
      }
    });
  },

  toggleIntroModule(event) {
    const index = Number(event.currentTarget.dataset.index);
    const modules = cloneArray(this.data.introDraft.display_modules);
    if (!modules[index]) return;
    modules[index].visible = event.detail.value;
    this.setData({ introDraft: { ...this.data.introDraft, display_modules: modules } });
  },

  chooseModuleLayout(event) {
    const index = Number(event.currentTarget.dataset.index);
    const layoutIndex = Number(event.detail.value);
    const modules = cloneArray(this.data.introDraft.display_modules);
    if (!modules[index] || !MODULE_LAYOUTS[layoutIndex]) return;
    modules[index].layout = MODULE_LAYOUTS[layoutIndex].value;
    modules[index].layoutLabel = MODULE_LAYOUTS[layoutIndex].label;
    this.setData({ introDraft: { ...this.data.introDraft, display_modules: modules } });
  },

  onIntroInput(event) {
    const key = event.currentTarget.dataset.key;
    this.setData({ introDraft: { ...this.data.introDraft, [key]: event.detail.value } });
  },

  uploadIntroImage() {
    this.uploadSingleImage("company-images", (url) => {
      this.setData({ "introDraft.imageUrl": url });
    });
  },

  clearIntroImage() {
    this.setData({ "introDraft.imageUrl": "" });
  },

  uploadIntroGallery() {
    this.uploadMultipleImages("company-images", (urls) => {
      const images = normalizeGalleryImages(this.data.introDraft.galleryImages)
        .concat(urls.map((url) => ({ url, caption: "" })))
        .slice(0, 12);
      this.setData({ "introDraft.galleryImages": images });
    });
  },

  onGalleryImageInput(event) {
    const index = Number(event.currentTarget.dataset.index);
    const key = event.currentTarget.dataset.key || "caption";
    const images = normalizeGalleryImages(this.data.introDraft.galleryImages);
    if (!images[index]) return;
    images[index] = { ...images[index], [key]: event.detail.value };
    this.setData({ "introDraft.galleryImages": images });
  },

  removeGalleryImage(event) {
    const index = Number(event.currentTarget.dataset.index);
    const images = normalizeGalleryImages(this.data.introDraft.galleryImages);
    if (!images[index]) return;
    images.splice(index, 1);
    this.setData({ "introDraft.galleryImages": images });
  },

  setIntroBlockType(event) {
    this.setData({
      introDraft: {
        ...this.data.introDraft,
        blockType: event.currentTarget.dataset.type || "paragraph"
      }
    });
  },

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

  cancelIntroBlockEdit() {
    this.setData({
      introDraft: {
        ...this.data.introDraft,
        ...emptyIntroBlockFields(this.data.introDraft.blockType),
        editingBlockIndex: -1
      }
    });
  },

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
      }
    });
  },

  moveIntroBlock(event) {
    const index = Number(event.currentTarget.dataset.index);
    const direction = event.currentTarget.dataset.direction === "up" ? -1 : 1;
    const blocks = stripIntroBlockRuntime(this.data.introDraft.intro_blocks);
    const nextIndex = index + direction;
    if (!blocks[index] || !blocks[nextIndex]) return;
    [blocks[index], blocks[nextIndex]] = [blocks[nextIndex], blocks[index]];
    this.setData({ introDraft: { ...this.data.introDraft, intro_blocks: decorateIntroBlocks(blocks) } });
  },

  removeIntroBlock(event) {
    const index = Number(event.currentTarget.dataset.index);
    const blocks = stripIntroBlockRuntime(this.data.introDraft.intro_blocks);
    blocks.splice(index, 1);
    this.setData({ introDraft: { ...this.data.introDraft, intro_blocks: decorateIntroBlocks(blocks) } });
  },

  onServiceInput(event) {
    const key = event.currentTarget.dataset.key;
    this.setData({
      introDraft: {
        ...this.data.introDraft,
        serviceDraft: { ...this.data.introDraft.serviceDraft, [key]: event.detail.value }
      }
    });
  },

  onServiceVisible(event) {
    this.setData({
      introDraft: {
        ...this.data.introDraft,
        serviceDraft: { ...this.data.introDraft.serviceDraft, visible: event.detail.value }
      }
    });
  },

  uploadServiceImage() {
    this.uploadSingleImage("company-images", (url) => {
      this.setData({ "introDraft.serviceDraft.image_url": url });
    });
  },

  clearServiceImage() {
    this.setData({ "introDraft.serviceDraft.image_url": "" });
  },

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

  cancelServiceEdit() {
    this.setData({
      introDraft: {
        ...this.data.introDraft,
        editingServiceIndex: -1,
        serviceDraft: emptyServiceDraft()
      }
    });
  },

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
      }
    });
  },

  moveServiceItem(event) {
    const index = Number(event.currentTarget.dataset.index);
    const direction = event.currentTarget.dataset.direction === "up" ? -1 : 1;
    const services = stripServiceRuntime(this.data.introDraft.service_items);
    const nextIndex = index + direction;
    if (!services[index] || !services[nextIndex]) return;
    [services[index], services[nextIndex]] = [services[nextIndex], services[index]];
    this.setData({ introDraft: { ...this.data.introDraft, service_items: decorateServices(resequenceSort(services)) } });
  },

  removeServiceItem(event) {
    const index = Number(event.currentTarget.dataset.index);
    const services = stripServiceRuntime(this.data.introDraft.service_items);
    services.splice(index, 1);
    this.setData({ introDraft: { ...this.data.introDraft, service_items: decorateServices(resequenceSort(services)) } });
  },

  startCreateVideo() {
    this.setData({
      introDraft: {
        ...this.data.introDraft,
        editingVideoId: "",
        videoDraft: emptyVideoDraft()
      }
    });
  },

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

  cancelVideoEdit() {
    this.setData({
      introDraft: {
        ...this.data.introDraft,
        editingVideoId: "",
        videoDraft: emptyVideoDraft()
      }
    });
  },

  onVideoInput(event) {
    const key = event.currentTarget.dataset.key;
    this.setData({
      introDraft: {
        ...this.data.introDraft,
        videoDraft: { ...this.data.introDraft.videoDraft, [key]: event.detail.value }
      }
    });
  },

  onVideoVisible(event) {
    this.setData({
      introDraft: {
        ...this.data.introDraft,
        videoDraft: { ...this.data.introDraft.videoDraft, visible: event.detail.value }
      }
    });
  },

  setVideoStatus(event) {
    this.setData({
      introDraft: {
        ...this.data.introDraft,
        videoDraft: { ...this.data.introDraft.videoDraft, status: event.currentTarget.dataset.status || "draft" }
      }
    });
  },

  uploadVideoFile() {
    this.uploadSingleVideo((url) => {
      this.setData({ "introDraft.videoDraft.video_url": url });
    });
  },

  clearVideoFile() {
    this.setData({ "introDraft.videoDraft.video_url": "" });
  },

  uploadVideoCover() {
    this.uploadSingleImage("company-images", (url) => {
      this.setData({ "introDraft.videoDraft.cover_url": url });
    });
  },

  clearVideoCover() {
    this.setData({ "introDraft.videoDraft.cover_url": "" });
  },

  async saveVideoDraft() {
    if (!this.requireAdmin()) return;
    if (this.data.videoFeature && !this.data.videoFeature.enabled) {
      wx.showToast({ title: "当前企业未开通视频功能", icon: "none" });
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
      this.setData({
        videos: decorateVideos(videos),
        introDraft: {
          ...this.data.introDraft,
          editingVideoId: "",
          videoDraft: emptyVideoDraft()
        }
      });
    }, "视频已保存");
  },

  async deleteVideoItem(event) {
    if (!this.requireAdmin()) return;
    const videoId = String(event.currentTarget.dataset.id || "");
    const ok = await confirm("删除视频", "删除后该视频将不再展示。");
    if (!ok) return;
    await this.saveWithToast(async () => {
      await this.adminRequest(`/admin/company-videos/${encodeURIComponent(videoId)}`, { method: "DELETE" });
      this.setData({ videos: this.data.videos.filter((item) => item.video_id !== videoId) });
    }, "视频已删除");
  },

  addVideoBlockFromList(event) {
    const videoId = String(event.currentTarget.dataset.id || "");
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
      }
    });
  },

  startCreateHonor() {
    this.setData({
      introDraft: {
        ...this.data.introDraft,
        editingHonorId: "",
        honorDraft: emptyHonorDraft()
      }
    });
  },

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

  cancelHonorEdit() {
    this.setData({
      introDraft: {
        ...this.data.introDraft,
        editingHonorId: "",
        honorDraft: emptyHonorDraft()
      }
    });
  },

  onHonorInput(event) {
    const key = event.currentTarget.dataset.key;
    this.setData({
      introDraft: {
        ...this.data.introDraft,
        honorDraft: { ...this.data.introDraft.honorDraft, [key]: event.detail.value }
      }
    });
  },

  onHonorVisible(event) {
    this.setData({
      introDraft: {
        ...this.data.introDraft,
        honorDraft: { ...this.data.introDraft.honorDraft, visible: event.detail.value }
      }
    });
  },

  setHonorStatus(event) {
    this.setData({
      introDraft: {
        ...this.data.introDraft,
        honorDraft: { ...this.data.introDraft.honorDraft, status: event.currentTarget.dataset.status || "draft" }
      }
    });
  },

  uploadHonorImages() {
    this.uploadMultipleImages("honors", (urls) => {
      const images = normalizeHonorImages(this.data.introDraft.honorDraft.images)
        .concat(urls.map((url) => ({ image_url: url, title: "", caption: "" })))
        .slice(0, 12);
      this.setData({
        "introDraft.honorDraft.images": resequenceHonorImages(images)
      });
    });
  },

  onHonorImageInput(event) {
    const index = Number(event.currentTarget.dataset.index);
    const key = event.currentTarget.dataset.key || "caption";
    const images = normalizeHonorImages(this.data.introDraft.honorDraft.images);
    if (!images[index]) return;
    images[index] = { ...images[index], [key]: event.detail.value };
    this.setData({ "introDraft.honorDraft.images": resequenceHonorImages(images) });
  },

  removeHonorImage(event) {
    const index = Number(event.currentTarget.dataset.index);
    const images = normalizeHonorImages(this.data.introDraft.honorDraft.images);
    if (!images[index]) return;
    images.splice(index, 1);
    this.setData({ "introDraft.honorDraft.images": resequenceHonorImages(images) });
  },

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
      this.setData({
        honors: decorateHonors(honors),
        introDraft: {
          ...this.data.introDraft,
          editingHonorId: "",
          honorDraft: emptyHonorDraft()
        }
      });
    }, "荣誉已保存");
  },

  async deleteHonorItem(event) {
    if (!this.requireAdmin()) return;
    const honorId = String(event.currentTarget.dataset.id || "");
    const ok = await confirm("删除荣誉", "删除后该荣誉资质将不再展示。");
    if (!ok) return;
    await this.saveWithToast(async () => {
      await this.adminRequest(`/admin/company-honors/${encodeURIComponent(honorId)}`, { method: "DELETE" });
      this.setData({ honors: this.data.honors.filter((item) => item.honor_id !== honorId) });
    }, "荣誉已删除");
  },

  async saveIntro() {
    if (!this.requireAdmin()) return;
    const draft = this.data.introDraft;
    await this.saveWithToast(async () => {
      const profile = await this.adminRequest("/admin/company-profile", {
        method: "PUT",
        data: {
          intro_blocks: stripIntroBlockRuntime(draft.intro_blocks),
          service_items: stripServiceRuntime(draft.service_items),
          display_modules: stripModuleLabels(draft.display_modules),
          status: "published"
        }
      });
      this.setData({ profile, panel: "" });
    }, "企业介绍已保存");
  },

  async openMemberEditor(event) {
    if (!this.data.permissions.canOperator) {
      wx.showToast({ title: "当前角色无权编辑人员", icon: "none" });
      return;
    }
    const memberId = event.currentTarget.dataset.id;
    try {
      const card = await this.adminRequest(`/admin/members/${encodeURIComponent(memberId)}/card`);
      this.setData({
        panel: "member",
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

  onMemberDraftInput(event) {
    const key = event.currentTarget.dataset.key;
    this.setData({ memberDraft: { ...this.data.memberDraft, [key]: event.detail.value } });
  },

  setMemberDraftStatus(event) {
    this.setData({ memberDraft: { ...this.data.memberDraft, status: event.currentTarget.dataset.status } });
  },

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
      this.setData({ panel: "" });
      await this.refreshMembers();
    }, "人员名片已保存");
  },

  async toggleMemberStatus(event) {
    if (!this.data.permissions.canOperator) {
      wx.showToast({ title: "当前角色无权操作人员", icon: "none" });
      return;
    }
    const memberId = event.currentTarget.dataset.id;
    const status = event.currentTarget.dataset.status === "active" ? "disabled" : "active";
    await this.saveWithToast(async () => {
      await this.adminRequest(`/admin/members/${encodeURIComponent(memberId)}/card`, {
        method: "PUT",
        data: { status }
      });
      await this.refreshMembers();
    }, status === "active" ? "名片已启用" : "名片已停用");
  },

  async deleteMember(event) {
    if (!this.requireAdmin()) return;
    const memberId = event.currentTarget.dataset.id;
    const ok = await confirm("删除成员", "删除后该成员名片将不可访问。");
    if (!ok) return;
    await this.saveWithToast(async () => {
      await this.adminRequest(`/admin/members/${encodeURIComponent(memberId)}`, { method: "DELETE" });
      await this.refreshMembers();
    }, "成员已删除");
  },

  async syncMembers() {
    if (!this.requireAdmin()) return;
    await this.saveWithToast(async () => {
      await this.adminRequest("/admin/members/sync", { method: "POST" });
      await this.refreshMembers();
    }, "成员同步已发起");
  },

  async createJoinCode() {
    if (!this.requireAdmin()) return;
    await this.saveWithToast(async () => {
      const joinCode = await this.adminRequest("/admin/local-enterprises/join-code", { method: "POST" });
      this.setData({ joinCode: { ...joinCode, expires_at: formatDateTime(joinCode.expires_at) } });
    }, "入企码已生成");
  },

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

  openInvitePanel() {
    this.setData({ panel: "invite", inviteDraft: { displayName: "", token: "", expiresAt: "" } });
  },

  onInviteInput(event) {
    this.setData({ inviteDraft: { ...this.data.inviteDraft, displayName: event.detail.value } });
  },

  async createInvitation() {
    if (!this.requireAdmin()) return;
    const displayName = String(this.data.inviteDraft.displayName || "").trim();
    if (!displayName) {
      wx.showToast({ title: "请输入成员姓名", icon: "none" });
      return;
    }
    await this.saveWithToast(async () => {
      const invitation = await this.adminRequest("/admin/local-enterprises/members/invitations", {
        method: "POST",
        data: { display_name: displayName }
      });
      this.setData({
        inviteDraft: {
          displayName,
          token: invitation.invitation_token || "",
          expiresAt: invitation.expires_at || ""
        }
      });
    }, "邀请已创建");
  },

  copyInviteToken() {
    const token = this.data.inviteDraft.token;
    if (!token) return;
    wx.setClipboardData({ data: token });
  },

  copyJoinPath() {
    const path = this.data.joinCode && this.data.joinCode.join_path;
    if (!path) return;
    wx.setClipboardData({ data: path });
  },

  closePanel() {
    this.setData({ panel: "" });
  },

  requireAdmin() {
    if (this.data.permissions.canAdmin) return true;
    wx.showToast({ title: "当前角色无权执行该操作", icon: "none" });
    return false;
  },

  async saveWithToast(action, title) {
    this.setData({ saving: true, error: "" });
    try {
      await action();
      wx.showToast({ title, icon: "success" });
    } catch (error) {
      wx.showToast({ title: formatError(error, "保存失败"), icon: "none" });
    } finally {
      this.setData({ saving: false });
    }
  },

  goHome() {
    wx.switchTab({ url: "/pages/employee/index" });
  }
});

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

function emptyHonorDraft() {
  return {
    title: "",
    body: "",
    images: [],
    sort_order: "",
    visible: true,
    status: "draft"
  };
}

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
      wx.showToast({ title: "当前企业未开通视频功能", icon: "none" });
      return null;
    }
    const videoId = String(draft.videoId || "").trim();
    if (!/^\d+$/.test(videoId)) {
      wx.showToast({ title: "请输入数字视频 ID", icon: "none" });
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
      return { ...block, _label: label, _summary: `视频 ID ${block.video_id || ""}` };
    }
    return { ...block, _label: label, _summary: block.text || "" };
  });
}

function stripIntroBlockRuntime(blocks) {
  return cloneArray(blocks).filter((block) => block && typeof block === "object").map((block) => {
    const { _label, _summary, _cover, ...rest } = block;
    return rest;
  });
}

function introBlockLabel(type) {
  const found = INTRO_BLOCK_TYPES.find((item) => item.value === type);
  return found ? found.label : type || "内容";
}

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

function stripServiceRuntime(items) {
  return cloneArray(items).filter((item) => item && typeof item === "object").map((item) => {
    const { _cover, _summary, _visibleLabel, ...rest } = item;
    return rest;
  });
}

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

function parseLines(value) {
  return String(value || "")
    .split(/\n|；|;/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function normalizeGalleryImages(value) {
  return cloneArray(value).slice(0, 12).map((image) => ({
    url: String((image && image.url) || "").trim(),
    caption: String((image && image.caption) || "").trim()
  })).filter((image) => image.url);
}

function normalizeHonorImages(value) {
  return cloneArray(value).slice(0, 12).map((image, index) => ({
    image_url: String((image && image.image_url) || "").trim(),
    title: textOrNull(image && image.title),
    caption: textOrNull(image && image.caption),
    sort_order: numberOrDefault(image && image.sort_order, (index + 1) * 10)
  })).filter((image) => image.image_url);
}

function resequenceHonorImages(images) {
  return normalizeHonorImages(images).map((image, index) => ({
    ...image,
    sort_order: (index + 1) * 10
  }));
}

function isBackendAssetSource(value) {
  const text = String(value || "").trim();
  return /^https?:\/\//.test(text) || text.startsWith("/api/v1/storage/") || text.startsWith("/api/v1/demo-assets/");
}

function numberOrNull(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : null;
}

function numberOrDefault(value, fallback) {
  const number = numberOrNull(value);
  return number === null ? fallback : number;
}

function resequenceSort(items) {
  return items.map((item, index) => ({ ...item, sort_order: (index + 1) * 10 }));
}

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
    wx.showToast({ title: "当前微信版本暂不支持选择媒体", icon: "none" });
    resolve([]);
  });
}

function tempFilePath(file) {
  return file && (file.tempFilePath || file.path || "");
}

function fileNameFromPath(filePath, fallback) {
  const clean = String(filePath || "").split("?")[0] || "";
  const name = clean.split(/[\\/]/).filter(Boolean).pop() || "";
  return name.includes(".") ? name : fallback;
}

function imageContentType(filePath) {
  const ext = extensionFromPath(filePath);
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}

function videoContentType(filePath) {
  const ext = extensionFromPath(filePath);
  return ext === "mp4" ? "video/mp4" : "video/mp4";
}

function extensionFromPath(filePath) {
  const match = String(filePath || "").toLowerCase().match(/\.([a-z0-9]+)(?:\?|$)/);
  return match ? match[1] : "";
}

function decorateTenant(item) {
  const name = item.tenant_name || "企业";
  return {
    tenant_id: String(item.tenant_id || ""),
    tenant_name: name,
    role: item.role || "auditor",
    roleLabel: ROLE_LABELS[item.role] || item.role || "管理员",
    initial: name.slice(0, 1) || "企"
  };
}

function permissionsFor(role) {
  const rank = ROLE_RANK[role] || 0;
  return {
    canAdmin: rank >= ROLE_RANK.admin,
    canOperator: rank >= ROLE_RANK.operator
  };
}

function decorateTemplates(items) {
  return items.map((item) => ({
    ...item,
    variant: (item.layout && item.layout.variant) || "horizontal-business",
    variantLabel: variantLabel((item.layout && item.layout.variant) || "horizontal-business"),
    primary: (item.color_scheme && item.color_scheme.primary) || "#5272d6"
  }));
}

function decorateMembers(items) {
  return items.map((item) => ({
    ...item,
    initial: (item.display_name || "成").slice(0, 1),
    statusLabel: item.card_status === "active" ? "名片启用" : "名片停用",
    statusClass: item.card_status === "active" ? "badge--success" : "badge--warning"
  }));
}

function decorateJoinRequests(items) {
  return items.map((item) => ({
    ...item,
    createdAt: formatDateTime(item.createdAt)
  }));
}

function draftFromTemplate(template) {
  return {
    template_id: template.template_id || "",
    name: template.name || "",
    logo_url: template.logo_url || "",
    background_url: template.background_url || "",
    primary: (template.color_scheme && template.color_scheme.primary) || template.primary || "#5272d6",
    surface: (template.color_scheme && template.color_scheme.surface) || "#ffffff",
    variant: (template.layout && template.layout.variant) || template.variant || "horizontal-business",
    status: template.status || "active",
    is_default: Boolean(template.is_default)
  };
}

function variantLabel(value) {
  const found = TEMPLATE_VARIANTS.find((item) => item.value === value);
  return found ? found.label : "商务横版";
}

function stripModuleLabels(modules) {
  return modules.map((item) => ({
    key: item.key,
    title: item.title,
    visible: Boolean(item.visible),
    sort_order: Number(item.sort_order || 0),
    layout: item.layout || "graphic"
  }));
}

function decorateModules(modules) {
  return cloneArray(modules).map((item) => {
    const layout = MODULE_LAYOUTS.find((layoutItem) => layoutItem.value === item.layout);
    return { ...item, layoutLabel: layout ? layout.label : "图文" };
  });
}

function cloneArray(value) {
  return JSON.parse(JSON.stringify(value || []));
}

function textOrNull(value) {
  const text = String(value || "").trim();
  return text || null;
}

function formatError(error, fallback) {
  return error && error.message ? error.message : fallback;
}

function formatDateTime(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return value || "";
  const pad = (num) => String(num).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

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
