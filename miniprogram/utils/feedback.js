function showNotice(message, title = "提示") {
  const content = String(message || "操作暂时无法完成").trim();
  return new Promise((resolve) => {
    wx.showModal({
      title,
      content,
      showCancel: false,
      confirmText: "知道了",
      complete: resolve
    });
  });
}

function showRestriction(message) {
  return showNotice(message, "暂时无法操作");
}

function showError(error, fallback = "操作失败，请稍后重试") {
  const message = String((error && (error.message || error.errMsg)) || fallback).trim();
  return showNotice(message || fallback, "操作失败");
}

module.exports = { showNotice, showRestriction, showError };
