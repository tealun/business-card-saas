# Database

`database/` is the project-level database boundary.

- `schema.sql` is the authoritative PostgreSQL initialization schema.
- `rls.sql` is the authoritative row-level security policy file.

The backend must not maintain a second ORM schema. Application code accesses PostgreSQL through `pg` and parameterized SQL only.

## `npm run db:verify`

`db:verify` is a destructive test probe for disposable databases.

It exists to prove that:

1. `database/schema.sql` can initialize an empty PostgreSQL database.
2. `database/rls.sql` can be applied successfully.
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

Never run `db:verify` on a production database or any database containing data that must be kept.

Production initialization should execute `schema.sql` and `rls.sql` directly with a migration/admin role, then run only non-destructive checks.
