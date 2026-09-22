-- Data Protection Act 2019 (Kenya) — Phase 1: read-audit + retention.
--
-- Two obligations this covers. First, a school is a data controller holding
-- minors' personal data (date of birth, birth certificate number, guardian ID
-- number) and must be able to show WHO LOOKED AT a record, not just who changed
-- it — audit_logs already existed for writes but nothing read-side used it.
-- Second, personal data may not be kept indefinitely: each category needs a
-- stated retention period and an actual purge.

-- ── 1. Read-side audit ──────────────────────────────────────
-- audit_logs is declared in migration 001, but 001 is recorded as applied on
-- databases where this table is absent — so it is recreated here rather than
-- assumed. Without this, the ALTERs below abort the whole migration.
CREATE TABLE IF NOT EXISTS audit_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID REFERENCES tenants(id) ON DELETE SET NULL,
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  action      VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100),
  entity_id   UUID,
  old_values  JSONB,
  new_values  JSONB,
  ip_address  INET,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Reads are much higher volume than writes, so they get two columns of their
-- own rather than being stuffed into new_values.
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS record_count INT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS route        TEXT;

-- Reads are queried "what happened in this tenant lately", so lead on tenant.
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_action_at
  ON audit_logs(tenant_id, action, created_at DESC);

-- ── 2. Retention columns on learners ────────────────────────
-- The deployed learners table drifts between environments (dev is built by
-- TypeORM synchronize from the entity, production by these migrations), so the
-- personal-data columns the purge clears are reconciled here before anything
-- relies on them. All are declared in migration 003 or 011; this only fills in
-- whichever an environment is missing.
ALTER TABLE learners ADD COLUMN IF NOT EXISTS special_needs TEXT;
ALTER TABLE learners ADD COLUMN IF NOT EXISTS photo_url     TEXT;
ALTER TABLE learners ADD COLUMN IF NOT EXISTS nationality   VARCHAR(50);

-- anonymised_at is set when a learner's identifiers have been stripped. It is
-- what makes the purge idempotent, and it distinguishes "no guardian phone was
-- ever captured" from "one was captured and has since expired".
ALTER TABLE learners ADD COLUMN IF NOT EXISTS anonymised_at TIMESTAMPTZ;

-- The retention clock runs from when a learner LEFT, which nothing recorded
-- until now — admission_date and created_at both describe arrival, and using
-- either would make a long-enrolled learner purgeable the moment they left.
ALTER TABLE learners ADD COLUMN IF NOT EXISTS exited_at TIMESTAMPTZ;

-- Backfill learners already marked as gone. NOW() is deliberate rather than a
-- guess at the real exit date: it starts every existing record's clock today,
-- so the first purge can never reach back and anonymise someone who left
-- recently but enrolled years ago.
UPDATE learners SET exited_at = NOW()
 WHERE exited_at IS NULL
   AND status IN ('transferred','completed','withdrawn','deceased');

CREATE INDEX IF NOT EXISTS idx_learners_retention_sweep
  ON learners(tenant_id, exited_at)
  WHERE anonymised_at IS NULL AND exited_at IS NOT NULL;

-- Keep exited_at current from here on. A trigger rather than application code:
-- status is updated from several places (bulk transfer, edit, deactivate), and
-- a retention clock that silently fails to start is worse than none at all.
CREATE OR REPLACE FUNCTION learners_stamp_exited_at() RETURNS TRIGGER AS $fn$
BEGIN
  IF NEW.status IN ('transferred','completed','withdrawn','deceased') THEN
    IF NEW.exited_at IS NULL THEN NEW.exited_at := NOW(); END IF;
  ELSE
    -- Re-admitted: stop the clock so they are not anonymised while enrolled.
    NEW.exited_at := NULL;
  END IF;
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_learners_exited_at ON learners;
CREATE TRIGGER trg_learners_exited_at
  BEFORE INSERT OR UPDATE OF status ON learners
  FOR EACH ROW EXECUTE FUNCTION learners_stamp_exited_at();

-- ── 3. Retention policies ───────────────────────────────────
-- One row per data category per tenant. retention_months counts from the
-- anchor date for that category (see compliance.module.ts for the anchors).
-- A NULL retention_months means "keep indefinitely" and is used for categories
-- a school is legally required to retain, so the UI can show them as locked
-- rather than pretending they are purgeable.
CREATE TABLE IF NOT EXISTS data_retention_policies (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  category          VARCHAR(60) NOT NULL,   -- alumni_learners | attendance | audit_logs | ...
  retention_months  INT,                    -- NULL = retain indefinitely (statutory)
  is_statutory      BOOLEAN NOT NULL DEFAULT FALSE,
  last_purged_at    TIMESTAMPTZ,
  last_purged_count INT,
  updated_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, category)
);

CREATE INDEX IF NOT EXISTS idx_retention_policies_tenant
  ON data_retention_policies(tenant_id);

-- Seed every existing tenant with the defaults. Academic records are marked
-- statutory: a school cannot lawfully destroy them on request, so an erasure
-- flow must refuse rather than silently drop them.
INSERT INTO data_retention_policies (tenant_id, category, retention_months, is_statutory)
SELECT t.id, d.category, d.months, d.statutory
FROM tenants t
CROSS JOIN (VALUES
  ('alumni_learners',   84,   FALSE),  -- 7 years after a learner exits
  ('attendance',        36,   FALSE),
  ('audit_logs',        24,   FALSE),
  ('academic_results',  NULL, TRUE),   -- statutory: never auto-purged
  ('financial_records', 60,   TRUE)    -- KRA requires 5 years; not user-shortenable
) AS d(category, months, statutory)
ON CONFLICT (tenant_id, category) DO NOTHING;
