-- Harden admin_operation_logs (added in migrate_v1_12): add the tenant_id foreign key that was
-- omitted, and an index that serves unfiltered platform-wide reads (GET /admin/platform/operation-logs
-- without a tenant_id filter), which the existing (tenant_id, created_at DESC) index cannot serve. See 99_71.

ALTER TABLE "admin_operation_logs"
  ADD CONSTRAINT "admin_operation_logs_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "admin_operation_logs_created_idx" ON "admin_operation_logs" ("created_at" DESC);
