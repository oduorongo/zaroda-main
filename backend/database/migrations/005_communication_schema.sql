-- ============================================================
-- ZARODA SCHOOL MANAGEMENT SYSTEM
-- MODULE 04: Communication — Database Schema
-- Covers: SMS · Email · Push Notifications · Announcements
--         Parent Portal Messages · Retooling Broadcasts
--         Bulk Fee Reminders · WhatsApp Links
-- Depends on: Module 01 (tenants, schools, users)
--             Module 02 (learners, streams)
--             Module 03 (fee_payments, learner_fee_accounts)
-- ============================================================

-- ============================================================
-- 1. COMMUNICATION CHANNELS CONFIG (per tenant)
-- ============================================================
CREATE TABLE IF NOT EXISTS communication_settings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- Africa's Talking SMS
  at_api_key      TEXT,                             -- encrypted
  at_username     VARCHAR(100),
  at_sender_id    VARCHAR(20) DEFAULT 'ZARODA',
  sms_enabled     BOOLEAN NOT NULL DEFAULT false,
  -- Email (SMTP)
  smtp_host       VARCHAR(255),
  smtp_port       INTEGER DEFAULT 587,
  smtp_user       VARCHAR(255),
  smtp_pass       TEXT,                             -- encrypted
  smtp_from_name  VARCHAR(100) DEFAULT 'ZARODA SMS',
  smtp_from_email VARCHAR(255),
  email_enabled   BOOLEAN NOT NULL DEFAULT false,
  -- WhatsApp (link-based, no API required)
  whatsapp_number VARCHAR(20) DEFAULT '+254781230805',
  -- Push (Web Push VAPID)
  vapid_public_key  TEXT,
  vapid_private_key TEXT,                           -- encrypted
  push_enabled      BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id)
);

-- ============================================================
-- 2. MESSAGE TEMPLATES
-- ============================================================
CREATE TABLE IF NOT EXISTS message_templates (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID REFERENCES tenants(id) ON DELETE CASCADE,  -- NULL = system template
  name            VARCHAR(150) NOT NULL,
  category        VARCHAR(30)  NOT NULL CHECK (category IN (
    'fee_reminder','fee_receipt','report_card','attendance',
    'exam_results','announcement','welcome','suspension',
    'retooling','custom'
  )),
  channel         VARCHAR(10)  NOT NULL CHECK (channel IN ('sms','email','push','whatsapp')),
  subject         VARCHAR(255),                     -- for email
  body            TEXT NOT NULL,                    -- supports {{variables}}
  variables       TEXT[] DEFAULT '{}',              -- e.g. {learner_name, balance_due, due_date}
  is_active       BOOLEAN NOT NULL DEFAULT true,
  is_system       BOOLEAN NOT NULL DEFAULT false,   -- system templates can't be deleted
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 3. OUTBOX — All outgoing messages queued here
-- ============================================================
CREATE TABLE IF NOT EXISTS message_outbox (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- Sender context
  sent_by         UUID REFERENCES users(id),
  template_id     UUID REFERENCES message_templates(id),
  campaign_id     UUID,                             -- for bulk sends
  -- Recipient
  recipient_id    UUID REFERENCES users(id),        -- NULL for external
  recipient_type  VARCHAR(20) CHECK (recipient_type IN (
    'parent','learner','teacher','admin','hoi','external'
  )),
  to_address      VARCHAR(255) NOT NULL,            -- phone or email
  -- Message
  channel         VARCHAR(10) NOT NULL CHECK (channel IN ('sms','email','push','whatsapp')),
  subject         VARCHAR(255),
  body            TEXT NOT NULL,
  -- Delivery
  status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','sending','sent','delivered','failed','cancelled')),
  attempts        INTEGER NOT NULL DEFAULT 0,
  max_attempts    INTEGER NOT NULL DEFAULT 3,
  provider_ref    VARCHAR(100),                     -- AT message ID / SMTP message ID
  provider_status VARCHAR(50),                      -- delivered / failed / DND etc.
  sent_at         TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,
  failed_reason   TEXT,
  -- Scheduling
  scheduled_at    TIMESTAMPTZ DEFAULT NOW(),        -- send at this time
  -- Metadata
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 4. BULK CAMPAIGNS (fee reminders, announcements, retooling)
-- ============================================================
CREATE TABLE IF NOT EXISTS message_campaigns (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name            VARCHAR(255) NOT NULL,
  campaign_type   VARCHAR(30)  NOT NULL CHECK (campaign_type IN (
    'fee_reminder','announcement','retooling','report_release',
    'exam_results','attendance_alert','custom'
  )),
  channel         VARCHAR(10)  NOT NULL,
  -- Audience targeting
  audience        VARCHAR(20)  NOT NULL CHECK (audience IN (
    'all','admins','teachers','learners','parents',
    'debtors','stream','grade'
  )),
  audience_filter JSONB DEFAULT '{}',               -- {streamId, gradeLevel, minBalance}
  -- Content
  subject         VARCHAR(255),
  message_body    TEXT NOT NULL,
  template_id     UUID REFERENCES message_templates(id),
  -- Stats
  total_recipients INTEGER NOT NULL DEFAULT 0,
  sent_count       INTEGER NOT NULL DEFAULT 0,
  delivered_count  INTEGER NOT NULL DEFAULT 0,
  failed_count     INTEGER NOT NULL DEFAULT 0,
  -- Status
  status          VARCHAR(20) NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','scheduled','sending','completed','cancelled')),
  scheduled_at    TIMESTAMPTZ,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 5. ANNOUNCEMENTS (school notice board)
-- ============================================================
CREATE TABLE IF NOT EXISTS announcements (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  school_id       UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  title           VARCHAR(255) NOT NULL,
  body            TEXT NOT NULL,
  category        VARCHAR(30) NOT NULL DEFAULT 'general'
                  CHECK (category IN (
                    'general','academic','finance','sports','health',
                    'event','emergency','retooling'
                  )),
  -- Audience (retooling: all | admins | teachers | learners | parents)
  audience        VARCHAR(20) NOT NULL DEFAULT 'all'
                  CHECK (audience IN ('all','admins','teachers','learners','parents')),
  audience_filter JSONB DEFAULT '{}',               -- optional: specific stream/grade
  priority        VARCHAR(10) NOT NULL DEFAULT 'normal'
                  CHECK (priority IN ('low','normal','high','urgent')),
  -- Attachments
  attachments     JSONB DEFAULT '[]',               -- [{name, url, type}]
  -- Publish control
  is_published    BOOLEAN NOT NULL DEFAULT false,
  published_at    TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  -- Push notification sent
  push_sent       BOOLEAN NOT NULL DEFAULT false,
  push_sent_at    TIMESTAMPTZ,
  -- Engagement
  view_count      INTEGER NOT NULL DEFAULT 0,
  created_by      UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS announcement_reads (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(announcement_id, user_id)
);

-- ============================================================
-- 6. PARENT-TEACHER MESSAGES (direct messaging)
-- ============================================================
CREATE TABLE IF NOT EXISTS message_threads (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  learner_id      UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  parent_id       UUID NOT NULL REFERENCES users(id),
  teacher_id      UUID NOT NULL REFERENCES users(id),
  subject         VARCHAR(255),
  status          VARCHAR(20) NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open','closed','archived')),
  last_message_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS thread_messages (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  thread_id       UUID NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
  sender_id       UUID NOT NULL REFERENCES users(id),
  sender_role     VARCHAR(20) NOT NULL,
  body            TEXT NOT NULL,
  attachments     JSONB DEFAULT '[]',
  is_read         BOOLEAN NOT NULL DEFAULT false,
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 7. PUSH SUBSCRIPTIONS (Web Push / PWA)
-- ============================================================
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint        TEXT NOT NULL,
  p256dh          TEXT NOT NULL,
  auth            TEXT NOT NULL,
  user_agent      TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, endpoint)
);

-- ============================================================
-- 8. DELIVERY WEBHOOKS (Africa's Talking callbacks)
-- ============================================================
CREATE TABLE IF NOT EXISTS sms_delivery_reports (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID REFERENCES tenants(id),
  message_id      VARCHAR(100) NOT NULL,            -- AT message ID
  status          VARCHAR(30),
  phone_number    VARCHAR(20),
  failure_reason  TEXT,
  retry_count     INTEGER DEFAULT 0,
  received_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_outbox_tenant_status    ON message_outbox(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_outbox_scheduled        ON message_outbox(scheduled_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_outbox_recipient        ON message_outbox(recipient_id);
CREATE INDEX IF NOT EXISTS idx_outbox_campaign         ON message_outbox(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_tenant        ON message_campaigns(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_campaigns_type          ON message_campaigns(campaign_type);
CREATE INDEX IF NOT EXISTS idx_announcements_tenant    ON announcements(tenant_id, is_published);
CREATE INDEX IF NOT EXISTS idx_announcements_audience  ON announcements(audience, tenant_id);
CREATE INDEX IF NOT EXISTS idx_announcements_expires   ON announcements(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_threads_learner         ON message_threads(learner_id);
CREATE INDEX IF NOT EXISTS idx_threads_parent          ON message_threads(parent_id);
CREATE INDEX IF NOT EXISTS idx_threads_teacher         ON message_threads(teacher_id);
CREATE INDEX IF NOT EXISTS idx_thread_msgs_thread      ON thread_messages(thread_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_thread_msgs_unread      ON thread_messages(thread_id) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_push_subs_user          ON push_subscriptions(user_id) WHERE is_active = true;

-- ============================================================
-- RLS
-- ============================================================
DO $$ DECLARE tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'communication_settings','message_templates','message_outbox',
    'message_campaigns','announcements','announcement_reads',
    'message_threads','thread_messages','push_subscriptions'
  ]) LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_setting(''app.tenant_id'')::UUID)',
      tbl
    );
  END LOOP;
END $$;

-- Updated_at triggers
DO $$ DECLARE tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'communication_settings','message_templates','message_campaigns',
    'announcements'
  ]) LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      replace(tbl,'-','_'), tbl
    );
  END LOOP;
END $$;

-- ============================================================
-- SEED: System message templates
-- ============================================================
INSERT INTO message_templates
  (id, tenant_id, name, category, channel, subject, body, variables, is_system)
VALUES
  -- Fee reminder SMS
  (uuid_generate_v4(), NULL, 'Fee Reminder — SMS', 'fee_reminder', 'sms', NULL,
   'Dear {{guardian_name}}, {{learner_name}} ({{admission_no}}) has an outstanding fee balance of KES {{balance_due}} for {{term}} {{academic_year}}. Due: {{due_date}}. Pay via M-Pesa Paybill {{paybill}} Acc: {{admission_no}}. ZARODA SMS +254781230805',
   ARRAY['guardian_name','learner_name','admission_no','balance_due','term','academic_year','due_date','paybill'], true),

  -- Fee receipt SMS
  (uuid_generate_v4(), NULL, 'Fee Receipt — SMS', 'fee_receipt', 'sms', NULL,
   'ZARODA SMS: Payment of KES {{amount}} received for {{learner_name}} ({{admission_no}}). Receipt: {{receipt_no}}. Balance: KES {{balance}}. {{school_name}}',
   ARRAY['amount','learner_name','admission_no','receipt_no','balance','school_name'], true),

  -- Fee receipt email
  (uuid_generate_v4(), NULL, 'Fee Receipt — Email', 'fee_receipt', 'email',
   'Fee Receipt {{receipt_no}} — {{school_name}}',
   'Dear {{guardian_name}},\n\nThis confirms receipt of KES {{amount}} for {{learner_name}} ({{admission_no}}).\n\nReceipt Number: {{receipt_no}}\nTerm: {{term}} {{academic_year}}\nAmount Paid: KES {{amount}}\nOutstanding Balance: KES {{balance}}\n\nThank you.\n\n{{school_name}}\nPowered by ZARODA SOLUTIONS\n+254781230805 | www.zarodasolutions.app',
   ARRAY['guardian_name','amount','learner_name','admission_no','receipt_no','term','academic_year','balance','school_name'], true),

  -- Report card released SMS
  (uuid_generate_v4(), NULL, 'Report Card Released — SMS', 'report_card', 'sms', NULL,
   'ZARODA SMS: {{learner_name}}''s {{term}} {{academic_year}} report card is ready. Average: {{average}}% ({{grade}}). Position: {{position}}/{{class_size}}. Log in: {{portal_url}}',
   ARRAY['learner_name','term','academic_year','average','grade','position','class_size','portal_url'], true),

  -- Announcement push
  (uuid_generate_v4(), NULL, 'Announcement — Push', 'announcement', 'push', '{{title}}',
   '{{body}}',
   ARRAY['title','body'], true),

  -- Welcome SMS (new learner)
  (uuid_generate_v4(), NULL, 'Welcome — New Learner SMS', 'welcome', 'sms', NULL,
   'Welcome to {{school_name}}! {{learner_name}} (Adm: {{admission_no}}) has been registered in {{stream_name}}. Portal: {{portal_url}}. ZARODA SMS',
   ARRAY['school_name','learner_name','admission_no','stream_name','portal_url'], true);
