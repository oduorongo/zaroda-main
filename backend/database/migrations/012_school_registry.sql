-- ============================================================
-- ZARODA SMS — KNEC School Registry
-- A lookup table of registered schools keyed by KNEC code.
-- Signup looks up this table to auto-fill school details.
-- Load the official KNEC school list into this table.
-- Usage: psql -U zaroda_app -d zaroda_sms -f 012_school_registry.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS knec_school_registry (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  knec_code    VARCHAR(20) UNIQUE NOT NULL,    -- the unique identifier
  name         VARCHAR(200) NOT NULL,
  level        VARCHAR(40),                    -- Primary / Junior / Secondary / Comprehensive
  county       VARCHAR(80),
  sub_county   VARCHAR(80),
  zone         VARCHAR(80),
  category     VARCHAR(60),                    -- Public / Private
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_knec_registry_code ON knec_school_registry(knec_code);
CREATE INDEX IF NOT EXISTS idx_knec_registry_name ON knec_school_registry(name);

-- Make KNEC code the unique tenant identifier (one school = one tenant)
ALTER TABLE tenants  ADD COLUMN IF NOT EXISTS knec_code VARCHAR(20);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenants_knec ON tenants(knec_code) WHERE knec_code IS NOT NULL;

-- ── Sample registry rows (replace with the official KNEC list) ──
INSERT INTO knec_school_registry (knec_code, name, level, county, sub_county, zone, category) VALUES
  ('44736226', 'Manyonge Comprehensive School',     'Comprehensive', 'Migori',  'Suna East',  'Central',   'Public'),
  ('01100101', 'Starlight Primary School',          'Primary',       'Nairobi', 'Westlands',  'Westlands', 'Private'),
  ('01100102', 'Nairobi Junior Academy',            'Junior',        'Nairobi', 'Dagoretti',  'Kawangware','Private'),
  ('20400305', 'Mombasa Comprehensive School',      'Comprehensive', 'Mombasa', 'Mvita',      'Old Town',  'Public'),
  ('30700412', 'Kisumu Hill Primary',               'Primary',       'Kisumu',  'Kisumu East','Kajulu',    'Public'),
  ('11500208', 'Nakuru West Secondary',             'Secondary',     'Nakuru',  'Nakuru Town West','London','Public')
ON CONFLICT (knec_code) DO NOTHING;
