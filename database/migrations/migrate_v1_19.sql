-- migrate_v1_19.sql
-- Purpose: one-time local enterprise admin browser login challenges.
CREATE TABLE IF NOT EXISTS local_admin_login_challenges (
 id BIGSERIAL PRIMARY KEY, token_hash VARCHAR(64) NOT NULL,
 account_id BIGINT REFERENCES accounts(id), tenant_id BIGINT REFERENCES tenants(id), member_identity_id BIGINT,
 status VARCHAR(16) NOT NULL DEFAULT 'pending', expires_at TIMESTAMPTZ(6) NOT NULL,
 approved_at TIMESTAMPTZ(6), consumed_at TIMESTAMPTZ(6), created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
 CONSTRAINT local_admin_login_challenges_status_check CHECK(status IN ('pending','approved','consumed')),
 CONSTRAINT local_admin_login_challenges_tenant_member_fkey FOREIGN KEY(tenant_id,member_identity_id) REFERENCES member_identities(tenant_id,id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uk_local_admin_login_challenges_token ON local_admin_login_challenges(token_hash);
CREATE INDEX IF NOT EXISTS idx_local_admin_login_challenges_expiry ON local_admin_login_challenges(status,expires_at);
ALTER TABLE local_admin_login_challenges DISABLE ROW LEVEL SECURITY;
