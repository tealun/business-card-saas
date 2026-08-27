ALTER TABLE card_exchange_requests DROP CONSTRAINT card_exchange_requests_status_check;
ALTER TABLE card_exchange_requests ADD CONSTRAINT card_exchange_requests_status_check
  CHECK (status IN ('pending','accepted','ignored','withdrawn'));

CREATE TABLE card_exchange_notification_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  event_type VARCHAR(32) NOT NULL CHECK (event_type IN ('request_received','request_accepted')),
  template_id VARCHAR(128) NOT NULL,
  granted_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  consumed_at TIMESTAMPTZ(6),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uk_card_exchange_subscription_active
  ON card_exchange_notification_subscriptions(account_id,event_type)
  WHERE consumed_at IS NULL;

CREATE TABLE card_exchange_notification_deliveries (
  id BIGSERIAL PRIMARY KEY,
  request_id VARCHAR(64) NOT NULL REFERENCES card_exchange_requests(request_id) ON DELETE CASCADE,
  event_type VARCHAR(32) NOT NULL CHECK (event_type IN ('request_received','request_accepted')),
  recipient_account_id BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  template_id VARCHAR(128),
  status VARCHAR(16) NOT NULL CHECK (status IN ('pending','sent','skipped','failed')),
  attempts SMALLINT NOT NULL DEFAULT 0,
  error TEXT,
  sent_at TIMESTAMPTZ(6),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT uk_card_exchange_delivery UNIQUE(request_id,event_type,recipient_account_id)
);
CREATE INDEX idx_card_exchange_delivery_status
  ON card_exchange_notification_deliveries(status,created_at);

-- Both tables are account-scoped and can reference cross-tenant exchange requests.
-- Repository operations always filter by authenticated account or an internal request event.
ALTER TABLE card_exchange_notification_subscriptions DISABLE ROW LEVEL SECURITY;
ALTER TABLE card_exchange_notification_deliveries DISABLE ROW LEVEL SECURITY;
