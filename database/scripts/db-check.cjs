const { Pool } = require("pg");

const databaseUrl = process.env.DATABASE_URL;

const requiredTables = [
  "accounts",
  "tenants",
  "wecom_suite_state",
  "member_identities",
  "account_identity_bindings",
  "account_preferences",
  "templates",
  "cards",
  "public_card_directory",
  "visitor_accounts",
  "card_visits",
  "card_actions",
  "card_shares",
  "tenant_admins",
  "admin_claim_tokens",
  "callback_events",
  "tenant_field_settings",
  "company_profiles",
  "company_videos",
  "company_honors",
  "company_honor_images",
  "card_style_overrides"
];

const tenantRlsTables = [
  "cards",
  "member_identities",
  "card_visits",
  "card_actions",
  "card_shares",
  "tenant_admins",
  "admin_claim_tokens",
  "templates",
  "tenant_field_settings",
  "company_profiles",
  "company_videos",
  "company_honors",
  "company_honor_images",
  "card_style_overrides",
  "account_identity_bindings",
  "account_preferences"
];

const requiredIndexes = [
  "uk_cards_public_id",
  "uk_visit_id",
  "uk_action_idem",
  "uk_public_share_id",
  "uk_callback_event_key"
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function tableExists(pool, table) {
  const result = await pool.query("SELECT to_regclass($1) AS name", [`public.${table}`]);
  return result.rows[0]?.name === table;
}

async function indexExists(pool, index) {
  const result = await pool.query("SELECT to_regclass($1) AS name", [`public.${index}`]);
  return result.rows[0]?.name === index;
}

async function relSecurity(pool, table) {
  const result = await pool.query(
    `
      SELECT relrowsecurity AS enabled
      FROM pg_class
      JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
      WHERE pg_namespace.nspname = 'public'
        AND pg_class.relname = $1
    `,
    [table]
  );
  return Boolean(result.rows[0]?.enabled);
}

async function policyCount(pool, table) {
  const result = await pool.query(
    `
      SELECT count(*)::int AS count
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = $1
    `,
    [table]
  );
  return result.rows[0]?.count ?? 0;
}

async function main() {
  assert(databaseUrl, "DATABASE_URL is required");
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 5_000,
    statement_timeout: 10_000,
    application_name: "business-card-db-check"
  });

  try {
    await pool.query("SELECT 1");

    for (const table of requiredTables) {
      assert(await tableExists(pool, table), `missing required table: ${table}`);
    }

    for (const index of requiredIndexes) {
      assert(await indexExists(pool, index), `missing required index: ${index}`);
    }

    for (const table of tenantRlsTables) {
      assert(await relSecurity(pool, table), `${table} must have row level security enabled`);
      assert((await policyCount(pool, table)) > 0, `${table} must have at least one RLS policy`);
    }

    assert(!(await relSecurity(pool, "public_card_directory")), "public_card_directory must not enable RLS");
    assert(!(await relSecurity(pool, "callback_events")), "callback_events must not enable RLS");

    console.log("Database check passed: schema objects, critical indexes, and RLS posture are present.");
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
