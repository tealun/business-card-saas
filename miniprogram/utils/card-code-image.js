const CARD_CODE_WIDTH = 720;
const CARD_CODE_HEIGHT = 980;

function buildCardCodeImage(page, options = {}) {
  if (!page || typeof page.createSelectorQuery !== "function") {
    return Promise.resolve("");
  }
  return new Promise((resolve) => {
    page
      .createSelectorQuery()
      .select("#cardCodeCanvas")
      .fields({ node: true, size: true })
      .exec((res) => {
        const node = res && res[0] && res[0].node;
        if (!node) {
          resolve("");
          return;
        }
        try {
          const dpr = devicePixelRatio();
          node.width = CARD_CODE_WIDTH * dpr;
          node.height = CARD_CODE_HEIGHT * dpr;
          const ctx = node.getContext("2d");
          ctx.scale(dpr, dpr);
          Promise.resolve(drawCardCode(ctx, node, options))
            .then(() => {
              wx.canvasToTempFilePath(
                {
                  canvas: node,
                  width: CARD_CODE_WIDTH,
                  height: CARD_CODE_HEIGHT,
                  destWidth: CARD_CODE_WIDTH * dpr,
                  destHeight: CARD_CODE_HEIGHT * dpr,
                  fileType: "png",
                  success(result) {
                    resolve(result.tempFilePath || "");
                  },
                  fail() {
                    resolve("");
                  }
                },
                page
              );
            })
            .catch(() => resolve(""));
        } catch (_error) {
          resolve("");
        }
      });
  });
}

async function drawCardCode(ctx, canvas, options) {
  const card = normalizeCard(options.card || {});
  const theme = normalizeTheme(options.theme || {});
  const meta = {
    initial: text(options.initial) || firstChar(card.display_name || card.company || "名"),
    subtitle: text(options.subtitle) || [card.title, card.company].map(text).filter(Boolean).join(" · "),
    qrUrl: text(options.qrUrl)
  };
  const qrImage = await loadCanvasImage(canvas, meta.qrUrl);

  ctx.clearRect(0, 0, CARD_CODE_WIDTH, CARD_CODE_HEIGHT);
  ctx.fillStyle = "#f4f6fa";
  ctx.fillRect(0, 0, CARD_CODE_WIDTH, CARD_CODE_HEIGHT);
  drawBackgroundTexture(ctx, theme);

  ctx.save();
  ctx.shadowColor = "rgba(17, 24, 39, 0.14)";
  ctx.shadowBlur = 34;
  ctx.shadowOffsetY = 18;
  roundedRect(ctx, 58, 54, 604, 854, 36);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundedRect(ctx, 58, 54, 604, 854, 36);
  ctx.clip();
  const header = ctx.createLinearGradient(58, 54, 662, 274);
  header.addColorStop(0, theme.brandDeep);
  header.addColorStop(1, theme.brand);
  ctx.fillStyle = header;
  ctx.fillRect(58, 54, 604, 230);
  drawDotGrid(ctx, 82, 78, 540, 160, "rgba(255,255,255,0.14)");
  ctx.restore();

  drawInitial(ctx, 110, 112, 94, meta.initial);
  drawText(ctx, card.display_name || "我的名片", 230, 158, 340, "bold 38px sans-serif", "#ffffff");
  drawText(ctx, meta.subtitle, 230, 198, 350, "25px sans-serif", "rgba(255,255,255,0.86)");

  ctx.save();
  roundedRect(ctx, 82, 244, 556, 540, 34);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.shadowColor = "rgba(17, 24, 39, 0.06)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 8;
  roundedRect(ctx, 184, 316, 352, 352, 22);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = "#e7ebf2";
  ctx.lineWidth = 2;
  roundedRect(ctx, 184, 316, 352, 352, 22);
  ctx.stroke();
  ctx.drawImage(qrImage, 212, 344, 296, 296);

  drawText(ctx, "扫一扫，查看我的名片", 0, 738, CARD_CODE_WIDTH, "27px sans-serif", "#788498", "center");
  drawText(ctx, card.company || card.company_short_name || "数字名片", 0, 844, CARD_CODE_WIDTH, "24px sans-serif", "#9aa3b2", "center");
}

function drawBackgroundTexture(ctx, theme) {
  const gradient = ctx.createLinearGradient(0, 0, CARD_CODE_WIDTH, CARD_CODE_HEIGHT);
  gradient.addColorStop(0, hexToRgba(theme.brand, 0.10));
  gradient.addColorStop(0.55, "#f4f6fa");
  gradient.addColorStop(1, hexToRgba(theme.brandSoft, 0.12));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CARD_CODE_WIDTH, CARD_CODE_HEIGHT);
}

function drawDotGrid(ctx, x, y, width, height, color) {
  ctx.fillStyle = color;
  for (let px = x; px <= x + width; px += 28) {
    for (let py = y; py <= y + height; py += 28) {
      circle(ctx, px, py, 2);
      ctx.fill();
    }
  }
}

function drawInitial(ctx, x, y, size, initial) {
  ctx.save();
  circle(ctx, x + size / 2, y + size / 2, size / 2);
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.62)";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 36px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(initial, x + size / 2, y + size / 2);
  ctx.restore();
}

function drawText(ctx, value, x, y, maxWidth, font, color, align = "left") {
  const textValue = text(value);
  if (!textValue) return;
  ctx.save();
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  const drawX = align === "center" ? CARD_CODE_WIDTH / 2 : x;
  if (ctx.measureText(textValue).width <= maxWidth) {
    ctx.fillText(textValue, drawX, y);
    ctx.restore();
    return;
  }
  let output = textValue;
  while (output.length > 1 && ctx.measureText(`${output}...`).width > maxWidth) {
    output = output.slice(0, -1);
  }
  ctx.fillText(`${output}...`, drawX, y);
  ctx.restore();
}

async function loadCanvasImage(canvas, src) {
  const path = await resolveImagePath(src);
  if (!path) {
    throw new Error("image source missing");
  }
  if (!canvas || typeof canvas.createImage !== "function") {
    return path;
  }
  return new Promise((resolve, reject) => {
    const image = canvas.createImage();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = path;
  });
}

function resolveImagePath(src) {
  const value = text(src);
  if (!value) return Promise.resolve("");
  if (/^data:image\//i.test(value)) {
    return dataUrlToTempFile(value);
  }
  if (/^https?:\/\//.test(value) || value.startsWith("/")) {
    return new Promise((resolve) => {
      wx.getImageInfo({
        src: value,
        success(result) {
          resolve(result.path || value);
        },
        fail() {
          resolve(value);
        }
      });
    });
  }
  return Promise.resolve(value);
}

function dataUrlToTempFile(dataUrl) {
  const match = String(dataUrl || "").match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/i);
  const fs = wx.getFileSystemManager && wx.getFileSystemManager();
  if (!match || !fs || !wx.env || !wx.env.USER_DATA_PATH) {
    return Promise.resolve(dataUrl);
  }
  const ext = match[1].toLowerCase().replace("jpeg", "jpg");
  const filePath = `${wx.env.USER_DATA_PATH}/card-code-${Date.now()}.${ext}`;
  return new Promise((resolve) => {
    fs.writeFile({
      filePath,
      data: match[2],
      encoding: "base64",
      success() {
        resolve(filePath);
      },
      fail() {
        resolve(dataUrl);
      }
    });
  });
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
  return Object.assign({ display_name: "", title: "", company: "", company_short_name: "", fields: {} }, card || {});
}

function normalizeTheme(theme) {
  return {
    brand: theme.brand || "#5a70c8",
    brandDeep: theme.brandDeep || "#485aa0",
    brandSoft: theme.brandSoft || "#9ca9de"
  };
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

function devicePixelRatio() {
  try {
    if (typeof wx.getWindowInfo === "function") {
      return wx.getWindowInfo().pixelRatio || 2;
    }
    if (typeof wx.getSystemInfoSync === "function") {
      return wx.getSystemInfoSync().pixelRatio || 2;
    }
  } catch (_error) {
    return 2;
  }
  return 2;
}

function firstChar(value) {
  return text(value).slice(0, 1) || "名";
}

function text(value) {
  return String(value || "").trim();
}

module.exports = { buildCardCodeImage };
