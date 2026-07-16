CREATE TABLE IF NOT EXISTS commercial_plans (
  plan_key VARCHAR(64) PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  billing_period VARCHAR(32) NOT NULL DEFAULT 'monthly',
  price_cents INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  currency VARCHAR(8) NOT NULL DEFAULT 'CNY',
  member_limit INTEGER NOT NULL DEFAULT 50,
  card_limit INTEGER NOT NULL DEFAULT 50,
  video_limit_bytes BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CHECK (member_limit >= 0 AND card_limit >= 0 AND video_limit_bytes >= 0)
);

INSERT INTO commercial_plans (plan_key, name, status, billing_period, price_cents, currency, member_limit, card_limit, video_limit_bytes)
VALUES ('free', 'Free', 'active', 'monthly', 0, 'CNY', 50, 50, 0)
ON CONFLICT (plan_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS tenant_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  plan_key VARCHAR(64) NOT NULL REFERENCES commercial_plans(plan_key) ON DELETE RESTRICT ON UPDATE CASCADE,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  started_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ(6),
  member_limit INTEGER NOT NULL,
  card_limit INTEGER NOT NULL,
  video_limit_bytes BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CHECK (member_limit >= 0 AND card_limit >= 0 AND video_limit_bytes >= 0)
);

CREATE TABLE IF NOT EXISTS commercial_orders (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  order_no VARCHAR(64) NOT NULL,
  plan_key VARCHAR(64) NOT NULL REFERENCES commercial_plans(plan_key) ON DELETE RESTRICT ON UPDATE CASCADE,
  amount_cents INTEGER NOT NULL DEFAULT 0 CHECK (amount_cents >= 0),
  currency VARCHAR(8) NOT NULL DEFAULT 'CNY',
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  payment_provider VARCHAR(64),
  provider_trade_no VARCHAR(128),
  paid_at TIMESTAMPTZ(6),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenant_quota_ledger (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  quota_type VARCHAR(32) NOT NULL CHECK (quota_type IN ('member', 'card', 'video_mb')),
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  created_by VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_tenant ON tenant_subscriptions(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS uk_tenant_subscription_active ON tenant_subscriptions(tenant_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_commercial_orders_tenant ON commercial_orders(tenant_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS uk_commercial_orders_order_no ON commercial_orders(order_no);
CREATE INDEX IF NOT EXISTS idx_tenant_quota_ledger_tenant ON tenant_quota_ledger(tenant_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS uk_tenant_quota_ledger_idem ON tenant_quota_ledger(tenant_id, idempotency_key);

ALTER TABLE tenant_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_tenant_subscriptions ON tenant_subscriptions;
CREATE POLICY tenant_isolation_tenant_subscriptions ON tenant_subscriptions
  USING (tenant_id = current_setting('app.tenant_id', true)::bigint);

ALTER TABLE commercial_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_commercial_orders ON commercial_orders;
CREATE POLICY tenant_isolation_commercial_orders ON commercial_orders
  USING (tenant_id = current_setting('app.tenant_id', true)::bigint);

ALTER TABLE tenant_quota_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_tenant_quota_ledger ON tenant_quota_ledger;
CREATE POLICY tenant_isolation_tenant_quota_ledger ON tenant_quota_ledger
  USING (tenant_id = current_setting('app.tenant_id', true)::bigint);
