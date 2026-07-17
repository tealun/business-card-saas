CREATE TABLE IF NOT EXISTS "admin_operation_logs" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "actor_admin_id" BIGINT,
    "actor_open_userid" VARCHAR(128),
    "actor_name" VARCHAR(128),
    "actor_role" VARCHAR(32) NOT NULL,
    "account_type" VARCHAR(16) NOT NULL DEFAULT 'tenant',
    "action" VARCHAR(64) NOT NULL,
    "target_type" VARCHAR(64),
    "target_id" VARCHAR(128),
    "detail_json" JSONB,
    "ip" VARCHAR(64),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    CONSTRAINT "admin_operation_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "admin_operation_logs_tenant_created_idx" ON "admin_operation_logs" ("tenant_id", "created_at" DESC);
