Page({
  data: {
    // 访客/交换后端功能未上线：空数据 + 空态，不再展示演示人名。
    demoMode: true,
    activeTab: "visitors",
    tabs: [
      { key: "visitors", label: "我的访客", count: 0 },
      { key: "viewed", label: "我看过的", count: 0 },
      { key: "friends", label: "好友名片", count: 0 }
    ],
    keyword: "",
    groups: []
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
