-- ============================================================
-- Professional Records: per-lesson scheme columns + direct lesson notes
--
-- 1. scheme_weeks gets a `lessons` JSONB column holding the per-lesson
--    breakdown (one entry per period, double lessons merged into one entry
--    with is_double=true) so the printed scheme can show each lesson in its
--    own column instead of lumping the whole week into one row.
-- 2. lesson_notes can now be generated directly from a scheme week without
--    requiring a lesson plan first — lesson_plan_id becomes optional, and
--    scheme_id/scheme_week_id record where a plan-less note came from.
-- ============================================================
ALTER TABLE scheme_weeks ADD COLUMN IF NOT EXISTS lessons JSONB;
ALTER TABLE schemes_of_work ADD COLUMN IF NOT EXISTS lessons_per_week SMALLINT;

ALTER TABLE lesson_notes ALTER COLUMN lesson_plan_id DROP NOT NULL;
ALTER TABLE lesson_notes ADD COLUMN IF NOT EXISTS scheme_id UUID REFERENCES schemes_of_work(id) ON DELETE CASCADE;
ALTER TABLE lesson_notes ADD COLUMN IF NOT EXISTS scheme_week_id UUID REFERENCES scheme_weeks(id) ON DELETE CASCADE;

DO $$ BEGIN
  ALTER TABLE lesson_notes ADD CONSTRAINT lesson_notes_source_check
    CHECK (lesson_plan_id IS NOT NULL OR scheme_week_id IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
