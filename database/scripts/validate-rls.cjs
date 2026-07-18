const fs = require("node:fs");
const path = require("node:path");

const schemaPath = path.resolve(__dirname, "..", "..", "database", "schema.sql");
const rlsPath = path.resolve(__dirname, "..", "..", "database", "rls.sql");
const schemaSql = fs.readFileSync(schemaPath, "utf8");
const sql = fs.readFileSync(rlsPath, "utf8");

const accountTables = ["account_preferences"];
const tenantRlsExceptions = new Set([
  "public_card_directory",
  "platform_admins",
  "tenant_feature_settings",
  // OAuth callbacks arrive before tenant context can be established. Access is gated by a
  // high-entropy, single-use state hash; the row contains no raw state, code, or user ticket.
  "wecom_sensitive_auth_states",
  // Admin OAuth/scan login state is consumed before tenant/platform identity has been established.
  // It stores only a state hash and request metadata.
  "admin_auth_states",
  // Platform operations table, same shape as callback_events: platform admins need cross-tenant
  // reads (GET /admin/platform/operation-logs), and the repository is not TenantTx-scoped.
  // Isolation is enforced at the query layer (tenant_id filter), not via RLS. See 99_71.
  "admin_operation_logs"
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
for (const table of ["platform_feature_settings", "tenant_feature_settings"]) {
  assert(new RegExp(`ALTER TABLE\\s+${table}\\s+DISABLE ROW LEVEL SECURITY`, "i").test(sql), `${table} must remain a platform-only table outside tenant RLS`);
  assert(!new RegExp(`CREATE POLICY\\s+\\S+\\s+ON\\s+${table}`, "i").test(sql), `${table} must not expose a tenant RLS policy`);
}
assert(
  /ALTER TABLE\s+callback_events\s+DISABLE ROW LEVEL SECURITY/i.test(sql),
  "callback_events must remain a platform table without tenant RLS"
);
assert(
  !/CREATE POLICY\s+\S+\s+ON\s+callback_events/i.test(sql),
  "callback_events must not define tenant RLS policies"
);
assert(
  /ALTER TABLE\s+wecom_sensitive_auth_states\s+DISABLE ROW LEVEL SECURITY/i.test(sql),
  "wecom_sensitive_auth_states must remain callback-accessible before tenant context exists"
);
assert(
  !/CREATE POLICY\s+\S+\s+ON\s+wecom_sensitive_auth_states/i.test(sql),
  "wecom_sensitive_auth_states must not define a tenant RLS policy"
);
assert(
  /ALTER TABLE\s+admin_auth_states\s+DISABLE ROW LEVEL SECURITY/i.test(sql),
  "admin_auth_states must remain callback-accessible before admin identity exists"
);
assert(
  !/CREATE POLICY\s+\S+\s+ON\s+admin_auth_states/i.test(sql),
  "admin_auth_states must not define a tenant RLS policy"
);
assert(
  !/current_setting\('app\.(tenant_id|account_id)'\)(?!\s*,)/.test(sql),
  "all app tenant/account current_setting calls must include missing_ok=true"
);

console.log(
  `RLS baseline validated: ${path.relative(process.cwd(), schemaPath)} + ${path.relative(process.cwd(), rlsPath)}`
);
