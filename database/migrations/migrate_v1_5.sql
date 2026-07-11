-- migrate_v1_5.sql
-- Employee card avatar support. Idempotent for existing M1 databases.

ALTER TABLE "cards"
  ADD COLUMN IF NOT EXISTS "avatar_url" TEXT;
