ALTER TABLE local_admin_login_challenges ADD COLUMN IF NOT EXISTS client_ip VARCHAR(64);
ALTER TABLE local_admin_login_challenges ADD COLUMN IF NOT EXISTS client_device VARCHAR(128);
ALTER TABLE local_admin_login_challenges ADD COLUMN IF NOT EXISTS client_location VARCHAR(128);
ALTER TABLE local_admin_login_challenges DROP CONSTRAINT IF EXISTS local_admin_login_challenges_status_check;
ALTER TABLE local_admin_login_challenges ADD CONSTRAINT local_admin_login_challenges_status_check CHECK (status IN ('pending','approved','consumed','rejected'));
