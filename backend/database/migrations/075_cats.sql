-- CAT (Continuous Assessment Test): formative, owned by the subject teacher.
-- Separate from exams/assessment_results — never feeds the mark list or report cards.

CREATE TABLE IF NOT EXISTS cats (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  teacher_id    UUID NOT NULL,
  stream_id     UUID NOT NULL,
  subject       VARCHAR(150) NOT NULL,
  title         VARCHAR(200) NOT NULL,
  term          VARCHAR(20) NOT NULL,
  academic_year VARCHAR(20),
  cat_date      DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);
-- Migration 003 created an unused legacy "cats" table; adapt it in place.
ALTER TABLE cats ADD COLUMN IF NOT EXISTS subject    VARCHAR(150);
ALTER TABLE cats ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cats' AND column_name = 'subject_id') THEN
    ALTER TABLE cats ALTER COLUMN subject_id    DROP NOT NULL;
    ALTER TABLE cats ALTER COLUMN cat_number    DROP NOT NULL;
    ALTER TABLE cats ALTER COLUMN academic_year DROP NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_cats_tenant_stream  ON cats(tenant_id, stream_id);
CREATE INDEX IF NOT EXISTS idx_cats_tenant_teacher ON cats(tenant_id, teacher_id);

CREATE TABLE IF NOT EXISTS cat_questions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL,
  cat_id       UUID NOT NULL REFERENCES cats(id) ON DELETE CASCADE,
  number       INT NOT NULL,
  max_marks    NUMERIC(6,2) NOT NULL CHECK (max_marks > 0),
  strand       VARCHAR(200),
  sub_strand   VARCHAR(200),
  substrand_id UUID,
  UNIQUE (cat_id, number)
);
CREATE INDEX IF NOT EXISTS idx_cat_questions_cat ON cat_questions(cat_id);

CREATE TABLE IF NOT EXISTS cat_scores (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL,
  cat_id      UUID NOT NULL REFERENCES cats(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES cat_questions(id) ON DELETE CASCADE,
  learner_id  UUID NOT NULL,
  score       NUMERIC(6,2) NOT NULL CHECK (score >= 0),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (question_id, learner_id)
);
CREATE INDEX IF NOT EXISTS idx_cat_scores_cat ON cat_scores(cat_id);
