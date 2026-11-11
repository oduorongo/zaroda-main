-- ============================================================
-- ZARODA SMS — KJSEA results (Grade 9 national exam) for analysis
-- One row per learner per exam year: the points (1-8) KNEC gave in each subject,
-- keyed by KJSEA subject code, e.g. {"901": 7, "902": 6, "908": 8}.
-- Totals, percentages, performance levels and every analysis are worked out from
-- these points when the mark list is opened, so only the points are stored.
-- Idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS kjsea_results (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL,
  learner_id  UUID NOT NULL,
  school_year INT  NOT NULL,                 -- the year the exam was sat
  points      JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by  UUID,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, learner_id, school_year)
);
CREATE INDEX IF NOT EXISTS idx_kjsea_tenant_year ON kjsea_results (tenant_id, school_year);
