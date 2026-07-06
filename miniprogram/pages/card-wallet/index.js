Page({
  data: {
    activeTab: "visitors",
    tabs: [
      { key: "visitors", label: "我的访客", count: 328 },
      { key: "viewed", label: "我看过的", count: 56 },
      { key: "friends", label: "好友名片", count: 4 }
    ],
    keyword: "",
    groups: [
      {
        title: "今天",
        items: [
          { id: "v1", name: "李明浩", title: "产品总监 · 星河科技", meta: "访问 3 次", state: "exchanged", time: "10:24" },
          { id: "v2", name: "王思远", title: "商务拓展 · 云图数据", meta: "访问 1 次", state: "pending", time: "09:12" }
        ]
      },
      {
        title: "本周",
        items: [
          { id: "v3", name: "陈可欣", title: "市场经理 · 万联传媒", meta: "访问 2 次", state: "none", time: "周一" },
          { id: "v4", name: "赵启航", title: "技术负责人 · 智造科技", meta: "访问 5 次", state: "exchanged", time: "周日" }
        ]
      }
    ]
  },

  switchTab(event) {
    this.setData({ activeTab: event.currentTarget.dataset.key });
  },

  onSearch(event) {
    this.setData({ keyword: event.detail.value });
  },

  exchange(event) {
    const id = event.currentTarget.dataset.id;
    const groups = this.data.groups.map((group) => ({
      title: group.title,
      items: group.items.map((item) => (item.id === id ? Object.assign({}, item, { state: "pending" }) : item))
    }));
    this.setData({ groups });
    wx.showToast({ title: "已发起交换", icon: "none" });
  },

  goSendCard() {
    wx.switchTab({ url: "/pages/employee/index" });
  }
});
