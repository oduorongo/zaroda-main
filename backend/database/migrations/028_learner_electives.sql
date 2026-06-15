-- ============================================================================
-- 028_learner_electives.sql
-- Senior School (Grades 10–12): each learner chooses 3–4 elective learning areas
-- on top of the 4 core areas (English, Kiswahili, Core Mathematics, Community
-- Service Learning). Store the chosen electives as a JSON array on the learner.
-- ============================================================================

ALTER TABLE learners ADD COLUMN IF NOT EXISTS electives JSONB;
