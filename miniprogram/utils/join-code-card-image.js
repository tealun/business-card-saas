const JOIN_CODE_WIDTH = 720;
const JOIN_CODE_HEIGHT = 980;

function buildJoinCodeCardImage(page, options = {}) {
  if (!page || typeof page.createSelectorQuery !== "function") {
    return Promise.resolve("");
  }
  return new Promise((resolve) => {
    page
      .createSelectorQuery()
      .select("#joinCodeCanvas")
      .fields({ node: true, size: true })
      .exec((res) => {
        const node = res && res[0] && res[0].node;
        if (!node) {
          resolve("");
          return;
        }
        try {
          const dpr = devicePixelRatio();
          node.width = JOIN_CODE_WIDTH * dpr;
          node.height = JOIN_CODE_HEIGHT * dpr;
          const ctx = node.getContext("2d");
          ctx.scale(dpr, dpr);
          Promise.resolve(drawJoinCodeCard(ctx, node, options))
            .then(() => {
              wx.canvasToTempFilePath(
                {
                  canvas: node,
                  width: JOIN_CODE_WIDTH,
                  height: JOIN_CODE_HEIGHT,
                  destWidth: JOIN_CODE_WIDTH * dpr,
                  destHeight: JOIN_CODE_HEIGHT * dpr,
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

async function drawJoinCodeCard(ctx, canvas, options) {
  const tenant = normalizeTenant(options.tenant || {});
  const overview = options.overview || {};
  const joinCode = normalizeJoinCode(options.joinCode || {});
  const theme = normalizeTheme(options.theme || {});
  const qrImage = await loadCanvasImage(canvas, joinCode.qrUrl);
  const tenantName = text(tenant.tenant_name || tenant.name || "企业");
  const initial = text(tenant.initial || tenantName.slice(0, 1) || "企");
  const memberCount = Number(overview.member_count || 0);
  const subtitle = `${tenant.roleLabel || "管理员"} · 成员 ${memberCount} 人`;
  const cardTitle = text(options.title || "扫码提交加入申请");
  const cardDescription = text(options.description || "管理员审核通过后创建企业名片");

  ctx.clearRect(0, 0, JOIN_CODE_WIDTH, JOIN_CODE_HEIGHT);
  drawBackground(ctx, theme);

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
  const header = ctx.createLinearGradient(58, 54, 662, 284);
  header.addColorStop(0, theme.brandDeep);
  header.addColorStop(1, theme.brand);
  ctx.fillStyle = header;
  ctx.fillRect(58, 54, 604, 230);
  drawDotGrid(ctx, 82, 78, 540, 160, "rgba(255,255,255,0.14)");
  ctx.restore();

  drawInitial(ctx, 110, 112, 94, initial);
  drawText(ctx, tenantName, 230, 154, 350, "bold 38px sans-serif", "#ffffff");
  drawText(ctx, subtitle, 230, 198, 360, "25px sans-serif", "rgba(255,255,255,0.86)");

  ctx.save();
  roundedRect(ctx, 82, 244, 556, 540, 34);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.shadowColor = "rgba(17, 24, 39, 0.06)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 8;
  roundedRect(ctx, 184, 314, 352, 352, 22);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = "#e7ebf2";
  ctx.lineWidth = 2;
  roundedRect(ctx, 184, 314, 352, 352, 22);
  ctx.stroke();
  ctx.drawImage(qrImage, 212, 342, 296, 296);

  drawText(ctx, cardTitle, 0, 736, JOIN_CODE_WIDTH, "bold 28px sans-serif", "#334155", "center");
  drawText(ctx, cardDescription, 0, 778, JOIN_CODE_WIDTH, "24px sans-serif", "#788498", "center");
  drawText(ctx, joinCode.expiresAtText ? `有效期至 ${joinCode.expiresAtText}` : "", 0, 842, JOIN_CODE_WIDTH, "24px sans-serif", "#9aa3b2", "center");
  drawText(ctx, joinCode.path, 108, 882, 504, "20px sans-serif", "#a6adba", "center");
}

function drawBackground(ctx, theme) {
  const gradient = ctx.createLinearGradient(0, 0, JOIN_CODE_WIDTH, JOIN_CODE_HEIGHT);
  gradient.addColorStop(0, hexToRgba(theme.brand, 0.10));
  gradient.addColorStop(0.55, "#f4f6fa");
  gradient.addColorStop(1, hexToRgba(theme.brandSoft, 0.12));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, JOIN_CODE_WIDTH, JOIN_CODE_HEIGHT);
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
  const drawX = align === "center" ? JOIN_CODE_WIDTH / 2 : x;
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
  const filePath = `${wx.env.USER_DATA_PATH}/join-code-${Date.now()}.${ext}`;
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

function normalizeTenant(tenant) {
  return Object.assign({ tenant_name: "", roleLabel: "", initial: "" }, tenant || {});
}

function normalizeJoinCode(joinCode) {
  return {
    qrUrl: text(joinCode.qr_code_data_url),
    path: text(joinCode.join_path),
    expiresAtText: text(joinCode.expiresAtText || joinCode.expires_at)
  };
}

function normalizeTheme(theme) {
  return {
    brand: theme.themeBrand || theme.brand || "#5272d6",
    brandDeep: theme.themeBrandDeep || theme.brandDeep || "#425bad",
    brandSoft: theme.themeBrandSoft || theme.brandSoft || "#9aabe8"
  };
}

function hexToRgba(hex, alpha) {
  const value = String(hex || "").replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(value)) {
    return `rgba(82,114,214,${alpha})`;
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

function text(value) {
  return String(value || "").trim();
}

module.exports = { buildJoinCodeCardImage };
