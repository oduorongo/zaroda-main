-- ============================================================
-- ZARODA SMS — Structure-aware assessment scoring
-- Grades 1-8: numeric CAT1/CAT2/End-Term -> level auto-computed
-- Grade 9+ : level tapped directly (already supported via `level`)
-- ECDE      : single band score out of 30 -> band auto-computed
-- All columns additive & nullable; safe to run on every boot.
-- ============================================================

ALTER TABLE assessment_scores ADD COLUMN IF NOT EXISTS cat1       FLOAT;
ALTER TABLE assessment_scores ADD COLUMN IF NOT EXISTS cat2       FLOAT;
ALTER TABLE assessment_scores ADD COLUMN IF NOT EXISTS end_term   FLOAT;
ALTER TABLE assessment_scores ADD COLUMN IF NOT EXISTS max_score  FLOAT DEFAULT 100;
ALTER TABLE assessment_scores ADD COLUMN IF NOT EXISTS band_score FLOAT;   -- ECDE: out of 30
