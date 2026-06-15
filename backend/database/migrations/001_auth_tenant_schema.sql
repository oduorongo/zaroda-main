-- ============================================================
-- ZARODA SCHOOL MANAGEMENT SYSTEM
-- MODULE 01: Auth + Tenant Onboarding
-- Database Schema — PostgreSQL
-- Convention: tenant_id on every table, soft deletes, audit cols
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. TENANTS (one per school group / director)
-- ============================================================
CREATE TABLE tenants (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name              VARCHAR(255) NOT NULL,                        -- school / group name
  knec_code         VARCHAR(20)  UNIQUE,                          -- Kenya KNEC school code
  subdomain         VARCHAR(100) UNIQUE NOT NULL,                 -- e.g. "starlight" → starlight.zarodasms.app
  logo_url          TEXT,
  primary_color     VARCHAR(7)   DEFAULT '#1a2e5a',
  secondary_color   VARCHAR(7)   DEFAULT '#d4af37',
  address           TEXT,
  county            VARCHAR(100),
  sub_county        VARCHAR(100),
  phone             VARCHAR(20),
  email             VARCHAR(255),
  website           VARCHAR(255),
  status            VARCHAR(20)  NOT NULL DEFAULT 'trial'         -- trial | active | suspended | cancelled
                    CHECK (status IN ('trial','active','suspended','cancelled')),
  trial_ends_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW() + INTERVAL '14 days',
  subscription_tier VARCHAR(20)  DEFAULT 'free'                  -- free | primary | senior
                    CHECK (subscription_tier IN ('free','primary','senior')),
  settings          JSONB        NOT NULL DEFAULT '{}',           -- school-specific settings
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ
);

-- ============================================================
-- 2. SCHOOLS (one tenant can have multiple campuses)
-- ============================================================
CREATE TABLE schools (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  knec_code       VARCHAR(20) UNIQUE,                             -- individual school KNEC code
  name            VARCHAR(255) NOT NULL,
  school_type     VARCHAR(30) NOT NULL                            -- ecde | primary | junior | senior | combined
                  CHECK (school_type IN ('ecde','primary','junior','senior','combined')),
  category        VARCHAR(20) NOT NULL DEFAULT 'day'             -- day | boarding | day_boarding
                  CHECK (category IN ('day','boarding','day_boarding')),
  gender_type     VARCHAR(20) NOT NULL DEFAULT 'mixed'           -- mixed | boys | girls
                  CHECK (gender_type IN ('mixed','boys','girls')),
  address         TEXT,
  county          VARCHAR(100),
  sub_county      VARCHAR(100),
  ward            VARCHAR(100),
  phone           VARCHAR(20),
  email           VARCHAR(255),
  principal_name  VARCHAR(255),
  logo_url        TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  settings        JSONB   NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

-- ============================================================
-- 3. STREAMS (e.g. Grade 4 North, Grade 4 South)
-- ============================================================
CREATE TABLE streams (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  school_id       UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name            VARCHAR(100) NOT NULL,                          -- "Grade 4 North"
  grade_level     VARCHAR(30)  NOT NULL,                         -- pp1|pp2|grade_1..grade_12
  academic_year   VARCHAR(9)   NOT NULL,                         -- "2025/2026"
  term            VARCHAR(10)  NOT NULL DEFAULT 'term_1'
                  CHECK (term IN ('term_1','term_2','term_3')),
  capacity        INTEGER      NOT NULL DEFAULT 40,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

-- ============================================================
-- 4. USERS (all roles — isolated by tenant_id)
-- ============================================================
CREATE TABLE users (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id           UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  school_id           UUID         REFERENCES schools(id) ON DELETE SET NULL,
  email               VARCHAR(255) UNIQUE NOT NULL,
  phone               VARCHAR(20),
  password_hash       TEXT         NOT NULL,
  first_name          VARCHAR(100) NOT NULL,
  last_name           VARCHAR(100) NOT NULL,
  other_names         VARCHAR(100),
  gender              VARCHAR(10)  CHECK (gender IN ('male','female','other')),
  date_of_birth       DATE,
  national_id         VARCHAR(20),
  tsc_number          VARCHAR(30),                                -- Teachers Service Commission number
  profile_photo_url   TEXT,
  role                VARCHAR(30)  NOT NULL
                      CHECK (role IN (
                        'super_admin','tenant_owner','school_admin',
                        'hoi','dhois','class_teacher','subject_teacher',
                        'overall_class_teacher','games_dept','bursar',
                        'parent','learner'
                      )),
  status              VARCHAR(20)  NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','active','suspended','deactivated')),
  email_verified_at   TIMESTAMPTZ,
  phone_verified_at   TIMESTAMPTZ,
  last_login_at       TIMESTAMPTZ,
  mfa_enabled         BOOLEAN      NOT NULL DEFAULT false,
  mfa_secret          TEXT,                                       -- TOTP secret (encrypted)
  registration_token  TEXT,                                       -- for invite-based self-registration
  token_expires_at    TIMESTAMPTZ,
  password_reset_token TEXT,
  reset_token_expires  TIMESTAMPTZ,
  settings            JSONB        NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ
);

-- ============================================================
-- 5. REFRESH TOKENS (JWT refresh token rotation)
-- ============================================================
CREATE TABLE refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,                                      -- hashed token stored, raw sent to client
  device_info JSONB,                                              -- user agent, IP, device fingerprint
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 6. SUBSCRIPTIONS
-- ============================================================
CREATE TABLE subscriptions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  stream_id       UUID REFERENCES streams(id) ON DELETE SET NULL,
  plan            VARCHAR(20) NOT NULL CHECK (plan IN ('primary','senior')),
  billing_cycle   VARCHAR(10) NOT NULL DEFAULT 'annual'
                  CHECK (billing_cycle IN ('monthly','annual')),
  amount_kes      NUMERIC(10,2) NOT NULL,                         -- KES amount
  starts_at       TIMESTAMPTZ NOT NULL,
  ends_at         TIMESTAMPTZ NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','expired','cancelled','grace')),
  auto_renew      BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 7. INVOICES (generated on onboarding and renewals)
-- ============================================================
CREATE TABLE invoices (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_number  VARCHAR(30) UNIQUE NOT NULL,                    -- ZAR-2025-00001
  subscription_id UUID REFERENCES subscriptions(id),
  amount_kes      NUMERIC(10,2) NOT NULL,
  tax_amount      NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_amount    NUMERIC(10,2) NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'unpaid'
                  CHECK (status IN ('unpaid','partially_paid','paid','void')),
  due_date        DATE NOT NULL,
  paid_at         TIMESTAMPTZ,
  notes           TEXT,
  line_items      JSONB NOT NULL DEFAULT '[]',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 8. PAYMENTS
-- ============================================================
CREATE TABLE payments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_id      UUID NOT NULL REFERENCES invoices(id),
  method          VARCHAR(20) NOT NULL CHECK (method IN ('mpesa','bank','card','cash')),
  mpesa_ref       VARCHAR(30),                                    -- M-Pesa transaction code
  bank_ref        VARCHAR(50),
  amount_kes      NUMERIC(10,2) NOT NULL,
  paid_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  receipt_number  VARCHAR(30) UNIQUE,                             -- ZAR-RCP-2025-00001
  recorded_by     UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 9. AUDIT LOGS (immutable — no updates, no deletes)
-- ============================================================
CREATE TABLE audit_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID REFERENCES tenants(id) ON DELETE SET NULL,
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  action      VARCHAR(100) NOT NULL,                              -- user.login | tenant.created | etc.
  entity_type VARCHAR(100),                                       -- users | schools | streams | etc.
  entity_id   UUID,
  old_values  JSONB,
  new_values  JSONB,
  ip_address  INET,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 10. NOTIFICATION QUEUE (SMS / Email / Push)
-- ============================================================
CREATE TABLE notification_queue (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  recipient   UUID REFERENCES users(id) ON DELETE SET NULL,
  channel     VARCHAR(20) NOT NULL CHECK (channel IN ('sms','email','push','whatsapp')),
  to_address  VARCHAR(255) NOT NULL,                              -- phone number or email
  subject     VARCHAR(255),
  body        TEXT NOT NULL,
  template    VARCHAR(100),
  status      VARCHAR(20) NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending','sent','failed','cancelled')),
  attempts    INTEGER NOT NULL DEFAULT 0,
  sent_at     TIMESTAMPTZ,
  error_msg   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_tenants_knec_code       ON tenants(knec_code);
CREATE INDEX idx_tenants_subdomain       ON tenants(subdomain);
CREATE INDEX idx_tenants_status          ON tenants(status);

CREATE INDEX idx_schools_tenant_id       ON schools(tenant_id);
CREATE INDEX idx_schools_knec_code       ON schools(knec_code);

CREATE INDEX idx_streams_school_id       ON streams(school_id);
CREATE INDEX idx_streams_tenant_id       ON streams(tenant_id);
CREATE INDEX idx_streams_grade_level     ON streams(grade_level);

CREATE INDEX idx_users_tenant_id         ON users(tenant_id);
CREATE INDEX idx_users_email             ON users(email);
CREATE INDEX idx_users_role              ON users(role);
CREATE INDEX idx_users_school_id         ON users(school_id);
CREATE INDEX idx_users_reg_token         ON users(registration_token) WHERE registration_token IS NOT NULL;

CREATE INDEX idx_refresh_tokens_user_id  ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_hash     ON refresh_tokens(token_hash);

CREATE INDEX idx_subscriptions_tenant_id ON subscriptions(tenant_id);
CREATE INDEX idx_subscriptions_status    ON subscriptions(status);
CREATE INDEX idx_subscriptions_ends_at   ON subscriptions(ends_at);

CREATE INDEX idx_invoices_tenant_id      ON invoices(tenant_id);
CREATE INDEX idx_invoices_status         ON invoices(status);

CREATE INDEX idx_payments_tenant_id      ON payments(tenant_id);
CREATE INDEX idx_payments_invoice_id     ON payments(invoice_id);

CREATE INDEX idx_audit_logs_tenant_id    ON audit_logs(tenant_id);
CREATE INDEX idx_audit_logs_user_id      ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_entity       ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_created_at   ON audit_logs(created_at DESC);

CREATE INDEX idx_notif_tenant_status     ON notification_queue(tenant_id, status);

-- ============================================================
-- ROW LEVEL SECURITY (tenant isolation)
-- ============================================================
ALTER TABLE schools              ENABLE ROW LEVEL SECURITY;
ALTER TABLE streams              ENABLE ROW LEVEL SECURITY;
ALTER TABLE users                ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens       ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices             ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments             ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_queue   ENABLE ROW LEVEL SECURITY;

-- App role: zaroda_app (used by NestJS connection pool)
-- Super admin role: zaroda_super (bypasses RLS)

CREATE ROLE zaroda_app;
CREATE ROLE zaroda_super BYPASSRLS;

-- RLS policies — app sets current_setting('app.tenant_id') at session level
CREATE POLICY tenant_isolation ON schools
  USING (tenant_id = current_setting('app.tenant_id')::UUID);

CREATE POLICY tenant_isolation ON streams
  USING (tenant_id = current_setting('app.tenant_id')::UUID);

CREATE POLICY tenant_isolation ON users
  USING (tenant_id = current_setting('app.tenant_id')::UUID);

CREATE POLICY tenant_isolation ON refresh_tokens
  USING (tenant_id = current_setting('app.tenant_id')::UUID);

CREATE POLICY tenant_isolation ON subscriptions
  USING (tenant_id = current_setting('app.tenant_id')::UUID);

CREATE POLICY tenant_isolation ON invoices
  USING (tenant_id = current_setting('app.tenant_id')::UUID);

CREATE POLICY tenant_isolation ON payments
  USING (tenant_id = current_setting('app.tenant_id')::UUID);

CREATE POLICY tenant_isolation ON notification_queue
  USING (tenant_id = current_setting('app.tenant_id')::UUID);

-- ============================================================
-- UPDATED_AT trigger (auto-update on row change)
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $fn$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tenants_updated_at
  BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_schools_updated_at
  BEFORE UPDATE ON schools FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_streams_updated_at
  BEFORE UPDATE ON streams FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_invoices_updated_at
  BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- SEED: Super Admin tenant (platform-level)
-- ============================================================
INSERT INTO tenants (id, name, knec_code, subdomain, status, subscription_tier)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'ZARODA SOLUTIONS',
  'ZARODA-SUPER',
  'admin',
  'active',
  'free'
);
