-- ============================================================
-- Grade 10 Senior School Selection — Parent/Guardian consent form
-- Digital version of the paper "Grade 10 Senior School Selection
-- Parent/Guardian Consultation and Consent Form": parents of
-- current Grade 9 learners submit career interest, pathway,
-- subject combination and 8 senior-school choices online.
-- ============================================================
CREATE TABLE IF NOT EXISTS senior_selection_forms (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  school_id          UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  learner_id         UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,

  -- Section B: parent/guardian details
  guardian_name      VARCHAR(255) NOT NULL,
  guardian_id_number VARCHAR(50),
  relationship       VARCHAR(50),
  phone_primary      VARCHAR(20) NOT NULL,
  phone_alternative  VARCHAR(20),
  address            TEXT,

  -- Section C: career interest and pathway
  career_interest    TEXT,
  pathway            VARCHAR(40) CHECK (pathway IN (
    'pure_sciences','applied_sciences','technical_studies',
    'languages_and_literature','humanities_and_business_studies',
    'fine_arts_theatre_film','sports_and_recreation'
  )),

  -- Section D: subject combination (3 subjects each)
  combination_1      JSONB NOT NULL DEFAULT '[]',
  combination_2      JSONB NOT NULL DEFAULT '[]',

  -- Section E: eight senior school choices
  -- [{category:'C1'|'C2'|'C3'|'C4', name, schoolCode, subcounty, boardingDay, gender, combination}]
  schools            JSONB NOT NULL DEFAULT '[]',

  -- Section F: declaration and consent (digital signature)
  consent_confirmed  BOOLEAN NOT NULL DEFAULT false,
  consent_at         TIMESTAMPTZ,

  -- Workflow / "FOR SCHOOL USE ONLY"
  status             VARCHAR(20) NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','submitted','keyed_in')),
  submitted_at       TIMESTAMPTZ,
  received_at        TIMESTAMPTZ,
  keyed_by           UUID REFERENCES users(id),
  keyed_at           TIMESTAMPTZ,

  created_by         UUID NOT NULL REFERENCES users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at         TIMESTAMPTZ,

  UNIQUE(tenant_id, learner_id)
);

CREATE INDEX IF NOT EXISTS idx_senior_selection_tenant  ON senior_selection_forms(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_senior_selection_learner ON senior_selection_forms(learner_id);

DO $$ BEGIN
  ALTER TABLE senior_selection_forms ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY tenant_isolation ON senior_selection_forms
    USING (tenant_id = current_setting('app.tenant_id')::UUID);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_senior_selection_forms_updated_at BEFORE UPDATE ON senior_selection_forms
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
