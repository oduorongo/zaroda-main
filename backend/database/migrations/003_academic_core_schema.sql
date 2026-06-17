-- ============================================================
-- ZARODA SCHOOL MANAGEMENT SYSTEM
-- MODULE 02: Academic Core — Database Schema
-- Tables: learners, subject_catalogue, stream_subjects,
--         learner_subjects, teacher_allocations, timetable,
--         attendance, cats, exams, exam_results, report_cards
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

  -- Identification
  admission_number    VARCHAR(30) UNIQUE NOT NULL,               -- auto-generated: SCH/2025/0001
  nemis_number        VARCHAR(20) UNIQUE,                        -- National Education Management Info System
  birth_cert_number   VARCHAR(30),

  -- Personal details
  first_name          VARCHAR(100) NOT NULL,
  last_name           VARCHAR(100) NOT NULL,
  other_names         VARCHAR(100),
  gender              VARCHAR(10) NOT NULL CHECK (gender IN ('male','female')),
  date_of_birth       DATE,
  nationality         VARCHAR(50) DEFAULT 'Kenyan',
  special_needs       TEXT,                                      -- learning disabilities, physical needs

  -- Academic
  grade_level         VARCHAR(20) NOT NULL,                      -- pp1|pp2|grade_1..grade_12
  academic_year       VARCHAR(9)  NOT NULL,                      -- "2025/2026"
  admission_date      DATE        NOT NULL DEFAULT CURRENT_DATE,
  previous_school     VARCHAR(255),
  pathway             VARCHAR(30) CHECK (pathway IN ('stem','arts_sports','social_sciences', NULL)),

  -- Status
  status              VARCHAR(20) NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','transferred','completed','withdrawn','deceased')),

  -- Parent / guardian (added after registration as per spec)
  parent_id           UUID REFERENCES users(id) ON DELETE SET NULL,
  guardian_name       VARCHAR(255),
  guardian_phone      VARCHAR(20),
  guardian_email      VARCHAR(255),
  guardian_relation   VARCHAR(50),

  -- Boarding
  is_boarder          BOOLEAN NOT NULL DEFAULT false,
  dormitory           VARCHAR(100),

  -- Profile photo
  photo_url           TEXT,

  -- Audit
  registered_by       UUID REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ
);

-- ============================================================
-- 2. SUBJECT CATALOGUE (school-specific subject library)
-- ============================================================
CREATE TABLE subject_catalogue (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  school_id       UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,

  name            VARCHAR(150) NOT NULL,                         -- "Mathematics", "Integrated Science"
  code            VARCHAR(20),                                   -- "MTH", "ISC"
  category        VARCHAR(30) NOT NULL                           -- core | optional | pathway | activities
                  CHECK (category IN ('core','optional','pathway','activities')),
  grade_band      VARCHAR(20) NOT NULL                           -- ecde|primary|junior|senior
                  CHECK (grade_band IN ('ecde','primary','junior','senior')),
  pathway         VARCHAR(30) CHECK (pathway IN ('stem','arts_sports','social_sciences', NULL)),

  -- CBC-specific
  has_strands     BOOLEAN NOT NULL DEFAULT true,
  is_examinable   BOOLEAN NOT NULL DEFAULT true,
  weighting       NUMERIC(4,2) DEFAULT 1.00,                     -- for weighted GPA

  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,

  UNIQUE(school_id, code)
);

-- ============================================================
-- 3. STREAM SUBJECTS (subjects offered per stream per term)
-- ============================================================
CREATE TABLE stream_subjects (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  stream_id       UUID NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
  subject_id      UUID NOT NULL REFERENCES subject_catalogue(id) ON DELETE CASCADE,
  academic_year   VARCHAR(9) NOT NULL,
  term            VARCHAR(10) NOT NULL CHECK (term IN ('term_1','term_2','term_3')),
  periods_per_week INTEGER NOT NULL DEFAULT 5,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(stream_id, subject_id, academic_year, term)
);

-- ============================================================
-- 4. LEARNER SUBJECTS (individual subject selections — Senior)
-- ============================================================
CREATE TABLE learner_subjects (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  learner_id      UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  subject_id      UUID NOT NULL REFERENCES subject_catalogue(id) ON DELETE CASCADE,
  stream_id       UUID NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
  academic_year   VARCHAR(9) NOT NULL,
  term            VARCHAR(10) NOT NULL CHECK (term IN ('term_1','term_2','term_3')),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(learner_id, subject_id, academic_year, term)
);

-- ============================================================
-- 5. TEACHER ALLOCATIONS
-- ============================================================
CREATE TABLE teacher_allocations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  teacher_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stream_id       UUID NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
  subject_id      UUID NOT NULL REFERENCES subject_catalogue(id) ON DELETE CASCADE,
  academic_year   VARCHAR(9) NOT NULL,
  term            VARCHAR(10) NOT NULL CHECK (term IN ('term_1','term_2','term_3')),
  role            VARCHAR(30) NOT NULL DEFAULT 'subject_teacher'
                  CHECK (role IN ('class_teacher','subject_teacher','overall_class_teacher')),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  allocated_by    UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(teacher_id, stream_id, subject_id, academic_year, term)
);

-- ============================================================
-- 6. TIMETABLE SLOTS
-- ============================================================
CREATE TABLE timetable_slots (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  school_id       UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  stream_id       UUID NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
  subject_id      UUID NOT NULL REFERENCES subject_catalogue(id),
  teacher_id      UUID REFERENCES users(id),

  academic_year   VARCHAR(9)  NOT NULL,
  term            VARCHAR(10) NOT NULL CHECK (term IN ('term_1','term_2','term_3')),
  day_of_week     SMALLINT    NOT NULL CHECK (day_of_week BETWEEN 1 AND 5), -- 1=Mon..5=Fri
  period_number   SMALLINT    NOT NULL,                          -- 1..8
  start_time      TIME        NOT NULL,
  end_time        TIME        NOT NULL,
  room            VARCHAR(50),                                    -- "Room 4A", "Lab 1"
  slot_type       VARCHAR(20) NOT NULL DEFAULT 'lesson'
                  CHECK (slot_type IN ('lesson','break','assembly','games','games_sports','co_curriculum')),

  is_active       BOOLEAN NOT NULL DEFAULT true,
  generated_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(stream_id, day_of_week, period_number, academic_year, term)
);

-- Teacher conflict check view
CREATE VIEW teacher_timetable_conflicts AS
SELECT
  ts.teacher_id,
  ts.day_of_week,
  ts.period_number,
  ts.academic_year,
  ts.term,
  COUNT(*) AS conflict_count
FROM timetable_slots ts
WHERE ts.is_active = true
GROUP BY ts.teacher_id, ts.day_of_week, ts.period_number, ts.academic_year, ts.term
HAVING COUNT(*) > 1;

-- ============================================================
-- 7. ATTENDANCE
-- ============================================================
CREATE TABLE attendance_sessions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  stream_id       UUID NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
  subject_id      UUID REFERENCES subject_catalogue(id),         -- NULL = morning roll call
  teacher_id      UUID REFERENCES users(id),
  session_date    DATE NOT NULL,
  session_type    VARCHAR(20) NOT NULL DEFAULT 'morning'
                  CHECK (session_type IN ('morning','lesson','afternoon')),
  academic_year   VARCHAR(9)  NOT NULL,
  term            VARCHAR(10) NOT NULL,
  period_number   SMALLINT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(stream_id, session_date, session_type, period_number)
);

CREATE TABLE attendance_records (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id      UUID NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
  learner_id      UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  status          VARCHAR(20) NOT NULL DEFAULT 'present'
                  CHECK (status IN ('present','absent','late','excused','sick')),
  remarks         VARCHAR(255),
  recorded_by     UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(session_id, learner_id)
);

-- Attendance summary (materialized — refresh daily)
CREATE MATERIALIZED VIEW attendance_summary AS
SELECT
  ar.tenant_id,
  ar.learner_id,
  s.stream_id,
  s.academic_year,
  s.term,
  COUNT(*) FILTER (WHERE ar.status = 'present') AS days_present,
  COUNT(*) FILTER (WHERE ar.status = 'absent')  AS days_absent,
  COUNT(*) FILTER (WHERE ar.status = 'late')    AS days_late,
  COUNT(*) FILTER (WHERE ar.status = 'excused') AS days_excused,
  COUNT(*)                                       AS total_sessions,
  ROUND(
    COUNT(*) FILTER (WHERE ar.status IN ('present','late')) * 100.0 / NULLIF(COUNT(*),0), 1
  ) AS attendance_pct
FROM attendance_records ar
JOIN attendance_sessions s ON s.id = ar.session_id
GROUP BY ar.tenant_id, ar.learner_id, s.stream_id, s.academic_year, s.term;

CREATE UNIQUE INDEX idx_attendance_summary
  ON attendance_summary(tenant_id, learner_id, stream_id, academic_year, term);

-- ============================================================
-- 8. CONTINUOUS ASSESSMENT TESTS (CATs)
-- ============================================================
CREATE TABLE cats (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  stream_id       UUID NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
  subject_id      UUID NOT NULL REFERENCES subject_catalogue(id) ON DELETE CASCADE,
  teacher_id      UUID REFERENCES users(id),

  title           VARCHAR(255) NOT NULL,                         -- "CAT 1 — Fractions"
  cat_number      SMALLINT NOT NULL,                             -- 1, 2, 3
  max_score       NUMERIC(6,2) NOT NULL DEFAULT 30,
  academic_year   VARCHAR(9)  NOT NULL,
  term            VARCHAR(10) NOT NULL CHECK (term IN ('term_1','term_2','term_3')),
  cat_date        DATE,
  status          VARCHAR(20) NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','active','marked','published')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE cat_results (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cat_id          UUID NOT NULL REFERENCES cats(id) ON DELETE CASCADE,
  learner_id      UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  score           NUMERIC(6,2),
  remarks         TEXT,
  entered_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(cat_id, learner_id)
);

-- ============================================================
-- 9. EXAMS
-- ============================================================
CREATE TABLE exams (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  school_id       UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,

  name            VARCHAR(255) NOT NULL,                         -- "End of Term 1 Exams 2025"
  exam_type       VARCHAR(30)  NOT NULL
                  CHECK (exam_type IN ('end_of_term','mid_term','mock','kcpe','kcse','trial')),
  academic_year   VARCHAR(9)  NOT NULL,
  term            VARCHAR(10) NOT NULL CHECK (term IN ('term_1','term_2','term_3')),
  start_date      DATE,
  end_date        DATE,
  status          VARCHAR(20) NOT NULL DEFAULT 'planned'
                  CHECK (status IN ('planned','ongoing','marked','results_released')),
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE exam_papers (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  exam_id         UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  stream_id       UUID NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
  subject_id      UUID NOT NULL REFERENCES subject_catalogue(id) ON DELETE CASCADE,
  max_score       NUMERIC(6,2) NOT NULL DEFAULT 100,
  exam_date       DATE,
  exam_time       TIME,
  duration_mins   INTEGER DEFAULT 120,
  room            VARCHAR(100),
  invigilator_id  UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE exam_results (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  exam_paper_id   UUID NOT NULL REFERENCES exam_papers(id) ON DELETE CASCADE,
  learner_id      UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  score           NUMERIC(6,2),
  grade           VARCHAR(5),                                    -- A, B+, B, C+... or EE1, EE2...
  performance_level VARCHAR(30),                                 -- CBC performance level
  remarks         TEXT,                                          -- AI-generated or manual
  entered_by      UUID REFERENCES users(id),
  verified_by     UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(exam_paper_id, learner_id)
);

-- ============================================================
-- 10. CBC COMPETENCY TRACKING
-- ============================================================
CREATE TABLE competency_assessments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  learner_id      UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  teacher_id      UUID REFERENCES users(id),
  stream_id       UUID REFERENCES streams(id),
  subject_id      UUID REFERENCES subject_catalogue(id),

  competency      VARCHAR(50) NOT NULL CHECK (competency IN (
    'communication_collaboration','critical_thinking',
    'creativity_imagination','citizenship','digital_literacy',
    'learning_to_learn','self_efficacy'
  )),
  -- ECDE–Grade 6:   EE | ME | AE | BE
  -- Grade 7–12:     EE1|EE2|ME1|ME2|AE1|AE2|BE1|BE2
  performance_level VARCHAR(10) NOT NULL,
  evidence        TEXT,
  assessment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  academic_year   VARCHAR(9)  NOT NULL,
  term            VARCHAR(10) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(learner_id, competency, subject_id, academic_year, term)
);

-- ============================================================
-- 11. REPORT CARDS
-- ============================================================
CREATE TABLE report_cards (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  learner_id      UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  stream_id       UUID NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
  exam_id         UUID REFERENCES exams(id),

  academic_year   VARCHAR(9)  NOT NULL,
  term            VARCHAR(10) NOT NULL CHECK (term IN ('term_1','term_2','term_3')),

  -- Aggregates (computed and stored for fast rendering)
  total_marks     NUMERIC(8,2),
  average_score   NUMERIC(5,2),
  grade           VARCHAR(5),
  class_position  INTEGER,
  stream_size     INTEGER,
  attendance_pct  NUMERIC(5,2),
  days_present    INTEGER,
  days_absent     INTEGER,

  -- Narrative comments (AI-generated or manual)
  class_teacher_comment   TEXT,
  hoi_comment             TEXT,
  ai_generated_comment    TEXT,
  comment_approved        BOOLEAN NOT NULL DEFAULT false,
  approved_by             UUID REFERENCES users(id),

  status          VARCHAR(20) NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','generated','approved','published','printed')),
  published_at    TIMESTAMPTZ,
  generated_at    TIMESTAMPTZ,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(learner_id, academic_year, term)
);

CREATE TABLE report_card_subjects (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  report_card_id  UUID NOT NULL REFERENCES report_cards(id) ON DELETE CASCADE,
  subject_id      UUID NOT NULL REFERENCES subject_catalogue(id),

  -- Scores
  cat1_score      NUMERIC(6,2),
  cat2_score      NUMERIC(6,2),
  cat3_score      NUMERIC(6,2),
  cats_total      NUMERIC(6,2),
  exam_score      NUMERIC(6,2),
  total_score     NUMERIC(6,2),
  max_possible    NUMERIC(6,2) DEFAULT 100,

  -- CBC
  performance_level VARCHAR(10),
  grade           VARCHAR(5),
  subject_position INTEGER,

  -- Comments
  teacher_comment TEXT,
  ai_comment      TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 12. LEARNER PROGRESS RECORDS (CBC formative)
-- ============================================================
CREATE TABLE learner_progress_records (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  learner_id      UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  subject_id      UUID NOT NULL REFERENCES subject_catalogue(id),
  teacher_id      UUID REFERENCES users(id),
  stream_id       UUID REFERENCES streams(id),

  strand          VARCHAR(255),
  sub_strand      VARCHAR(255),
  slo             TEXT,                                          -- Specific Learning Outcome
  assessment_type VARCHAR(20) NOT NULL DEFAULT 'formative'
                  CHECK (assessment_type IN ('formative','summative')),
  performance_level VARCHAR(10) NOT NULL,
  observation     TEXT,
  assessment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  academic_year   VARCHAR(9) NOT NULL,
  term            VARCHAR(10) NOT NULL,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_learners_tenant_id     ON learners(tenant_id);
CREATE INDEX idx_learners_school_id     ON learners(school_id);
CREATE INDEX idx_learners_stream_id     ON learners(stream_id);
CREATE INDEX idx_learners_admission_no  ON learners(admission_number);
CREATE INDEX idx_learners_nemis         ON learners(nemis_number) WHERE nemis_number IS NOT NULL;
CREATE INDEX idx_learners_grade_year    ON learners(grade_level, academic_year);
CREATE INDEX idx_learners_status        ON learners(status);

CREATE INDEX idx_subjects_school_id     ON subject_catalogue(school_id);
CREATE INDEX idx_subjects_grade_band    ON subject_catalogue(grade_band);

CREATE INDEX idx_stream_subj_stream_id  ON stream_subjects(stream_id);
CREATE INDEX idx_teacher_alloc_teacher  ON teacher_allocations(teacher_id);
CREATE INDEX idx_teacher_alloc_stream   ON teacher_allocations(stream_id);

CREATE INDEX idx_timetable_stream_id    ON timetable_slots(stream_id);
CREATE INDEX idx_timetable_teacher_id   ON timetable_slots(teacher_id);
CREATE INDEX idx_timetable_day_period   ON timetable_slots(day_of_week, period_number);

CREATE INDEX idx_attend_session_date    ON attendance_sessions(session_date);
CREATE INDEX idx_attend_session_stream  ON attendance_sessions(stream_id);
CREATE INDEX idx_attend_records_learner ON attendance_records(learner_id);
CREATE INDEX idx_attend_records_session ON attendance_records(session_id);
CREATE INDEX idx_attend_records_status  ON attendance_records(status);

CREATE INDEX idx_cats_stream_subject    ON cats(stream_id, subject_id);
CREATE INDEX idx_cat_results_learner    ON cat_results(learner_id);
CREATE INDEX idx_cat_results_cat_id     ON cat_results(cat_id);

CREATE INDEX idx_exam_results_learner   ON exam_results(learner_id);
CREATE INDEX idx_exam_results_paper     ON exam_results(exam_paper_id);

CREATE INDEX idx_report_cards_learner   ON report_cards(learner_id);
CREATE INDEX idx_report_cards_year_term ON report_cards(academic_year, term);
CREATE INDEX idx_report_cards_status    ON report_cards(status);

CREATE INDEX idx_competency_learner     ON competency_assessments(learner_id);
CREATE INDEX idx_competency_type        ON competency_assessments(competency);
CREATE INDEX idx_progress_records_learn ON learner_progress_records(learner_id, subject_id);

-- ============================================================
-- RLS — Tenant Isolation (same pattern as Module 01)
-- ============================================================
ALTER TABLE learners                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE subject_catalogue         ENABLE ROW LEVEL SECURITY;
ALTER TABLE stream_subjects           ENABLE ROW LEVEL SECURITY;
ALTER TABLE learner_subjects          ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_allocations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE timetable_slots           ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_sessions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records        ENABLE ROW LEVEL SECURITY;
ALTER TABLE cats                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE cat_results               ENABLE ROW LEVEL SECURITY;
ALTER TABLE exams                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_papers               ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_results              ENABLE ROW LEVEL SECURITY;
ALTER TABLE competency_assessments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_cards              ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_card_subjects      ENABLE ROW LEVEL SECURITY;
ALTER TABLE learner_progress_records  ENABLE ROW LEVEL SECURITY;

DO $$ DECLARE tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'learners','subject_catalogue','stream_subjects','learner_subjects',
    'teacher_allocations','timetable_slots','attendance_sessions','attendance_records',
    'cats','cat_results','exams','exam_papers','exam_results',
    'competency_assessments','report_cards','report_card_subjects','learner_progress_records'
  ]) LOOP
    BEGIN
      EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_setting(''app.tenant_id'')::UUID)',
      tbl
    );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;

-- Updated_at triggers
DO $$ DECLARE tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'learners','subject_catalogue','teacher_allocations','timetable_slots',
    'cats','cat_results','exams','exam_results','report_cards','learner_progress_records'
  ]) LOOP
    BEGIN
      EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      replace(tbl,'-','_'), tbl
    );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;

-- ============================================================
-- KENYA CBC — DEFAULT SUBJECT CATALOGUE SEED
-- (Applied per school on onboarding; school_id filled dynamically)
-- ============================================================
-- Primary (Grade 1–6) core subjects
-- INSERT INTO subject_catalogue (tenant_id, school_id, name, code, category, grade_band) VALUES
-- ('...','...','Literacy Activities','LIT','core','ecde'),
-- ('...','...','Kiswahili Language Activities','KSW','core','ecde'),
-- ('...','...','English Language Activities','ENG','core','ecde'),
-- ('...','...','Mathematical Activities','MAT','core','ecde'),
-- ('...','...','Environmental Activities','ENV','core','ecde'),
-- ('...','...','Psychomotor & Creative Activities','PCA','core','ecde'),
-- ('...','...','Religious Education Activities','REL','core','ecde'),
-- English Language','ENG','core','primary'),
-- ('...','...','Kiswahili Language / KSL','KSW','core','primary'),
-- ('...','...','Mathematics','MAT','core','primary'),
-- ('...','...','Integrated Science','ISC','core','primary'),
-- ('...','...','Home Science','HSC','core','primary'),
-- ('...','...','Agriculture','AGR','core','primary'),
-- ('...','...','Social Studies','SST','core','primary'),
-- ('...','...','Religious Education','CRE','optional','primary'),
-- ('...','...','Creative Arts & Sports','CAS','core','primary'),
-- ('...','...','Music','MUS','activities','primary');
