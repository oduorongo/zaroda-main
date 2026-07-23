-- ============================================================================
-- 038_drop_indigenous_language.sql
-- Remove "Indigenous Language" (all spelling variants, e.g. "Indeginous
-- Language Activities") from the marklist rubric entirely. It was already
-- hidden from the mark list and report card at read time; this drops the
-- underlying assessment_templates rows (assessment_strands/substrands cascade)
-- so it can no longer reappear or be re-seeded. Idempotent.
-- ============================================================================

DELETE FROM assessment_templates
 WHERE learning_area ~* 'indigenous|indeg';
