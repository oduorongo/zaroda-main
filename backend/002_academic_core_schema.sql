-- ============================================================
-- ZARODA SCHOOL MANAGEMENT SYSTEM
-- MODULE 02: Academic Core
-- Tables: learners, guardians, subjects, allocations,
--         timetable, attendance, CATs, exams, report_cards
-- Depends on: Module 01 (tenants, schools, streams, users)
-- ============================================================

-- ============================================================
-- 1. LEARNERS
-- ============================================================
CREATE TABLE learners (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  school_id           UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  stream_id           UUID REFERENCES streams(id) ON DELETE SET NULL,
  user_id             UUID REFERENCES users(id) ON DELETE SET NULL,  -- learner portal login
  admission_number    VARCHAR(30) NOT NULL,                          -- school-assigned
  upi_number          VARCHAR(30),                                   -- Kenya Unique Pupil Identifier
  first_name          VARCHAR(100) NOT NULL,
  last_name           VARCHAR(100) NOT NULL,
  other_names         VARCHAR(100),
  date_of_birth       DATE,
  gender              VARCHAR(10) CHECK (gender IN ('male','female')),
  nationality         VARCHAR(60)  DEFAULT 'Kenyan',
  religion            VARCHAR(50),
  special_needs       TEXT,                                          -- any learning support needs
  photo_url           TEXT,
  admission_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  academic_year       VARCHAR(9) NOT NULL,                           -- "2025/2026"
  grade_level         VARCHAR(30) NOT NULL,                          -- grade_1 … grade_12 | pp1 | pp2
  previous_school     VARCHAR(255),
  kcpe_index          VARCHAR(30),                                   -- for Grade 7 entry
  kcse_index          VARCHAR(30),                                   -- for Grade 10 entry
  status              VARCHAR(20) NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','transferred','withdrawn','graduated','deceased')),
  is_boarder          BOOLEAN NOT NULL DEFAULT false,
  has_transport       BOOLEAN NOT NULL DEFAULT false,
  -- Date of birth and guardian details added via separate update (per spec)
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ,
  UNIQUE(tenant_id, school_id, admission_number)
);

-- ============================================================
-- 2. GUARDIANS (parent/guardian details — added post-registration)
-- ============================================================
CREATE TABLE guardians (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  learner_id      UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,      -- parent portal login
  relationship    VARCHAR(30) NOT NULL
                  CHECK (relationship IN ('father','mother','guardian','sibling','grandparent','other')),
  first_name      VARCHAR(100) NOT NULL,
  last_name       VARCHAR(100) NOT NULL,
  phone_primary   VARCHAR(20) NOT NULL,
  phone_secondary VARCHAR(20),
  email           VARCHAR(255),
  national_id     VARCHAR(20),
  occupation      VARCHAR(100),
  address         TEXT,
  is_primary      BOOLEAN NOT NULL DEFAULT false,                    -- primary contact
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

-- ============================================================
-- 3. SUBJECTS (learning areas per CBC)
-- ============================================================
CREATE TABLE subjects (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  school_id       UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name            VARCHAR(150) NOT NULL,                             -- "Mathematics", "Kiswahili"
  code            VARCHAR(20),                                       -- school subject code
  category        VARCHAR(30) NOT NULL
                  CHECK (category IN ('core','elective','optional','pathway')),
  grade_levels    TEXT[]  NOT NULL DEFAULT '{}',                     -- ["grade_7","grade_8","grade_9"]
  pathway         VARCHAR(30),                                       -- stem | arts_sports | social_sciences
  weekly_lessons  INTEGER NOT NULL DEFAULT 5,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

-- ============================================================
-- 4. SUBJECT ALLOCATIONS (teacher ↔ subject ↔ stream)
-- ============================================================
CREATE TABLE subject_allocations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  school_id       UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  stream_id       UUID NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
  subject_id      UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  teacher_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  academic_year   VARCHAR(9) NOT NULL,
  term            VARCHAR(10) NOT NULL CHECK (term IN ('term_1','term_2','term_3')),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, stream_id, subject_id, academic_year, term)
);

-- ============================================================
-- 5. CLASS TEACHER ASSIGNMENTS
-- ============================================================
CREATE TABLE class_teacher_assignments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  stream_id       UUID NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
  teacher_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  academic_year   VARCHAR(9) NOT NULL,
  term            VARCHAR(10) NOT NULL CHECK (term IN ('term_1','term_2','term_3')),
  role            VARCHAR(30) NOT NULL DEFAULT 'class_teacher'
                  CHECK (role IN ('class_teacher','overall_class_teacher')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, stream_id, academic_year, term, role)
);

-- ============================================================
-- 6. TIMETABLE SLOTS
-- ============================================================
CREATE TABLE timetable_slots (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  school_id       UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  stream_id       UUID NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
  subject_id      UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  teacher_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  academic_year   VARCHAR(9) NOT NULL,
  term            VARCHAR(10) NOT NULL CHECK (term IN ('term_1','term_2','term_3')),
  day_of_week     INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 5),  -- 1=Mon, 5=Fri
  period_number   INTEGER NOT NULL CHECK (period_number BETWEEN 1 AND 10),
  start_time      TIME NOT NULL,
  end_time        TIME NOT NULL,
  room            VARCHAR(50),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- No teacher double-booking
  UNIQUE(tenant_id, teacher_id, academic_year, term, day_of_week, period_number),
  -- No stream double-booking
  UNIQUE(tenant_id, stream_id, academic_year, term, day_of_week, period_number)
);

-- ============================================================
-- 7. ATTENDANCE (daily — class-level)
-- ============================================================
CREATE TABLE attendance_sessions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  stream_id       UUID NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
  teacher_id      UUID NOT NULL REFERENCES users(id),
  session_date    DATE NOT NULL,
  session_type    VARCHAR(20) NOT NULL DEFAULT 'morning'
                  CHECK (session_type IN ('morning','afternoon','full_day')),
  total_present   INTEGER NOT NULL DEFAULT 0,
  total_absent    INTEGER NOT NULL DEFAULT 0,
  total_enrolled  INTEGER NOT NULL DEFAULT 0,
  notes           TEXT,
  submitted_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, stream_id, session_date, session_type)
);

CREATE TABLE attendance_records (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id      UUID NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
  learner_id      UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  status          VARCHAR(20) NOT NULL CHECK (status IN ('present','absent','late','excused')),
  remarks         VARCHAR(255),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(session_id, learner_id)
);

-- ============================================================
-- 8. ASSESSMENTS — CATs & Exams
-- ============================================================
CREATE TABLE assessments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  stream_id       UUID NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
  subject_id      UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  teacher_id      UUID NOT NULL REFERENCES users(id),
  title           VARCHAR(255) NOT NULL,
  type            VARCHAR(30) NOT NULL
                  CHECK (type IN ('cat','midterm','endterm','assignment','project','practical','mock')),
  academic_year   VARCHAR(9)  NOT NULL,
  term            VARCHAR(10) NOT NULL CHECK (term IN ('term_1','term_2','term_3')),
  max_score       NUMERIC(6,2) NOT NULL DEFAULT 100,
  weight_percent  NUMERIC(5,2) NOT NULL DEFAULT 100,                 -- % weighting in final grade
  assessment_date DATE,
  instructions    TEXT,
  is_published    BOOLEAN NOT NULL DEFAULT false,                    -- visible to learners/parents
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE TABLE assessment_scores (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  assessment_id   UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  learner_id      UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  score           NUMERIC(6,2),
  is_absent       BOOLEAN NOT NULL DEFAULT false,
  remarks         VARCHAR(500),
  entered_by      UUID REFERENCES users(id),
  entered_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(assessment_id, learner_id)
);

-- ============================================================
-- 9. CBC COMPETENCY TRACKING
-- ============================================================
CREATE TABLE competency_assessments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  learner_id      UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  teacher_id      UUID NOT NULL REFERENCES users(id),
  subject_id      UUID REFERENCES subjects(id),
  academic_year   VARCHAR(9)  NOT NULL,
  term            VARCHAR(10) NOT NULL CHECK (term IN ('term_1','term_2','term_3')),
  competency      VARCHAR(60) NOT NULL CHECK (competency IN (
    'communication_collaboration','critical_thinking','creativity_imagination',
    'citizenship','digital_literacy','learning_to_learn','self_efficacy'
  )),
  -- ECDE → Grade 6 scale
  performance_level_basic    VARCHAR(30) CHECK (performance_level_basic IN (
    'exceeding_expectation','meeting_expectation','approaching_expectation','below_expectation'
  )),
  -- Grade 7 → Grade 12 scale (8-point)
  performance_level_advanced VARCHAR(30) CHECK (performance_level_advanced IN (
    'ee1','ee2','me1','me2','ae1','ae2','be1','be2'
  )),
  evidence        TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, learner_id, subject_id, academic_year, term, competency)
);

-- ============================================================
-- 10. REPORT CARDS
-- ============================================================
CREATE TABLE report_cards (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  learner_id      UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  stream_id       UUID NOT NULL REFERENCES streams(id),
  academic_year   VARCHAR(9)  NOT NULL,
  term            VARCHAR(10) NOT NULL CHECK (term IN ('term_1','term_2','term_3')),
  grade_level     VARCHAR(30) NOT NULL,
  -- Computed totals (denormalized for fast retrieval)
  total_marks     NUMERIC(8,2),
  average_percent NUMERIC(5,2),
  class_position  INTEGER,
  stream_position INTEGER,
  total_in_class  INTEGER,
  days_present    INTEGER,
  days_absent     INTEGER,
  days_school_open INTEGER,
  -- CBC narrative
  class_teacher_comment  TEXT,
  hoi_comment            TEXT,
  ai_generated_comment   TEXT,                                      -- Claude-generated, editable
  ai_comment_approved    BOOLEAN NOT NULL DEFAULT false,
  -- Status
  status          VARCHAR(20) NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','approved','published','printed')),
  approved_by     UUID REFERENCES users(id),
  approved_at     TIMESTAMPTZ,
  published_at    TIMESTAMPTZ,
  pdf_url         TEXT,                                             -- generated PDF storage URL
  subject_scores  JSONB NOT NULL DEFAULT '[]',                     -- snapshot of all subject scores
  competencies    JSONB NOT NULL DEFAULT '[]',                     -- snapshot of competencies
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, learner_id, academic_year, term)
);

-- ============================================================
-- 11. LEARNER TRANSFERS
-- ============================================================
CREATE TABLE learner_transfers (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  learner_id      UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  from_stream_id  UUID REFERENCES streams(id),
  to_stream_id    UUID REFERENCES streams(id),
  transfer_type   VARCHAR(20) NOT NULL CHECK (transfer_type IN ('internal','external_in','external_out')),
  transfer_date   DATE NOT NULL,
  reason          TEXT,
  processed_by    UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_learners_tenant        ON learners(tenant_id);
CREATE INDEX idx_learners_school        ON learners(school_id);
CREATE INDEX idx_learners_stream        ON learners(stream_id);
CREATE INDEX idx_learners_adm_no        ON learners(tenant_id, admission_number);
CREATE INDEX idx_learners_upi           ON learners(upi_number) WHERE upi_number IS NOT NULL;
CREATE INDEX idx_learners_status        ON learners(status);

CREATE INDEX idx_guardians_learner      ON guardians(learner_id);
CREATE INDEX idx_guardians_tenant       ON guardians(tenant_id);

CREATE INDEX idx_subjects_tenant        ON subjects(tenant_id);
CREATE INDEX idx_subjects_school        ON subjects(school_id);

CREATE INDEX idx_allocations_stream     ON subject_allocations(stream_id);
CREATE INDEX idx_allocations_teacher    ON subject_allocations(teacher_id);
CREATE INDEX idx_allocations_year_term  ON subject_allocations(academic_year, term);

CREATE INDEX idx_timetable_stream       ON timetable_slots(stream_id);
CREATE INDEX idx_timetable_teacher      ON timetable_slots(teacher_id);
CREATE INDEX idx_timetable_day_period   ON timetable_slots(day_of_week, period_number);

CREATE INDEX idx_attendance_stream_date ON attendance_sessions(stream_id, session_date);
CREATE INDEX idx_attendance_records_l   ON attendance_records(learner_id);
CREATE INDEX idx_attendance_records_s   ON attendance_records(session_id);

CREATE INDEX idx_assessments_stream     ON assessments(stream_id);
CREATE INDEX idx_assessments_subject    ON assessments(subject_id);
CREATE INDEX idx_assessments_year_term  ON assessments(academic_year, term);

CREATE INDEX idx_scores_assessment      ON assessment_scores(assessment_id);
CREATE INDEX idx_scores_learner         ON assessment_scores(learner_id);

CREATE INDEX idx_competency_learner     ON competency_assessments(learner_id);
CREATE INDEX idx_competency_year_term   ON competency_assessments(academic_year, term);

CREATE INDEX idx_report_cards_learner   ON report_cards(learner_id);
CREATE INDEX idx_report_cards_year_term ON report_cards(academic_year, term);
CREATE INDEX idx_report_cards_status    ON report_cards(status);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE learners                ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardians               ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects                ENABLE ROW LEVEL SECURITY;
ALTER TABLE subject_allocations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_teacher_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE timetable_slots         ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_sessions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records      ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessments             ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_scores       ENABLE ROW LEVEL SECURITY;
ALTER TABLE competency_assessments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_cards            ENABLE ROW LEVEL SECURITY;
ALTER TABLE learner_transfers       ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON learners
  USING (tenant_id = current_setting('app.tenant_id')::UUID);
CREATE POLICY tenant_isolation ON guardians
  USING (tenant_id = current_setting('app.tenant_id')::UUID);
CREATE POLICY tenant_isolation ON subjects
  USING (tenant_id = current_setting('app.tenant_id')::UUID);
CREATE POLICY tenant_isolation ON subject_allocations
  USING (tenant_id = current_setting('app.tenant_id')::UUID);
CREATE POLICY tenant_isolation ON class_teacher_assignments
  USING (tenant_id = current_setting('app.tenant_id')::UUID);
CREATE POLICY tenant_isolation ON timetable_slots
  USING (tenant_id = current_setting('app.tenant_id')::UUID);
CREATE POLICY tenant_isolation ON attendance_sessions
  USING (tenant_id = current_setting('app.tenant_id')::UUID);
CREATE POLICY tenant_isolation ON attendance_records
  USING (tenant_id = current_setting('app.tenant_id')::UUID);
CREATE POLICY tenant_isolation ON assessments
  USING (tenant_id = current_setting('app.tenant_id')::UUID);
CREATE POLICY tenant_isolation ON assessment_scores
  USING (tenant_id = current_setting('app.tenant_id')::UUID);
CREATE POLICY tenant_isolation ON competency_assessments
  USING (tenant_id = current_setting('app.tenant_id')::UUID);
CREATE POLICY tenant_isolation ON report_cards
  USING (tenant_id = current_setting('app.tenant_id')::UUID);
CREATE POLICY tenant_isolation ON learner_transfers
  USING (tenant_id = current_setting('app.tenant_id')::UUID);

-- updated_at triggers
CREATE TRIGGER trg_learners_updated_at
  BEFORE UPDATE ON learners FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_subjects_updated_at
  BEFORE UPDATE ON subjects FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_allocations_updated_at
  BEFORE UPDATE ON subject_allocations FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_timetable_updated_at
  BEFORE UPDATE ON timetable_slots FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_assessments_updated_at
  BEFORE UPDATE ON assessments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_scores_updated_at
  BEFORE UPDATE ON assessment_scores FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_competency_updated_at
  BEFORE UPDATE ON competency_assessments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_report_cards_updated_at
  BEFORE UPDATE ON report_cards FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- DEFAULT SUBJECTS per CBC (run after school onboarding)
-- Call: SELECT seed_default_subjects(:tenant_id, :school_id);
-- ============================================================
CREATE OR REPLACE FUNCTION seed_default_subjects(p_tenant UUID, p_school UUID)
RETURNS void AS $$
BEGIN
  INSERT INTO subjects (tenant_id, school_id, name, code, category, grade_levels, weekly_lessons)
  VALUES
    -- ECDE
    (p_tenant, p_school, 'Language Activities',      'LA',   'core',     ARRAY['playgroup','pp1','pp2'], 7),
    (p_tenant, p_school, 'Mathematical Activities',  'MA',   'core',     ARRAY['playgroup','pp1','pp2'], 7),
    (p_tenant, p_school, 'Environmental Activities', 'EA',   'core',     ARRAY['playgroup','pp1','pp2'], 5),
    (p_tenant, p_school, 'Psychomotor & Creative',   'PCA',  'core',     ARRAY['playgroup','pp1','pp2'], 5),
    (p_tenant, p_school, 'Religious Education',      'RE',   'optional', ARRAY['playgroup','pp1','pp2'], 3),
    -- Primary Grade 1-3
    (p_tenant, p_school, 'Literacy I (English)',     'LIT1', 'core',     ARRAY['grade_1','grade_2','grade_3'], 10),
    (p_tenant, p_school, 'Literacy II (Kiswahili)',  'LIT2', 'core',     ARRAY['grade_1','grade_2','grade_3'], 10),
    (p_tenant, p_school, 'Kiswahili',               'KSW',  'core',     ARRAY['grade_1','grade_2','grade_3'], 5),
    (p_tenant, p_school, 'Mathematics',              'MTH',  'core',     ARRAY['grade_1','grade_2','grade_3','grade_4','grade_5','grade_6'], 10),
    (p_tenant, p_school, 'Environmental',            'ENV',  'core',     ARRAY['grade_1','grade_2','grade_3'], 5),
    -- Primary Grade 4-6
    (p_tenant, p_school, 'English',                 'ENG',  'core',     ARRAY['grade_4','grade_5','grade_6'], 10),
    (p_tenant, p_school, 'Science & Technology',    'SCI',  'core',     ARRAY['grade_4','grade_5','grade_6'], 7),
    (p_tenant, p_school, 'Social Studies',          'SST',  'core',     ARRAY['grade_4','grade_5','grade_6'], 5),
    (p_tenant, p_school, 'Creative Arts',           'CAT',  'core',     ARRAY['grade_4','grade_5','grade_6'], 5),
    (p_tenant, p_school, 'Physical & Health Ed',    'PHE',  'core',     ARRAY['grade_4','grade_5','grade_6'], 5),
    -- Junior School Grade 7-9
    (p_tenant, p_school, 'English',                 'ENG',  'core',     ARRAY['grade_7','grade_8','grade_9'], 8),
    (p_tenant, p_school, 'Kiswahili',               'KSW',  'core',     ARRAY['grade_7','grade_8','grade_9'], 8),
    (p_tenant, p_school, 'Mathematics',             'MTH',  'core',     ARRAY['grade_7','grade_8','grade_9'], 8),
    (p_tenant, p_school, 'Integrated Science',      'ISC',  'core',     ARRAY['grade_7','grade_8','grade_9'], 8),
    (p_tenant, p_school, 'Social Studies',          'SST',  'core',     ARRAY['grade_7','grade_8','grade_9'], 5),
    (p_tenant, p_school, 'Business Studies',        'BST',  'core',     ARRAY['grade_7','grade_8','grade_9'], 5),
    (p_tenant, p_school, 'Agriculture & Nutrition', 'AGR',  'core',     ARRAY['grade_7','grade_8','grade_9'], 5),
    (p_tenant, p_school, 'Creative Arts & Sports',  'CAS',  'core',     ARRAY['grade_7','grade_8','grade_9'], 5),
    (p_tenant, p_school, 'Religious Education',     'CRE',  'optional', ARRAY['grade_7','grade_8','grade_9'], 3),
    -- Senior STEM
    (p_tenant, p_school, 'Mathematics',             'MTH',  'core',     ARRAY['grade_10','grade_11','grade_12'], 8),
    (p_tenant, p_school, 'Biology',                 'BIO',  'core',     ARRAY['grade_10','grade_11','grade_12'], 6),
    (p_tenant, p_school, 'Chemistry',               'CHE',  'core',     ARRAY['grade_10','grade_11','grade_12'], 6),
    (p_tenant, p_school, 'Physics',                 'PHY',  'core',     ARRAY['grade_10','grade_11','grade_12'], 6),
    (p_tenant, p_school, 'Computer Science',        'CSC',  'pathway',  ARRAY['grade_10','grade_11','grade_12'], 5),
    -- Senior Arts & Sports Science
    (p_tenant, p_school, 'Literature',              'LIT',  'pathway',  ARRAY['grade_10','grade_11','grade_12'], 6),
    (p_tenant, p_school, 'Music',                   'MUS',  'pathway',  ARRAY['grade_10','grade_11','grade_12'], 5),
    (p_tenant, p_school, 'Sports Science',          'SPT',  'pathway',  ARRAY['grade_10','grade_11','grade_12'], 5),
    -- Senior Social Sciences
    (p_tenant, p_school, 'History & Government',    'HST',  'pathway',  ARRAY['grade_10','grade_11','grade_12'], 6),
    (p_tenant, p_school, 'Geography',               'GEO',  'pathway',  ARRAY['grade_10','grade_11','grade_12'], 6),
    (p_tenant, p_school, 'Christian Religious Ed',  'CRE',  'pathway',  ARRAY['grade_10','grade_11','grade_12'], 5)
  ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql;
