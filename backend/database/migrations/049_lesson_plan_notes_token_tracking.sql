-- ============================================================
-- Track AI token usage on Lesson Plans and Lesson Notes, matching what
-- schemes_of_work.generation_tokens already does — needed to check real
-- generation cost against what the wallet charges per item.
-- ============================================================
ALTER TABLE lesson_plans ADD COLUMN IF NOT EXISTS generation_tokens INTEGER;
ALTER TABLE lesson_notes ADD COLUMN IF NOT EXISTS generation_tokens INTEGER;
