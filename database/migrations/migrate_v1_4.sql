-- migrate_v1_4.sql
-- 管理后台超级管理员账号密码登录（99_56 整改）。
-- platform_admins 是平台级表：密码登录发生在租户上下文建立之前，
-- 与 callback_events 同类，不启用租户 RLS。幂等，可重复执行。

CREATE TABLE IF NOT EXISTS "platform_admins" (
    "id" BIGSERIAL NOT NULL,
    "username" VARCHAR(64) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "tenant_id" BIGINT NOT NULL,
    "role" VARCHAR(32) NOT NULL DEFAULT 'owner',
    "status" VARCHAR(32) NOT NULL DEFAULT 'active',
    "password_updated_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "platform_admins_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "platform_admins_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "uk_platform_admins_username" ON "platform_admins"("username");
