# Database

`database/` is the project-level database boundary.

- `schema.sql` is the authoritative PostgreSQL initialization schema.
- `rls.sql` is the authoritative row-level security policy file.
- `migrations/` contains incremental database migrations.
- `scripts/` contains database validation and readiness probes.

The backend must not own database lifecycle commands or maintain a second ORM schema. Application code accesses PostgreSQL through `pg` and parameterized SQL only.

## Commands

Run database commands from this directory:

```bash
cd database
npm ci
npm run migrate
npm run check
npm run rls:validate
```

## Migrations

Migrations are plain SQL files in `migrations/`, executed by `scripts/migrate.cjs` (no framework):

- File name must match `migrate_v<major>_<minor>.sql`, for example `migrate_v1_3.sql`. Any other file in `migrations/` fails the runner.
- Order is numeric by `(major, minor)`, so `migrate_v1_2` runs before `migrate_v1_10`.
- A file is executed as a whole inside one transaction. There are no down migrations; write forward-only, idempotent SQL (`IF NOT EXISTS` / `IF EXISTS`) whenever possible.
- Start each file with a comment block stating its purpose.
- Applied migrations are recorded in the `pgmigrations` table (`id`, `name`, `run_on`; the name is the file name without `.sql`).

Create a new migration by hand: add `migrations/migrate_vX_Y.sql` with the next free version number.

### Adopting an existing database (baseline marking)

`migrate_v1_1.sql` is the full-schema baseline. On a database that already has the schema (for example production, or a database previously migrated with node-pg-migrate under the old `<timestamp>_<name>.js` naming), mark historical migrations as applied instead of executing them:

```bash
cd database
DATABASE_URL=... node scripts/migrate.cjs mark migrate_v1_1 migrate_v1_2
DATABASE_URL=... npm run migrate   # applies the rest, e.g. migrate_v1_3
```

Old node-pg-migrate rows in `pgmigrations` are ignored with a warning; they can be left in place.

## `npm run verify`

`verify` is a destructive test probe for disposable databases.

It exists to prove that:

1. `schema.sql` can initialize an empty PostgreSQL database.
2. `rls.sql` can be applied successfully.
3. tenant RLS actually isolates A/B tenant data.
4. `public_card_directory` remains readable for public-card resolution without granting `BYPASSRLS`.

It intentionally resets the target database schema:

```sql
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
```

Use it only with:

- local Docker PostgreSQL;
- a disposable test database;
- a remote empty test database with `DB_VERIFY_ALLOW_NONLOCAL=1`.

Never run `verify` on a production database or any database containing data that must be kept.

Production initialization and upgrades should run `npm run migrate` with a migration/admin role, then run only non-destructive checks.

## Admin Console Migration Entry

The admin console can display pending migrations and let an owner manually run them. The database assets still live here; the backend only acts as a controlled executor.

Configure the backend environment with:

```bash
DATABASE_DIR=database
```

Use the path that is correct for the backend process working directory. In the deployed layout produced by this repository, `database` is usually correct. When running the backend locally from `backend/`, use `../database`.

The console checks `database/migrations` against PostgreSQL's `pgmigrations` table. Running migrations executes `npm run migrate` in `DATABASE_DIR`, so production servers must have database dependencies installed in that directory.
