-- ============================================================================
-- 024_teacher_stream_subjects.sql
-- Capture which learning areas a teacher teaches IN WHICH STREAM.
-- A teacher can teach different subjects in different streams (e.g. Mathematics
-- in Grade 7A and 8B, but English only in 7A). This table records each
-- (teacher, stream, subject) assignment as free text (matching the rubric
-- learning-area names — no subject_catalogue FK dependency).
-- The flat users.subjects CSV is kept as the union for backward compatibility.
-- ============================================================================

CREATE TABLE IF NOT EXISTS teacher_stream_subjects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL,
  teacher_id  UUID NOT NULL,
  stream_id   UUID NOT NULL,
  subject     VARCHAR(150) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (teacher_id, stream_id, subject)
);

CREATE INDEX IF NOT EXISTS idx_tss_tenant_teacher ON teacher_stream_subjects(tenant_id, teacher_id);
CREATE INDEX IF NOT EXISTS idx_tss_stream         ON teacher_stream_subjects(stream_id);
