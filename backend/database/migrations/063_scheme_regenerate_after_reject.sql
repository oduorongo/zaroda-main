-- Allow regenerating a scheme of work after it's been rejected.
--
-- SchemeService.generate() already permits this at the application level
-- (its own duplicate check only blocks when an existing scheme's status is
-- NOT 'rejected'), but the table still carries a flat UNIQUE constraint on
-- (teacher_id, stream_id, subject_id, academic_year, term) with no
-- exception for status — so a regenerate attempt still hits a Postgres
-- unique-violation and surfaces as a 500 to the user. Replace the flat
-- constraint with a partial unique index that only applies to schemes that
-- are still "the active one" for that slot, so a rejected scheme can
-- coexist with its regenerated replacement (kept for audit history).

DO $$
DECLARE
  con_name text;
BEGIN
  SELECT tc.constraint_name INTO con_name
  FROM information_schema.table_constraints tc
  WHERE tc.table_name = 'schemes_of_work'
    AND tc.constraint_type = 'UNIQUE'
    AND EXISTS (
      SELECT 1 FROM information_schema.key_column_usage kcu
      WHERE kcu.constraint_name = tc.constraint_name
        AND kcu.table_name = 'schemes_of_work'
        AND kcu.column_name = 'stream_id'
    );

  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE schemes_of_work DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS schemes_of_work_active_slot_unique
  ON schemes_of_work (teacher_id, stream_id, subject_id, academic_year, term)
  WHERE status != 'rejected' AND deleted_at IS NULL;
