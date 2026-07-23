-- ============================================================
-- ZARODA SMS — Paper 1 / Paper 2 learning areas
-- Some learning areas (e.g. English, Kiswahili in Junior & Senior School) are
-- examined as two separate papers but reported as ONE summed score on the
-- mark list. This lets a school flag which (grade_level, learning_area)
-- combinations are multi-paper, and lets teachers enter each paper separately.
-- Idempotent, self-sufficient (works whether or not TypeORM has synced yet).
-- ============================================================

CREATE TABLE IF NOT EXISTS subject_paper_config (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID,                 -- NULL = global default; set = school override
  grade_level   VARCHAR(40) NOT NULL,
  learning_area VARCHAR(120) NOT NULL,
  paper_count   INT NOT NULL DEFAULT 2,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_spc_lookup ON subject_paper_config(grade_level, learning_area);

-- Paper marker on the marks table: NULL = single-paper subject, '1'/'2' = which
-- paper this row is. Two rows (paper 1 + paper 2) for the same learner/subject/
-- exam are summed into one score by the mark-list and report/PDF logic.
ALTER TABLE assessment_results ADD COLUMN IF NOT EXISTS paper VARCHAR(4);

-- Global defaults: English & Kiswahili have Paper 1 & 2 in Junior (7-9) and
-- Senior (10-12) School. Schools can add/remove more via the API.
DO $$
DECLARE g TEXT; la TEXT;
BEGIN
  FOREACH g IN ARRAY ARRAY['grade_7','grade_8','grade_9','grade_10','grade_11','grade_12']
  LOOP
    FOREACH la IN ARRAY ARRAY['English','Kiswahili']
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM subject_paper_config
         WHERE tenant_id IS NULL AND grade_level = g AND learning_area = la
      ) THEN
        INSERT INTO subject_paper_config (tenant_id, grade_level, learning_area, paper_count)
        VALUES (NULL, g, la, 2);
      END IF;
    END LOOP;
  END LOOP;
END $$;
