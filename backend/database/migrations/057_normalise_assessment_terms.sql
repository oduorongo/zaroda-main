-- ============================================================
-- The teacher-facing Assessment Rubric page defaulted `term` to the free-text
-- label "Term One"/"Term Two"/"Term Three" and saved it verbatim, while the
-- parent-facing rubric view always queries by canonical term_1/term_2/term_3.
-- Any score saved under the raw label was silently invisible to parents.
-- Normalise whatever's already stored so existing saved rubric scores show up.
-- ============================================================
UPDATE assessment_scores
   SET term = 'term_1'
 WHERE term ILIKE '%one%' OR term ILIKE '%1%';
UPDATE assessment_scores
   SET term = 'term_2'
 WHERE term ILIKE '%two%' OR term ILIKE '%2%';
UPDATE assessment_scores
   SET term = 'term_3'
 WHERE term ILIKE '%three%' OR term ILIKE '%3%';

UPDATE assessment_comments
   SET term = 'term_1'
 WHERE term ILIKE '%one%' OR term ILIKE '%1%';
UPDATE assessment_comments
   SET term = 'term_2'
 WHERE term ILIKE '%two%' OR term ILIKE '%2%';
UPDATE assessment_comments
   SET term = 'term_3'
 WHERE term ILIKE '%three%' OR term ILIKE '%3%';
