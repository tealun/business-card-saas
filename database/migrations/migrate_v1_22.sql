ALTER TABLE member_join_requests ADD COLUMN IF NOT EXISTS notification_template_id VARCHAR(128);
ALTER TABLE member_join_requests ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ(6);
ALTER TABLE member_join_requests ADD COLUMN IF NOT EXISTS notification_error TEXT;
