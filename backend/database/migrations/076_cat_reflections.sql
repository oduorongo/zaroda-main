-- CAT reflection loop: the teacher's diagnosis and next-lesson plan for a flagged question.
CREATE TABLE IF NOT EXISTS cat_reflections (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL,
  cat_id      UUID NOT NULL REFERENCES cats(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES cat_questions(id) ON DELETE CASCADE,
  teacher_id  UUID NOT NULL,
  cause       VARCHAR(30) NOT NULL
              CHECK (cause IN ('concept_not_understood', 'misread_question', 'could_not_apply', 'lack_of_practice')),
  next_action VARCHAR(300) NOT NULL,
  video_url   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (question_id)
);
CREATE INDEX IF NOT EXISTS idx_cat_reflections_tenant ON cat_reflections(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cat_reflections_cat    ON cat_reflections(cat_id);
