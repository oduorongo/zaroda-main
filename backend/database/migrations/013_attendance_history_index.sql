-- ============================================================
-- ZARODA SMS — Attendance history indexes
-- Speeds up trend / history queries (per-learner over date ranges)
-- Usage: psql -U zaroda_app -d zaroda_sms -f 013_attendance_history_index.sql
-- ============================================================

-- Fast per-learner history over a date range
CREATE INDEX IF NOT EXISTS idx_attendance_learner_date
  ON attendance (tenant_id, learner_id, date);

-- Fast per-stream summaries over a date range
CREATE INDEX IF NOT EXISTS idx_attendance_stream_date
  ON attendance (tenant_id, stream_id, date);
