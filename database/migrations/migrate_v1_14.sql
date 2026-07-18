-- migrate_v1_14.sql
-- ============================================================================
-- 用途: 管理后台账号登录系统（docs/01-specs/01_09）所需结构演进
--   1) platform_admins: role 枚举扩展为 01_08 角色矩阵；存量 'owner' 归一为 'platform_owner'；
--      role 默认值同步改为 'platform_owner'（旧默认与新 CHECK 冲突）；新增 created_by
--   2) tenant_admins: 新增 last_login_at / auth_source（存量归一为 'claim_token'）
--   3) 新表 admin_auth_states: 企业微信扫码登录一次性 state（平台级表，不入租户 RLS，与 admin_claim_tokens 同级）
-- 原因/风险: 平台账号管理（创建/角色/删除）与企业扫码登录（02_04 M1）依赖；存量 role 值变更，先跑 PRE-FLIGHT
-- 生产执行（与既有迁移一致：runner 把整文件包在单事务中，仅前滚、幂等）:
--   node database/scripts/migrate.cjs            -- 常规方式：runner 按序执行并记录 pgmigrations
--   -- 或手动（-1 = --single-transaction，替代本文件内嵌 BEGIN/COMMIT；runner 路径禁止内嵌事务，
--   -- 否则内嵌 COMMIT 会提前提交 runner 事务，pgmigrations 记录失去原子性）:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f database/migrations/migrate_v1_14.sql
-- 后置步骤: 无新增数据库角色授权（应用经 backend 单一角色连接）；执行后回填 02_04 Evidence
-- 注意: PRE-FLIGHT 已于 2026-07-18 对照 database/schema.sql 实际 DDL 完成核对（见下方逐项结论）
-- ============================================================================

-- ============ PRE-FLIGHT（只读，逐项人工确认；任一不符即中止并修订本文件） ============
-- P1. 确认 platform_admins 现有 role 取值（预期仅 'owner'；若有其他值，先扩展下方 UPDATE 映射）
--     SELECT role, count(*) FROM platform_admins GROUP BY 1;
--     [代码侧已核实] 唯一 INSERT 来源为 bootstrap（硬编码 'owner'），与预期一致；存量数据仍以查询为准。
-- P2. platform_admins.role 的 CHECK 约束（[已核实] schema.sql L226-238 无 CHECK，列为 VARCHAR(32) DEFAULT 'owner'）
--     SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--     WHERE conrelid = 'platform_admins'::regclass AND contype = 'c';
--     下方 DROP 段为防御性幂等：若目标库曾手工加过同名约束也能平滑替换。
-- P3. 确认 tenant_admins 尚无 last_login_at / auth_source 列（[已核实] schema.sql L210-221 无此二列）
--     SELECT column_name FROM information_schema.columns WHERE table_name = 'tenant_admins';
-- P4. 确认 platform_admins 尚无 created_by 列（[已核实] schema.sql L226-238 无此列）
--     SELECT column_name FROM information_schema.columns WHERE table_name = 'platform_admins';

-- ============ 1) platform_admins ============

ALTER TABLE "platform_admins"
  ADD COLUMN IF NOT EXISTS "created_by" VARCHAR(64);  -- 创建人 username，对齐 username 列宽

-- 存量角色归一：'owner' → 'platform_owner'（01_08 矩阵中的内建超管；须在 CHECK 替换前完成）
UPDATE "platform_admins" SET "role" = 'platform_owner' WHERE "role" = 'owner';

-- 防御性幂等：若已存在同名约束（首次执行中断后重跑、或手工加过）先 DROP
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'platform_admins'::regclass AND conname = 'platform_admins_role_check'
  ) THEN
    ALTER TABLE "platform_admins" DROP CONSTRAINT "platform_admins_role_check";
  END IF;
END $$;

ALTER TABLE "platform_admins"
  ADD CONSTRAINT "platform_admins_role_check"
  CHECK ("role" IN ('platform_owner','ops','support','finance','engineer','auditor')) NOT VALID;

ALTER TABLE "platform_admins" VALIDATE CONSTRAINT "platform_admins_role_check";

-- 旧默认 'owner' 与新 CHECK 冲突；代码侧（platform-admin.repository）已只写新枚举
ALTER TABLE "platform_admins" ALTER COLUMN "role" SET DEFAULT 'platform_owner';

-- ============ 2) tenant_admins ============

ALTER TABLE "tenant_admins"
  ADD COLUMN IF NOT EXISTS "last_login_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "auth_source"  VARCHAR(32);

UPDATE "tenant_admins" SET "auth_source" = 'claim_token' WHERE "auth_source" IS NULL;

-- 与 1) 同理的防御性幂等：重跑时先 DROP 再 ADD
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'tenant_admins'::regclass AND conname = 'tenant_admins_auth_source_check'
  ) THEN
    ALTER TABLE "tenant_admins" DROP CONSTRAINT "tenant_admins_auth_source_check";
  END IF;
END $$;

ALTER TABLE "tenant_admins"
  ADD CONSTRAINT "tenant_admins_auth_source_check"
  CHECK ("auth_source" IN ('claim_token','wecom_scan')) NOT VALID;

ALTER TABLE "tenant_admins" VALIDATE CONSTRAINT "tenant_admins_auth_source_check";

-- ============ 3) admin_auth_states ============

CREATE TABLE IF NOT EXISTS "admin_auth_states" (
  "state_hash"    VARCHAR(64) NOT NULL,             -- SHA-256(state 原文) hex，定长 64
  "account_type"  VARCHAR(16) NOT NULL DEFAULT 'tenant'
                  CONSTRAINT "admin_auth_states_account_type_check"
                  CHECK ("account_type" IN ('tenant','platform')),
  "redirect_path" VARCHAR(256),
  "expires_at"    TIMESTAMPTZ(6) NOT NULL,
  "used_at"       TIMESTAMPTZ(6),
  "client_ip"     VARCHAR(64),                      -- 对齐 admin_operation_logs.ip 列宽
  "user_agent"    VARCHAR(256),
  "created_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "admin_auth_states_pkey" PRIMARY KEY ("state_hash")
);

CREATE INDEX IF NOT EXISTS "idx_admin_auth_states_expires"
  ON "admin_auth_states" ("expires_at");

COMMENT ON TABLE "admin_auth_states" IS
  '管理后台扫码登录一次性 state（01_09）。平台级表，与 admin_claim_tokens 同级，不纳入租户 RLS。定期清理 expires_at 过期记录。';
