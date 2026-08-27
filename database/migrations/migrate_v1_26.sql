-- Collapse legacy duplicate accepted rows before enforcing one friendship per identity pair.
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY LEAST(sender_member_identity_id,recipient_member_identity_id),
                 GREATEST(sender_member_identity_id,recipient_member_identity_id)
    ORDER BY responded_at ASC NULLS LAST, created_at ASC, id ASC
  ) AS row_number
  FROM card_exchange_requests
  WHERE status='accepted'
)
UPDATE card_exchange_requests requests
SET status='withdrawn',responded_at=COALESCE(responded_at,now()),updated_at=now()
FROM ranked
WHERE requests.id=ranked.id AND ranked.row_number>1;

-- A pending request is obsolete when the pair already exchanged cards.
UPDATE card_exchange_requests pending
SET status='withdrawn',responded_at=COALESCE(responded_at,now()),updated_at=now()
WHERE pending.status='pending' AND EXISTS (
  SELECT 1 FROM card_exchange_requests accepted
  WHERE accepted.status='accepted'
    AND LEAST(accepted.sender_member_identity_id,accepted.recipient_member_identity_id)
      = LEAST(pending.sender_member_identity_id,pending.recipient_member_identity_id)
    AND GREATEST(accepted.sender_member_identity_id,accepted.recipient_member_identity_id)
      = GREATEST(pending.sender_member_identity_id,pending.recipient_member_identity_id)
);

-- Phase-one deployments could contain two opposite pending requests. Mutual intent means accepted.
WITH mutual AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY LEAST(sender_member_identity_id,recipient_member_identity_id),
                   GREATEST(sender_member_identity_id,recipient_member_identity_id)
      ORDER BY created_at ASC,id ASC
    ) AS row_number,
    COUNT(*) OVER (
      PARTITION BY LEAST(sender_member_identity_id,recipient_member_identity_id),
                   GREATEST(sender_member_identity_id,recipient_member_identity_id)
    ) AS pair_count
  FROM card_exchange_requests
  WHERE status='pending'
)
UPDATE card_exchange_requests requests
SET status=CASE WHEN mutual.row_number=1 THEN 'accepted' ELSE 'withdrawn' END,
    recipient_read_at=CASE WHEN mutual.row_number=1 THEN COALESCE(recipient_read_at,now()) ELSE recipient_read_at END,
    responded_at=COALESCE(responded_at,now()),updated_at=now()
FROM mutual
WHERE requests.id=mutual.id AND mutual.pair_count>1;

CREATE UNIQUE INDEX uk_card_exchange_accepted_pair
  ON card_exchange_requests(
    LEAST(sender_member_identity_id,recipient_member_identity_id),
    GREATEST(sender_member_identity_id,recipient_member_identity_id)
  )
  WHERE status='accepted';
