-- ============================================================
-- Individual teacher accounts (Professional Records without a school)
-- A teacher whose school isn't a ZARODA tenant can still sign up and use
-- Professional Records. Each such signup gets its own one-person tenant +
-- school (auto-provisioned), marked account_type='individual' so the rest
-- of the app can skip school-only workflows (subscription trial, HOI
-- approval, teacher/subject assignment checks) for it.
-- ============================================================
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS account_type VARCHAR(20) NOT NULL DEFAULT 'school'
    CHECK (account_type IN ('school', 'individual'));

CREATE INDEX IF NOT EXISTS idx_tenants_account_type ON tenants(account_type);
