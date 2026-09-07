-- ============================================================
-- Exams/CATs were always whole-school — every teacher, in every grade, saw
-- every exam when picking one to enter marks against, even ones that only
-- made sense for a different grade band. NULL/empty means "whole school"
-- (matches all existing exams), so this is fully backward compatible.
-- ============================================================
ALTER TABLE exams ADD COLUMN IF NOT EXISTS grade_levels TEXT[];
