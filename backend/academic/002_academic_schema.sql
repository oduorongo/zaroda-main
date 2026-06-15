-- ============================================================
-- ZARODA SCHOOL MANAGEMENT SYSTEM
-- MODULE 02: Academic Core — Database Schema
-- Depends on: 001_auth_tenant_schema.sql
-- ============================================================

-- ============================================================
-- 1. LEARNING AREAS (CBC/CBE subjects)
-- ============================================================
CREATE TABLE learning_areas (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  school_id       UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name            VARCHAR(255) NOT NULL,           -- "Mathematics", "Integrated Science"
  code            VARCHAR(20),                     -- "MTH", "ISC"
  grade_band      VARCHAR(30) NOT NULL,            -- ecde | lower_primary | upper_primary | junior | senior_stem | senior_arts | senior_social
  pathway         VARCHAR(30),                     -- stem | arts_sports | social_sciences (senior only)
  is_compulsory   BOOLEAN NOT NULL DEFAULT true,
  weekly_lessons  INTEGER NOT NULL DEFAULT 5,      -- lessons per week
  is_active       BOOLEAN NOT NULL DEFAULT true,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

-- ============================================================
-- 2. STRANDS & SUB-STRANDS (CBC structure)
-- ============================================================
CREATE TABLE strands (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  learning_area_id UUID NOT NULL REFERENCES learning_areas(id) ON DELETE CASCADE,
  name            VARCHAR(255) NOT NULL,
  code            VARCHAR(20),
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE TABLE sub_strands (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  strand_id   UUID NOT NULL REFERENCES strands(id) ON DELETE CASCADE,
  name        VARCHAR(255) NOT NULL,
  code        VARCHAR(20),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

-- ============================================================
-- 3. LEARNERS
-- ============================================================
CREATE TABLE learners (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  school_id           UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  admission_number    VARCHAR(30) UNIQUE NOT NULL,       -- school-assigned (auto or manual)
  upi_number          VARCHAR(30),                       -- Kenya NEMIS UPI
  first_name          VARCHAR(100) NOT NULL,
  middle_name         VARCHAR(100),
  last_name           VARCHAR(100) NOT NULL,
  gender              VARCHAR(10) NOT NULL CHECK (gender IN ('male','female')),
  date_of_birth       DATE,
  birth_certificate   VARCHAR(50),
  nationality         VARCHAR(50) NOT NULL DEFAULT 'Kenyan',
  religion            VARCHAR(50),
  special_needs       TEXT,                              -- any special learning needs
  photo_url           TEXT,
  status              VARCHAR(20) NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','graduated','transferred_in','transferred_out','withdrawn','deceased')),
  -- Address
  county              VARCHAR(100),
  sub_county          VARCHAR(100),
  ward                VARCHAR(100),
  village             VARCHAR(100),
  postal_address      VARCHAR(100),
  -- Admission
  admission_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  admission_class     VARCHAR(30),                       -- grade at time of admission
  transfer_from       VARCHAR(255),                      -- previous school if transferred
  -- Linked user account (for learner portal login)
  user_id             UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ
);

-- ============================================================
-- 4. PARENTS / GUARDIANS
-- ============================================================
CREATE TABLE guardians (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  learner_id      UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  relationship    VARCHAR(30) NOT NULL               -- father | mother | guardian | sponsor
                  CHECK (relationship IN ('father','mother','guardian','sponsor','sibling','other')),
  first_name      VARCHAR(100) NOT NULL,
  last_name       VARCHAR(100) NOT NULL,
  national_id     VARCHAR(20),
  phone_primary   VARCHAR(20) NOT NULL,
  phone_secondary VARCHAR(20),
  email           VARCHAR(255),
  occupation      VARCHAR(100),
  employer        VARCHAR(150),
  address         TEXT,
  is_primary      BOOLEAN NOT NULL DEFAULT false,    -- primary contact
  is_fee_payer    BOOLEAN NOT NULL DEFAULT false,    -- responsible for fees
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,  -- linked parent portal account
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

-- ============================================================
-- 5. STREAM ENROLMENTS (learner ↔ stream per term)
-- ============================================================
CREATE TABLE stream_enrolments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  learner_id      UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  stream_id       UUID NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
  school_id       UUID NOT NULL REFERENCES schools(id),
  academic_year   VARCHAR(9) NOT NULL,                -- "2025/2026"
  term            VARCHAR(10) NOT NULL,               -- term_1|term_2|term_3
  enrolment_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  exit_date       DATE,
  exit_reason     VARCHAR(100),                       -- graduated|transferred|withdrawn
  roll_number     INTEGER,                            -- position on class register
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (learner_id, stream_id, academic_year, term)
);

-- ============================================================
-- 6. TEACHER ALLOCATIONS (teacher ↔ subject ↔ stream)
-- ============================================================
CREATE TABLE teacher_allocations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  teacher_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stream_id       UUID NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
  learning_area_id UUID NOT NULL REFERENCES learning_areas(id) ON DELETE CASCADE,
  school_id       UUID NOT NULL REFERENCES schools(id),
  academic_year   VARCHAR(9) NOT NULL,
  term            VARCHAR(10) NOT NULL,
  is_class_teacher BOOLEAN NOT NULL DEFAULT false,   -- is this teacher the class teacher for this stream?
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,
  UNIQUE (teacher_id, stream_id, learning_area_id, academic_year, term)
);

-- ============================================================
-- 7. TIMETABLE SLOTS
-- ============================================================
CREATE TABLE timetable_slots (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  stream_id       UUID NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
  school_id       UUID NOT NULL REFERENCES schools(id),
  teacher_id      UUID NOT NULL REFERENCES users(id),
  learning_area_id UUID NOT NULL REFERENCES learning_areas(id),
  academic_year   VARCHAR(9) NOT NULL,
  term            VARCHAR(10) NOT NULL,
  day_of_week     SMALLINT NOT NULL CHECK (day_of_week BETWEEN 1 AND 5),  -- 1=Mon...5=Fri
  period_number   SMALLINT NOT NULL CHECK (period_number BETWEEN 1 AND 10),
  start_time      TIME NOT NULL,
  end_time        TIME NOT NULL,
  room            VARCHAR(50),
  is_break        BOOLEAN NOT NULL DEFAULT false,    -- break/assembly period
  break_label     VARCHAR(50),                       -- "Break", "Assembly", "Lunch"
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- No teacher double-booking
  UNIQUE (teacher_id, academic_year, term, day_of_week, period_number),
  -- No stream double-booking
  UNIQUE (stream_id, academic_year, term, day_of_week, period_number)
);

-- ============================================================
-- 8. ATTENDANCE RECORDS
-- ============================================================
CREATE TABLE attendance_records (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  learner_id      UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  stream_id       UUID NOT NULL REFERENCES streams(id),
  school_id       UUID NOT NULL REFERENCES schools(id),
  recorded_by     UUID NOT NULL REFERENCES users(id),   -- teacher taking register
  date            DATE NOT NULL,
  period          VARCHAR(20) NOT NULL DEFAULT 'morning' -- morning|afternoon|lesson_N
                  CHECK (period IN ('morning','afternoon','lesson_1','lesson_2','lesson_3','lesson_4','lesson_5','lesson_6','lesson_7','lesson_8')),
  status          VARCHAR(20) NOT NULL
                  CHECK (status IN ('present','absent','late','excused','sick','suspended')),
  remarks         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (learner_id, date, period)
);

-- Bulk attendance session (one per class per day)
CREATE TABLE attendance_sessions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  stream_id       UUID NOT NULL REFERENCES streams(id),
  school_id       UUID NOT NULL REFERENCES schools(id),
  taken_by        UUID NOT NULL REFERENCES users(id),
  date            DATE NOT NULL,
  period          VARCHAR(20) NOT NULL DEFAULT 'morning',
  total_present   INTEGER NOT NULL DEFAULT 0,
  total_absent    INTEGER NOT NULL DEFAULT 0,
  total_late      INTEGER NOT NULL DEFAULT 0,
  total_enrolled  INTEGER NOT NULL DEFAULT 0,
  is_submitted    BOOLEAN NOT NULL DEFAULT false,
  submitted_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (stream_id, date, period)
);

-- ============================================================
-- 9. ASSESSMENTS — CATs & EXAMS
-- ============================================================
CREATE TABLE assessment_types (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name            VARCHAR(100) NOT NULL,             -- "CAT 1", "Mid-Term Exam", "End Term Exam"
  category        VARCHAR(20) NOT NULL               -- formative | summative
                  CHECK (category IN ('formative','summative')),
  weight_percent  NUMERIC(5,2) NOT NULL DEFAULT 0,   -- contribution to term total
  max_score       NUMERIC(6,2) NOT NULL DEFAULT 100,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE TABLE assessments (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  stream_id         UUID NOT NULL REFERENCES streams(id),
  school_id         UUID NOT NULL REFERENCES schools(id),
  learning_area_id  UUID NOT NULL REFERENCES learning_areas(id),
  assessment_type_id UUID NOT NULL REFERENCES assessment_types(id),
  administered_by   UUID NOT NULL REFERENCES users(id),  -- teacher
  name              VARCHAR(200) NOT NULL,             -- "Mathematics CAT 1 — Term 2 2026"
  academic_year     VARCHAR(9) NOT NULL,
  term              VARCHAR(10) NOT NULL,
  date_administered DATE NOT NULL,
  max_score         NUMERIC(6,2) NOT NULL DEFAULT 100,
  strand_id         UUID REFERENCES strands(id),        -- optional: which strand assessed
  sub_strand_id     UUID REFERENCES sub_strands(id),
  remarks           TEXT,
  is_published      BOOLEAN NOT NULL DEFAULT false,     -- teacher publishes results when ready
  published_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ
);

-- ============================================================
-- 10. ASSESSMENT SCORES
-- ============================================================
CREATE TABLE assessment_scores (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  assessment_id   UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  learner_id      UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  score           NUMERIC(6,2),                        -- NULL = absent / not yet marked
  performance_level VARCHAR(30),                       -- EE | ME | AE | BE (Grade 1-6) or EE1/EE2/ME1/ME2/AE1/AE2/BE1/BE2 (Grade 7-12)
  remarks         TEXT,                                -- AI or manual
  is_absent       BOOLEAN NOT NULL DEFAULT false,
  marked_by       UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (assessment_id, learner_id)
);

-- ============================================================
-- 11. CBC COMPETENCY TRACKING
-- ============================================================
CREATE TABLE competency_ratings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  learner_id      UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  stream_id       UUID NOT NULL REFERENCES streams(id),
  rated_by        UUID NOT NULL REFERENCES users(id),
  academic_year   VARCHAR(9) NOT NULL,
  term            VARCHAR(10) NOT NULL,
  competency      VARCHAR(60) NOT NULL               -- see CHECK below
                  CHECK (competency IN (
                    'communication_collaboration',
                    'critical_thinking',
                    'creativity_imagination',
                    'citizenship',
                    'digital_literacy',
                    'learning_to_learn',
                    'self_efficacy'
                  )),
  rating          VARCHAR(30) NOT NULL,              -- EE|ME|AE|BE or EE1/EE2/...
  evidence        TEXT,                              -- teacher's observation notes
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (learner_id, academic_year, term, competency)
);

-- ============================================================
-- 12. TERM RESULTS (aggregated per learner per subject per term)
-- ============================================================
CREATE TABLE term_results (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  learner_id        UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  stream_id         UUID NOT NULL REFERENCES streams(id),
  learning_area_id  UUID NOT NULL REFERENCES learning_areas(id),
  academic_year     VARCHAR(9) NOT NULL,
  term              VARCHAR(10) NOT NULL,
  -- Scores
  cat1_score        NUMERIC(6,2),
  cat2_score        NUMERIC(6,2),
  midterm_score     NUMERIC(6,2),
  endterm_score     NUMERIC(6,2),
  total_score       NUMERIC(6,2),
  max_possible      NUMERIC(6,2) NOT NULL DEFAULT 100,
  percentage        NUMERIC(5,2),
  performance_level VARCHAR(30),                     -- EE|ME|AE|BE (or EE1..BE2 for Grade 7-12)
  position_in_class INTEGER,
  teacher_remarks   TEXT,
  ai_remarks        TEXT,                            -- Claude-generated remarks
  final_remarks     TEXT,                            -- approved remarks (ai or edited)
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (learner_id, learning_area_id, academic_year, term)
);

-- ============================================================
-- 13. REPORT CARDS
-- ============================================================
CREATE TABLE report_cards (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  learner_id        UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  stream_id         UUID NOT NULL REFERENCES streams(id),
  school_id         UUID NOT NULL REFERENCES schools(id),
  academic_year     VARCHAR(9) NOT NULL,
  term              VARCHAR(10) NOT NULL,
  overall_grade     VARCHAR(30),
  overall_position  INTEGER,
  class_size        INTEGER,
  days_present      INTEGER NOT NULL DEFAULT 0,
  days_absent       INTEGER NOT NULL DEFAULT 0,
  days_late         INTEGER NOT NULL DEFAULT 0,
  hoi_remarks       TEXT,
  class_teacher_remarks TEXT,
  ai_general_remarks TEXT,
  final_remarks     TEXT,
  status            VARCHAR(20) NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','generated','approved','issued')),
  generated_at      TIMESTAMPTZ,
  approved_by       UUID REFERENCES users(id),
  approved_at       TIMESTAMPTZ,
  issued_at         TIMESTAMPTZ,
  pdf_url           TEXT,                            -- stored report card PDF
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (learner_id, academic_year, term)
);

-- ============================================================
-- 14. ACADEMIC YEARS / TERMS (school calendar)
-- ============================================================
CREATE TABLE academic_calendars (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  school_id       UUID NOT NULL REFERENCES schools(id),
  academic_year   VARCHAR(9) NOT NULL,
  term            VARCHAR(10) NOT NULL,
  term_start      DATE NOT NULL,
  term_end        DATE NOT NULL,
  holiday_start   DATE,
  holiday_end     DATE,
  is_current      BOOLEAN NOT NULL DEFAULT false,
  working_days    INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, academic_year, term)
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_learners_tenant       ON learners(tenant_id);
CREATE INDEX idx_learners_school       ON learners(school_id);
CREATE INDEX idx_learners_adm_number   ON learners(admission_number);
CREATE INDEX idx_learners_upi          ON learners(upi_number) WHERE upi_number IS NOT NULL;
CREATE INDEX idx_learners_status       ON learners(status);
CREATE INDEX idx_learners_name         ON learners USING gin(to_tsvector('simple', first_name || ' ' || last_name));

CREATE INDEX idx_guardians_learner     ON guardians(learner_id);
CREATE INDEX idx_guardians_tenant      ON guardians(tenant_id);

CREATE INDEX idx_enrolments_learner    ON stream_enrolments(learner_id);
CREATE INDEX idx_enrolments_stream     ON stream_enrolments(stream_id);
CREATE INDEX idx_enrolments_year_term  ON stream_enrolments(academic_year, term);

CREATE INDEX idx_teacher_alloc_teacher ON teacher_allocations(teacher_id);
CREATE INDEX idx_teacher_alloc_stream  ON teacher_allocations(stream_id);
CREATE INDEX idx_teacher_alloc_la      ON teacher_allocations(learning_area_id);

CREATE INDEX idx_timetable_stream      ON timetable_slots(stream_id, academic_year, term);
CREATE INDEX idx_timetable_teacher     ON timetable_slots(teacher_id, academic_year, term);

CREATE INDEX idx_attendance_learner    ON attendance_records(learner_id, date);
CREATE INDEX idx_attendance_stream     ON attendance_records(stream_id, date);
CREATE INDEX idx_attendance_date       ON attendance_records(date);

CREATE INDEX idx_assessments_stream    ON assessments(stream_id, academic_year, term);
CREATE INDEX idx_assessments_la        ON assessments(learning_area_id);
CREATE INDEX idx_scores_assessment     ON assessment_scores(assessment_id);
CREATE INDEX idx_scores_learner        ON assessment_scores(learner_id);

CREATE INDEX idx_term_results_learner  ON term_results(learner_id, academic_year, term);
CREATE INDEX idx_term_results_stream   ON term_results(stream_id, academic_year, term);

CREATE INDEX idx_report_cards_learner  ON report_cards(learner_id, academic_year, term);
CREATE INDEX idx_report_cards_stream   ON report_cards(stream_id, academic_year, term);
CREATE INDEX idx_report_cards_status   ON report_cards(status);

-- ============================================================
-- RLS — extend tenant isolation to academic tables
-- ============================================================
ALTER TABLE learning_areas      ENABLE ROW LEVEL SECURITY;
ALTER TABLE learners            ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardians           ENABLE ROW LEVEL SECURITY;
ALTER TABLE stream_enrolments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE timetable_slots     ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records  ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_scores   ENABLE ROW LEVEL SECURITY;
ALTER TABLE competency_ratings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE term_results        ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_cards        ENABLE ROW LEVEL SECURITY;
ALTER TABLE academic_calendars  ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'learning_areas','learners','guardians','stream_enrolments',
    'teacher_allocations','timetable_slots','attendance_records',
    'attendance_sessions','assessments','assessment_scores',
    'competency_ratings','term_results','report_cards','academic_calendars'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_setting(''app.tenant_id'')::UUID)',
      tbl
    );
  END LOOP;
END $$;

-- updated_at triggers
DO $$
DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'learning_areas','learners','guardians','stream_enrolments',
    'teacher_allocations','timetable_slots','attendance_records',
    'assessments','assessment_scores','competency_ratings',
    'term_results','report_cards','academic_calendars'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      replace(tbl,'-','_'), tbl
    );
  END LOOP;
END $$;

-- ============================================================
-- HELPER VIEW: current enrolments with learner details
-- ============================================================
CREATE OR REPLACE VIEW v_current_enrolments AS
SELECT
  se.id           AS enrolment_id,
  se.tenant_id,
  se.stream_id,
  se.school_id,
  se.academic_year,
  se.term,
  se.roll_number,
  l.id            AS learner_id,
  l.admission_number,
  l.upi_number,
  l.first_name,
  l.middle_name,
  l.last_name,
  l.gender,
  l.date_of_birth,
  l.photo_url,
  l.status        AS learner_status,
  s.name          AS stream_name,
  s.grade_level,
  sc.name         AS school_name
FROM stream_enrolments se
JOIN learners l  ON l.id = se.learner_id
JOIN streams  s  ON s.id = se.stream_id
JOIN schools  sc ON sc.id = se.school_id
WHERE se.is_active = true
  AND l.deleted_at IS NULL;

-- ============================================================
-- HELPER VIEW: teacher workload
-- ============================================================
CREATE OR REPLACE VIEW v_teacher_workload AS
SELECT
  ta.teacher_id,
  ta.tenant_id,
  ta.academic_year,
  ta.term,
  u.first_name || ' ' || u.last_name AS teacher_name,
  u.tsc_number,
  COUNT(DISTINCT ta.stream_id)       AS streams_count,
  COUNT(DISTINCT ta.learning_area_id) AS subjects_count,
  SUM(la.weekly_lessons)             AS weekly_lessons_total
FROM teacher_allocations ta
JOIN users          u  ON u.id  = ta.teacher_id
JOIN learning_areas la ON la.id = ta.learning_area_id
WHERE ta.is_active = true AND ta.deleted_at IS NULL
GROUP BY ta.teacher_id, ta.tenant_id, ta.academic_year, ta.term,
         u.first_name, u.last_name, u.tsc_number;
