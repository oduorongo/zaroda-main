-- ============================================================================
-- 023_teacher_onboard_links.sql
-- Admin-generated links that let teachers self-onboard into a specific
-- school/tenant (shared via WhatsApp). Raw token is never stored — only its
-- SHA-256 hash. One active link per tenant is reused.
-- ============================================================================

CREATE TABLE IF NOT EXISTS teacher_onboard_links (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL,
  school_id    UUID,
  token_hash   VARCHAR(64) NOT NULL,          -- SHA-256 of the raw token
  token_prefix VARCHAR(12),                   -- for admin to recognise the link
  invite_url   TEXT NOT NULL,
  created_by   UUID,                          -- admin user id
  school_name  VARCHAR(200),
  uses_count   INT  NOT NULL DEFAULT 0,
  max_uses     INT  NOT NULL DEFAULT 200,
  expires_at   TIMESTAMPTZ NOT NULL,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_teacher_onboard_token  ON teacher_onboard_links(token_hash);
CREATE INDEX IF NOT EXISTS idx_teacher_onboard_tenant ON teacher_onboard_links(tenant_id);

-- Track each successful self-onboarding (for the admin's analytics)
CREATE TABLE IF NOT EXISTS teacher_onboard_signups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id     UUID NOT NULL REFERENCES teacher_onboard_links(id) ON DELETE CASCADE,
  tenant_id   UUID NOT NULL,
  user_id     UUID,
  teacher_name VARCHAR(200),
  email       VARCHAR(200),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_teacher_onboard_signups_link ON teacher_onboard_signups(link_id);
