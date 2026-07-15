-- Persist WeCom authorization cancellation time so revoked tenants can be
-- disabled atomically with credential removal. Idempotent for existing sites.
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS cancel_auth_time TIMESTAMPTZ(6);
