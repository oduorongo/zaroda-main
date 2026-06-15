-- ============================================================
-- ZARODA SMS — Attendance history indexes
-- Self-sufficient: ensures the `attendance` table exists (it is
-- otherwise created by TypeORM synchronize) before indexing it.
-- ============================================================

CREATE TABLE IF NOT EXISTS attendance (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL,
  learner_id  UUID NOT NULL,
  stream_id   UUID,
  date        DATE,
  status      VARCHAR(20) DEFAULT 'present',
  recorded_by UUID,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attendance_learner_date
  ON attendance (tenant_id, learner_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_stream_date
  ON attendance (tenant_id, stream_id, date);
