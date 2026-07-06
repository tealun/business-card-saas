const fs = require("node:fs");
const path = require("node:path");

const schemaPath = path.resolve(__dirname, "..", "..", "database", "schema.sql");
const rlsPath = path.resolve(__dirname, "..", "..", "database", "rls.sql");
const schemaSql = fs.readFileSync(schemaPath, "utf8");
const sql = fs.readFileSync(rlsPath, "utf8");

const accountTables = ["account_preferences"];
const tenantRlsExceptions = new Set([
  "admin_claim_tokens",
  "public_card_directory"
]);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function tableDefinitions() {
  return [...schemaSql.matchAll(/CREATE TABLE "([^"]+)" \(([\s\S]*?)\n\);/g)].map((match) => ({
    name: match[1],
    body: match[2]
  }));
}

function tenantTables() {
  return tableDefinitions()
    .filter((table) => /"tenant_id"\s+BIGINT\s+NOT NULL/i.test(table.body))
    .map((table) => table.name)
    .filter((table) => !tenantRlsExceptions.has(table));
}

function tableBlock(table) {
  const escaped = table.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = sql.match(new RegExp(`ALTER TABLE ${escaped} ENABLE ROW LEVEL SECURITY;[\\s\\S]*?(?=\\nALTER TABLE|\\n--|$)`, "i"));
  return match?.[0] ?? "";
}

for (const table of tenantTables()) {
  const block = tableBlock(table);
  assert(block, `${table} must enable RLS`);
  assert(
    block.includes("current_setting('app.tenant_id', true)::bigint"),
    `${table} policy must use app.tenant_id with missing_ok=true`
  );
}

const aibBlock = tableBlock("account_identity_bindings");
assert(aibBlock, "account_identity_bindings must enable RLS");
assert(
  aibBlock.includes("current_setting('app.tenant_id', true)::bigint"),
  "account_identity_bindings must support tenant context with missing_ok=true"
);
assert(
  aibBlock.includes("current_setting('app.account_id', true)::bigint"),
  "account_identity_bindings must support account context with missing_ok=true"
);

for (const table of accountTables) {
  const block = tableBlock(table);
  assert(block, `${table} must enable RLS`);
  assert(
    block.includes("current_setting('app.account_id', true)::bigint"),
    `${table} policy must use app.account_id with missing_ok=true`
  );
}

assert(
  !/ALTER TABLE\s+public_card_directory\s+ENABLE ROW LEVEL SECURITY/i.test(sql),
  "public_card_directory must remain outside tenant RLS"
);
assert(
  !/ALTER TABLE\s+admin_claim_tokens\s+ENABLE ROW LEVEL SECURITY/i.test(sql),
  "admin_claim_tokens is managed by application authorization and must not be added to tenant RLS casually"
);
assert(
  !/current_setting\('app\.(tenant_id|account_id)'\)(?!\s*,)/.test(sql),
  "all app tenant/account current_setting calls must include missing_ok=true"
);

console.log(
  `RLS baseline validated: ${path.relative(process.cwd(), schemaPath)} + ${path.relative(process.cwd(), rlsPath)}`
);
