CREATE TABLE IF NOT EXISTS "tenant_wecom_settings" (
    "tenant_id" BIGINT NOT NULL,
    "auto_sync_on_auth" BOOLEAN NOT NULL DEFAULT true,
    "auto_create_cards" BOOLEAN NOT NULL DEFAULT true,
    "auto_disable_left_members" BOOLEAN NOT NULL DEFAULT true,
    "allow_employee_privacy_edit" BOOLEAN NOT NULL DEFAULT true,
    "allow_employee_share_edit" BOOLEAN NOT NULL DEFAULT true,
    "allow_employee_wecom_qrcode_upload" BOOLEAN NOT NULL DEFAULT true,
    "qrcode_source" TEXT NOT NULL DEFAULT 'enterprise_first',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tenant_wecom_settings_pkey" PRIMARY KEY ("tenant_id"),
    CONSTRAINT "tenant_wecom_settings_qrcode_source_check"
      CHECK ("qrcode_source" IN ('enterprise_first', 'employee_upload_only', 'enterprise_only'))
);

ALTER TABLE "tenant_wecom_settings"
  ADD CONSTRAINT "tenant_wecom_settings_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE tenant_wecom_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_tenant_wecom_settings ON tenant_wecom_settings;
CREATE POLICY tenant_isolation_tenant_wecom_settings ON tenant_wecom_settings
  USING (tenant_id = current_setting('app.tenant_id', true)::bigint);
