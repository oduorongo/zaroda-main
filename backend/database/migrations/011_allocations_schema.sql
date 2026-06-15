-- ============================================================
-- ZARODA SMS — Subject & Teacher Allocation Schema
-- Run after 003_academic_core_schema.sql
-- Usage: psql -U zaroda_app -d zaroda_sms -f 011_allocations_schema.sql
-- ============================================================

-- Senior school subject allocation per pathway/track
CREATE TABLE IF NOT EXISTS subject_allocations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL,
  pathway     VARCHAR(100) NOT NULL,
  track       VARCHAR(100) NOT NULL,
  subject     VARCHAR(150) NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, pathway, track, subject)
);
CREATE INDEX IF NOT EXISTS idx_subject_alloc_tenant ON subject_allocations(tenant_id);

-- Teacher → subject → stream allocation
CREATE TABLE IF NOT EXISTS teacher_allocations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL,
  teacher_id  UUID NOT NULL,
  subject     VARCHAR(150) NOT NULL,
  stream_id   UUID,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_teacher_alloc_tenant  ON teacher_allocations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_teacher_alloc_teacher ON teacher_allocations(teacher_id);

-- Admission-specific columns on the learners table (additive, safe)
ALTER TABLE learners ADD COLUMN IF NOT EXISTS middle_name      VARCHAR(100);
ALTER TABLE learners ADD COLUMN IF NOT EXISTS birth_cert_no    VARCHAR(80);
ALTER TABLE learners ADD COLUMN IF NOT EXISTS upi_number       VARCHAR(80);
ALTER TABLE learners ADD COLUMN IF NOT EXISTS previous_school  VARCHAR(200);
ALTER TABLE learners ADD COLUMN IF NOT EXISTS pathway          VARCHAR(100);
ALTER TABLE learners ADD COLUMN IF NOT EXISTS track            VARCHAR(100);
ALTER TABLE learners ADD COLUMN IF NOT EXISTS guardian_relation VARCHAR(50);
ALTER TABLE learners ADD COLUMN IF NOT EXISTS guardian_id_no   VARCHAR(50);
ALTER TABLE learners ADD COLUMN IF NOT EXISTS residence        VARCHAR(200);
ALTER TABLE learners ADD COLUMN IF NOT EXISTS admission_date   DATE;
ALTER TABLE learners ADD COLUMN IF NOT EXISTS status           VARCHAR(30) DEFAULT 'enrolled';

-- ── Timetable periods (links subject + teacher to a day/period slot) ──
CREATE TABLE IF NOT EXISTS timetable_periods (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  stream_id     UUID NOT NULL,
  day           VARCHAR(20) NOT NULL,         -- Monday..Friday
  period_label  VARCHAR(40) NOT NULL,         -- 'Period 1'..'Period 7'
  subject       VARCHAR(150) NOT NULL,
  teacher_id    UUID,
  teacher_name  VARCHAR(150),
  day_order     INT DEFAULT 0,
  period_order  INT DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_timetable_tenant_stream ON timetable_periods(tenant_id, stream_id);
CREATE INDEX IF NOT EXISTS idx_timetable_teacher       ON timetable_periods(teacher_id);
-- One lesson per stream/day/period
CREATE UNIQUE INDEX IF NOT EXISTS uq_timetable_slot
  ON timetable_periods(tenant_id, stream_id, day, period_label);

-- ── Teacher onboarding fields on users table (additive, safe) ──
ALTER TABLE users ADD COLUMN IF NOT EXISTS id_number   VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS tsc_number  VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS subjects    TEXT;  -- comma-separated subjects the teacher teaches

-- ── Force first-login password change for admin-created accounts ──
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT false;
