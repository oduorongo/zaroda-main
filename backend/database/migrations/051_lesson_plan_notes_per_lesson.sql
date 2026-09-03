-- ============================================================
-- Lesson Plans/Notes generate per individual LESSON, not per scheme week —
-- a week can hold several lessons (see scheme_weeks.lessons), so "one plan
-- per week" collapsed a multi-lesson week into a single mis-framed plan.
-- lesson_slot identifies which lesson within the week (1-indexed, matches
-- scheme_weeks.lessons[].lessonNumber); null on rows predating this.
-- ============================================================
ALTER TABLE lesson_plans ADD COLUMN IF NOT EXISTS lesson_slot SMALLINT;
ALTER TABLE lesson_notes ADD COLUMN IF NOT EXISTS lesson_slot SMALLINT;

ALTER TABLE lesson_plans DROP CONSTRAINT IF EXISTS lesson_plans_one_per_week;
DO $$ BEGIN
  ALTER TABLE lesson_plans ADD CONSTRAINT lesson_plans_one_per_lesson
    UNIQUE (tenant_id, teacher_id, scheme_id, scheme_week_id, lesson_slot);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP INDEX IF EXISTS lesson_notes_one_per_week;
CREATE UNIQUE INDEX IF NOT EXISTS lesson_notes_one_per_lesson
  ON lesson_notes (tenant_id, teacher_id, scheme_week_id, lesson_slot)
  WHERE scheme_week_id IS NOT NULL;
