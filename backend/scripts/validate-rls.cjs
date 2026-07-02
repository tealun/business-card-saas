const fs = require("node:fs");
const path = require("node:path");

const rlsPath = path.resolve(__dirname, "..", "..", "database", "rls.sql");
const sql = fs.readFileSync(rlsPath, "utf8");

const tenantTables = [
  "cards",
  "member_identities",
  "card_visits",
  "card_actions",
  "card_shares",
  "tenant_admins"
];

const accountTables = ["account_preferences"];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function tableBlock(table) {
  const escaped = table.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = sql.match(new RegExp(`ALTER TABLE ${escaped} ENABLE ROW LEVEL SECURITY;[\\s\\S]*?(?=\\nALTER TABLE|\\n--|$)`, "i"));
  return match?.[0] ?? "";
}

for (const table of tenantTables) {
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
  !/current_setting\('app\.(tenant_id|account_id)'\)(?!\s*,)/.test(sql),
  "all app tenant/account current_setting calls must include missing_ok=true"
);

console.log(`RLS baseline validated: ${path.relative(process.cwd(), rlsPath)}`);
