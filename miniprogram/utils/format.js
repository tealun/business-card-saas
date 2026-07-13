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
  const mapped = [];

  (recentVisitors || []).forEach((item, index) => {
    const isAnonymous = isAnonymousVisitor(item);
    const visitedCardName = item.card_name || cardName;
    const visitCount = Number(item.visit_count || 0);
    const peopleCount = Number(item.visitor_count || 1);

    mapped.push({
      id: `${item.card_id || item.public_id || "card"}:${item.visitor_key || index}`,
      name: isAnonymous ? `匿名访客 ${peopleCount} 人` : item.visitor_label || "微信访客",
      title: `访问了${visitedCardName}${visitCount}次`,
      meta: "",
      state: isAnonymous ? "anonymous" : item.state || "none",
      time: formatVisitTime(item.last_visit_at),
      avatarUrl: item.avatar_url || item.visitor_avatar_url || "",
      visitCount,
      peopleCount,
      isAnonymous,
      canExchange: !isAnonymous,
      cardId: item.card_id || "",
      publicId: item.public_id || ""
    });
  });

  return mapped;
}

function isAnonymousVisitor(item) {
  const label = String((item && item.visitor_label) || "").toLowerCase();
  return !item || item.is_anonymous === true || item.trust_level === "anonymous_client" || label.includes("匿名");
}

module.exports = { formatVisitTime, mapRecentVisitors };
