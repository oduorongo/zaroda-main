-- ============================================================
-- ZARODA SMS — The school year on every mark, rubric level and comment
-- Classes (streams) are kept from year to year and terms repeat every year, so
-- term alone could not tell this year's Term 1 from last year's. Once learners are
-- promoted, a class's Term 1 mark list, a learner's report card and a repeater's
-- rubric would mix two years (and saving one could overwrite the other).
-- school_year is the calendar year (Kenyan schools run January to November).
-- Existing rows take the year they were entered in, in Nairobi time; an exam's
-- marks take the year of the exam.
-- Idempotent.
-- ============================================================

ALTER TABLE assessment_results  ADD COLUMN IF NOT EXISTS school_year INT;
ALTER TABLE assessment_scores   ADD COLUMN IF NOT EXISTS school_year INT;
ALTER TABLE assessment_comments ADD COLUMN IF NOT EXISTS school_year INT;

UPDATE assessment_results ar
   SET school_year = COALESCE(
         (SELECT EXTRACT(YEAR FROM COALESCE(e.start_date::timestamp, e.created_at AT TIME ZONE 'Africa/Nairobi'))::int
            FROM exams e WHERE e.id::text = ar.exam_id::text),
         EXTRACT(YEAR FROM COALESCE(ar.created_at, NOW()) AT TIME ZONE 'Africa/Nairobi')::int)
 WHERE school_year IS NULL;

UPDATE assessment_scores
   SET school_year = EXTRACT(YEAR FROM COALESCE(updated_at, NOW()) AT TIME ZONE 'Africa/Nairobi')::int
 WHERE school_year IS NULL;

UPDATE assessment_comments
   SET school_year = EXTRACT(YEAR FROM COALESCE(updated_at, NOW()) AT TIME ZONE 'Africa/Nairobi')::int
 WHERE school_year IS NULL;

-- Anything saved without a year gets the current one.
ALTER TABLE assessment_results  ALTER COLUMN school_year SET DEFAULT EXTRACT(YEAR FROM NOW() AT TIME ZONE 'Africa/Nairobi')::int;
ALTER TABLE assessment_scores   ALTER COLUMN school_year SET DEFAULT EXTRACT(YEAR FROM NOW() AT TIME ZONE 'Africa/Nairobi')::int;
ALTER TABLE assessment_comments ALTER COLUMN school_year SET DEFAULT EXTRACT(YEAR FROM NOW() AT TIME ZONE 'Africa/Nairobi')::int;

-- One rubric level per learner, sub-strand, term AND year; one comment per learner,
-- learning area, term and year (Mathematics exists in every grade).
ALTER TABLE assessment_scores   DROP CONSTRAINT IF EXISTS assessment_scores_learner_id_substrand_id_term_key;
ALTER TABLE assessment_scores   DROP CONSTRAINT IF EXISTS uq_ascore_learner_sub_term;
ALTER TABLE assessment_comments DROP CONSTRAINT IF EXISTS assessment_comments_learner_id_learning_area_term_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_ascore_learner_sub_term_year
  ON assessment_scores (learner_id, substrand_id, term, school_year);
CREATE UNIQUE INDEX IF NOT EXISTS uq_acomment_learner_area_term_year
  ON assessment_comments (learner_id, learning_area, term, school_year);

CREATE INDEX IF NOT EXISTS idx_aresult_stream_term_year ON assessment_results (tenant_id, stream_id, term, school_year);
CREATE INDEX IF NOT EXISTS idx_aresult_learner_term_year ON assessment_results (tenant_id, learner_id, term, school_year);

-- Promotions: who moved which learner from which class to which, and when. Undo reads it.
CREATE TABLE IF NOT EXISTS learner_promotions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  batch_id        UUID NOT NULL,
  learner_id      UUID NOT NULL,
  action          VARCHAR(20) NOT NULL,      -- promote | repeat | transfer | complete
  from_grade      VARCHAR(40),
  from_stream_id  UUID,
  to_grade        VARCHAR(40),
  to_stream_id    UUID,
  from_status     VARCHAR(40),
  to_status       VARCHAR(40),
  school_year     INT NOT NULL,              -- the year being closed
  done_by         UUID,
  done_at         TIMESTAMPTZ DEFAULT NOW(),
  undone_at       TIMESTAMPTZ,
  undone_by       UUID
);
CREATE INDEX IF NOT EXISTS idx_lpromo_tenant_batch ON learner_promotions (tenant_id, batch_id);
CREATE INDEX IF NOT EXISTS idx_lpromo_learner ON learner_promotions (tenant_id, learner_id);
