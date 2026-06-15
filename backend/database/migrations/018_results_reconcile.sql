-- ============================================================
-- ZARODA SMS — Reconcile assessment_results columns
-- Repairs a partial table (e.g. created by TypeORM synchronize) so
-- Enter Marks can save. Runs as its own migration to apply even if
-- 013 is already recorded. All additive / idempotent.
-- ============================================================
CREATE TABLE IF NOT EXISTS assessment_results (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  learner_id    UUID NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE assessment_results ADD COLUMN IF NOT EXISTS stream_id     UUID;
ALTER TABLE assessment_results ADD COLUMN IF NOT EXISTS grade_level   VARCHAR(40);
ALTER TABLE assessment_results ADD COLUMN IF NOT EXISTS subject       VARCHAR(120);
ALTER TABLE assessment_results ADD COLUMN IF NOT EXISTS strand        VARCHAR(200);
ALTER TABLE assessment_results ADD COLUMN IF NOT EXISTS raw_score     FLOAT;
ALTER TABLE assessment_results ADD COLUMN IF NOT EXISTS max_score     FLOAT;
ALTER TABLE assessment_results ADD COLUMN IF NOT EXISTS percent       FLOAT;
ALTER TABLE assessment_results ADD COLUMN IF NOT EXISTS level         VARCHAR(8);
ALTER TABLE assessment_results ADD COLUMN IF NOT EXISTS exam_type     VARCHAR(40);
ALTER TABLE assessment_results ADD COLUMN IF NOT EXISTS exam_id       UUID;
ALTER TABLE assessment_results ADD COLUMN IF NOT EXISTS term          VARCHAR(20);
ALTER TABLE assessment_results ADD COLUMN IF NOT EXISTS academic_year VARCHAR(20);
ALTER TABLE assessment_results ADD COLUMN IF NOT EXISTS teacher_comment       TEXT;
ALTER TABLE assessment_results ADD COLUMN IF NOT EXISTS class_teacher_comment TEXT;
CREATE INDEX IF NOT EXISTS idx_results_stream2 ON assessment_results(tenant_id, stream_id);
