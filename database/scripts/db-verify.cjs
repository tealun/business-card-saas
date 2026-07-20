const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");

const databaseUrl = process.env.DATABASE_URL;
const allowNonLocal = process.env.DB_VERIFY_ALLOW_NONLOCAL === "1";
const runtimeRole = "business_card_rls_probe";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function isLocalDatabase(url) {
  try {
    const parsed = new URL(url);
    return ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  } catch {
    return false;
  }
}

function splitSql(sql) {
  const statements = [];
  let current = "";
  let dollarQuoteTag = null;
  let inSingleQuote = false;
  let inLineComment = false;

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1];
    current += char;

    if (inLineComment) {
      if (char === "\n") {
        inLineComment = false;
      }
      continue;
    }

    if (!inSingleQuote && !dollarQuoteTag && char === "-" && next === "-") {
      current += next;
      index += 1;
      inLineComment = true;
      continue;
    }

    if (!inSingleQuote && char === "$") {
      const rest = sql.slice(index);
      const match = rest.match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
      if (match) {
        const tag = match[0];
        if (!dollarQuoteTag) {
          dollarQuoteTag = tag;
          current += tag.slice(1);
          index += tag.length - 1;
          continue;
        }
        if (dollarQuoteTag === tag) {
          dollarQuoteTag = null;
          current += tag.slice(1);
          index += tag.length - 1;
          continue;
        }
      }
    }

    if (!dollarQuoteTag && char === "'") {
      if (inSingleQuote && next === "'") {
        current += next;
        index += 1;
        continue;
      }
      inSingleQuote = !inSingleQuote;
      continue;
    }

    if (!dollarQuoteTag && !inSingleQuote && char === ";") {
      const statement = current.trim();
      if (statement) {
        statements.push(statement);
      }
      current = "";
    }
  }

  const trailing = current.trim();
  if (trailing) {
    statements.push(trailing);
  }
  return statements;
}

async function applySqlFile(pool, relativePath) {
  const sqlPath = path.resolve(__dirname, "..", "..", relativePath);
  const statements = splitSql(fs.readFileSync(sqlPath, "utf8"));

  for (const statement of statements) {
    await pool.query(statement);
  }
}

async function prepareProbeRole(pool) {
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${runtimeRole}') THEN
        CREATE ROLE ${runtimeRole};
      END IF;
    END
    $$;
  `);
  await pool.query(`GRANT USAGE ON SCHEMA public TO ${runtimeRole}`);
  await pool.query(`
      GRANT SELECT ON
      cards,
      member_identities,
      card_visits,
      card_actions,
      card_shares,
      tenant_admins,
      tenant_field_settings,
      templates,
      company_profiles,
      company_videos,
      company_honors,
      company_honor_images,
      card_style_overrides,
      account_identity_bindings,
      account_preferences,
      public_card_directory
    TO ${runtimeRole}
  `);
  await pool.query(`
    DO $$
    BEGIN
      EXECUTE format('GRANT ${runtimeRole} TO %I', current_user);
    END
    $$;
  `);
}

async function seedProbeData(pool) {
  await pool.query(`
    TRUNCATE
      wecom_suite_state,
      callback_events,
      admin_claim_tokens,
      tenant_admins,
      tenant_field_settings,
      card_style_overrides,
      company_honor_images,
      company_honors,
      company_videos,
      company_profiles,
      card_shares,
      card_actions,
      card_visits,
      public_card_directory,
      cards,
      templates,
      account_preferences,
      account_identity_bindings,
      member_identities,
      visitor_accounts,
      accounts,
      tenants
    RESTART IDENTITY CASCADE
  `);

  await pool.query(`
    INSERT INTO tenants (name, creation_source, open_corpid, auth_status, created_at, updated_at)
    VALUES
      ('Tenant A', 'wecom', 'open-corpid-a', 'active', now(), now()),
      ('Tenant B', 'wecom', 'open-corpid-b', 'active', now(), now())
  `);
  await pool.query(`
    INSERT INTO member_identities (tenant_id, open_userid, name, status, created_at, updated_at)
    VALUES
      (1, 'open-user-a', 'Alice', 'active', now(), now()),
      (2, 'open-user-b', 'Bob', 'active', now(), now())
  `);
  await pool.query(`
    INSERT INTO cards (
      tenant_id,
      member_identity_id,
      public_id,
      card_type,
      slug,
      display_name,
      status,
      created_at,
      updated_at
    )
    VALUES
      (1, 1, 'pub_a', 'primary', 'alice', 'Alice', 'active', now(), now()),
      (2, 2, 'pub_b', 'primary', 'bob', 'Bob', 'active', now(), now())
  `);
  await pool.query(`
    INSERT INTO public_card_directory (public_id, tenant_id, card_id, status, card_updated_at, created_at, updated_at)
    VALUES
      ('pub_a', 1, 1, 'active', now(), now(), now()),
      ('pub_b', 2, 2, 'active', now(), now(), now())
  `);
}

async function transaction(pool, callback) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the original transaction error.
    }
    throw error;
  } finally {
    client.release();
  }
}

async function countCardsAsTenant(pool, tenantId) {
  const result = await transaction(pool, async (client) => {
    await client.query(`SET LOCAL ROLE ${runtimeRole}`);
    await client.query("SET LOCAL row_security = on");
    if (tenantId !== null) {
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [String(tenantId)]);
    }
    return client.query("SELECT count(*)::int AS count FROM cards");
  });

  return result.rows[0].count;
}

async function countPublicDirectoryAsProbe(pool) {
  const result = await transaction(pool, async (client) => {
    await client.query(`SET LOCAL ROLE ${runtimeRole}`);
    await client.query("SET LOCAL row_security = on");
    return client.query("SELECT count(*)::int AS count FROM public_card_directory");
  });

  return result.rows[0].count;
}

async function main() {
  assert(databaseUrl, "DATABASE_URL is required");
  assert(
    allowNonLocal || isLocalDatabase(databaseUrl),
    "Refusing to reset a non-local database. Set DB_VERIFY_ALLOW_NONLOCAL=1 only for disposable databases."
  );

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await pool.query("CREATE SCHEMA public");
    await applySqlFile(pool, "database/schema.sql");
    await applySqlFile(pool, "database/rls.sql");
    await prepareProbeRole(pool);
    await seedProbeData(pool);

    const noTenantCount = await countCardsAsTenant(pool, null);
    const tenantOneCount = await countCardsAsTenant(pool, 1);
    const tenantTwoCount = await countCardsAsTenant(pool, 2);
    const publicDirectoryCount = await countPublicDirectoryAsProbe(pool);

    assert(noTenantCount === 0, `expected no tenant context to see 0 cards, got ${noTenantCount}`);
    assert(tenantOneCount === 1, `expected tenant 1 to see 1 card, got ${tenantOneCount}`);
    assert(tenantTwoCount === 1, `expected tenant 2 to see 1 card, got ${tenantTwoCount}`);
    assert(
      publicDirectoryCount === 2,
      `expected public_card_directory to remain globally readable, got ${publicDirectoryCount}`
    );

    console.log("Database verified: schema.sql applied, rls.sql applied, tenant isolation probe passed.");
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

module.exports = {
  applySqlFile,
  splitSql
};
