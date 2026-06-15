-- ============================================================================
-- 020_grade1_learning_areas_fix.sql
-- Grade 1 report cards / mark list were not picking learning areas correctly
-- because the seeded assessment_templates for grade_1:
--   • had a typo: 'Indeginous Language Activities' → 'Indigenous Language Activities'
--   • were MISSING 'English Language Activities' (a core Lower-Primary area)
-- The report card and mark list read learning areas from assessment_templates,
-- so this corrects the source of truth. Idempotent.
-- ============================================================================

-- 1) Fix the typo (only if the wrong spelling exists)
UPDATE assessment_templates
SET learning_area = 'Indigenous Language Activities'
WHERE grade_level = 'grade_1'
  AND learning_area = 'Indeginous Language Activities';

-- 2) Add the missing English Language Activities template for Grade 1
DO $$
DECLARE tid UUID; sid UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM assessment_templates
    WHERE grade_level = 'grade_1' AND learning_area = 'English Language Activities'
      AND tenant_id IS NULL
  ) THEN
    INSERT INTO assessment_templates (tenant_id, grade_level, learning_area)
    VALUES (NULL, 'grade_1', 'English Language Activities') RETURNING id INTO tid;

    INSERT INTO assessment_strands (template_id, position, name)
    VALUES (tid, 1, 'Listening and Speaking') RETURNING id INTO sid;
    INSERT INTO assessment_substrands (strand_id, position, name) VALUES
      (sid, 1, 'Pronunciation and vocabulary'),
      (sid, 2, 'Listening comprehension'),
      (sid, 3, 'Oral presentation');

    INSERT INTO assessment_strands (template_id, position, name)
    VALUES (tid, 2, 'Reading') RETURNING id INTO sid;
    INSERT INTO assessment_substrands (strand_id, position, name) VALUES
      (sid, 1, 'Letter and sound recognition'),
      (sid, 2, 'Reading aloud'),
      (sid, 3, 'Reading comprehension');

    INSERT INTO assessment_strands (template_id, position, name)
    VALUES (tid, 3, 'Writing') RETURNING id INTO sid;
    INSERT INTO assessment_substrands (strand_id, position, name) VALUES
      (sid, 1, 'Handwriting and letter formation'),
      (sid, 2, 'Spelling'),
      (sid, 3, 'Guided writing');

    INSERT INTO assessment_strands (template_id, position, name)
    VALUES (tid, 4, 'Language Use') RETURNING id INTO sid;
    INSERT INTO assessment_substrands (strand_id, position, name) VALUES
      (sid, 1, 'Sentence structure'),
      (sid, 2, 'Grammar in context');
  END IF;
END $$;
