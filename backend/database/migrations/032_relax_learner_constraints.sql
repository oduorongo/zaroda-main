-- 032_relax_learner_constraints.sql
-- The teacher "add learner" form doesn't send grade_level (it's implied by the stream)
-- and may leave gender blank. The original learners table (003) makes grade_level NOT
-- NULL and gender NOT NULL with a CHECK (male|female), which caused server errors when
-- class teachers added learners. Relax these so the app layer can fill sensible values.

ALTER TABLE learners ALTER COLUMN grade_level DROP NOT NULL;
ALTER TABLE learners ALTER COLUMN gender      DROP NOT NULL;

-- Drop the strict gender CHECK if present (the app normalises gender itself).
ALTER TABLE learners DROP CONSTRAINT IF EXISTS learners_gender_check;
