-- 033_assessment_strand_term.sql
-- CBC strands run SEQUENTIALLY across terms: each term has its own distinct strands
-- (e.g. Grade 7 Maths — Term 1 Numbers, Term 2 Algebra/Measurement, Term 3 Geometry/
-- Data Handling). The rubric previously had no term dimension, so every term showed
-- Term 1's strands. Add a term column so strands are scoped to the term they belong to.
--
-- term values: 'term_1' | 'term_2' | 'term_3'. Existing strands default to term_1 so
-- nothing breaks; Term 2/3 strands are populated per grade afterwards.

ALTER TABLE assessment_strands ADD COLUMN IF NOT EXISTS term VARCHAR(10) NOT NULL DEFAULT 'term_1';

CREATE INDEX IF NOT EXISTS idx_astrand_tpl_term ON assessment_strands(template_id, term);
