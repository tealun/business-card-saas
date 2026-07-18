import fs from "node:fs";

const indexHtml = fs.readFileSync("admin/index.html", "utf8");
const pageFiles = fs
  .readdirSync("admin/partials/pages")
  .filter((file) => file.endsWith(".html"))
  .sort()
  .map((file) => `admin/partials/pages/${file}`);
const partials = pageFiles.map((file) => fs.readFileSync(file, "utf8"));
const html = [indexHtml, ...partials].join("\n");
const app = fs.readFileSync("admin/app.js", "utf8");

const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
const selectors = new Set(
  [...app.matchAll(/\$\("([^"]+)"\)/g)]
    .map((match) => match[1])
    .filter((selector) => /^#[A-Za-z][\w-]*$/.test(selector))
    .map((selector) => selector.slice(1))
);

const missing = [...selectors].filter((id) => !ids.has(id)).sort();
if (missing.length) {
  console.error(`Missing static ids: ${missing.join(", ")}`);
  process.exit(1);
}

const pageCount = [...html.matchAll(/<section class="page(?:\s|")/g)].length;
if (pageCount !== 18) {
  console.error(`Expected 18 admin pages after partial assembly, found ${pageCount}`);
  process.exit(1);
}

if (!indexHtml.includes("data-admin-page-partials")) {
  console.error("Missing admin page partial mount");
  process.exit(1);
}

if (pageFiles.length !== 18) {
  console.error(`Expected 18 page partial files, found ${pageFiles.length}`);
  process.exit(1);
}

console.log(`admin static structure ok: ${selectors.size} ids checked, ${pageFiles.length} files, ${pageCount} pages assembled`);
