-- migrate_v1_16.sql
-- Purpose: local enterprise owner login and one-time employee invitations (D3-D5).
-- Production: node database/scripts/migrate.cjs

ALTER TABLE tenant_admins DROP CONSTRAINT IF EXISTS tenant_admins_auth_source_check;
ALTER TABLE tenant_admins ADD CONSTRAINT tenant_admins_auth_source_check
  CHECK (auth_source IN ('claim_token','wecom_scan','local_account')) NOT VALID;
ALTER TABLE tenant_admins VALIDATE CONSTRAINT tenant_admins_auth_source_check;

CREATE TABLE IF NOT EXISTS member_invitations (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  member_identity_id BIGINT NOT NULL REFERENCES member_identities(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  token_hash VARCHAR(64) NOT NULL,
  created_by_admin_id BIGINT,
  expires_at TIMESTAMPTZ(6) NOT NULL,
  used_at TIMESTAMPTZ(6),
  revoked_at TIMESTAMPTZ(6),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uk_member_invitations_token_hash ON member_invitations(token_hash);
CREATE INDEX IF NOT EXISTS idx_member_invitations_tenant_member ON member_invitations(tenant_id, member_identity_id);
ALTER TABLE member_invitations DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_member_invitations ON member_invitations;
