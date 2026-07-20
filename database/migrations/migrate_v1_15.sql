-- migrate_v1_15.sql
-- ============================================================================
-- 用途: 将企业租户从企业微信授权中解耦（第一阶段兼容迁移）。
-- 1) tenants 增加 creation_source(local/wecom/personal)；2) open_corpid 改为可空；
-- 3) auth_status 增加 unconnected 默认态；4) open_corpid 唯一索引仅约束非空值。
-- 风险: 保留全部既有企微凭据和状态；tenant_connectors 待双写/回填验证后再引入。
-- 生产执行: node database/scripts/migrate.cjs
-- 后置验证:
-- SELECT creation_source, auth_status, count(*) FROM tenants GROUP BY 1,2 ORDER BY 1,2;
-- SELECT count(*) FROM tenants WHERE creation_source='wecom' AND open_corpid IS NULL;
-- ============================================================================

ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "creation_source" VARCHAR(32);

UPDATE "tenants"
SET "creation_source" = CASE
  WHEN "tenant_type" = 'personal' THEN 'personal'
  WHEN "open_corpid" IS NOT NULL THEN 'wecom'
  ELSE 'local'
END
WHERE "creation_source" IS NULL;

ALTER TABLE "tenants"
  ALTER COLUMN "creation_source" SET DEFAULT 'local',
  ALTER COLUMN "creation_source" SET NOT NULL,
  ALTER COLUMN "open_corpid" DROP NOT NULL,
  ALTER COLUMN "auth_status" SET DEFAULT 'unconnected';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'tenants'::regclass AND conname = 'tenants_creation_source_check'
  ) THEN
    ALTER TABLE "tenants" DROP CONSTRAINT "tenants_creation_source_check";
  END IF;
END $$;

ALTER TABLE "tenants"
  ADD CONSTRAINT "tenants_creation_source_check"
  CHECK ("creation_source" IN ('local','wecom','personal')) NOT VALID;
ALTER TABLE "tenants" VALIDATE CONSTRAINT "tenants_creation_source_check";

DROP INDEX IF EXISTS "uk_tenants_open_corpid";
CREATE UNIQUE INDEX "uk_tenants_open_corpid"
  ON "tenants"("open_corpid") WHERE "open_corpid" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_tenants_creation_source"
  ON "tenants"("tenant_type", "creation_source");
