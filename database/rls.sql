-- M1 RLS baseline. Apply after database/schema.sql in PostgreSQL environments.
-- Table shape lives in database/schema.sql; RLS policies live here.

ALTER TABLE cards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_cards ON cards;
CREATE POLICY tenant_isolation_cards ON cards
  USING (tenant_id = current_setting('app.tenant_id', true)::bigint);

ALTER TABLE member_identities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_member_identities ON member_identities;
CREATE POLICY tenant_isolation_member_identities ON member_identities
  USING (tenant_id = current_setting('app.tenant_id', true)::bigint);

ALTER TABLE card_visits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_card_visits ON card_visits;
CREATE POLICY tenant_isolation_card_visits ON card_visits
  USING (tenant_id = current_setting('app.tenant_id', true)::bigint);

ALTER TABLE card_actions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_card_actions ON card_actions;
CREATE POLICY tenant_isolation_card_actions ON card_actions
  USING (tenant_id = current_setting('app.tenant_id', true)::bigint);

ALTER TABLE card_shares ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_card_shares ON card_shares;
CREATE POLICY tenant_isolation_card_shares ON card_shares
  USING (tenant_id = current_setting('app.tenant_id', true)::bigint);

ALTER TABLE tenant_admins ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_tenant_admins ON tenant_admins;
CREATE POLICY tenant_isolation_tenant_admins ON tenant_admins
  USING (tenant_id = current_setting('app.tenant_id', true)::bigint);

ALTER TABLE admin_claim_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_admin_claim_tokens ON admin_claim_tokens;
CREATE POLICY tenant_isolation_admin_claim_tokens ON admin_claim_tokens
  USING (tenant_id = current_setting('app.tenant_id', true)::bigint);

ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_templates ON templates;
CREATE POLICY tenant_isolation_templates ON templates
  USING (tenant_id = current_setting('app.tenant_id', true)::bigint);

ALTER TABLE tenant_field_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_tenant_field_settings ON tenant_field_settings;
CREATE POLICY tenant_isolation_tenant_field_settings ON tenant_field_settings
  USING (tenant_id = current_setting('app.tenant_id', true)::bigint);

ALTER TABLE company_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_company_profiles ON company_profiles;
CREATE POLICY tenant_isolation_company_profiles ON company_profiles
  USING (tenant_id = current_setting('app.tenant_id', true)::bigint);

ALTER TABLE company_videos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_company_videos ON company_videos;
CREATE POLICY tenant_isolation_company_videos ON company_videos
  USING (tenant_id = current_setting('app.tenant_id', true)::bigint);

ALTER TABLE company_honors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_company_honors ON company_honors;
CREATE POLICY tenant_isolation_company_honors ON company_honors
  USING (tenant_id = current_setting('app.tenant_id', true)::bigint);

ALTER TABLE company_honor_images ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_company_honor_images ON company_honor_images;
CREATE POLICY tenant_isolation_company_honor_images ON company_honor_images
  USING (tenant_id = current_setting('app.tenant_id', true)::bigint);

ALTER TABLE card_style_overrides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_card_style_overrides ON card_style_overrides;
CREATE POLICY tenant_isolation_card_style_overrides ON card_style_overrides
  USING (tenant_id = current_setting('app.tenant_id', true)::bigint);

ALTER TABLE account_identity_bindings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aib_tenant_ctx ON account_identity_bindings;
CREATE POLICY aib_tenant_ctx ON account_identity_bindings
  USING (tenant_id = current_setting('app.tenant_id', true)::bigint);
DROP POLICY IF EXISTS aib_account_ctx ON account_identity_bindings;
CREATE POLICY aib_account_ctx ON account_identity_bindings
  USING (account_id = current_setting('app.account_id', true)::bigint);

-- account_preferences has no tenant_id. It is visible only in account context.
ALTER TABLE account_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS account_preferences_account_ctx ON account_preferences;
CREATE POLICY account_preferences_account_ctx ON account_preferences
  USING (account_id = current_setting('app.account_id', true)::bigint);

-- public_card_directory intentionally has no tenant RLS. Public service role may only read this table
-- and then must enter TenantTx before reading tenant business tables.

-- platform_admins is a platform operations table (super-admin password login happens before any
-- tenant context exists). It intentionally does not use tenant RLS.

-- callback_events is a platform operations table. It intentionally does not use tenant RLS because
-- callbacks can arrive before a tenant is known and retry/admin event queries are platform-scoped.
ALTER TABLE callback_events DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_callback_events ON callback_events;
