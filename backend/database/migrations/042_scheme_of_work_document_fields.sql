-- ============================================================
-- Scheme of Work: document metadata + optional columns
-- Supports the full "Generate Scheme of Work" form (school/teacher/
-- TSC number/sign-off line/curriculum edition/start week/column
-- selection/default export font), not just the AI generation inputs.
-- ============================================================
ALTER TABLE schemes_of_work
  ADD COLUMN IF NOT EXISTS school_name        VARCHAR(255),
  ADD COLUMN IF NOT EXISTS teacher_name        VARCHAR(255),
  ADD COLUMN IF NOT EXISTS tsc_number          VARCHAR(50),
  ADD COLUMN IF NOT EXISTS sign_off_line       VARCHAR(255) DEFAULT 'Checked by D.H.O.I.',
  ADD COLUMN IF NOT EXISTS curriculum_edition  VARCHAR(255),
  ADD COLUMN IF NOT EXISTS start_week          SMALLINT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS columns             TEXT[],
  ADD COLUMN IF NOT EXISTS default_font        VARCHAR(50) DEFAULT 'Times New Roman';

-- Per-week core competencies / values / PCIs — optional, only populated when the
-- "Core competencies, values, PCIs" column is selected at generation time.
-- reflection_notes already exists on this table (migration 006).
ALTER TABLE scheme_weeks
  ADD COLUMN IF NOT EXISTS core_competencies TEXT[],
  ADD COLUMN IF NOT EXISTS values            TEXT[],
  ADD COLUMN IF NOT EXISTS pertinent_issues  TEXT;
