-- 034_grade7_term_strands.sql
-- Grade 7 Term 2 & Term 3 strands (and sub-strands where available), extracted from
-- the official Grade 7 Assessment Report Book. Term 1 strands already exist (014) and
-- default to term_1 via migration 033. This adds the sequential Term 2/3 strands so the
-- rubric shows the correct strands per term. Idempotent: clears any prior term_2/term_3
-- strands for these templates before inserting.
DO $$
DECLARE tid UUID; sid UUID;
BEGIN
  -- term_2 :: Mathematics
  SELECT id INTO tid FROM assessment_templates WHERE grade_level='grade_7' AND learning_area='Mathematics' AND tenant_id IS NULL LIMIT 1;
  IF tid IS NOT NULL THEN
    DELETE FROM assessment_substrands WHERE strand_id IN (SELECT id FROM assessment_strands WHERE template_id=tid AND term='term_2');
    DELETE FROM assessment_strands WHERE template_id=tid AND term='term_2';
    INSERT INTO assessment_strands (template_id, position, name, term) VALUES (tid, 1, 'ALGEBRA', 'term_2') RETURNING id INTO sid;
    INSERT INTO assessment_substrands (strand_id, position, name) VALUES (sid, 1, 'Linear equations');
    INSERT INTO assessment_substrands (strand_id, position, name) VALUES (sid, 2, 'Linear Inequalities');
    INSERT INTO assessment_strands (template_id, position, name, term) VALUES (tid, 2, 'MEASUREMENT', 'term_2') RETURNING id INTO sid;
    INSERT INTO assessment_substrands (strand_id, position, name) VALUES (sid, 1, 'Pythagorean relationship');
    INSERT INTO assessment_substrands (strand_id, position, name) VALUES (sid, 2, 'Length');
    INSERT INTO assessment_substrands (strand_id, position, name) VALUES (sid, 3, 'Area');
    INSERT INTO assessment_substrands (strand_id, position, name) VALUES (sid, 4, 'Volume and capacity');
    INSERT INTO assessment_substrands (strand_id, position, name) VALUES (sid, 5, 'Time, distance & speed');
    INSERT INTO assessment_substrands (strand_id, position, name) VALUES (sid, 6, 'Temperature');
    INSERT INTO assessment_substrands (strand_id, position, name) VALUES (sid, 7, 'Money');
  END IF;
  -- term_2 :: English
  SELECT id INTO tid FROM assessment_templates WHERE grade_level='grade_7' AND learning_area='English' AND tenant_id IS NULL LIMIT 1;
  IF tid IS NOT NULL THEN
    DELETE FROM assessment_substrands WHERE strand_id IN (SELECT id FROM assessment_strands WHERE template_id=tid AND term='term_2');
    DELETE FROM assessment_strands WHERE template_id=tid AND term='term_2';
    INSERT INTO assessment_strands (template_id, position, name, term) VALUES (tid, 1, 'DRUG & SUBSTANCE ABUSE', 'term_2') RETURNING id INTO sid;
    INSERT INTO assessment_substrands (strand_id, position, name) VALUES (sid, 1, 'DRUG & SUBSTANCE ABUSE');
    INSERT INTO assessment_strands (template_id, position, name, term) VALUES (tid, 2, 'NATURAL RESOURCES- FORESTS', 'term_2') RETURNING id INTO sid;
    INSERT INTO assessment_substrands (strand_id, position, name) VALUES (sid, 1, 'NATURAL RESOURCES- FORESTS');
    INSERT INTO assessment_strands (template_id, position, name, term) VALUES (tid, 3, 'TRAVEL', 'term_2') RETURNING id INTO sid;
    INSERT INTO assessment_substrands (strand_id, position, name) VALUES (sid, 1, 'TRAVEL');
    INSERT INTO assessment_strands (template_id, position, name, term) VALUES (tid, 4, 'HEROES & HEROINES - KENYA', 'term_2') RETURNING id INTO sid;
    INSERT INTO assessment_substrands (strand_id, position, name) VALUES (sid, 1, 'HEROES & HEROINES - KENYA');
    INSERT INTO assessment_strands (template_id, position, name, term) VALUES (tid, 5, 'MUSIC', 'term_2') RETURNING id INTO sid;
    INSERT INTO assessment_substrands (strand_id, position, name) VALUES (sid, 1, 'MUSIC');
    INSERT INTO assessment_strands (template_id, position, name, term) VALUES (tid, 6, 'PROFESSIONS', 'term_2') RETURNING id INTO sid;
    INSERT INTO assessment_substrands (strand_id, position, name) VALUES (sid, 1, 'PROFESSIONS');
  END IF;
  -- term_2 :: Kiswahili
  SELECT id INTO tid FROM assessment_templates WHERE grade_level='grade_7' AND learning_area='Kiswahili' AND tenant_id IS NULL LIMIT 1;
  IF tid IS NOT NULL THEN
    DELETE FROM assessment_substrands WHERE strand_id IN (SELECT id FROM assessment_strands WHERE template_id=tid AND term='term_2');
    DELETE FROM assessment_strands WHERE template_id=tid AND term='term_2';
    INSERT INTO assessment_strands (template_id, position, name, term) VALUES (tid, 1, 'USALAMA SHULENI', 'term_2') RETURNING id INTO sid;
    INSERT INTO assessment_substrands (strand_id, position, name) VALUES (sid, 1, 'USALAMA SHULENI');
    INSERT INTO assessment_strands (template_id, position, name, term) VALUES (tid, 2, 'KUHUDUMIA JAMII SHULENI', 'term_2') RETURNING id INTO sid;
    INSERT INTO assessment_substrands (strand_id, position, name) VALUES (sid, 1, 'KUHUDUMIA JAMII SHULENI');
    INSERT INTO assessment_strands (template_id, position, name, term) VALUES (tid, 3, 'ULANGUZI WA BINADAMU', 'term_2') RETURNING id INTO sid;
    INSERT INTO assessment_substrands (strand_id, position, name) VALUES (sid, 1, 'ULANGUZI WA BINADAMU');
    INSERT INTO assessment_strands (template_id, position, name, term) VALUES (tid, 4, 'MATUMIZI YA VIFAA VYA KIDIJITALI KATIKA MAWASILIANO', 'term_2') RETURNING id INTO sid;
    INSERT INTO assessment_substrands (strand_id, position, name) VALUES (sid, 1, 'MATUMIZI YA VIFAA VYA KIDIJITALI KATIKA MAWASILIANO');
    INSERT INTO assessment_strands (template_id, position, name, term) VALUES (tid, 5, 'KUJITHAMINI', 'term_2') RETURNING id INTO sid;
    INSERT INTO assessment_substrands (strand_id, position, name) VALUES (sid, 1, 'KUJITHAMINI');
    INSERT INTO assessment_strands (template_id, position, name, term) VALUES (tid, 6, 'MAJUKUMU YA WATOTO', 'term_2') RETURNING id INTO sid;
    INSERT INTO assessment_substrands (strand_id, position, name) VALUES (sid, 1, 'MAJUKUMU YA WATOTO');
  END IF;
  -- term_2 :: Social Studies
  SELECT id INTO tid FROM assessment_templates WHERE grade_level='grade_7' AND learning_area='Social Studies' AND tenant_id IS NULL LIMIT 1;
  IF tid IS NOT NULL THEN
    DELETE FROM assessment_substrands WHERE strand_id IN (SELECT id FROM assessment_strands WHERE template_id=tid AND term='term_2');
    DELETE FROM assessment_strands WHERE template_id=tid AND term='term_2';
    INSERT INTO assessment_strands (template_id, position, name, term) VALUES (tid, 1, 'COMMUNITY SERVICE LEARNING', 'term_2') RETURNING id INTO sid;
    INSERT INTO assessment_substrands (strand_id, position, name) VALUES (sid, 1, 'COMMUNITY SERVICE LEARNING');
    INSERT INTO assessment_strands (template_id, position, name, term) VALUES (tid, 2, 'NATURAL & HISTORIC BUILT ENVIRONMENTS IN AFRICA', 'term_2') RETURNING id INTO sid;
    INSERT INTO assessment_substrands (strand_id, position, name) VALUES (sid, 1, 'NATURAL & HISTORIC BUILT ENVIRONMENTS IN AFRICA');
  END IF;
  -- term_2 :: Integrated Science
  SELECT id INTO tid FROM assessment_templates WHERE grade_level='grade_7' AND learning_area='Integrated Science' AND tenant_id IS NULL LIMIT 1;
  IF tid IS NOT NULL THEN
    DELETE FROM assessment_substrands WHERE strand_id IN (SELECT id FROM assessment_strands WHERE template_id=tid AND term='term_2');
    DELETE FROM assessment_strands WHERE template_id=tid AND term='term_2';
    INSERT INTO assessment_strands (template_id, position, name, term) VALUES (tid, 1, 'MIXTURES, ELEMENTS & COMPONENTS', 'term_2') RETURNING id INTO sid;
    INSERT INTO assessment_substrands (strand_id, position, name) VALUES (sid, 1, 'MIXTURES, ELEMENTS & COMPONENTS');
    INSERT INTO assessment_strands (template_id, position, name, term) VALUES (tid, 2, 'LIVING THINGS & THEIR ENVIRONMENT', 'term_2') RETURNING id INTO sid;
    INSERT INTO assessment_substrands (strand_id, position, name) VALUES (sid, 1, 'LIVING THINGS & THEIR ENVIRONMENT');
  END IF;
  -- term_2 :: Agriculture
  SELECT id INTO tid FROM assessment_templates WHERE grade_level='grade_7' AND learning_area='Agriculture' AND tenant_id IS NULL LIMIT 1;
  IF tid IS NOT NULL THEN
    DELETE FROM assessment_substrands WHERE strand_id IN (SELECT id FROM assessment_strands WHERE template_id=tid AND term='term_2');
    DELETE FROM assessment_strands WHERE template_id=tid AND term='term_2';
    INSERT INTO assessment_strands (template_id, position, name, term) VALUES (tid, 1, 'FOOD PRODUCTION PROCESSES', 'term_2') RETURNING id INTO sid;
    INSERT INTO assessment_substrands (strand_id, position, name) VALUES (sid, 1, 'Selected crop management practices');
    INSERT INTO assessment_substrands (strand_id, position, name) VALUES (sid, 2, 'Preparing animal products: eggs & honey');
    INSERT INTO assessment_substrands (strand_id, position, name) VALUES (sid, 3, 'Cooking: grilling, roasting & steaming');
    INSERT INTO assessment_strands (template_id, position, name, term) VALUES (tid, 2, 'HYGIENE PRACTICES', 'term_2') RETURNING id INTO sid;
    INSERT INTO assessment_substrands (strand_id, position, name) VALUES (sid, 1, 'HYGIENE PRACTICES');
    INSERT INTO assessment_strands (template_id, position, name, term) VALUES (tid, 3, 'PRODUCTION TECHNIQUES', 'term_2') RETURNING id INTO sid;
    INSERT INTO assessment_substrands (strand_id, position, name) VALUES (sid, 1, 'PRODUCTION TECHNIQUES');
  END IF;
  -- term_2 :: Pre-technical Studies
  SELECT id INTO tid FROM assessment_templates WHERE grade_level='grade_7' AND learning_area='Pre-technical Studies' AND tenant_id IS NULL LIMIT 1;
  IF tid IS NOT NULL THEN
    DELETE FROM assessment_substrands WHERE strand_id IN (SELECT id FROM assessment_strands WHERE template_id=tid AND term='term_2');
    DELETE FROM assessment_strands WHERE template_id=tid AND term='term_2';
    INSERT INTO assessment_strands (template_id, position, name, term) VALUES (tid, 1, 'COMMUNICATION  IN PRE TECHNICAL', 'term_2') RETURNING id INTO sid;
    INSERT INTO assessment_substrands (strand_id, position, name) VALUES (sid, 1, 'COMMUNICATION  IN PRE TECHNICAL');
    INSERT INTO assessment_strands (template_id, position, name, term) VALUES (tid, 2, 'Materials for production', 'term_2') RETURNING id INTO sid;
    INSERT INTO assessment_substrands (strand_id, position, name) VALUES (sid, 1, 'Materials for production');
    INSERT INTO assessment_strands (template_id, position, name, term) VALUES (tid, 3, 'TOOLS & PRODUCTION', 'term_2') RETURNING id INTO sid;
    INSERT INTO assessment_substrands (strand_id, position, name) VALUES (sid, 1, 'TOOLS & PRODUCTION');
  END IF;
  -- term_2 :: Creative Arts and Sports
  SELECT id INTO tid FROM assessment_templates WHERE grade_level='grade_7' AND learning_area='Creative Arts and Sports' AND tenant_id IS NULL LIMIT 1;
  IF tid IS NOT NULL THEN
    DELETE FROM assessment_substrands WHERE strand_id IN (SELECT id FROM assessment_strands WHERE template_id=tid AND term='term_2');
    DELETE FROM assessment_strands WHERE template_id=tid AND term='term_2';
    INSERT INTO assessment_strands (template_id, position, name, term) VALUES (tid, 1, 'CREATION & PERFORMING OF CA&S', 'term_2') RETURNING id INTO sid;
    INSERT INTO assessment_substrands (strand_id, position, name) VALUES (sid, 1, 'Football');
    INSERT INTO assessment_substrands (strand_id, position, name) VALUES (sid, 2, 'Storytelling');
    INSERT INTO assessment_substrands (strand_id, position, name) VALUES (sid, 3, 'Swimming');
    INSERT INTO assessment_strands (template_id, position, name, term) VALUES (tid, 2, 'THE EARLY LIFE OF JESUS CHRIST', 'term_2') RETURNING id INTO sid;
    INSERT INTO assessment_substrands (strand_id, position, name) VALUES (sid, 1, 'THE EARLY LIFE OF JESUS CHRIST');
    INSERT INTO assessment_strands (template_id, position, name, term) VALUES (tid, 3, 'THE CHURCH', 'term_2') RETURNING id INTO sid;
    INSERT INTO assessment_substrands (strand_id, position, name) VALUES (sid, 1, 'THE CHURCH');
    INSERT INTO assessment_strands (template_id, position, name, term) VALUES (tid, 4, 'CHRISTIAN LIVING', 'term_2') RETURNING id INTO sid;
    INSERT INTO assessment_substrands (strand_id, position, name) VALUES (sid, 1, 'CHRISTIAN LIVING');
  END IF;
  -- term_3 :: Mathematics
  SELECT id INTO tid FROM assessment_templates WHERE grade_level='grade_7' AND learning_area='Mathematics' AND tenant_id IS NULL LIMIT 1;
  IF tid IS NOT NULL THEN
    DELETE FROM assessment_substrands WHERE strand_id IN (SELECT id FROM assessment_strands WHERE template_id=tid AND term='term_3');
    DELETE FROM assessment_strands WHERE template_id=tid AND term='term_3';
    INSERT INTO assessment_strands (template_id, position, name, term) VALUES (tid, 1, 'GEOMETRY', 'term_3') RETURNING id INTO sid;
    INSERT INTO assessment_substrands (strand_id, position, name) VALUES (sid, 1, 'GEOMETRY');
    INSERT INTO assessment_strands (template_id, position, name, term) VALUES (tid, 2, 'DATA HANDLING', 'term_3') RETURNING id INTO sid;
    INSERT INTO assessment_substrands (strand_id, position, name) VALUES (sid, 1, 'Data handling');
  END IF;
  -- term_3 :: English
  SELECT id INTO tid FROM assessment_templates WHERE grade_level='grade_7' AND learning_area='English' AND tenant_id IS NULL LIMIT 1;
  IF tid IS NOT NULL THEN
    DELETE FROM assessment_substrands WHERE strand_id IN (SELECT id FROM assessment_strands WHERE template_id=tid AND term='term_3');
    DELETE FROM assessment_strands WHERE template_id=tid AND term='term_3';
    INSERT INTO assessment_strands (template_id, position, name, term) VALUES (tid, 1, 'TRADITIONAL FASHION', 'term_3') RETURNING id INTO sid;
    INSERT INTO assessment_substrands (strand_id, position, name) VALUES (sid, 1, 'TRADITIONAL FASHION');
    INSERT INTO assessment_strands (template_id, position, name, term) VALUES (tid, 2, 'LAND TRAVEL', 'term_3') RETURNING id INTO sid;
    INSERT INTO assessment_substrands (strand_id, position, name) VALUES (sid, 1, 'LAND TRAVEL');
    INSERT INTO assessment_strands (template_id, position, name, term) VALUES (tid, 3, 'SPORTS & OUTDOOR GAMES', 'term_3') RETURNING id INTO sid;
    INSERT INTO assessment_substrands (strand_id, position, name) VALUES (sid, 1, 'SPORTS & OUTDOOR GAMES');
    INSERT INTO assessment_strands (template_id, position, name, term) VALUES (tid, 4, 'TOURIST ATTRACTION SITES- KENYA', 'term_3') RETURNING id INTO sid;
    INSERT INTO assessment_substrands (strand_id, position, name) VALUES (sid, 1, 'TOURIST ATTRACTION SITES- KENYA');
  END IF;
  -- term_3 :: Kiswahili
  SELECT id INTO tid FROM assessment_templates WHERE grade_level='grade_7' AND learning_area='Kiswahili' AND tenant_id IS NULL LIMIT 1;
  IF tid IS NOT NULL THEN
    DELETE FROM assessment_substrands WHERE strand_id IN (SELECT id FROM assessment_strands WHERE template_id=tid AND term='term_3');
    DELETE FROM assessment_strands WHERE template_id=tid AND term='term_3';
    INSERT INTO assessment_strands (template_id, position, name, term) VALUES (tid, 1, 'MAGONJWA AMBUKIZI', 'term_3') RETURNING id INTO sid;
    INSERT INTO assessment_substrands (strand_id, position, name) VALUES (sid, 1, 'MAGONJWA AMBUKIZI');
    INSERT INTO assessment_strands (template_id, position, name, term) VALUES (tid, 2, 'UTATUZI WA MIZOZO', 'term_3') RETURNING id INTO sid;
    INSERT INTO assessment_substrands (strand_id, position, name) VALUES (sid, 1, 'UTATUZI WA MIZOZO');
    INSERT INTO assessment_strands (template_id, position, name, term) VALUES (tid, 3, 'MATUMIZI YA PESA', 'term_3') RETURNING id INTO sid;
    INSERT INTO assessment_substrands (strand_id, position, name) VALUES (sid, 1, 'MATUMIZI YA PESA');
    INSERT INTO assessment_strands (template_id, position, name, term) VALUES (tid, 4, 'MAADILI YA MTU BINAFSI', 'term_3') RETURNING id INTO sid;
    INSERT INTO assessment_substrands (strand_id, position, name) VALUES (sid, 1, 'MAADILI YA MTU BINAFSI');
  END IF;
  -- term_3 :: Social Studies
  SELECT id INTO tid FROM assessment_templates WHERE grade_level='grade_7' AND learning_area='Social Studies' AND tenant_id IS NULL LIMIT 1;
  IF tid IS NOT NULL THEN
    DELETE FROM assessment_substrands WHERE strand_id IN (SELECT id FROM assessment_strands WHERE template_id=tid AND term='term_3');
    DELETE FROM assessment_strands WHERE template_id=tid AND term='term_3';
    INSERT INTO assessment_strands (template_id, position, name, term) VALUES (tid, 1, 'POLITICAL DEVELOPMENT & GOVERNANCE', 'term_3') RETURNING id INTO sid;
    INSERT INTO assessment_substrands (strand_id, position, name) VALUES (sid, 1, 'POLITICAL DEVELOPMENT & GOVERNANCE');
  END IF;
  -- term_3 :: Integrated Science
  SELECT id INTO tid FROM assessment_templates WHERE grade_level='grade_7' AND learning_area='Integrated Science' AND tenant_id IS NULL LIMIT 1;
  IF tid IS NOT NULL THEN
    DELETE FROM assessment_substrands WHERE strand_id IN (SELECT id FROM assessment_strands WHERE template_id=tid AND term='term_3');
    DELETE FROM assessment_strands WHERE template_id=tid AND term='term_3';
    INSERT INTO assessment_strands (template_id, position, name, term) VALUES (tid, 1, 'FORCE AND ENERGY', 'term_3') RETURNING id INTO sid;
    INSERT INTO assessment_substrands (strand_id, position, name) VALUES (sid, 1, 'FORCE AND ENERGY');
  END IF;
  -- term_3 :: Agriculture
  SELECT id INTO tid FROM assessment_templates WHERE grade_level='grade_7' AND learning_area='Agriculture' AND tenant_id IS NULL LIMIT 1;
  IF tid IS NOT NULL THEN
    DELETE FROM assessment_substrands WHERE strand_id IN (SELECT id FROM assessment_strands WHERE template_id=tid AND term='term_3');
    DELETE FROM assessment_strands WHERE template_id=tid AND term='term_3';
    INSERT INTO assessment_strands (template_id, position, name, term) VALUES (tid, 1, 'PRODUCTION TECHNIQUES', 'term_3') RETURNING id INTO sid;
    INSERT INTO assessment_substrands (strand_id, position, name) VALUES (sid, 1, 'Constructing framed suspended gardens');
    INSERT INTO assessment_substrands (strand_id, position, name) VALUES (sid, 2, 'Adding value to crop produce');
  END IF;
  -- term_3 :: Pre-technical Studies
  SELECT id INTO tid FROM assessment_templates WHERE grade_level='grade_7' AND learning_area='Pre-technical Studies' AND tenant_id IS NULL LIMIT 1;
  IF tid IS NOT NULL THEN
    DELETE FROM assessment_substrands WHERE strand_id IN (SELECT id FROM assessment_strands WHERE template_id=tid AND term='term_3');
    DELETE FROM assessment_strands WHERE template_id=tid AND term='term_3';
    INSERT INTO assessment_strands (template_id, position, name, term) VALUES (tid, 1, 'ENTREPRENEURSHIP', 'term_3') RETURNING id INTO sid;
    INSERT INTO assessment_substrands (strand_id, position, name) VALUES (sid, 1, 'ENTREPRENEURSHIP');
  END IF;
  -- term_3 :: Creative Arts and Sports
  SELECT id INTO tid FROM assessment_templates WHERE grade_level='grade_7' AND learning_area='Creative Arts and Sports' AND tenant_id IS NULL LIMIT 1;
  IF tid IS NOT NULL THEN
    DELETE FROM assessment_substrands WHERE strand_id IN (SELECT id FROM assessment_strands WHERE template_id=tid AND term='term_3');
    DELETE FROM assessment_strands WHERE template_id=tid AND term='term_3';
    INSERT INTO assessment_strands (template_id, position, name, term) VALUES (tid, 1, 'Creating and Preforming', 'term_3') RETURNING id INTO sid;
    INSERT INTO assessment_substrands (strand_id, position, name) VALUES (sid, 1, 'Kenyan folk songs');
    INSERT INTO assessment_strands (template_id, position, name, term) VALUES (tid, 2, 'APPRECIATION IN CA&S', 'term_3') RETURNING id INTO sid;
    INSERT INTO assessment_substrands (strand_id, position, name) VALUES (sid, 1, 'APPRECIATION IN CA&S');
    INSERT INTO assessment_strands (template_id, position, name, term) VALUES (tid, 3, 'CHRISTIAN LIVING', 'term_3') RETURNING id INTO sid;
    INSERT INTO assessment_substrands (strand_id, position, name) VALUES (sid, 1, 'CHRISTIAN LIVING');
  END IF;
END $$;
