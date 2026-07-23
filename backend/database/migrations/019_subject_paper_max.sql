-- ============================================================
-- ZARODA SMS — Persist each paper's "out of" so the mark list can use the
-- FULL combined total (e.g. Paper 1 /40 + Paper 2 /60 = /100) even when a
-- learner only has one paper's score entered. Without this, a learner
-- missing Paper 2 would be averaged against Paper 1's max alone (40) and
-- show 100% instead of 40/100.
-- ============================================================

ALTER TABLE subject_paper_config ADD COLUMN IF NOT EXISTS paper1_max INT;
ALTER TABLE subject_paper_config ADD COLUMN IF NOT EXISTS paper2_max INT;
