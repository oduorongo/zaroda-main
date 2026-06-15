-- ============================================================================
-- 021_missing_learning_areas.sql
-- Some grades were missing learning areas in the assessment rubric
-- (e.g. Grade 8 English, Grade 7 English/Creative Arts/Pre-Technical,
--  Grade 2/3 English & Creative Arts, Grade 6 several).
-- Learning areas below are taken from the official KICD grade assessment
-- report books (the section/table TITLES, not the summative tables) and added
-- using each grade's existing naming convention so the mark list & report card
-- match. Idempotent: each area is inserted only if not already present.
-- ============================================================================

DO $$
DECLARE
  tid UUID; sid UUID;
  -- (grade_level, learning_area) pairs to ensure exist
  rec RECORD;
  -- generic CBC strands applied to any newly-added area
  strands TEXT[] := ARRAY['Listening and Speaking','Reading','Writing','Language Use'];
  s TEXT; pos INT;
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      -- Lower primary (Activities naming)
      ('grade_2','English Language Activities'),
      ('grade_2','Creative Arts Activities'),
      ('grade_3','English Language Activities'),
      ('grade_3','Creative Arts Activities'),
      -- Upper primary (Activities naming)
      ('grade_4','English Language Activities'),
      ('grade_5','English Language Activities'),
      ('grade_6','English Language Activities'),
      ('grade_6','Creative Arts Activities'),
      ('grade_6','Science & Technology Activities'),
      ('grade_6','Indeginous Language Activities'),
      -- Junior school (no "Activities" suffix)
      ('grade_7','English Language'),
      ('grade_7','Creative Arts'),
      ('grade_7','Pretechnical Studies'),
      ('grade_8','English Language')
    ) AS t(grade_level, learning_area)
  LOOP
    -- Only add if this grade/area template does not already exist
    IF NOT EXISTS (
      SELECT 1 FROM assessment_templates
       WHERE grade_level = rec.grade_level
         AND lower(learning_area) = lower(rec.learning_area)
         AND tenant_id IS NULL
    ) THEN
      INSERT INTO assessment_templates (tenant_id, grade_level, learning_area)
      VALUES (NULL, rec.grade_level, rec.learning_area)
      RETURNING id INTO tid;

      pos := 1;
      FOREACH s IN ARRAY strands LOOP
        INSERT INTO assessment_strands (template_id, position, name)
        VALUES (tid, pos, s) RETURNING id INTO sid;
        INSERT INTO assessment_substrands (strand_id, position, name)
        VALUES (sid, 1, s || ' — competency 1'),
               (sid, 2, s || ' — competency 2');
        pos := pos + 1;
      END LOOP;
    END IF;
  END LOOP;
END $$;
