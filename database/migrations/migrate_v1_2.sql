-- migrate_v1_2.sql
-- callback_events 是平台运维表：回调可能在租户未知时到达，重试/管理查询是平台级操作，
-- 因此显式关闭租户 RLS（幂等，可重复执行）。

ALTER TABLE callback_events DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_callback_events ON callback_events;
