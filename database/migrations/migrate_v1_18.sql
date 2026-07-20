-- migrate_v1_18.sql
-- Purpose: enforce one account identity per enterprise and tenant/member integrity.
-- Production: node database/scripts/migrate.cjs

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM account_identity_bindings
    GROUP BY tenant_id, account_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'duplicate account identity bindings exist; resolve tenant_id/account_id conflicts before v1_18';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uk_binding_tenant_account
  ON account_identity_bindings(tenant_id, account_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='account_identity_bindings'::regclass
      AND conname='account_identity_bindings_tenant_member_fkey'
  ) THEN
    ALTER TABLE account_identity_bindings
      ADD CONSTRAINT account_identity_bindings_tenant_member_fkey
      FOREIGN KEY (tenant_id,member_identity_id)
      REFERENCES member_identities(tenant_id,id)
      ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
  END IF;
END $$;
ALTER TABLE account_identity_bindings VALIDATE CONSTRAINT account_identity_bindings_tenant_member_fkey;
