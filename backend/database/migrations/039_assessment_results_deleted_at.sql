-- 039_assessment_results_deleted_at.sql
-- The mark list, report card, and area-ranking queries (pdf.service, stubs.module,
-- academic.module) all filter "WHERE ar.deleted_at IS NULL", but assessment_results
-- never had this column — the entity didn't declare it either, so any environment
-- without a manual ALTER TABLE has every one of those queries throw and silently
-- return an empty result (wrapped in .catch(() => [])), showing "no marks found"
-- even when real marks exist. Add the column so it matches what the code already
-- assumes everywhere.

ALTER TABLE assessment_results ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL;

CREATE INDEX IF NOT EXISTS idx_assessment_results_deleted_at ON assessment_results(deleted_at);
