-- ============================================================
-- Lesson Notes: learner-facing version
-- A simplified, plain-language version of the same lesson content for
-- printing as a learner handout, alongside the teacher-facing notes.
-- ============================================================
ALTER TABLE lesson_notes ADD COLUMN IF NOT EXISTS learner_content TEXT;
