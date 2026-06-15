-- ============================================================
-- ZARODA SCHOOL MANAGEMENT SYSTEM
-- MODULE 05: Professional Records — Database Schema
-- Covers: Schemes of Work · Lesson Plans · Lesson Notes
--         Records of Work Covered · Learner Progress Records
--         Teacher Folder · Submission & HOI Approval Workflow
-- All KICD CBC/CBE aligned
-- Depends on: Module 01 (tenants, schools, users)
--             Module 02 (learners, streams, subject_catalogue,
--                        teacher_allocations)
-- ============================================================

-- ============================================================
-- 1. KICD CURRICULUM STRUCTURE
-- Strands → Sub-Strands → Specific Learning Outcomes (SLOs)
-- Seeded from KICD syllabus data per learning area
-- ============================================================
CREATE TABLE curriculum_strands (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subject_code    VARCHAR(20)  NOT NULL,           -- "ENG", "MAT", "ISC" etc.
  grade_level     VARCHAR(20)  NOT NULL,           -- "grade_4", "grade_7" etc.
  strand_number   VARCHAR(10)  NOT NULL,           -- "1", "2", "3"
  strand_name     VARCHAR(255) NOT NULL,           -- "Listening and Speaking"
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(subject_code, grade_level, strand_number)
);

CREATE TABLE curriculum_sub_strands (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  strand_id       UUID NOT NULL REFERENCES curriculum_strands(id) ON DELETE CASCADE,
  sub_strand_number VARCHAR(10) NOT NULL,          -- "1.1", "1.2"
  sub_strand_name   VARCHAR(255) NOT NULL,         -- "Oral Narratives"
  periods_suggested INTEGER DEFAULT 3,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(strand_id, sub_strand_number)
);

CREATE TABLE curriculum_slos (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sub_strand_id   UUID NOT NULL REFERENCES curriculum_sub_strands(id) ON DELETE CASCADE,
  slo_code        VARCHAR(20),                     -- "ENG.4.1.1.1"
  slo_text        TEXT NOT NULL,                   -- full SLO statement
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 2. SCHEMES OF WORK
-- One per teacher per learning area per term
-- ============================================================
CREATE TABLE schemes_of_work (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  school_id       UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  teacher_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stream_id       UUID NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
  subject_id      UUID NOT NULL REFERENCES subject_catalogue(id) ON DELETE CASCADE,

  academic_year   VARCHAR(9)   NOT NULL,           -- "2025/2026"
  term            VARCHAR(10)  NOT NULL CHECK (term IN ('term_1','term_2','term_3')),
  grade_level     VARCHAR(20)  NOT NULL,
  title           VARCHAR(255) NOT NULL,           -- "Grade 4 Mathematics Term 1 2025"

  -- AI generation metadata
  ai_generated    BOOLEAN NOT NULL DEFAULT false,
  ai_model        VARCHAR(50),                     -- "claude-sonnet-4-20250514"
  generation_prompt TEXT,                          -- stored for audit/regeneration
  generation_tokens INTEGER,

  -- Approval workflow
  status          VARCHAR(20)  NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','submitted','approved','rejected','revision_requested')),
  submitted_at    TIMESTAMPTZ,
  submitted_to    UUID REFERENCES users(id),       -- HOI / admin
  reviewed_by     UUID REFERENCES users(id),
  reviewed_at     TIMESTAMPTZ,
  review_comment  TEXT,

  -- Download
  pdf_url         TEXT,                            -- generated PDF stored here
  docx_url        TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,

  UNIQUE(teacher_id, stream_id, subject_id, academic_year, term)
);

-- ============================================================
-- 3. SCHEME OF WORK WEEKS (rows of the scheme)
-- ============================================================
CREATE TABLE scheme_weeks (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  scheme_id       UUID NOT NULL REFERENCES schemes_of_work(id) ON DELETE CASCADE,

  week_number     SMALLINT    NOT NULL,            -- 1 to ~14
  dates           VARCHAR(50),                     -- "Jan 13 – Jan 17, 2025"
  strand          VARCHAR(255) NOT NULL,
  sub_strand      VARCHAR(255) NOT NULL,
  specific_learning_outcomes TEXT NOT NULL,        -- SLOs for this week
  key_inquiry_questions TEXT,
  learning_experiences TEXT NOT NULL,             -- what learners do
  learning_resources TEXT,                        -- materials needed
  assessment_methods TEXT,                        -- how assessed
  reflection_notes TEXT,                          -- filled after delivery
  periods         SMALLINT NOT NULL DEFAULT 5,
  remarks         TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(scheme_id, week_number)
);

-- ============================================================
-- 4. LESSON PLANS
-- One per week per scheme (generated from scheme week)
-- ============================================================
CREATE TABLE lesson_plans (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  teacher_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scheme_id       UUID NOT NULL REFERENCES schemes_of_work(id) ON DELETE CASCADE,
  scheme_week_id  UUID REFERENCES scheme_weeks(id),
  stream_id       UUID NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
  subject_id      UUID NOT NULL REFERENCES subject_catalogue(id) ON DELETE CASCADE,

  lesson_date     DATE,
  lesson_number   SMALLINT,
  duration_minutes INTEGER DEFAULT 40,
  grade_level     VARCHAR(20) NOT NULL,

  -- Content (CBC lesson plan structure)
  strand          VARCHAR(255) NOT NULL,
  sub_strand      VARCHAR(255) NOT NULL,
  specific_learning_outcomes TEXT NOT NULL,
  key_inquiry_questions TEXT,
  core_competencies TEXT[],                       -- CBC core competencies targeted
  values          TEXT[],                         -- CBC values
  pertinent_issues TEXT,                          -- PCIs (Pertinent and Contemporary Issues)
  link_to_other_subjects TEXT,

  -- Lesson phases
  introduction    TEXT NOT NULL,                  -- set induction / intro activity
  lesson_development TEXT NOT NULL,               -- main activity
  conclusion      TEXT NOT NULL,                  -- summary / closure
  assessment      TEXT NOT NULL,                  -- how learning is assessed
  extended_activities TEXT,                       -- for fast learners
  support_activities TEXT,                        -- for struggling learners

  -- Resources
  learning_materials TEXT,
  reference_books TEXT,

  -- AI generation
  ai_generated    BOOLEAN NOT NULL DEFAULT false,
  ai_model        VARCHAR(50),

  -- Approval
  status          VARCHAR(20) NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','submitted','approved','rejected')),
  submitted_at    TIMESTAMPTZ,
  reviewed_by     UUID REFERENCES users(id),
  reviewed_at     TIMESTAMPTZ,
  review_comment  TEXT,

  pdf_url         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 5. LESSON NOTES
-- Teacher's actual delivery notes (generated from lesson plan)
-- ============================================================
CREATE TABLE lesson_notes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  teacher_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_plan_id  UUID NOT NULL REFERENCES lesson_plans(id) ON DELETE CASCADE,
  stream_id       UUID NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
  subject_id      UUID NOT NULL REFERENCES subject_catalogue(id) ON DELETE CASCADE,

  lesson_date     DATE NOT NULL,
  grade_level     VARCHAR(20) NOT NULL,
  topic           VARCHAR(255) NOT NULL,
  sub_topic       VARCHAR(255),

  -- Detailed teaching notes
  teacher_content TEXT NOT NULL,                  -- what teacher explains
  board_work      TEXT,                           -- what goes on board
  examples        TEXT,                           -- worked examples
  activities      TEXT NOT NULL,                  -- learner activities
  questions       TEXT,                           -- probing questions

  -- Formative assessment notes
  assessment_evidence TEXT,
  expected_responses TEXT,

  -- Actual delivery record
  actual_duration INTEGER,                        -- minutes actually used
  coverage_status VARCHAR(20) NOT NULL DEFAULT 'pending'
                  CHECK (coverage_status IN ('pending','covered','partially_covered','not_covered')),
  delivery_remarks TEXT,

  ai_generated    BOOLEAN NOT NULL DEFAULT false,
  ai_model        VARCHAR(50),
  pdf_url         TEXT,

  status          VARCHAR(20) NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','submitted','approved','rejected')),
  submitted_at    TIMESTAMPTZ,
  reviewed_by     UUID REFERENCES users(id),
  reviewed_at     TIMESTAMPTZ,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 6. RECORDS OF WORK COVERED
-- Running log of actual topics covered per class
-- ============================================================
CREATE TABLE records_of_work (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  teacher_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stream_id       UUID NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
  subject_id      UUID NOT NULL REFERENCES subject_catalogue(id) ON DELETE CASCADE,
  lesson_note_id  UUID REFERENCES lesson_notes(id),

  academic_year   VARCHAR(9)   NOT NULL,
  term            VARCHAR(10)  NOT NULL,
  week_number     SMALLINT     NOT NULL,
  lesson_date     DATE         NOT NULL,
  period_number   SMALLINT,

  topic           VARCHAR(255) NOT NULL,
  sub_topic       VARCHAR(255),
  strand          VARCHAR(255),
  sub_strand      VARCHAR(255),
  activities      TEXT,
  coverage_status VARCHAR(20)  NOT NULL DEFAULT 'covered'
                  CHECK (coverage_status IN ('covered','partially_covered','not_covered','postponed')),
  reason_if_not_covered TEXT,
  learner_count   SMALLINT,                       -- how many were present
  remarks         TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 7. LEARNER PROGRESS RECORDS (AI-generated per learner)
-- Formative assessment record per strand per term
-- ============================================================
CREATE TABLE learner_progress_entries (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  teacher_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  learner_id      UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  stream_id       UUID NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
  subject_id      UUID NOT NULL REFERENCES subject_catalogue(id) ON DELETE CASCADE,

  academic_year   VARCHAR(9)  NOT NULL,
  term            VARCHAR(10) NOT NULL,
  week_number     SMALLINT,

  strand          VARCHAR(255) NOT NULL,
  sub_strand      VARCHAR(255),
  slo_assessed    TEXT,                           -- specific SLO being assessed

  -- CBC performance level
  performance_level VARCHAR(10) NOT NULL,         -- EE|ME|AE|BE or EE1..BE2
  evidence        TEXT,                           -- what the learner did/said
  teacher_comment TEXT,
  support_needed  BOOLEAN NOT NULL DEFAULT false,
  support_type    TEXT,                           -- type of intervention if needed

  assessment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  ai_generated    BOOLEAN NOT NULL DEFAULT false,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 8. TEACHER FOLDER (download tracking)
-- Virtual folder of all generated documents per teacher
-- ============================================================
CREATE TABLE teacher_documents (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  teacher_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_type   VARCHAR(30)  NOT NULL CHECK (document_type IN (
    'scheme_of_work','lesson_plan','lesson_notes',
    'record_of_work','learner_progress_record','combined_folder'
  )),
  reference_id    UUID,                           -- points to source record
  title           VARCHAR(255) NOT NULL,
  file_url        TEXT NOT NULL,
  file_size_kb    INTEGER,
  academic_year   VARCHAR(9),
  term            VARCHAR(10),
  subject_name    VARCHAR(150),
  stream_name     VARCHAR(100),
  download_count  INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 9. PROFESSIONAL RECORDS AUDIT
-- Track all submissions and approvals
-- ============================================================
CREATE TABLE professional_records_audit (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  record_type     VARCHAR(30)  NOT NULL,           -- scheme_of_work | lesson_plan | lesson_notes
  record_id       UUID         NOT NULL,
  action          VARCHAR(30)  NOT NULL,           -- submitted | approved | rejected | revision_requested
  actor_id        UUID REFERENCES users(id),
  actor_role      VARCHAR(30),
  comment         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_sow_teacher_id       ON schemes_of_work(teacher_id);
CREATE INDEX idx_sow_stream_id        ON schemes_of_work(stream_id);
CREATE INDEX idx_sow_subject_id       ON schemes_of_work(subject_id);
CREATE INDEX idx_sow_status           ON schemes_of_work(status);
CREATE INDEX idx_sow_year_term        ON schemes_of_work(academic_year, term);

CREATE INDEX idx_scheme_weeks_scheme  ON scheme_weeks(scheme_id);

CREATE INDEX idx_lesson_plans_teacher ON lesson_plans(teacher_id);
CREATE INDEX idx_lesson_plans_scheme  ON lesson_plans(scheme_id);
CREATE INDEX idx_lesson_plans_date    ON lesson_plans(lesson_date DESC);
CREATE INDEX idx_lesson_plans_status  ON lesson_plans(status);

CREATE INDEX idx_lesson_notes_teacher ON lesson_notes(teacher_id);
CREATE INDEX idx_lesson_notes_plan    ON lesson_notes(lesson_plan_id);
CREATE INDEX idx_lesson_notes_date    ON lesson_notes(lesson_date DESC);

CREATE INDEX idx_row_teacher_stream   ON records_of_work(teacher_id, stream_id);
CREATE INDEX idx_row_year_term        ON records_of_work(academic_year, term);
CREATE INDEX idx_row_date             ON records_of_work(lesson_date DESC);

CREATE INDEX idx_lpe_learner          ON learner_progress_entries(learner_id);
CREATE INDEX idx_lpe_stream_subject   ON learner_progress_entries(stream_id, subject_id);
CREATE INDEX idx_lpe_year_term        ON learner_progress_entries(academic_year, term);

CREATE INDEX idx_teacher_docs_teacher ON teacher_documents(teacher_id);
CREATE INDEX idx_teacher_docs_type    ON teacher_documents(document_type);

CREATE INDEX idx_pr_audit_record      ON professional_records_audit(record_type, record_id);
CREATE INDEX idx_pr_audit_actor       ON professional_records_audit(actor_id);

-- Curriculum indexes
CREATE INDEX idx_strands_subject      ON curriculum_strands(subject_code, grade_level);
CREATE INDEX idx_sub_strands_strand   ON curriculum_sub_strands(strand_id);
CREATE INDEX idx_slos_sub_strand      ON curriculum_slos(sub_strand_id);

-- ============================================================
-- RLS
-- ============================================================
DO $$ DECLARE tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'schemes_of_work','scheme_weeks','lesson_plans','lesson_notes',
    'records_of_work','learner_progress_entries',
    'teacher_documents','professional_records_audit'
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
    'schemes_of_work','lesson_plans','lesson_notes',
    'records_of_work','learner_progress_entries'
  ]) LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      replace(tbl,'-','_'), tbl
    );
  END LOOP;
END $$;
