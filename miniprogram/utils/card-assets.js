const config = require("../config");

const DEFAULT_PORTRAIT_PHOTO_URL = `${String(config.apiBase || "").replace(/\/$/, "")}/demo-assets/card-portraits/default-avatar-square.png?v=20260726-portrait`;

module.exports = {
  DEFAULT_PORTRAIT_PHOTO_URL
};
