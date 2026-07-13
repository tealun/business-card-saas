const SHARE_IMAGE_WIDTH = 500;
const SHARE_IMAGE_HEIGHT = 400;
const CARD_X = 55;
const CARD_Y = 48;
const CARD_W = 390;
const CARD_H = 232;

function buildShareCardImage(page, options = {}) {
  if (!page || typeof page.createSelectorQuery !== "function") {
    return Promise.resolve("");
  }
  return new Promise((resolve) => {
    page
      .createSelectorQuery()
      .select("#shareCardCanvas")
      .fields({ node: true, size: true })
      .exec((res) => {
        const node = res && res[0] && res[0].node;
        if (!node) {
          resolve("");
          return;
        }
        try {
          const dpr = (wx.getSystemInfoSync && wx.getSystemInfoSync().pixelRatio) || 2;
          node.width = SHARE_IMAGE_WIDTH * dpr;
          node.height = SHARE_IMAGE_HEIGHT * dpr;
          const ctx = node.getContext("2d");
          ctx.scale(dpr, dpr);
          drawShareCard(ctx, options);
          wx.canvasToTempFilePath(
            {
              canvas: node,
              width: SHARE_IMAGE_WIDTH,
              height: SHARE_IMAGE_HEIGHT,
              destWidth: SHARE_IMAGE_WIDTH * dpr,
              destHeight: SHARE_IMAGE_HEIGHT * dpr,
              fileType: "jpg",
              quality: 0.92,
              success(result) {
                resolve(result.tempFilePath || "");
              },
              fail() {
                resolve("");
              }
            },
            page
          );
        } catch (_error) {
          resolve("");
        }
      });
  });
}

function drawShareCard(ctx, options) {
  const theme = normalizeTheme(options.theme || {});
  const card = normalizeCard(options.card || {});
  const meta = options.meta || {};
  const dark = isDarkTemplate(options.templateClass || "");
  const brandImage = isBrandTemplate(options.templateClass || "");
  const surface = dark ? "#161b22" : brandImage ? theme.brand : "#ffffff";
  const primary = dark || brandImage ? "#ffffff" : "#1f2329";
  const secondary = dark ? "#a8c5ff" : brandImage ? "rgba(255,255,255,0.82)" : "#697282";

  drawShareBackground(ctx, theme);

  ctx.save();
  roundedRect(ctx, CARD_X, CARD_Y, CARD_W, CARD_H, 20);
  ctx.shadowColor = "rgba(16, 24, 40, 0.24)";
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 16;
  ctx.fillStyle = surface;
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundedRect(ctx, CARD_X, CARD_Y, CARD_W, CARD_H, 20);
  ctx.clip();
  if (dark) {
    const gradient = ctx.createLinearGradient(CARD_X, CARD_Y, CARD_X + CARD_W, CARD_Y + CARD_H);
    gradient.addColorStop(0, "#111827");
    gradient.addColorStop(1, "#1f2937");
    ctx.fillStyle = gradient;
    ctx.fillRect(CARD_X, CARD_Y, CARD_W, CARD_H);
  } else if (brandImage) {
    const gradient = ctx.createLinearGradient(CARD_X, CARD_Y, CARD_X + CARD_W, CARD_Y + CARD_H);
    gradient.addColorStop(0, theme.brandDeep);
    gradient.addColorStop(0.58, theme.brand);
    gradient.addColorStop(1, theme.brandSoft);
    ctx.fillStyle = gradient;
    ctx.fillRect(CARD_X, CARD_Y, CARD_W, CARD_H);
  } else if (isCampaignTemplate(options.templateClass || "")) {
    const gradient = ctx.createLinearGradient(CARD_X, CARD_Y, CARD_X + CARD_W, CARD_Y + 92);
    gradient.addColorStop(0, theme.brand);
    gradient.addColorStop(1, theme.brandSoft);
    ctx.fillStyle = gradient;
    ctx.fillRect(CARD_X, CARD_Y, CARD_W, 92);
  } else if (!isMinimalTemplate(options.templateClass || "")) {
    ctx.fillStyle = theme.brand;
    ctx.fillRect(CARD_X, CARD_Y, 10, CARD_H);
  }
  ctx.restore();

  const contentX = CARD_X + 34;
  const contentY = CARD_Y + 32;
  const company = text(meta.companyName || card.company || "");
  const shortName = text(meta.companyShortName || "");
  const name = text(card.display_name || "名片");
  const title = text(card.title || "");
  const fields = card.fields || {};
  const contact = [fields.mobile || fields.phone || "", fields.email || "", fields.address || ""]
    .map(text)
    .filter(Boolean)
    .slice(0, 3);

  if (shortName) {
    ctx.fillStyle = secondary;
    ctx.font = "20px sans-serif";
    drawText(ctx, shortName, contentX, contentY, 224);
  }

  let infoY = contentY + (shortName ? 50 : 22);
  if (company) {
    ctx.fillStyle = primary;
    ctx.font = "bold 22px sans-serif";
    drawText(ctx, company, contentX, infoY, 224);
    infoY += 30;
  }

  ctx.fillStyle = primary;
  ctx.font = "bold 32px sans-serif";
  drawText(ctx, name, contentX, infoY, 210);
  infoY += 36;

  if (title) {
    ctx.fillStyle = secondary;
    ctx.font = "21px sans-serif";
    drawText(ctx, title, contentX, infoY, 210);
    infoY += 29;
  }

  ctx.fillStyle = secondary;
  ctx.font = "18px sans-serif";
  contact.forEach((line) => {
    drawText(ctx, line, contentX, infoY, 252);
    infoY += 24;
  });

  drawAvatar(ctx, CARD_X + CARD_W - 104, CARD_Y + 68, 76, dark || brandImage);
  drawCorner(ctx, theme.brand, dark || brandImage);
}

function drawShareBackground(ctx, theme) {
  ctx.clearRect(0, 0, SHARE_IMAGE_WIDTH, SHARE_IMAGE_HEIGHT);
  const gradient = ctx.createLinearGradient(0, 0, SHARE_IMAGE_WIDTH, SHARE_IMAGE_HEIGHT);
  gradient.addColorStop(0, theme.brandDeep);
  gradient.addColorStop(0.56, theme.brand);
  gradient.addColorStop(1, theme.brandSoft);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, SHARE_IMAGE_WIDTH, SHARE_IMAGE_HEIGHT);

  ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
  ctx.fillRect(0, 0, SHARE_IMAGE_WIDTH, SHARE_IMAGE_HEIGHT);

  ctx.save();
  ctx.fillStyle = "rgba(255, 255, 255, 0.28)";
  for (let x = 10; x < SHARE_IMAGE_WIDTH; x += 30) {
    for (let y = 10; y < SHARE_IMAGE_HEIGHT; y += 30) {
      circle(ctx, x, y, 1.6);
      ctx.fill();
    }
  }
  ctx.restore();

  const glow = ctx.createRadialGradient(92, 76, 0, 92, 76, 220);
  glow.addColorStop(0, "rgba(255, 255, 255, 0.24)");
  glow.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, SHARE_IMAGE_WIDTH, SHARE_IMAGE_HEIGHT);
}

function drawAvatar(ctx, x, y, size, inverse) {
  const fill = inverse ? "rgba(255,255,255,0.16)" : "#eef0f3";
  const mark = inverse ? "rgba(255,255,255,0.72)" : "#a9b2c1";
  ctx.save();
  circle(ctx, x + size / 2, y + size / 2, size / 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.clip();
  ctx.fillStyle = mark;
  circle(ctx, x + size / 2, y + size * 0.36, size * 0.2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + size * 0.18, y + size);
  ctx.quadraticCurveTo(x + size / 2, y + size * 0.62, x + size * 0.82, y + size);
  ctx.lineTo(x + size * 0.18, y + size);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawCorner(ctx, brand, inverse) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(CARD_X + CARD_W, CARD_Y + CARD_H);
  ctx.lineTo(CARD_X + CARD_W - 72, CARD_Y + CARD_H);
  ctx.lineTo(CARD_X + CARD_W, CARD_Y + CARD_H - 72);
  ctx.closePath();
  ctx.fillStyle = inverse ? "rgba(255,255,255,0.24)" : hexToRgba(brand, 0.46);
  ctx.fill();
  ctx.restore();
}

function drawText(ctx, value, x, y, maxWidth) {
  const textValue = text(value);
  if (!textValue) {
    return;
  }
  if (ctx.measureText(textValue).width <= maxWidth) {
    ctx.fillText(textValue, x, y);
    return;
  }
  let output = textValue;
  while (output.length > 1 && ctx.measureText(`${output}...`).width > maxWidth) {
    output = output.slice(0, -1);
  }
  ctx.fillText(`${output}...`, x, y);
}

function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function circle(ctx, x, y, radius) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
}

function normalizeCard(card) {
  return Object.assign({ display_name: "", title: "", company: "", fields: {} }, card || {});
}

function normalizeTheme(theme) {
  return {
    brand: theme.brand || "#5a70c8",
    brandDeep: theme.brandDeep || "#485aa0",
    brandSoft: theme.brandSoft || "#9ca9de"
  };
}

function text(value) {
  return String(value || "").trim();
}

function isMinimalTemplate(templateClass) {
  return templateClass.indexOf("biz-card--minimal") >= 0;
}

function isBrandTemplate(templateClass) {
  return templateClass.indexOf("biz-card--brand-image") >= 0;
}

function isDarkTemplate(templateClass) {
  return templateClass.indexOf("biz-card--dark") >= 0;
}

function isCampaignTemplate(templateClass) {
  return templateClass.indexOf("biz-card--campaign") >= 0;
}

function hexToRgba(hex, alpha) {
  const value = String(hex || "").replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(value)) {
    return `rgba(90,112,200,${alpha})`;
  }
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

module.exports = {
  buildShareCardImage
};
