-- ============================================================
-- MODULE 36: School ownership — public vs private
-- Private schools may have a non-teaching "School Owner" (tenant_owner)
-- account for a proprietor who isn't part of the teaching staff. Public
-- schools are run by a Head of Institution (hoi) and have no such role —
-- this column is what onboarding and staff-creation gate that on.
-- ============================================================

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS ownership VARCHAR(10) NOT NULL DEFAULT 'public';

DO $$ BEGIN
  ALTER TABLE tenants ADD CONSTRAINT tenants_ownership_check CHECK (ownership IN ('public','private'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
