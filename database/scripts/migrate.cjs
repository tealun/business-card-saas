// Minimal SQL migration runner. Replaces node-pg-migrate (99_55 follow-up).
//
// Conventions (Moread style):
// - Migration files live in database/migrations and are named migrate_v<major>_<minor>.sql.
// - A file is plain SQL, executed as a whole inside one transaction. No down migrations.
// - Applied migrations are recorded in the pgmigrations table (same shape node-pg-migrate
//   used: id/name/run_on), so existing history tooling keeps working.
//
// Usage:
//   node scripts/migrate.cjs                      # apply pending migrations in order
//   node scripts/migrate.cjs mark <name> [...]    # record migrations as applied WITHOUT
//                                                 # executing them (baseline adoption on
//                                                 # databases that already have the schema)

const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");

const MIGRATIONS_DIR = path.resolve(__dirname, "..", "migrations");
const MIGRATION_PATTERN = /^migrate_v(\d+)_(\d+)\.sql$/;
// Same advisory lock id spirit as node-pg-migrate: prevent concurrent runners.
const LOCK_ID = "7241865325823965";

function listMigrations(dir = MIGRATIONS_DIR) {
  const entries = fs.readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isFile());
  const invalid = entries.map((entry) => entry.name).filter((name) => !MIGRATION_PATTERN.test(name));
  if (invalid.length) {
    throw new Error(
      `migrations directory only allows migrate_v<major>_<minor>.sql files, found: ${invalid.join(", ")}`
    );
  }
  const migrations = entries.map((entry) => {
    const match = MIGRATION_PATTERN.exec(entry.name);
    return {
      fileName: entry.name,
      name: entry.name.replace(/\.sql$/, ""),
      major: Number(match[1]),
      minor: Number(match[2]),
      filePath: path.join(dir, entry.name)
    };
  });
  migrations.sort((a, b) => a.major - b.major || a.minor - b.minor);
  for (let i = 1; i < migrations.length; i += 1) {
    const prev = migrations[i - 1];
    const curr = migrations[i];
    if (prev.major === curr.major && prev.minor === curr.minor) {
      throw new Error(`duplicate migration version: ${prev.fileName} and ${curr.fileName}`);
    }
  }
  return migrations;
}

async function ensureMigrationTable(client) {
  await client.query(
    'CREATE TABLE IF NOT EXISTS "pgmigrations" (id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, run_on TIMESTAMP NOT NULL)'
  );
}

async function readAppliedNames(client) {
  const result = await client.query("SELECT name FROM pgmigrations ORDER BY run_on ASC, name ASC");
  return new Set(result.rows.map((row) => row.name));
}

function splitPending(migrations, appliedNames) {
  const applied = migrations.filter((migration) => appliedNames.has(migration.name));
  const pending = migrations.filter((migration) => !appliedNames.has(migration.name));
  // A pending migration older than an already applied one means history drift
  // (e.g. a version number was reused). Refuse instead of running out of order.
  const lastApplied = applied[applied.length - 1];
  if (lastApplied) {
    const outOfOrder = pending.filter(
      (migration) =>
        migration.major < lastApplied.major ||
        (migration.major === lastApplied.major && migration.minor < lastApplied.minor)
    );
    if (outOfOrder.length) {
      throw new Error(
        `pending migrations precede already applied ${lastApplied.name}: ` +
          `${outOfOrder.map((migration) => migration.name).join(", ")}. ` +
          "Fix the version numbers, or use 'mark' if they were applied manually."
      );
    }
  }
  return pending;
}

async function runPending(client) {
  const migrations = listMigrations();
  await ensureMigrationTable(client);
  const appliedNames = await readAppliedNames(client);
  for (const appliedName of appliedNames) {
    if (!migrations.some((migration) => migration.name === appliedName)) {
      console.warn(`warning: pgmigrations has '${appliedName}' with no matching file (pre-conversion history?)`);
    }
  }
  const pending = splitPending(migrations, appliedNames);
  if (!pending.length) {
    console.log("No pending migrations.");
    return;
  }
  for (const migration of pending) {
    const sql = fs.readFileSync(migration.filePath, "utf8");
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO pgmigrations (name, run_on) VALUES ($1, now())", [migration.name]);
      await client.query("COMMIT");
      console.log(`applied ${migration.name}`);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      error.message = `migration ${migration.fileName} failed: ${error.message}`;
      throw error;
    }
  }
  console.log(`Migrations complete: ${pending.length} applied.`);
}

async function markApplied(client, names) {
  if (!names.length) {
    throw new Error("usage: node scripts/migrate.cjs mark <migration-name> [...]");
  }
  const migrations = listMigrations();
  const known = new Set(migrations.map((migration) => migration.name));
  const unknown = names.filter((name) => !known.has(name));
  if (unknown.length) {
    throw new Error(`unknown migration names: ${unknown.join(", ")}`);
  }
  await ensureMigrationTable(client);
  const appliedNames = await readAppliedNames(client);
  for (const name of names) {
    if (appliedNames.has(name)) {
      console.log(`already marked ${name}`);
      continue;
    }
    await client.query("INSERT INTO pgmigrations (name, run_on) VALUES ($1, now())", [name]);
    console.log(`marked ${name} as applied (not executed)`);
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }
  const [command = "up", ...args] = process.argv.slice(2);
  if (command !== "up" && command !== "mark") {
    throw new Error(`unknown command '${command}'. Use 'up' (default) or 'mark <name> [...]'.`);
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    connectionTimeoutMillis: 10_000,
    application_name: "business-card-migrate"
  });
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [LOCK_ID]);
    if (command === "mark") {
      await markApplied(client, args);
    } else {
      await runPending(client);
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [LOCK_ID]).catch(() => {});
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { listMigrations, splitPending, MIGRATION_PATTERN };
