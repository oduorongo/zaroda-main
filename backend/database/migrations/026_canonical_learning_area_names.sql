-- ============================================================================
-- 026_canonical_learning_area_names.sql
-- Single source of truth for learning-area names (from the official KICD
-- LEARNING_AREAS document). Renames every known spelling/variant to the exact
-- canonical name, in BOTH the rubric (assessment_templates) and saved marks
-- (assessment_results), so names match perfectly across Enter Marks → mark list
-- → report card with no fuzzy matching needed.
--
-- Canonical names per band:
--   Pre-Primary (pp1/pp2): Language Activities, Mathematical Activities,
--       Creative Activities, Environmental Activities, Religious Activities
--   Grades 1-3: Indigenous Language Activities,
--       Kiswahili Language Activities / Kenya Sign Language Activities,
--       English Language Activities, Mathematical Activities,
--       Religious Education Activities, Environmental Activities,
--       Creative Activities
--   Grades 4-6: English, Kiswahili/Kenya Sign Language, Mathematics,
--       Religious Education, Science & Technology, Agriculture, Social Studies,
--       Creative Arts
--   Grades 7-9: English, Kiswahili/Kenya Sign Language (KSL), Mathematics,
--       Religious Education, Social Studies, Integrated Science,
--       Pre-technical Studies, Agriculture, Creative Arts and Sports
--
-- Idempotent. Renames merge onto the canonical row where one already exists.
-- ============================================================================

DO $$
DECLARE
  m RECORD;
  dup_template UUID;
BEGIN
  -- (grade_level, from_variant, to_canonical) — covers every name seen in seeds 014/020/021.
  FOR m IN
    SELECT * FROM (VALUES
      -- ── Pre-Primary ──
      ('pp1','English Language Activities','Language Activities'),
      ('pp2','English Language Activities','Language Activities'),
      ('pp1','Mathematics Activities','Mathematical Activities'),
      ('pp2','Mathematics Activities','Mathematical Activities'),
      ('pp1','Creative Arts Activities','Creative Activities'),
      ('pp2','Creative Arts Activities','Creative Activities'),
      ('pp1','Christian Religious Education Activities','Religious Activities'),
      ('pp2','Christian Religious Education Activities','Religious Activities'),
      -- (Environmental Activities already canonical)

      -- ── Grades 1-3 ──
      ('grade_1','Indeginous Language Activities','Indigenous Language Activities'),
      ('grade_2','Indeginous Language Activities','Indigenous Language Activities'),
      ('grade_3','Indeginous Language Activities','Indigenous Language Activities'),
      ('grade_1','Shughuli Za Kiswahili','Kiswahili Language Activities / Kenya Sign Language Activities'),
      ('grade_2','Shughuli Za Kiswahili','Kiswahili Language Activities / Kenya Sign Language Activities'),
      ('grade_3','Shughuli Za Kiswahili','Kiswahili Language Activities / Kenya Sign Language Activities'),
      ('grade_1','Mathematics Activities','Mathematical Activities'),
      ('grade_2','Mathematics Activities','Mathematical Activities'),
      ('grade_3','Mathematics Activities','Mathematical Activities'),
      ('grade_1','Christian Religious Education Activities','Religious Education Activities'),
      ('grade_2','Christian Religious Education Activities','Religious Education Activities'),
      ('grade_3','Christian Religious Education Activities','Religious Education Activities'),
      ('grade_1','Creative Arts Activities','Creative Activities'),
      ('grade_2','Creative Arts Activities','Creative Activities'),
      ('grade_3','Creative Arts Activities','Creative Activities'),
      -- (English Language Activities, Environmental Activities already canonical)

      -- ── Grades 4-6 ──
      ('grade_4','English Language Activities','English'),
      ('grade_5','English Language Activities','English'),
      ('grade_6','English Language Activities','English'),
      ('grade_4','Shughuli Za Kiswahili','Kiswahili/Kenya Sign Language'),
      ('grade_5','Shughuli Za Kiswahili','Kiswahili/Kenya Sign Language'),
      ('grade_6','Shughuli Za Kiswahili','Kiswahili/Kenya Sign Language'),
      ('grade_4','Mathematics Activities','Mathematics'),
      ('grade_5','Mathematics Activities','Mathematics'),
      ('grade_6','Mathematics Activities','Mathematics'),
      ('grade_4','C.R.E Activities','Religious Education'),
      ('grade_5','C.R.E Activities','Religious Education'),
      ('grade_6','C.R.E Activities','Religious Education'),
      ('grade_4','Science & Technology Activities','Science & Technology'),
      ('grade_5','Science & Technology Activities','Science & Technology'),
      ('grade_6','Science & Technology Activities','Science & Technology'),
      ('grade_4','Agriculture & Nutrition Activities','Agriculture'),
      ('grade_5','Agriculture & Nutrition Activities','Agriculture'),
      ('grade_6','Agriculture & Nutrition Activities','Agriculture'),
      ('grade_4','Social Studies Activities','Social Studies'),
      ('grade_5','Social Studies Activities','Social Studies'),
      ('grade_6','Social Studies Activities','Social Studies'),
      ('grade_4','Creative Arts Activities','Creative Arts'),
      ('grade_5','Creative Arts Activities','Creative Arts'),
      ('grade_6','Creative Arts Activities','Creative Arts'),
      ('grade_4','Indeginous Language Activities','Indigenous Language'),
      ('grade_5','Indeginous Language Activities','Indigenous Language'),

      -- ── Grades 7-9 ──
      ('grade_7','English Language','English'),
      ('grade_8','English Language','English'),
      ('grade_9','English Language','English'),
      ('grade_7','Kiswahili','Kiswahili/Kenya Sign Language (KSL)'),
      ('grade_8','Kiswahili','Kiswahili/Kenya Sign Language (KSL)'),
      ('grade_9','Kiswahili','Kiswahili/Kenya Sign Language (KSL)'),
      ('grade_7','C.R.E','Religious Education'),
      ('grade_8','C.R.E','Religious Education'),
      ('grade_9','C.R.E','Religious Education'),
      ('grade_7','Social Studies Activities','Social Studies'),
      ('grade_8','Social Studies Activities','Social Studies'),
      ('grade_9','Social Studies Activities','Social Studies'),
      ('grade_7','Intergrated Science','Integrated Science'),
      ('grade_8','Intergrated Science','Integrated Science'),
      ('grade_9','Intergrated Science','Integrated Science'),
      ('grade_7','Pretechnical Studies','Pre-technical Studies'),
      ('grade_8','Pretechnical Studies','Pre-technical Studies'),
      ('grade_9','Pretechnical Studies','Pre-technical Studies'),
      ('grade_7','Pre-Technical Studies','Pre-technical Studies'),
      ('grade_8','Pre-Technical Studies','Pre-technical Studies'),
      ('grade_9','Pre-Technical Studies','Pre-technical Studies'),
      ('grade_7','Agriculture & Nutrition','Agriculture'),
      ('grade_8','Agriculture & Nutrition','Agriculture'),
      ('grade_9','Agriculture & Nutrition','Agriculture'),
      ('grade_7','Creative Arts','Creative Arts and Sports'),
      ('grade_8','Creative Arts','Creative Arts and Sports'),
      ('grade_9','Creative Arts','Creative Arts and Sports'),
      ('grade_7','Creative Arts & Sports','Creative Arts and Sports'),
      ('grade_8','Creative Arts & Sports','Creative Arts and Sports'),
      ('grade_9','Creative Arts & Sports','Creative Arts and Sports')
    ) AS t(grade_level, from_name, to_name)
  LOOP
    -- Rubric (assessment_templates): if a canonical row already exists for this
    -- grade, move the variant's strands onto it and delete the variant; else rename.
    SELECT id INTO dup_template
      FROM assessment_templates
     WHERE grade_level = m.grade_level AND learning_area = m.to_name
     LIMIT 1;

    IF dup_template IS NOT NULL THEN
      -- Re-point any strands from the variant template onto the canonical one, then remove the variant.
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

    -- Saved marks (assessment_results): rename the subject so existing marks keep matching.
    -- assessment_results carries its own grade_level, so match on that directly.
    UPDATE assessment_results
       SET subject = m.to_name
     WHERE grade_level = m.grade_level
       AND subject = m.from_name;
    -- Safety net for any rows with a null grade_level: match via the learner's grade.
    UPDATE assessment_results ar
       SET subject = m.to_name
      FROM learners l
     WHERE ar.grade_level IS NULL
       AND ar.learner_id::text = l.id::text
       AND l.grade_level = m.grade_level
       AND ar.subject = m.from_name;
  END LOOP;
END $$;
