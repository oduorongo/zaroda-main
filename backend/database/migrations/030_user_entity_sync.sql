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

-- Signup is KNEC-code based and does not set a subdomain, but migration 001 made
-- tenants.subdomain NOT NULL. Drop that constraint so signup can create a tenant.
-- (Backfill any existing nulls first in case the column already has the constraint.)
ALTER TABLE tenants ALTER COLUMN subdomain DROP NOT NULL;

-- The app sets subscription_tier='trial', but migration 001's CHECK only allowed
-- ('free','primary','senior'). Drop the restrictive check so app values are accepted.
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_subscription_tier_check;

-- Sync the schools table with the School entity. Migration 001 was missing several
-- columns the app writes (mpesa_paybill, zone, location ids) and marked school_type/
-- category/gender_type NOT NULL even though signup doesn't set them.
ALTER TABLE schools ADD COLUMN IF NOT EXISTS mpesa_paybill    VARCHAR(20);
ALTER TABLE schools ADD COLUMN IF NOT EXISTS zone             VARCHAR(150);
ALTER TABLE schools ADD COLUMN IF NOT EXISTS ke_county_id     SMALLINT;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS ke_sub_county_id SMALLINT;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS ke_zone_id       SMALLINT;
ALTER TABLE schools ALTER COLUMN school_type DROP NOT NULL;
ALTER TABLE schools ALTER COLUMN category    DROP NOT NULL;
ALTER TABLE schools ALTER COLUMN gender_type DROP NOT NULL;

-- Sync the streams table with the Stream entity. Migration 001 was missing the
-- class-teacher and learners-count columns the app reads/writes when creating a class.
ALTER TABLE streams ADD COLUMN IF NOT EXISTS class_teacher_id   UUID;
ALTER TABLE streams ADD COLUMN IF NOT EXISTS class_teacher_name VARCHAR(150);
ALTER TABLE streams ADD COLUMN IF NOT EXISTS learners_count     INTEGER NOT NULL DEFAULT 0;
-- The app does not set term on insert; keep its default but ensure no insert is blocked.
ALTER TABLE streams ALTER COLUMN term DROP NOT NULL;

-- The learners insert identifies a learner by tenant_id + stream_id and does not send
-- school_id or academic_year, but migration 003 marked both NOT NULL. Relax them.
ALTER TABLE learners ALTER COLUMN school_id     DROP NOT NULL;
ALTER TABLE learners ALTER COLUMN academic_year DROP NOT NULL;
