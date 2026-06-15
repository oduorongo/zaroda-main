-- ============================================================
-- ZARODA SMS — Summative scoring (separate from formative rubric)
-- CATs & End-Term are admin-created exam events. Teachers enter ONE
-- numeric score per learning area per event. Only the End-Term event
-- feeds the end-term report. The formative rubric (assessment_scores)
-- is daily EE/ME/AE/BE per sub-strand and never appears on the report.
-- ============================================================

CREATE TABLE IF NOT EXISTS summative_scores (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  exam_id       UUID NOT NULL,              -- the admin-created CAT / End-Term event
  learner_id    UUID NOT NULL,
  stream_id     UUID,
  grade_level   VARCHAR(40),
  learning_area VARCHAR(120) NOT NULL,
  score         FLOAT,                       -- numeric mark
  max_score     FLOAT DEFAULT 100,
  percent       FLOAT,
  level         VARCHAR(8),                  -- computed band (4-level or 8-level)
  recorded_by   UUID,
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (exam_id, learner_id, learning_area)
);
CREATE INDEX IF NOT EXISTS idx_summative_lookup ON summative_scores(tenant_id, learner_id, exam_id);
CREATE INDEX IF NOT EXISTS idx_summative_stream ON summative_scores(tenant_id, stream_id, exam_id);

-- The formative rubric (assessment_scores) is level-only per sub-strand.
-- The numeric columns added earlier no longer belong there; leave them
-- nullable & unused (harmless) so existing data isn't disturbed.
