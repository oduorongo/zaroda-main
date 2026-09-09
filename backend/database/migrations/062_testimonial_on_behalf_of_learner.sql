-- ============================================================
-- Lets a parent submit a testimonial voiced by their child (a learner has no
-- login of their own, so it's entered through the parent's account) that's
-- distinct from the parent's own testimonial about the same school.
-- ============================================================
ALTER TABLE testimonials ADD COLUMN IF NOT EXISTS on_behalf_of_learner_id UUID REFERENCES learners(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_testimonials_on_behalf_of ON testimonials(on_behalf_of_learner_id);
