-- ============================================================
-- Prevent double-generating a Lesson Plan or Lesson Notes for the same
-- lesson — the app already checks before generating, these are the
-- race-safe backstop against two near-simultaneous requests.
-- ============================================================
DO $$ BEGIN
  ALTER TABLE lesson_plans ADD CONSTRAINT lesson_plans_one_per_week
    UNIQUE (tenant_id, teacher_id, scheme_id, scheme_week_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Partial index (not a table constraint) since scheme_week_id can be null
-- on very old rows predating this column.
CREATE UNIQUE INDEX IF NOT EXISTS lesson_notes_one_per_week
  ON lesson_notes (tenant_id, teacher_id, scheme_week_id)
  WHERE scheme_week_id IS NOT NULL;
