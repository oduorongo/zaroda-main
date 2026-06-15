-- ============================================================
-- ZARODA SMS — Reconcile assessment_scores columns & constraint
-- Repairs any partial table created by TypeORM synchronize before
-- migration 014 ran (missing learning_area, ON CONFLICT key, etc.).
-- Runs as its own migration so it applies even if 014 is already recorded.
-- ============================================================

ALTER TABLE assessment_scores ADD COLUMN IF NOT EXISTS stream_id     UUID;
ALTER TABLE assessment_scores ADD COLUMN IF NOT EXISTS grade_level   VARCHAR(40);
ALTER TABLE assessment_scores ADD COLUMN IF NOT EXISTS learning_area VARCHAR(120);
ALTER TABLE assessment_scores ADD COLUMN IF NOT EXISTS level         VARCHAR(4);
ALTER TABLE assessment_scores ADD COLUMN IF NOT EXISTS recorded_by   UUID;
ALTER TABLE assessment_scores ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE assessment_scores ADD COLUMN IF NOT EXISTS cat1          FLOAT;
ALTER TABLE assessment_scores ADD COLUMN IF NOT EXISTS cat2          FLOAT;
ALTER TABLE assessment_scores ADD COLUMN IF NOT EXISTS end_term      FLOAT;
ALTER TABLE assessment_scores ADD COLUMN IF NOT EXISTS max_score     FLOAT DEFAULT 100;
ALTER TABLE assessment_scores ADD COLUMN IF NOT EXISTS band_score    FLOAT;

-- Ensure the unique key the app's ON CONFLICT relies on exists
DO $recon$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'assessment_scores'::regclass
      AND conname = 'uq_ascore_learner_sub_term'
  ) THEN
    BEGIN
      ALTER TABLE assessment_scores
        ADD CONSTRAINT uq_ascore_learner_sub_term UNIQUE (learner_id, substrand_id, term);
    EXCEPTION WHEN others THEN NULL;  -- a duplicate-form UNIQUE may already exist
    END;
  END IF;
END
$recon$;

-- Same guard for assessment_comments (ON CONFLICT learner_id, learning_area, term)
CREATE TABLE IF NOT EXISTS assessment_comments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  learner_id    UUID NOT NULL,
  learning_area VARCHAR(120) NOT NULL,
  term          VARCHAR(20) NOT NULL,
  comment       TEXT,
  recorded_by   UUID,
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (learner_id, learning_area, term)
);
