-- migrate_v1_14.sql
-- ============================================================================
-- 用途: 管理后台账号登录系统（docs/01-specs/01_09）所需结构演进
--   1) platform_admins: role 枚举扩展为 01_08 角色矩阵；存量 'owner' 归一为 'platform_owner'；新增 created_by
--   2) tenant_admins: 新增 last_login_at / auth_source（存量归一为 'claim_token'）
--   3) 新表 admin_auth_states: 企业微信扫码登录一次性 state（平台级表，不入租户 RLS，与 admin_claim_tokens 同级）
-- 原因/风险: 平台账号管理（创建/角色/删除）与企业扫码登录（02_04 M1）依赖；存量 role 值变更，先跑 PRE-FLIGHT
-- 生产执行（与既有迁移一致，单事务、仅前滚、幂等）:
--   node database/scripts/migrate.cjs            -- 常规方式：runner 按序执行并记录 pgmigrations
--   -- 或手动:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/migrate_v1_14.sql
-- 后置步骤: 无新增数据库角色授权（应用经 backend 单一角色连接）；执行后回填 02_04 Evidence
-- 注意: 本草案基于 2026-07-17 只读勘察，执行前必须完成下方 PRE-FLIGHT 并对照 database/schema.sql 实际 DDL
-- ============================================================================

BEGIN;

-- ============ PRE-FLIGHT（只读，逐项人工确认；任一不符即中止并修订本文件） ============
-- P1. 确认 platform_admins 现有 role 取值（预期仅 'owner'；若有其他值，先扩展下方 UPDATE 映射）
--     SELECT role, count(*) FROM platform_admins GROUP BY 1;
-- P2. 确认 platform_admins 是否已有 role 的 CHECK 约束及约束名（若非 platform_admins_role_check，调整下方 DROP）
--     SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--     WHERE conrelid = 'platform_admins'::regclass AND contype = 'c';
-- P3. 确认 tenant_admins 尚无 last_login_at / auth_source 列
--     SELECT column_name FROM information_schema.columns WHERE table_name = 'tenant_admins';
-- P4. 确认 platform_admins 尚无 created_by 列
--     SELECT column_name FROM information_schema.columns WHERE table_name = 'platform_admins';

-- ============ 1) platform_admins ============

ALTER TABLE platform_admins
  ADD COLUMN IF NOT EXISTS created_by text NULL;

-- 存量角色归一：'owner' → 'platform_owner'（01_08 矩阵中的内建超管）
UPDATE platform_admins SET role = 'platform_owner' WHERE role = 'owner';

-- 替换 role 枚举约束（若 PRE-FLIGHT P2 显示旧约束名不同，先按实际名 DROP）
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'platform_admins'::regclass AND conname = 'platform_admins_role_check'
  ) THEN
    ALTER TABLE platform_admins DROP CONSTRAINT platform_admins_role_check;
  END IF;
END $$;

ALTER TABLE platform_admins
  ADD CONSTRAINT platform_admins_role_check
  CHECK (role IN ('platform_owner','ops','support','finance','engineer','auditor')) NOT VALID;

ALTER TABLE platform_admins VALIDATE CONSTRAINT platform_admins_role_check;

-- ============ 2) tenant_admins ============

ALTER TABLE tenant_admins
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS auth_source  text NULL;

UPDATE tenant_admins SET auth_source = 'claim_token' WHERE auth_source IS NULL;

ALTER TABLE tenant_admins
  ADD CONSTRAINT tenant_admins_auth_source_check
  CHECK (auth_source IN ('claim_token','wecom_scan')) NOT VALID;

ALTER TABLE tenant_admins VALIDATE CONSTRAINT tenant_admins_auth_source_check;

-- ============ 3) admin_auth_states ============

CREATE TABLE IF NOT EXISTS admin_auth_states (
  state_hash    text PRIMARY KEY,              -- SHA-256(state 原文)
  account_type  text NOT NULL DEFAULT 'tenant'
                CHECK (account_type IN ('tenant','platform')),
  redirect_path text NULL,
  expires_at    timestamptz NOT NULL,
  used_at       timestamptz NULL,
  client_ip     text NULL,
  user_agent    text NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_auth_states_expires
  ON admin_auth_states (expires_at);

COMMENT ON TABLE admin_auth_states IS
  '管理后台扫码登录一次性 state（01_09）。平台级表，与 admin_claim_tokens 同级，不纳入租户 RLS。定期清理 expires_at 过期记录。';

COMMIT;
