Page({
  data: {
    // M1 无对应接口，以下为设计还原用的演示数据
    company: {
      name: "Demo Tenant 云图科技",
      certified: true,
      stats: [
        { num: "128", label: "在职成员" },
        { num: "460+", label: "服务客户" },
        { num: "2015", label: "成立年份" }
      ],
      intro: "云图科技专注企业数字化名片与获客解决方案，为中大型企业提供统一对外形象与员工名片管理。",
      quals: ["国家高新技术企业", "ISO27001 认证", "双软认证"],
      address: "上海市浦东新区张江高科技园区",
      phone: "021-6000 0000",
      website: "www.yuntu.example.com"
    },
    departments: [
      {
        name: "市场部",
        members: [
          { id: "m1", name: "李明哲", title: "市场总监", self: true },
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
