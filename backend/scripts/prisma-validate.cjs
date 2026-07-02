const { spawnSync } = require("node:child_process");

process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/business_card_saas";

const result = spawnSync(
  process.execPath,
  ["node_modules/prisma/build/index.js", "validate", "--schema", "prisma/schema.prisma"],
  {
    stdio: "inherit",
    env: process.env
  }
);

process.exit(result.status ?? 1);
