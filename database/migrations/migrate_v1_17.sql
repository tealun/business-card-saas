-- migrate_v1_17.sql
-- Purpose: shared enterprise QR codes and approval-only join requests.
-- Production: node database/scripts/migrate.cjs
CREATE TABLE IF NOT EXISTS tenant_join_codes (
 id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL REFERENCES tenants(id), token_hash VARCHAR(64) NOT NULL,
 expires_at TIMESTAMPTZ(6) NOT NULL, revoked_at TIMESTAMPTZ(6), created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS member_join_requests (
 id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL REFERENCES tenants(id), account_id BIGINT NOT NULL REFERENCES accounts(id),
 display_name VARCHAR(128) NOT NULL, status VARCHAR(16) NOT NULL DEFAULT 'pending', reviewed_by_admin_id BIGINT,
 reviewed_at TIMESTAMPTZ(6), created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
 CONSTRAINT member_join_requests_status_check CHECK (status IN ('pending','approved','rejected','cancelled'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uk_tenant_join_codes_token_hash ON tenant_join_codes(token_hash);
CREATE INDEX IF NOT EXISTS idx_tenant_join_codes_tenant ON tenant_join_codes(tenant_id,expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS uk_member_join_requests_pending ON member_join_requests(tenant_id,account_id) WHERE status='pending';
CREATE INDEX IF NOT EXISTS idx_member_join_requests_tenant_status ON member_join_requests(tenant_id,status,created_at);
ALTER TABLE tenant_join_codes DISABLE ROW LEVEL SECURITY;
ALTER TABLE member_join_requests DISABLE ROW LEVEL SECURITY;
