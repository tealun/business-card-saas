-- M1 RLS baseline. Apply after Prisma migration in environments that use PostgreSQL.
-- Prisma schema defines table shape; RLS policies live here because Prisma does not model them.

ALTER TABLE cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_cards ON cards
  USING (tenant_id = current_setting('app.tenant_id', true)::bigint);

ALTER TABLE member_identities ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_member_identities ON member_identities
  USING (tenant_id = current_setting('app.tenant_id', true)::bigint);

ALTER TABLE card_visits ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_card_visits ON card_visits
  USING (tenant_id = current_setting('app.tenant_id', true)::bigint);

ALTER TABLE card_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_card_actions ON card_actions
  USING (tenant_id = current_setting('app.tenant_id', true)::bigint);

ALTER TABLE card_shares ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_card_shares ON card_shares
  USING (tenant_id = current_setting('app.tenant_id', true)::bigint);

ALTER TABLE account_identity_bindings ENABLE ROW LEVEL SECURITY;
CREATE POLICY aib_tenant_ctx ON account_identity_bindings
  USING (tenant_id = current_setting('app.tenant_id', true)::bigint);
CREATE POLICY aib_account_ctx ON account_identity_bindings
  USING (account_id = current_setting('app.account_id', true)::bigint);

-- account_preferences has no tenant_id. It is visible only in account context.
ALTER TABLE account_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY account_preferences_account_ctx ON account_preferences
  USING (account_id = current_setting('app.account_id', true)::bigint);

-- public_card_directory intentionally has no tenant RLS. Public service role may only read this table
-- and then must enter TenantTx before reading tenant business tables.
