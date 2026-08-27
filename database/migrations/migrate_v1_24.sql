ALTER TABLE card_visits ADD COLUMN visitor_employee_account_id BIGINT;
ALTER TABLE card_visits ADD COLUMN visitor_tenant_id BIGINT;
ALTER TABLE card_visits ADD COLUMN visitor_member_identity_id BIGINT;
ALTER TABLE card_visits ADD COLUMN visitor_public_id VARCHAR(32);
ALTER TABLE card_visits ADD CONSTRAINT card_visits_visitor_employee_account_fkey
  FOREIGN KEY (visitor_employee_account_id) REFERENCES accounts(id) ON DELETE SET NULL;
ALTER TABLE card_visits ADD CONSTRAINT card_visits_visitor_identity_fkey
  FOREIGN KEY (visitor_tenant_id, visitor_member_identity_id) REFERENCES member_identities(tenant_id, id) ON DELETE SET NULL;
CREATE INDEX idx_card_visits_visitor_identity ON card_visits(visitor_employee_account_id, visitor_member_identity_id);

CREATE TABLE card_exchange_requests (
  id BIGSERIAL PRIMARY KEY,
  request_id VARCHAR(64) NOT NULL,
  sender_account_id BIGINT NOT NULL,
  sender_tenant_id BIGINT NOT NULL,
  sender_member_identity_id BIGINT NOT NULL,
  sender_card_id BIGINT NOT NULL,
  sender_card_snapshot JSONB NOT NULL,
  recipient_account_id BIGINT NOT NULL,
  recipient_tenant_id BIGINT NOT NULL,
  recipient_member_identity_id BIGINT NOT NULL,
  recipient_card_id BIGINT NOT NULL,
  recipient_card_snapshot JSONB NOT NULL,
  source_visit_id VARCHAR(64) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  recipient_read_at TIMESTAMPTZ(6),
  responded_at TIMESTAMPTZ(6),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT card_exchange_requests_request_id_key UNIQUE (request_id),
  CONSTRAINT card_exchange_requests_status_check CHECK (status IN ('pending','accepted','ignored')),
  CONSTRAINT card_exchange_requests_distinct_identity_check CHECK (
    sender_member_identity_id <> recipient_member_identity_id OR sender_tenant_id <> recipient_tenant_id
  ),
  CONSTRAINT card_exchange_requests_sender_account_fkey FOREIGN KEY (sender_account_id) REFERENCES accounts(id) ON DELETE RESTRICT,
  CONSTRAINT card_exchange_requests_recipient_account_fkey FOREIGN KEY (recipient_account_id) REFERENCES accounts(id) ON DELETE RESTRICT,
  CONSTRAINT card_exchange_requests_sender_card_fkey FOREIGN KEY (sender_tenant_id, sender_card_id) REFERENCES cards(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT card_exchange_requests_recipient_card_fkey FOREIGN KEY (recipient_tenant_id, recipient_card_id) REFERENCES cards(tenant_id, id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX uk_card_exchange_pending_pair
  ON card_exchange_requests(sender_member_identity_id, recipient_member_identity_id)
  WHERE status = 'pending';
CREATE INDEX idx_card_exchange_recipient_inbox
  ON card_exchange_requests(recipient_account_id, recipient_member_identity_id, status, created_at DESC);
CREATE INDEX idx_card_exchange_sender_outbox
  ON card_exchange_requests(sender_account_id, sender_member_identity_id, created_at DESC);

-- Requests can cross tenant boundaries. Access is enforced by participant account and
-- identity predicates in CardExchangeRepository, so a single tenant RLS policy is invalid.
ALTER TABLE card_exchange_requests DISABLE ROW LEVEL SECURITY;
