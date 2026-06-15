-- ============================================================================
-- 025_fix_integrated_science_spelling.sql
-- The assessment rubric seed misspelled "Integrated Science" as
-- "Intergrated Science" for Grade 7, 8 and 9. Teachers enter marks under the
-- correct spelling, so the names didn't match and scores were dropped from the
-- mark list / report card for that subject. Correct the rubric area name.
-- Idempotent: only renames rows that still carry the typo, and won't create a
-- duplicate if the correct name already exists for that grade.
-- ============================================================================

UPDATE assessment_templates t
   SET learning_area = 'Integrated Science'
 WHERE t.learning_area = 'Intergrated Science'
   AND NOT EXISTS (
     SELECT 1 FROM assessment_templates x
      WHERE x.grade_level = t.grade_level
        AND x.learning_area = 'Integrated Science'
        AND COALESCE(x.tenant_id::text,'') = COALESCE(t.tenant_id::text,'')
   );

-- If a correct row already existed, just delete the leftover misspelled duplicates.
DELETE FROM assessment_templates
 WHERE learning_area = 'Intergrated Science';
