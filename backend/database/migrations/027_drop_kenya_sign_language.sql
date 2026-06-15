-- ============================================================================
-- 027_drop_kenya_sign_language.sql
-- Omit "Kenya Sign Language" from learning-area names. Renames the combined
-- Kiswahili/KSL names to plain "Kiswahili" (and the Lower-Primary activities
-- variant) in BOTH the rubric (assessment_templates) and saved marks
-- (assessment_results). Idempotent; merges onto an existing canonical row.
-- ============================================================================

DO $$
DECLARE
  m RECORD;
  dup_template UUID;
BEGIN
  FOR m IN
    SELECT * FROM (VALUES
      ('grade_1','Kiswahili Language Activities / Kenya Sign Language Activities','Kiswahili Language Activities'),
      ('grade_2','Kiswahili Language Activities / Kenya Sign Language Activities','Kiswahili Language Activities'),
      ('grade_3','Kiswahili Language Activities / Kenya Sign Language Activities','Kiswahili Language Activities'),
      ('grade_4','Kiswahili/Kenya Sign Language','Kiswahili'),
      ('grade_5','Kiswahili/Kenya Sign Language','Kiswahili'),
      ('grade_6','Kiswahili/Kenya Sign Language','Kiswahili'),
      ('grade_7','Kiswahili/Kenya Sign Language (KSL)','Kiswahili'),
      ('grade_8','Kiswahili/Kenya Sign Language (KSL)','Kiswahili'),
      ('grade_9','Kiswahili/Kenya Sign Language (KSL)','Kiswahili')
    ) AS t(grade_level, from_name, to_name)
  LOOP
    SELECT id INTO dup_template
      FROM assessment_templates
     WHERE grade_level = m.grade_level AND learning_area = m.to_name
     LIMIT 1;

    IF dup_template IS NOT NULL THEN
      UPDATE assessment_strands
         SET template_id = dup_template
       WHERE template_id::text IN (
         SELECT id::text FROM assessment_templates
          WHERE grade_level = m.grade_level AND learning_area = m.from_name
       );
      DELETE FROM assessment_templates
       WHERE grade_level = m.grade_level AND learning_area = m.from_name;
    ELSE
      UPDATE assessment_templates
         SET learning_area = m.to_name
       WHERE grade_level = m.grade_level AND learning_area = m.from_name;
    END IF;

    UPDATE assessment_results
       SET subject = m.to_name
     WHERE grade_level = m.grade_level
       AND subject = m.from_name;
  END LOOP;
END $$;
