-- ============================================================
-- Testimonials: lets a real teacher/HOI submit a short written testimonial
-- about using Zaroda. Cross-tenant read is owner-only (super_admin) — this
-- is evidence-gathering for the platform, not a per-school feature.
-- ============================================================
CREATE TABLE IF NOT EXISTS testimonials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_name VARCHAR(150) NOT NULL,
  author_role VARCHAR(50) NOT NULL,
  school_name VARCHAR(200),
  message TEXT NOT NULL,
  rating INT CHECK (rating BETWEEN 1 AND 5),
  allow_public_use BOOLEAN NOT NULL DEFAULT true,
  status VARCHAR(20) NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'featured', 'archived')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_testimonials_tenant ON testimonials(tenant_id);
CREATE INDEX IF NOT EXISTS idx_testimonials_status ON testimonials(status);
