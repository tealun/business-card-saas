export function normalizeWebsiteUrlValue(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  const text = value.trim();
  if (!text) {
    return null;
  }

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
    return text;
  }

  if (text.startsWith("//")) {
    const candidate = `https:${text}`;
    try {
      new URL(candidate);
      return candidate;
    } catch {
      return text;
    }
  }

  const candidate = `https://${text}`;
  try {
    new URL(candidate);
    return candidate;
  } catch {
    return text;
  }
}
