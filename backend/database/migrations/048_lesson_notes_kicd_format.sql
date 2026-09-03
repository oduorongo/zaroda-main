-- ============================================================
-- Lesson Notes: align with the official KICD lesson-notes template
-- (School/Learning Area/Grade, Term/Week/Date, Strand/Sub-Strand, SLOs
-- Covered, Introduction, Content, Key Vocabulary, Summary, Review
-- Questions with answers, References).
-- ============================================================
ALTER TABLE lesson_notes ADD COLUMN IF NOT EXISTS strand VARCHAR(255);
ALTER TABLE lesson_notes ADD COLUMN IF NOT EXISTS sub_strand VARCHAR(255);
ALTER TABLE lesson_notes ADD COLUMN IF NOT EXISTS slos_covered TEXT;
ALTER TABLE lesson_notes ADD COLUMN IF NOT EXISTS introduction TEXT;
ALTER TABLE lesson_notes ADD COLUMN IF NOT EXISTS key_vocabulary TEXT;
ALTER TABLE lesson_notes ADD COLUMN IF NOT EXISTS summary TEXT;
ALTER TABLE lesson_notes ADD COLUMN IF NOT EXISTS review_questions TEXT;
ALTER TABLE lesson_notes ADD COLUMN IF NOT EXISTS reference_materials TEXT;

-- The new template doesn't have a distinct "Activities" section (folded into
-- Content/Review Questions instead), so this stops being populated going forward.
ALTER TABLE lesson_notes ALTER COLUMN activities DROP NOT NULL;
