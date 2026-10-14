-- ============================================================
-- ZARODA SMS — Paper 1 & 2 only where a school has set it up
-- 017 seeded a shared default (English & Kiswahili, Grades 7-12) and 018 tried to
-- remove it, but the code still honoured any shared (tenant_id IS NULL) row, so a
-- database that still had one showed "(Paper 1 & 2)" on English and Kiswahili for
-- every school without anyone asking for it. From now on the code reads ONLY a
-- school's own settings (Academic > Paper 1 & 2 Setup), and this migration clears
-- the shared rows.
--
-- Nothing changes for a school that already entered marks as Paper 1 / Paper 2:
-- first, for every school + grade + learning area that has paper-marked results,
-- the setting it was relying on becomes that school's own explicit setting (the
-- "out of" totals are copied from what was entered, when it was always the same).
-- Idempotent: it only adds a setting that is not already there.
-- ============================================================

INSERT INTO subject_paper_config (tenant_id, grade_level, learning_area, paper_count, paper1_max, paper2_max)
SELECT r.tenant_id,
       r.grade_level,
       MIN(r.subject),
       2,
       CASE WHEN COUNT(DISTINCT r.max_score) FILTER (WHERE r.paper = '1' AND r.max_score IS NOT NULL) = 1
            THEN ROUND(MAX(r.max_score) FILTER (WHERE r.paper = '1'))::INT END,
       CASE WHEN COUNT(DISTINCT r.max_score) FILTER (WHERE r.paper = '2' AND r.max_score IS NOT NULL) = 1
            THEN ROUND(MAX(r.max_score) FILTER (WHERE r.paper = '2'))::INT END
  FROM assessment_results r
 WHERE r.paper IN ('1', '2')
   AND r.tenant_id IS NOT NULL
   AND r.grade_level IS NOT NULL
   AND r.subject IS NOT NULL
   AND NOT EXISTS (
         SELECT 1 FROM subject_paper_config c
          WHERE c.tenant_id = r.tenant_id
            AND c.grade_level = r.grade_level
            AND LOWER(c.learning_area) = LOWER(r.subject)
       )
 GROUP BY r.tenant_id, r.grade_level, LOWER(r.subject);

-- Then remove the shared defaults, so no school gets Paper 1 & 2 it did not turn on.
DELETE FROM subject_paper_config WHERE tenant_id IS NULL;
