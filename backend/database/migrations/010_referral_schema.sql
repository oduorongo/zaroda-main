-- ============================================================
-- ZARODA SCHOOL MANAGEMENT SYSTEM
-- CLASS TEACHER SHARE INVITE — Database Schema
-- Features: Secure tokens · Expiry · Use limits
--           Click tracking · Conversion tracking
--           Rate limiting · Abuse protection
-- ============================================================

CREATE TABLE IF NOT EXISTS class_teacher_invites (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id        UUID REFERENCES tenants(id) ON DELETE CASCADE,
  teacher_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stream_id        UUID NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
  token_hash       VARCHAR(64) NOT NULL UNIQUE,
  token_prefix     VARCHAR(8)  NOT NULL,
  raw_token_once   VARCHAR(64),
  invite_url       TEXT NOT NULL,
  teacher_name     VARCHAR(200) NOT NULL,
  class_name       VARCHAR(150) NOT NULL,
  expires_at       TIMESTAMPTZ NOT NULL,
  max_uses         SMALLINT    NOT NULL DEFAULT 50,
  use_count        SMALLINT    NOT NULL DEFAULT 0,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  revoked_at       TIMESTAMPTZ,
  revoked_by       UUID REFERENCES users(id),
  revoke_reason    TEXT,
  channels_used    TEXT[] DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invite_clicks (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invite_id        UUID NOT NULL REFERENCES class_teacher_invites(id) ON DELETE CASCADE,
  ip_hash          VARCHAR(64),
  user_agent_hash  VARCHAR(64),
  referer          VARCHAR(50),
  converted        BOOLEAN NOT NULL DEFAULT false,
  signup_id        UUID,
  clicked_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invite_signups (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invite_id        UUID NOT NULL REFERENCES class_teacher_invites(id) ON DELETE CASCADE,
  click_id         UUID REFERENCES invite_clicks(id),
  school_name      VARCHAR(255) NOT NULL,
  admin_email      VARCHAR(255) NOT NULL,
  admin_name       VARCHAR(200) NOT NULL,
  tenant_id        UUID REFERENCES tenants(id),
  stream_name      VARCHAR(150),
  signed_up_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  onboarding_completed_at TIMESTAMPTZ,
  ip_hash          VARCHAR(64)
);

ALTER TABLE invite_clicks
  ADD CONSTRAINT fk_click_signup
  FOREIGN KEY (signup_id) REFERENCES invite_signups(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS invite_rate_limits (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ip_hash          VARCHAR(64) NOT NULL,
  action           VARCHAR(30) NOT NULL,
  window_start     TIMESTAMPTZ NOT NULL,
  request_count    SMALLINT    NOT NULL DEFAULT 1,
  blocked_until    TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(ip_hash, action, window_start)
);

CREATE INDEX IF NOT EXISTS idx_invites_teacher    ON class_teacher_invites(teacher_id, is_active);
CREATE INDEX IF NOT EXISTS idx_invites_stream     ON class_teacher_invites(stream_id, is_active);
CREATE INDEX IF NOT EXISTS idx_invites_token_hash ON class_teacher_invites(token_hash);
CREATE INDEX IF NOT EXISTS idx_invites_expires    ON class_teacher_invites(expires_at) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_clicks_invite      ON invite_clicks(invite_id);
CREATE INDEX IF NOT EXISTS idx_signups_invite     ON invite_signups(invite_id);
CREATE INDEX IF NOT EXISTS idx_rate_limits_ip     ON invite_rate_limits(ip_hash, action, window_start);

CREATE TRIGGER trg_class_teacher_invites_updated_at
  BEFORE UPDATE ON class_teacher_invites
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
