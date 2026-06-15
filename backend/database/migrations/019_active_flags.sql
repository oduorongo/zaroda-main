-- ============================================================
-- ZARODA SMS — is_active flags for deactivate (vs delete)
-- ============================================================
ALTER TABLE learners ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE users    ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
