-- migrate_v1_6.sql
-- Signed anonymous visitor ids include a server signature and can exceed 64 chars.

ALTER TABLE "card_visits"
  ALTER COLUMN "anon_id" TYPE VARCHAR(128);
