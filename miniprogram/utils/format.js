function pad(value) {
  return String(value).padStart(2, "0");
}

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

function mapRecentVisitors(recentVisitors, options = {}) {
  const cardName = options.cardName || "名片";
  const anonymous = {
    id: "anonymous",
    name: "",
    title: "",
    meta: "",
    state: "anonymous",
    time: "",
    visitCount: 0,
    peopleCount: 0,
    isAnonymous: true,
    canExchange: false
  };
  const mapped = [];

  (recentVisitors || []).forEach((item, index) => {
    const isAnonymous = isAnonymousVisitor(item);
    if (isAnonymous) {
      anonymous.peopleCount += 1;
      anonymous.visitCount += Number(item.visit_count || 0);
      if (!anonymous.lastVisitAt || isNewer(item.last_visit_at, anonymous.lastVisitAt)) {
        anonymous.time = formatVisitTime(item.last_visit_at);
        anonymous.lastVisitAt = item.last_visit_at;
      }
      return;
    }

    mapped.push({
      id: item.visitor_key || String(index),
      name: item.visitor_label || "微信访客",
      title: item.visitor_title || item.visitor_company || (item.channel ? "通过分享链接访问" : `访问了${cardName}`),
      meta: `访问 ${item.visit_count} 次`,
      state: item.state || "none",
      time: formatVisitTime(item.last_visit_at),
      avatarUrl: item.avatar_url || item.visitor_avatar_url || "",
      visitCount: Number(item.visit_count || 0),
      isAnonymous: false,
      canExchange: true
    });
  });

  if (anonymous.peopleCount > 0) {
    anonymous.name = `${anonymous.peopleCount}人`;
    anonymous.title = `访问了${cardName}${anonymous.visitCount}次`;
    anonymous.meta = `访问 ${anonymous.visitCount} 次`;
    delete anonymous.lastVisitAt;
    mapped.push(anonymous);
  }

  return mapped;
}

function isAnonymousVisitor(item) {
  const label = String((item && item.visitor_label) || "").toLowerCase();
  return !item || item.is_anonymous === true || item.trust_level === "anonymous_client" || label.includes("匿名");
}

function isNewer(next, current) {
  return new Date(next).getTime() > new Date(current).getTime();
}

module.exports = { formatVisitTime, mapRecentVisitors };
