function normalizeWebsiteUrl(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) return text;
  if (text.startsWith("//")) return `https:${text}`;
  const candidate = `https://${text}`;
  try {
    new URL(candidate);
    return candidate;
  } catch (_error) {
    return text;
  }
}

module.exports = { normalizeWebsiteUrl };
