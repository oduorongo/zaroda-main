-- ============================================================
-- ZARODA SMS — Exams + Mark List
-- Self-sufficient: creates assessment_results if it doesn't exist
-- (it is otherwise created by TypeORM synchronize, but the migration
-- must not depend on that timing). All idempotent.
-- ============================================================

-- Ensure the marks table exists (mirrors the AssessmentResult entity)
CREATE TABLE IF NOT EXISTS assessment_results (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  learner_id    UUID NOT NULL,
  stream_id     UUID,
  subject       VARCHAR(120),
  strand        VARCHAR(200),
  level         VARCHAR(8),
  term          VARCHAR(20),
  academic_year VARCHAR(20),
  teacher_comment        TEXT,
  class_teacher_comment  TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Score columns (additive, safe whether the table was just created or pre-existed)
ALTER TABLE assessment_results ADD COLUMN IF NOT EXISTS raw_score   FLOAT;
ALTER TABLE assessment_results ADD COLUMN IF NOT EXISTS max_score   FLOAT;
ALTER TABLE assessment_results ADD COLUMN IF NOT EXISTS percent     FLOAT;
ALTER TABLE assessment_results ADD COLUMN IF NOT EXISTS exam_type   VARCHAR(40);
ALTER TABLE assessment_results ADD COLUMN IF NOT EXISTS exam_id     UUID;
ALTER TABLE assessment_results ADD COLUMN IF NOT EXISTS grade_level VARCHAR(40);
CREATE INDEX IF NOT EXISTS idx_results_stream ON assessment_results(tenant_id, stream_id);
CREATE INDEX IF NOT EXISTS idx_results_grade  ON assessment_results(tenant_id, grade_level);

-- Exams / CATs (created by admin only)
CREATE TABLE IF NOT EXISTS exams (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  name          VARCHAR(200) NOT NULL,
  exam_type     VARCHAR(40),
  term          VARCHAR(20),
  academic_year VARCHAR(20),
  start_date    DATE,
  end_date      DATE,
  max_score     INT DEFAULT 100,
  status        VARCHAR(20) DEFAULT 'scheduled',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_exams_tenant ON exams(tenant_id);
