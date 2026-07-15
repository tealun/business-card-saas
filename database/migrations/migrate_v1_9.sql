-- One-time state for third-party snsapi_privateinfo member authorization.
-- Only hashed state/member identifiers are stored; codes and user_ticket are ephemeral.
CREATE TABLE IF NOT EXISTS wecom_sensitive_auth_states (
  state_hash VARCHAR(64) PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  member_identity_id BIGINT NOT NULL,
  open_corpid VARCHAR(128) NOT NULL,
  open_userid_hash VARCHAR(64) NOT NULL,
  expires_at TIMESTAMPTZ(6) NOT NULL,
  consumed_at TIMESTAMPTZ(6),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wecom_sensitive_auth_states_expiry
  ON wecom_sensitive_auth_states(expires_at);

-- The callback resolves tenant context by atomically consuming the high-entropy state hash.
-- Raw OAuth state, code, and user_ticket are never persisted in this table.
ALTER TABLE wecom_sensitive_auth_states DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_wecom_sensitive_auth_states ON wecom_sensitive_auth_states;
