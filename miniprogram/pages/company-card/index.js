const app = getApp();

// 未登录时的演示样例（页面顶部有“演示样例”横幅说明）。
// 登录后展示当前身份的真实租户名 + 待完善空态，绝不把演示企业当真数据。
const demoCompany = {
  name: "智云科技",
  fullName: "智云科技（深圳）有限公司",
  certified: true,
  stats: [
    { num: "128", label: "在职成员" },
    { num: "460+", label: "服务客户" },
    { num: "2015", label: "成立年份" }
  ],
  intro: "智云科技专注企业数字化名片与获客解决方案，为中大型企业提供统一对外形象、员工名片管理与客户转化追踪。",
  quals: ["国家高新技术企业", "ISO27001 认证", "双软认证"],
  address: "深圳市南山区科技园",
  phone: "0755-8888 0000",
  website: "www.zhiyun.tech"
};

const demoDepartments = [
  {
    name: "市场部",
    members: [
      { id: "m1", name: "李明", title: "销售总监", self: true },
      { id: "m2", name: "王思远", title: "品牌经理", self: false }
    ]
  },
  {
    name: "商务部",
    members: [{ id: "m3", name: "陈可欣", title: "商务拓展", self: false }]
  }
];

Page({
  data: {
    demoMode: true,
    loggedIn: false,
    isPersonal: false,
    company: demoCompany,
    departments: demoDepartments
  },

  onLoginSuccess() {
    this.onShow();
  },

  onShow() {
    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }
    const identity = app.globalData.currentIdentity;
    if (!app.globalData.token || !identity) {
      this.setData({
        demoMode: true,
        loggedIn: false,
        isPersonal: false,
        company: demoCompany,
        departments: demoDepartments
      });
      return;
    }
    const isPersonal = identity.identity_type === "personal";
    const tenantName = identity.tenant_name || "我的企业";
    this.setData({
      demoMode: false,
      loggedIn: true,
      isPersonal,
      company: {
        name: isPersonal ? "个人名片" : tenantName,
        fullName: isPersonal ? "个人名片" : tenantName,
        certified: false,
        stats: [],
        intro: "",
        quals: [],
        address: "",
        phone: "",
        website: ""
      },
      departments: []
    });
  },

  copyWebsite() {
    if (!this.data.company.website) {
      wx.showToast({ title: "企业官网未配置", icon: "none" });
      return;
    }
    wx.setClipboardData({ data: this.data.company.website, success() { wx.showToast({ title: "官网已复制", icon: "none" }); } });
  },

  copyAddress() {
    if (!this.data.company.address) {
      wx.showToast({ title: "企业地址未配置", icon: "none" });
      return;
    }
    wx.setClipboardData({ data: this.data.company.address, success() { wx.showToast({ title: "地址已复制", icon: "none" }); } });
  },

  callCompany() {
    if (!this.data.company.phone) {
      wx.showToast({ title: "企业电话未配置", icon: "none" });
      return;
    }
    wx.makePhoneCall({ phoneNumber: this.data.company.phone, fail() {} });
  },

  followCompany() {
    wx.showToast({ title: "关注功能即将上线", icon: "none" });
  }
});
