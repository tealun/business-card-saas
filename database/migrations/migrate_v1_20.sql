-- migrate_v1_20.sql
-- Purpose: platform-managed local enterprise lifecycle (status/soft-delete) and
--          a reserved member_limit for future WeCom paid-seat upgrades.
-- Production: node database/scripts/migrate.cjs

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS status VARCHAR(16) NOT NULL DEFAULT 'active';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ(6);
-- member_limit is NULL for unlimited local enterprises; a positive integer once a
-- tenant is upgraded to WeCom mode and bound to a paid seat quota.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS member_limit INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'tenants'::regclass
      AND conname = 'tenants_status_check'
  ) THEN
    ALTER TABLE tenants
      ADD CONSTRAINT tenants_status_check CHECK (status IN ('active','disabled'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'tenants'::regclass
      AND conname = 'tenants_member_limit_check'
  ) THEN
    ALTER TABLE tenants
      ADD CONSTRAINT tenants_member_limit_check CHECK (member_limit IS NULL OR member_limit > 0);
  END IF;
END $$;

-- Platform tenant listing and login identity assembly filter soft-deleted rows.
CREATE INDEX IF NOT EXISTS idx_tenants_status_deleted ON tenants(status, deleted_at);
