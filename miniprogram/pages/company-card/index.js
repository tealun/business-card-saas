Page({
  data: {
    demoMode: true,
    company: {
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
    },
    departments: [
      {
        name: "市场部",
        members: [
          { id: "m1", name: "李明", title: "销售总监", self: true },
          { id: "m2", name: "王思远", title: "品牌经理", self: false }
        ]
      },
      {
        name: "商务部",
        members: [
          { id: "m3", name: "陈可欣", title: "商务拓展", self: false }
        ]
      }
    ]
  },

  copyWebsite() {
    wx.setClipboardData({ data: this.data.company.website, success() { wx.showToast({ title: "官网已复制", icon: "none" }); } });
  },

  copyAddress() {
    wx.setClipboardData({ data: this.data.company.address, success() { wx.showToast({ title: "地址已复制", icon: "none" }); } });
  },

  callCompany() {
    wx.makePhoneCall({ phoneNumber: this.data.company.phone, fail() {} });
  },

  followCompany() {
    wx.showToast({ title: "已关注企业", icon: "success" });
  }
});
