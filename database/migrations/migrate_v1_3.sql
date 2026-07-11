-- migrate_v1_3.sql
-- 个人身份登录（99_48/99_55）：tenants 增加 tenant_type 区分个人/企业租户；
-- accounts.primary_wx_openid 建部分唯一索引，保证一个微信 openid 只对应一个主账号。
-- 全部幂等，可重复执行。

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS tenant_type VARCHAR(32) NOT NULL DEFAULT 'enterprise';

CREATE UNIQUE INDEX IF NOT EXISTS uk_accounts_primary_wx_openid
  ON accounts(primary_wx_openid)
  WHERE primary_wx_openid IS NOT NULL;
