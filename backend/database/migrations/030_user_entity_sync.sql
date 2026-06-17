-- ============================================================================
-- 030_user_entity_sync.sql
-- Bring the users table in line with the NestJS User entity. Some columns the
-- app reads (stream_id, stream_name, id_number, subjects, email_verified,
-- must_change_password) were never added by earlier migrations, causing
-- "column User.stream_id does not exist" on login/signup. All idempotent.
-- ============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS stream_id            UUID;
ALTER TABLE users ADD COLUMN IF NOT EXISTS stream_name          VARCHAR(150);
ALTER TABLE users ADD COLUMN IF NOT EXISTS id_number            VARCHAR(30);
ALTER TABLE users ADD COLUMN IF NOT EXISTS tsc_number           VARCHAR(30);
ALTER TABLE users ADD COLUMN IF NOT EXISTS subjects             TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active            BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified       BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at        TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_stream_id ON users(stream_id);
