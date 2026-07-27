-- migrate_v1_21.sql
-- Purpose: fix 99_74-P0-1 — admin_claim_tokens kept RLS enabled, but the local
--          enterprise claim flow resolves the tenant from an opaque claim token
--          before tenant context can be set, so every claim lookup was silently
--          filtered to zero rows by tenant_isolation_admin_claim_tokens. Disable
--          RLS on this table (matching tenant_join_codes/member_join_requests/
--          local_admin_login_challenges); every consumer already filters writes
--          by tenant_id explicitly.
-- Production: node database/scripts/migrate.cjs

DROP POLICY IF EXISTS tenant_isolation_admin_claim_tokens ON admin_claim_tokens;
ALTER TABLE admin_claim_tokens DISABLE ROW LEVEL SECURITY;
