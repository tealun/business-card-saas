const POSTER_WIDTH = 690;
const POSTER_HEIGHT = 624;

function buildCardPosterImage(page, options = {}) {
  if (!page || typeof page.createSelectorQuery !== "function") return Promise.resolve("");
  return new Promise((resolve) => {
    page.createSelectorQuery()
      .select("#cardPosterCanvas")
      .fields({ node: true, size: true })
      .exec((res) => {
        const canvas = res && res[0] && res[0].node;
        if (!canvas) return resolve("");
        try {
          const dpr = devicePixelRatio();
          canvas.width = POSTER_WIDTH * dpr;
          canvas.height = POSTER_HEIGHT * dpr;
          const ctx = canvas.getContext("2d");
          ctx.scale(dpr, dpr);
          Promise.resolve(drawPoster(ctx, canvas, options)).then(() => {
            wx.canvasToTempFilePath({
              canvas,
              width: POSTER_WIDTH,
              height: POSTER_HEIGHT,
              destWidth: POSTER_WIDTH * dpr,
              destHeight: POSTER_HEIGHT * dpr,
              fileType: "png",
              success(result) { resolve(result.tempFilePath || ""); },
              fail() { resolve(""); }
            }, page);
          }).catch(() => resolve(""));
        } catch (_error) {
          resolve("");
        }
      });
  });
}

async function drawPoster(ctx, canvas, options) {
  const card = Object.assign({ display_name: "", title: "", company: "", company_short_name: "", fields: {} }, options.card || {});
  const theme = normalizeTheme(options.theme || {});
  const qrImage = await loadCanvasImage(canvas, options.qrUrl);
  const backgroundImage = await loadOptionalCanvasImage(canvas, options.backgroundUrl);
  const logoImage = await loadOptionalCanvasImage(canvas, options.logoUrl);
  const frame = { x: 20, y: 18, width: 650, height: 588, radius: 34 };
  const headerHeight = 338;

  ctx.clearRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);
  ctx.save();
  ctx.shadowColor = "rgba(15, 23, 42, 0.18)";
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 14;
  roundedRect(ctx, frame.x, frame.y, frame.width, frame.height, frame.radius);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundedRect(ctx, frame.x, frame.y, frame.width, frame.height, frame.radius);
  ctx.clip();
  drawHeader(ctx, backgroundImage, frame, headerHeight, theme, options);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(frame.x, frame.y + headerHeight, frame.width, frame.height - headerHeight);
  ctx.restore();

  const company = text(card.company_short_name || card.company || "数字名片");
  if (logoImage) {
    ctx.save();
    roundedRect(ctx, 70, 70, 34, 34, 8);
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.fill();
    drawImageContain(ctx, logoImage, 74, 74, 26, 26);
    ctx.restore();
  } else {
    drawBuildingMark(ctx, 70, 72);
  }
  drawText(ctx, company, 116, 98, 390, "bold 25px sans-serif", "#ffffff");
  drawText(ctx, card.display_name || "我的名片", 70, 205, 520, "bold 55px sans-serif", "#ffffff");
  drawText(ctx, card.title || "", 70, 258, 520, "29px sans-serif", "rgba(255,255,255,0.88)");

  const fields = card.fields || {};
  const phone = text(fields.mobile || fields.phone || "");
  const email = text(fields.email || "");
  if (phone) {
    drawPhoneIcon(ctx, 78, 414);
    drawText(ctx, phone, 112, 428, 310, "27px sans-serif", "#596579");
  }
  if (email) {
    drawMailIcon(ctx, 78, 466);
    drawText(ctx, email, 112, 478, 310, "26px sans-serif", "#596579");
  }
  drawText(ctx, "长按识别，查看数字名片", 70, 552, 380, "25px sans-serif", "#9aa3b2");

  ctx.save();
  roundedRect(ctx, 474, 384, 154, 154, 16);
  ctx.fillStyle = "#f7f8fa";
  ctx.fill();
  ctx.strokeStyle = "#e5e8ed";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.drawImage(qrImage, 484, 394, 134, 134);
  ctx.restore();
}

function drawHeader(ctx, image, frame, height, theme, options) {
  const dark = String(options.templateClass || "").includes("biz-card--dark");
  const gradient = ctx.createLinearGradient(frame.x, frame.y, frame.x + frame.width, frame.y + height);
  gradient.addColorStop(0, dark ? "#111827" : theme.brandDeep);
  gradient.addColorStop(1, dark ? "#26344a" : theme.brand);
  ctx.fillStyle = gradient;
  ctx.fillRect(frame.x, frame.y, frame.width, height);
  if (image) {
    ctx.save();
    ctx.globalAlpha = normalizeOpacity(options.backgroundOpacity);
    drawImageCover(ctx, image, frame.x, frame.y, frame.width, height);
    ctx.restore();
  } else {
    drawDotGrid(ctx, frame.x + 28, frame.y + 22, frame.width - 56, height - 44);
  }
  ctx.fillStyle = dark ? "rgba(0,0,0,0.18)" : "rgba(15,23,42,0.08)";
  ctx.fillRect(frame.x, frame.y, frame.width, height);
}

function drawDotGrid(ctx, x, y, width, height) {
  ctx.fillStyle = "rgba(255,255,255,0.17)";
  for (let px = x; px < x + width; px += 38) {
    for (let py = y; py < y + height; py += 38) {
      ctx.beginPath();
      ctx.arc(px, py, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawBuildingMark(ctx, x, y) {
  ctx.save();
  ctx.strokeStyle = "#ffffff";
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  ctx.lineWidth = 2;
  roundedRect(ctx, x, y, 32, 28, 7);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x + 7, y + 11, 4, 4);
  ctx.fillRect(x + 14, y + 11, 4, 4);
  ctx.fillRect(x + 21, y + 11, 4, 4);
  ctx.fillRect(x + 14, y + 19, 5, 9);
  ctx.restore();
}

function drawPhoneIcon(ctx, x, y) {
  ctx.save();
  ctx.strokeStyle = "#e83f8d";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, y - 10);
  ctx.quadraticCurveTo(x + 5, y + 5, x + 18, y + 12);
  ctx.moveTo(x + 1, y - 10);
  ctx.lineTo(x + 8, y - 5);
  ctx.moveTo(x + 18, y + 12);
  ctx.lineTo(x + 23, y + 5);
  ctx.stroke();
  ctx.restore();
}

function drawMailIcon(ctx, x, y) {
  ctx.save();
  ctx.strokeStyle = "#738094";
  ctx.lineWidth = 2.5;
  ctx.strokeRect(x, y - 12, 22, 16);
  ctx.beginPath();
  ctx.moveTo(x, y - 12);
  ctx.lineTo(x + 11, y - 3);
  ctx.lineTo(x + 22, y - 12);
  ctx.stroke();
  ctx.restore();
}

function drawText(ctx, value, x, y, maxWidth, font, color) {
  let output = text(value);
  if (!output) return;
  ctx.save();
  ctx.font = font;
  ctx.fillStyle = color;
  while (output.length > 1 && ctx.measureText(output).width > maxWidth) output = output.slice(0, -1);
  if (output !== text(value)) output = `${output.slice(0, -1)}...`;
  ctx.fillText(output, x, y);
  ctx.restore();
}

function drawImageCover(ctx, image, x, y, width, height) {
  const sourceWidth = image.width || width;
  const sourceHeight = image.height || height;
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

function drawImageContain(ctx, image, x, y, width, height) {
  const sourceWidth = image.width || width;
  const sourceHeight = image.height || height;
  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

async function loadOptionalCanvasImage(canvas, src) {
  if (!text(src)) return null;
  try { return await loadCanvasImage(canvas, src); } catch (_error) { return null; }
}

async function loadCanvasImage(canvas, src) {
  const path = await resolveImagePath(src);
  if (!path) throw new Error("image source missing");
  if (!canvas || typeof canvas.createImage !== "function") return path;
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
  if (/^data:image\//i.test(value)) return dataUrlToTempFile(value);
  if (/^https?:\/\//.test(value) || value.startsWith("/") || /^wxfile:\/\//.test(value)) {
    return new Promise((resolve) => wx.getImageInfo({ src: value, success: (result) => resolve(result.path || value), fail: () => resolve(value) }));
  }
  return Promise.resolve(value);
}

function dataUrlToTempFile(dataUrl) {
  const match = String(dataUrl || "").match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/i);
  const fs = wx.getFileSystemManager && wx.getFileSystemManager();
  if (!match || !fs || !wx.env || !wx.env.USER_DATA_PATH) return Promise.resolve(dataUrl);
  const ext = match[1].toLowerCase().replace("jpeg", "jpg");
  const filePath = `${wx.env.USER_DATA_PATH}/card-poster-${Date.now()}.${ext}`;
  return new Promise((resolve) => fs.writeFile({
    filePath,
    data: match[2],
    encoding: "base64",
    success() { resolve(filePath); },
    fail() { resolve(dataUrl); }
  }));
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

function normalizeTheme(theme) {
  return { brand: theme.brand || "#5a70c8", brandDeep: theme.brandDeep || "#485aa0" };
}

function normalizeOpacity(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 1;
  return Math.max(0, Math.min(1, number));
}

function devicePixelRatio() {
  try { return (wx.getWindowInfo && wx.getWindowInfo().pixelRatio) || 2; } catch (_error) { return 2; }
}

function text(value) { return String(value || "").trim(); }

module.exports = { buildCardPosterImage };
