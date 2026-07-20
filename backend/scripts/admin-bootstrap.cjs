// One-time platform operator bootstrap for the admin console (99_56 A-P1-5).
//
// Creates (or reuses) a tenant owner in tenant_admins and prints a signed admin
// access token that can be pasted into the admin console login gate. Optionally
// marks already-applied migrations in pgmigrations so the console's migration
// runner starts from a clean baseline.
//
// Requires DATABASE_URL and ADMIN_JWT_SECRET in the environment. On the server:
//
//   cd <deploy-path>
//   node --env-file=.env scripts/admin-bootstrap.cjs list
//   node --env-file=.env scripts/admin-bootstrap.cjs setup \
//     --tenant-name "平台运营" --open-userid <your-id> \
//     --mark migrate_v1_1,migrate_v1_2
//
// Security note: this tool must stay server-side only. Anyone with these env
// secrets already owns the deployment; the tool adds no new remote surface.

const { createHmac } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { parseArgs } = require("node:util");
const { Pool } = require("pg");

const BOOTSTRAP_CORPID = "platform:bootstrap";

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    fail(`${name} must be set (hint: run with node --env-file=.env)`);
  }
  return value;
}

function migrationsDir() {
  const candidates = [
    path.join(__dirname, "..", "database", "migrations"),
    path.join(__dirname, "..", "..", "database", "migrations")
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function signAdminToken(secret, session, ttlHours) {
  const payload = {
    ...session,
    exp: Math.floor(Date.now() / 1000) + Math.round(ttlHours * 3600)
  };
  const encodedPayload = Buffer.from(JSON.stringify({ payload })).toString("base64url");
  const sig = createHmac("sha256", secret).update(`v1.admin-session.${encodedPayload}`).digest("base64url");
  return `${encodedPayload}.${sig}`;
}

async function listTenants(pool) {
  const result = await pool.query(
    "SELECT id, name, open_corpid, auth_status, created_at FROM tenants ORDER BY id ASC LIMIT 50"
  );
  if (!result.rows.length) {
    console.log("no tenants yet — run setup with --tenant-name to create one");
    return;
  }
  for (const row of result.rows) {
    console.log(`tenant_id=${row.id}  name=${row.name}  open_corpid=${row.open_corpid}  auth_status=${row.auth_status}`);
  }
}

async function resolveTenant(client, options) {
  if (options.tenantId) {
    const result = await client.query("SELECT id, name FROM tenants WHERE id = $1", [options.tenantId]);
    if (!result.rows[0]) {
      fail(`tenant ${options.tenantId} does not exist (use 'list' to see tenants)`);
    }
    return { id: String(result.rows[0].id), name: result.rows[0].name };
  }
  if (!options.tenantName) {
    fail("either --tenant-id or --tenant-name is required");
  }
  // Deliberately avoids newer optional columns (e.g. tenant_type) so the tool
  // works on databases that still have pending migrations.
  const result = await client.query(
    `
      INSERT INTO tenants (name, open_corpid, auth_status, created_at, updated_at)
      VALUES ($1, $2, 'active', now(), now())
      ON CONFLICT (open_corpid) WHERE open_corpid IS NOT NULL DO UPDATE SET updated_at = now()
      RETURNING id, name
    `,
    [options.tenantName, BOOTSTRAP_CORPID]
  );
  return { id: String(result.rows[0].id), name: result.rows[0].name };
}

async function ensureOwner(client, input) {
  // tenant_admins is RLS-protected: set the tenant context first (transaction-local).
  await client.query("SELECT set_config('app.tenant_id', $1, true)", [input.tenantId]);
  const existing = await client.query(
    `
      SELECT tenant_id, member_identity_id, open_userid, role
      FROM tenant_admins
      WHERE tenant_id = $1 AND role = 'owner' AND status = 'active'
      LIMIT 1
    `,
    [input.tenantId]
  );
  const owner = existing.rows[0];
  if (owner) {
    if (owner.open_userid !== input.openUserid) {
      fail(
        `tenant ${input.tenantId} already has an active owner (open_userid=${owner.open_userid}); ` +
          "refusing to add a second owner"
      );
    }
    console.log(`owner already exists for tenant ${input.tenantId}, reusing it`);
    return { memberIdentityId: owner.member_identity_id === null ? null : String(owner.member_identity_id) };
  }
  const created = await client.query(
    `
      INSERT INTO tenant_admins (tenant_id, member_identity_id, open_userid, role, status, created_at, updated_at)
      VALUES ($1, $2, $3, 'owner', 'active', now(), now())
      RETURNING member_identity_id
    `,
    [input.tenantId, input.memberIdentityId ?? null, input.openUserid]
  );
  console.log(`created owner for tenant ${input.tenantId} (open_userid=${input.openUserid})`);
  const memberIdentityId = created.rows[0]?.member_identity_id;
  return { memberIdentityId: memberIdentityId === null || memberIdentityId === undefined ? null : String(memberIdentityId) };
}

async function markMigrations(client, names) {
  const dir = migrationsDir();
  if (dir) {
    const known = new Set(fs.readdirSync(dir).map((file) => file.replace(/\.sql$/, "")));
    const unknown = names.filter((name) => !known.has(name));
    if (unknown.length) {
      fail(`unknown migration names: ${unknown.join(", ")} (files in ${dir})`);
    }
  } else {
    console.warn("warning: migrations directory not found next to this script; marking without validation");
  }
  await client.query(
    'CREATE TABLE IF NOT EXISTS "pgmigrations" (id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, run_on TIMESTAMP NOT NULL)'
  );
  for (const name of names) {
    const existing = await client.query("SELECT 1 FROM pgmigrations WHERE name = $1", [name]);
    if (existing.rows[0]) {
      console.log(`already marked ${name}`);
      continue;
    }
    await client.query("INSERT INTO pgmigrations (name, run_on) VALUES ($1, now())", [name]);
    console.log(`marked ${name} as applied (not executed)`);
  }
}

async function main() {
  const { values, positionals } = parseArgs({
    options: {
      "tenant-id": { type: "string" },
      "tenant-name": { type: "string" },
      "open-userid": { type: "string" },
      "member-identity-id": { type: "string" },
      mark: { type: "string" },
      "token-ttl-hours": { type: "string", default: "8" }
    },
    allowPositionals: true
  });
  const command = positionals[0] ?? "setup";
  const databaseUrl = requireEnv("DATABASE_URL");

  const pool = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 10_000 });
  try {
    if (command === "list") {
      await listTenants(pool);
      return;
    }
    if (command !== "setup") {
      fail(`unknown command '${command}'. Use 'setup' (default) or 'list'.`);
    }

    const openUserid = values["open-userid"];
    if (!openUserid) {
      fail("--open-userid is required for setup");
    }
    const secret = requireEnv("ADMIN_JWT_SECRET");
    const ttlHours = Number(values["token-ttl-hours"]);
    if (!Number.isFinite(ttlHours) || ttlHours <= 0 || ttlHours > 72) {
      fail("--token-ttl-hours must be a number between 0 and 72");
    }

    const client = await pool.connect();
    let session;
    try {
      await client.query("BEGIN");
      const tenant = await resolveTenant(client, {
        tenantId: values["tenant-id"],
        tenantName: values["tenant-name"]
      });
      const owner = await ensureOwner(client, {
        tenantId: tenant.id,
        openUserid,
        memberIdentityId: values["member-identity-id"]
      });
      if (values.mark) {
        const names = values.mark.split(",").map((name) => name.trim()).filter(Boolean);
        await markMigrations(client, names);
      }
      await client.query("COMMIT");
      session = {
        tenantId: tenant.id,
        tenantName: tenant.name,
        memberIdentityId: owner.memberIdentityId,
        openUserid,
        role: "owner"
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }

    const token = signAdminToken(secret, session, ttlHours);
    console.log("");
    console.log(`tenant_id: ${session.tenantId}`);
    console.log(`tenant_name: ${session.tenantName}`);
    console.log(`role: owner, token valid for ${ttlHours}h`);
    console.log("");
    console.log("admin access token (paste into the console login gate 「使用访问令牌登录」):");
    console.log(token);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
