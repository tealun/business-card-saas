-- migrate_v1_7.sql
-- Configurable company-card modules plus platform-controlled video entitlement.

ALTER TABLE "company_profiles"
  ADD COLUMN IF NOT EXISTS "service_items_json" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "display_modules_json" JSONB NOT NULL DEFAULT '[{"key":"services","title":"产品与服务","visible":true,"sort_order":10,"layout":"graphic"},{"key":"profile","title":"企业简介","visible":true,"sort_order":20,"layout":"carousel"},{"key":"videos","title":"企业视频","visible":false,"sort_order":30,"layout":"carousel"},{"key":"honors","title":"荣誉资质","visible":true,"sort_order":40,"layout":"carousel"}]'::jsonb;

CREATE TABLE IF NOT EXISTS "platform_feature_settings" (
  "feature_key" VARCHAR(64) PRIMARY KEY,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "default_limit_bytes" BIGINT NOT NULL DEFAULT 524288000 CHECK (default_limit_bytes BETWEEN 1048576 AND 1073741824),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "tenant_feature_settings" (
  "tenant_id" BIGINT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "feature_key" VARCHAR(64) NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "limit_bytes" BIGINT CHECK (limit_bytes IS NULL OR limit_bytes >= 1048576),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  PRIMARY KEY ("tenant_id", "feature_key")
);

INSERT INTO "platform_feature_settings" (feature_key, enabled, default_limit_bytes, updated_at)
VALUES ('company_video_upload', false, 524288000, now())
ON CONFLICT (feature_key) DO NOTHING;

-- IF NOT EXISTS must not silently accept incompatible pre-existing columns.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='company_profiles' AND column_name='service_items_json' AND data_type='jsonb' AND is_nullable='NO') THEN
    RAISE EXCEPTION 'company_profiles.service_items_json must be NOT NULL jsonb';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='company_profiles' AND column_name='display_modules_json' AND data_type='jsonb' AND is_nullable='NO') THEN
    RAISE EXCEPTION 'company_profiles.display_modules_json must be NOT NULL jsonb';
  END IF;
END $$;
