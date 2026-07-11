function pad(value) {
  return String(value).padStart(2, "0");
}

// ISO 时间 → 今天显示 HH:mm，其余显示 MM-DD
function formatVisitTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function mapRecentVisitors(recentVisitors) {
  return (recentVisitors || []).map((item, index) => ({
    id: item.visitor_key || String(index),
    name: `${item.visitor_label || "访客"} ${index + 1}`,
    title: item.channel ? "通过分享链接访问" : "访问了你的名片",
    meta: `访问 ${item.visit_count} 次`,
    state: "none",
    time: formatVisitTime(item.last_visit_at)
  }));
}

module.exports = { formatVisitTime, mapRecentVisitors };
