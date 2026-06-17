-- ============================================================
-- ZARODA SCHOOL MANAGEMENT SYSTEM
-- MODULE 08: Discipline & Guidance — Database Schema
-- Covers: Incident Recording · Discipline Workflow
--         Counselling Records · Behaviour Analytics
--         Parent Notifications · QASO-ready Reports
-- Depends on: Module 01 (tenants, schools, users)
--             Module 02 (learners, streams)
--             Module 04 (notification_queue)
-- ============================================================

-- ============================================================
-- 1. INCIDENT CATEGORIES
-- ============================================================
CREATE TABLE IF NOT EXISTS incident_categories (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID REFERENCES tenants(id) ON DELETE CASCADE,  -- NULL = system default
  name          VARCHAR(150) NOT NULL,
  severity      VARCHAR(10)  NOT NULL DEFAULT 'minor'
                CHECK (severity IN ('minor','moderate','major','critical')),
  description   TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  is_system     BOOLEAN NOT NULL DEFAULT false,  -- system defaults can't be deleted
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 2. INCIDENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS incidents (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  school_id         UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,

  -- Who
  learner_id        UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  reported_by       UUID NOT NULL REFERENCES users(id),       -- teacher/staff
  witnessed_by      TEXT,                                     -- free text: names of witnesses

  -- What
  category_id       UUID REFERENCES incident_categories(id),
  title             VARCHAR(255) NOT NULL,
  description       TEXT        NOT NULL,
  location          VARCHAR(150),                             -- "Classroom 4A", "Football field"
  incident_date     DATE        NOT NULL DEFAULT CURRENT_DATE,
  incident_time     TIME,

  -- Severity
  severity          VARCHAR(10) NOT NULL DEFAULT 'minor'
                    CHECK (severity IN ('minor','moderate','major','critical')),

  -- Other learners involved
  other_learners_involved TEXT,                               -- free text
  injuries_reported BOOLEAN NOT NULL DEFAULT false,
  injury_details    TEXT,

  -- Status through workflow
  status            VARCHAR(20) NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','under_review','action_taken','closed','appealed')),

  -- Parent notification
  parent_notified   BOOLEAN NOT NULL DEFAULT false,
  parent_notified_at TIMESTAMPTZ,
  parent_notified_by UUID REFERENCES users(id),
  parent_response   TEXT,

  -- Attachments
  attachments       JSONB DEFAULT '[]',                       -- [{name, url, type}]

  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ
);

-- ============================================================
-- 3. DISCIPLINE ACTIONS (outcome of an incident)
-- ============================================================
CREATE TABLE IF NOT EXISTS discipline_actions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  incident_id     UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  learner_id      UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,

  action_type     VARCHAR(30) NOT NULL
                  CHECK (action_type IN (
                    'verbal_warning','written_warning','detention',
                    'community_service','parent_called','parent_meeting',
                    'suspension_in_school','suspension_external',
                    'expulsion','referred_to_counsellor',
                    'referred_to_external','no_action','other'
                  )),
  action_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  description     TEXT NOT NULL,

  -- Suspension/expulsion details
  suspension_days SMALLINT,                                   -- number of days
  suspension_start DATE,
  suspension_end   DATE,
  reinstatement_conditions TEXT,

  -- Who decided
  decided_by      UUID NOT NULL REFERENCES users(id),
  approved_by     UUID REFERENCES users(id),                  -- HOI for serious actions
  decision_date   DATE,

  -- Follow-up
  follow_up_required  BOOLEAN NOT NULL DEFAULT false,
  follow_up_date      DATE,
  follow_up_notes     TEXT,
  follow_up_completed BOOLEAN NOT NULL DEFAULT false,

  status          VARCHAR(20) NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','completed','appealed','overturned')),

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 4. DISCIPLINE APPEALS
-- ============================================================
CREATE TABLE IF NOT EXISTS discipline_appeals (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  action_id       UUID NOT NULL REFERENCES discipline_actions(id) ON DELETE CASCADE,
  learner_id      UUID NOT NULL REFERENCES learners(id),
  appealed_by     UUID NOT NULL REFERENCES users(id),         -- parent or teacher
  appeal_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  grounds         TEXT NOT NULL,
  outcome         VARCHAR(20) CHECK (outcome IN ('upheld','overturned','modified','pending')),
  outcome_notes   TEXT,
  reviewed_by     UUID REFERENCES users(id),
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 5. COUNSELLING RECORDS
-- ============================================================
CREATE TABLE IF NOT EXISTS counselling_sessions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  school_id       UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  learner_id      UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  counsellor_id   UUID NOT NULL REFERENCES users(id),

  -- Session details
  session_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  session_time    TIME,
  duration_minutes SMALLINT DEFAULT 30,
  session_type    VARCHAR(20) NOT NULL DEFAULT 'individual'
                  CHECK (session_type IN ('individual','group','crisis','follow_up','referral')),
  referral_source VARCHAR(30) CHECK (referral_source IN (
                    'self','teacher','parent','incident','hoi','external', NULL
                  )),

  -- Linked incident (optional)
  incident_id     UUID REFERENCES incidents(id),

  -- Issues addressed (multiple via array)
  issues_addressed TEXT[] DEFAULT '{}',  -- ["academic_stress","family_issues","peer_conflict","behaviour","mental_health","substance","other"]

  -- Content (kept confidential — visible only to counsellor + HOI)
  session_notes   TEXT,                  -- CONFIDENTIAL
  goals_set       TEXT,
  progress_notes  TEXT,
  risk_level      VARCHAR(10) DEFAULT 'low'
                  CHECK (risk_level IN ('low','medium','high','critical')),

  -- Outcome & follow-up
  outcome         VARCHAR(30) CHECK (outcome IN (
                    'resolved','ongoing','referred_external','referred_hoi',
                    'no_further_action','crisis_intervention', NULL
                  )),
  next_session_date DATE,
  external_referral VARCHAR(255),        -- name of external agency if referred

  -- Parent involvement
  parent_informed  BOOLEAN NOT NULL DEFAULT false,
  parent_informed_notes TEXT,

  is_confidential  BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 6. BEHAVIOUR TRACKING (periodic assessments)
-- ============================================================
CREATE TABLE IF NOT EXISTS behaviour_records (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  learner_id      UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  stream_id       UUID REFERENCES streams(id),
  recorded_by     UUID NOT NULL REFERENCES users(id),

  -- CBC behaviour competencies
  social_skills         VARCHAR(10) CHECK (social_skills         IN ('EE','ME','AE','BE',NULL)),
  self_management       VARCHAR(10) CHECK (self_management       IN ('EE','ME','AE','BE',NULL)),
  responsibility        VARCHAR(10) CHECK (responsibility        IN ('EE','ME','AE','BE',NULL)),
  respect_for_others    VARCHAR(10) CHECK (respect_for_others    IN ('EE','ME','AE','BE',NULL)),
  punctuality           VARCHAR(10) CHECK (punctuality           IN ('EE','ME','AE','BE',NULL)),
  participation         VARCHAR(10) CHECK (participation         IN ('EE','ME','AE','BE',NULL)),

  overall_behaviour     VARCHAR(10) CHECK (overall_behaviour     IN ('EE','ME','AE','BE',NULL)),
  teacher_comment       TEXT,
  academic_year         VARCHAR(9)  NOT NULL,
  term                  VARCHAR(10) NOT NULL CHECK (term IN ('term_1','term_2','term_3')),
  recorded_date         DATE        NOT NULL DEFAULT CURRENT_DATE,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(learner_id, academic_year, term)
);

-- ============================================================
-- 7. GUIDANCE PROGRAMMES
-- ============================================================
CREATE TABLE IF NOT EXISTS guidance_programmes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  school_id       UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name            VARCHAR(255) NOT NULL,
  description     TEXT,
  programme_type  VARCHAR(30) NOT NULL DEFAULT 'workshop'
                  CHECK (programme_type IN ('workshop','life_skills','career','peer_support',
                                            'anti_bullying','drug_awareness','mental_health','other')),
  facilitator_id  UUID REFERENCES users(id),
  scheduled_date  DATE,
  scheduled_time  TIME,
  duration_minutes SMALLINT DEFAULT 60,
  target_audience VARCHAR(20) DEFAULT 'all'
                  CHECK (target_audience IN ('all','grade_level','stream','at_risk')),
  audience_filter JSONB DEFAULT '{}',
  status          VARCHAR(20) NOT NULL DEFAULT 'planned'
                  CHECK (status IN ('planned','completed','cancelled')),
  attendance_count SMALLINT,
  outcomes        TEXT,
  notes           TEXT,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 8. PARENT COMMUNICATION LOG (discipline-related)
-- ============================================================
CREATE TABLE IF NOT EXISTS discipline_communications (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  incident_id     UUID REFERENCES incidents(id),
  action_id       UUID REFERENCES discipline_actions(id),
  learner_id      UUID NOT NULL REFERENCES learners(id),
  parent_id       UUID REFERENCES users(id),
  communicated_by UUID NOT NULL REFERENCES users(id),

  channel         VARCHAR(20) NOT NULL
                  CHECK (channel IN ('phone_call','sms','email','whatsapp','in_person','letter')),
  direction       VARCHAR(10) NOT NULL DEFAULT 'outgoing'
                  CHECK (direction IN ('outgoing','incoming')),
  summary         TEXT NOT NULL,
  parent_response TEXT,
  communicated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_incidents_tenant          ON incidents(tenant_id, school_id);
CREATE INDEX IF NOT EXISTS idx_incidents_learner         ON incidents(learner_id);
CREATE INDEX IF NOT EXISTS idx_incidents_date            ON incidents(incident_date DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_status          ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_severity        ON incidents(severity);
CREATE INDEX IF NOT EXISTS idx_disc_actions_incident     ON discipline_actions(incident_id);
CREATE INDEX IF NOT EXISTS idx_disc_actions_learner      ON discipline_actions(learner_id);
CREATE INDEX IF NOT EXISTS idx_disc_actions_type         ON discipline_actions(action_type);
CREATE INDEX IF NOT EXISTS idx_counselling_learner       ON counselling_sessions(learner_id);
CREATE INDEX IF NOT EXISTS idx_counselling_date          ON counselling_sessions(session_date DESC);
CREATE INDEX IF NOT EXISTS idx_counselling_counsellor    ON counselling_sessions(counsellor_id);
CREATE INDEX IF NOT EXISTS idx_counselling_risk          ON counselling_sessions(risk_level) WHERE risk_level IN ('high','critical');
CREATE INDEX IF NOT EXISTS idx_behaviour_learner         ON behaviour_records(learner_id);
CREATE INDEX IF NOT EXISTS idx_behaviour_year_term       ON behaviour_records(academic_year, term);
CREATE INDEX IF NOT EXISTS idx_guidance_tenant           ON guidance_programmes(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_disc_comms_incident       ON discipline_communications(incident_id);
CREATE INDEX IF NOT EXISTS idx_disc_comms_learner        ON discipline_communications(learner_id);

-- ============================================================
-- RLS
-- ============================================================
DO $$ DECLARE tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'incidents','discipline_actions','discipline_appeals',
    'counselling_sessions','behaviour_records',
    'guidance_programmes','discipline_communications'
  ]) LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_setting(''app.tenant_id'')::UUID)',
      tbl
    );
  END LOOP;
END $$;

DO $$ DECLARE tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'incidents','discipline_actions','counselling_sessions',
    'behaviour_records','guidance_programmes'
  ]) LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      replace(tbl,'-','_'), tbl
    );
  END LOOP;
END $$;

-- ============================================================
-- SEED: Default incident categories
-- ============================================================
INSERT INTO incident_categories (id, tenant_id, name, severity, description, is_system) VALUES
  (uuid_generate_v4(), NULL, 'Late Coming',               'minor',    'Learner arrives after bell',                            true),
  (uuid_generate_v4(), NULL, 'Uniform Violation',         'minor',    'Not wearing correct school uniform',                    true),
  (uuid_generate_v4(), NULL, 'Disruptive Behaviour',      'minor',    'Disrupting class or school activities',                 true),
  (uuid_generate_v4(), NULL, 'Incomplete Homework',       'minor',    'Failure to complete assigned work',                     true),
  (uuid_generate_v4(), NULL, 'Disrespect to Teacher',     'moderate', 'Rude or disrespectful behaviour toward staff',          true),
  (uuid_generate_v4(), NULL, 'Bullying',                  'moderate', 'Physical or verbal bullying of another learner',        true),
  (uuid_generate_v4(), NULL, 'Truancy',                   'moderate', 'Absent without permission',                             true),
  (uuid_generate_v4(), NULL, 'Cheating / Examination Irregularity', 'moderate', 'Dishonest conduct during assessments',        true),
  (uuid_generate_v4(), NULL, 'Vandalism / Property Damage','major',  'Deliberate damage to school or personal property',      true),
  (uuid_generate_v4(), NULL, 'Theft',                     'major',    'Stealing from school or another person',                true),
  (uuid_generate_v4(), NULL, 'Fighting / Physical Assault','major',  'Physical altercation with another learner or staff',    true),
  (uuid_generate_v4(), NULL, 'Drug / Substance Abuse',    'critical', 'Possession or use of drugs, alcohol or tobacco',        true),
  (uuid_generate_v4(), NULL, 'Possession of Weapon',      'critical', 'Bringing a dangerous object to school',                 true),
  (uuid_generate_v4(), NULL, 'Sexual Misconduct',         'critical', 'Inappropriate sexual behaviour',                        true),
  (uuid_generate_v4(), NULL, 'Cyberbullying',             'major',    'Online harassment or harmful digital behaviour',        true),
  (uuid_generate_v4(), NULL, 'Radicalisation Concern',    'critical', 'Signs of extremist influence or radicalisation',        true);
