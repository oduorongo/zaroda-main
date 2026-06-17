-- ============================================================
-- ZARODA SCHOOL MANAGEMENT SYSTEM
-- LOCATION UPGRADE — Migration
-- Adds: county · sub-county · zone to tenants, schools,
--       invite_signups for marketing targeting
-- Includes: All 47 Kenya counties seeded
-- ============================================================

-- ============================================================
-- 1. KENYA LOCATION REFERENCE TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS ke_counties (
  id        SMALLSERIAL PRIMARY KEY,
  code      VARCHAR(5)   NOT NULL UNIQUE,
  name      VARCHAR(100) NOT NULL UNIQUE,
  region    VARCHAR(30)  NOT NULL
);

CREATE TABLE IF NOT EXISTS ke_sub_counties (
  id         SMALLSERIAL PRIMARY KEY,
  county_id  SMALLINT    NOT NULL REFERENCES ke_counties(id),
  name       VARCHAR(150) NOT NULL,
  UNIQUE(county_id, name)
);

CREATE TABLE IF NOT EXISTS ke_zones (
  id             SMALLSERIAL PRIMARY KEY,
  sub_county_id  SMALLINT    NOT NULL REFERENCES ke_sub_counties(id),
  name           VARCHAR(150) NOT NULL,
  UNIQUE(sub_county_id, name)
);

-- ============================================================
-- 2. ADD LOCATION COLUMNS TO TENANTS
-- ============================================================

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS zone               VARCHAR(150),
  ADD COLUMN IF NOT EXISTS ke_county_id       SMALLINT REFERENCES ke_counties(id),
  ADD COLUMN IF NOT EXISTS ke_sub_county_id   SMALLINT REFERENCES ke_sub_counties(id),
  ADD COLUMN IF NOT EXISTS ke_zone_id         SMALLINT REFERENCES ke_zones(id),
  ADD COLUMN IF NOT EXISTS location_verified  BOOLEAN NOT NULL DEFAULT false;

-- ============================================================
-- 3. ADD LOCATION COLUMNS TO SCHOOLS
-- ============================================================

ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS zone               VARCHAR(150),
  ADD COLUMN IF NOT EXISTS ke_county_id       SMALLINT REFERENCES ke_counties(id),
  ADD COLUMN IF NOT EXISTS ke_sub_county_id   SMALLINT REFERENCES ke_sub_counties(id),
  ADD COLUMN IF NOT EXISTS ke_zone_id         SMALLINT REFERENCES ke_zones(id);

-- ============================================================
-- 4. ADD LOCATION COLUMNS TO INVITE_SIGNUPS
-- (geo-tags every lead at the moment of capture)
-- ============================================================

ALTER TABLE invite_signups
  ADD COLUMN IF NOT EXISTS county             VARCHAR(100),
  ADD COLUMN IF NOT EXISTS sub_county         VARCHAR(100),
  ADD COLUMN IF NOT EXISTS zone               VARCHAR(150),
  ADD COLUMN IF NOT EXISTS ke_county_id       SMALLINT REFERENCES ke_counties(id),
  ADD COLUMN IF NOT EXISTS ke_sub_county_id   SMALLINT REFERENCES ke_sub_counties(id),
  ADD COLUMN IF NOT EXISTS ke_zone_id         SMALLINT REFERENCES ke_zones(id);

-- ============================================================
-- 5. MARKETING PIPELINE VIEW (super admin only)
-- Aggregates signup funnel by location
-- ============================================================

CREATE MATERIALIZED VIEW mv_signup_pipeline AS
SELECT
  COALESCE(s.county,     t.county,     'Unknown') AS county,
  COALESCE(s.sub_county, t.sub_county, 'Unknown') AS sub_county,
  COALESCE(s.zone,                     'Unknown') AS zone,
  c.name  AS ke_county_name,
  sc.name AS ke_sub_county_name,
  z.name  AS ke_zone_name,
  COUNT(*)                                         AS total_signups,
  COUNT(*) FILTER (WHERE t.id IS NOT NULL)         AS converted_to_tenant,
  COUNT(*) FILTER (WHERE t.status = 'trial')       AS on_trial,
  COUNT(*) FILTER (WHERE t.status = 'active')      AS paying,
  COUNT(*) FILTER (WHERE t.status = 'cancelled')   AS churned,
  COUNT(*) FILTER (WHERE s.invite_id IS NOT NULL)  AS from_invite,
  MIN(s.signed_up_at) AS first_signup,
  MAX(s.signed_up_at) AS latest_signup
FROM invite_signups s
LEFT JOIN tenants t        ON t.id  = s.tenant_id
LEFT JOIN ke_counties c    ON c.id  = s.ke_county_id
LEFT JOIN ke_sub_counties sc ON sc.id = s.ke_sub_county_id
LEFT JOIN ke_zones z       ON z.id  = s.ke_zone_id
GROUP BY
  COALESCE(s.county,     t.county,     'Unknown'),
  COALESCE(s.sub_county, t.sub_county, 'Unknown'),
  COALESCE(s.zone,                     'Unknown'),
  c.name, sc.name, z.name;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_signup_pipeline
  ON mv_signup_pipeline(county, sub_county, zone);

-- Refresh after each signup:
-- REFRESH MATERIALIZED VIEW CONCURRENTLY mv_signup_pipeline;

-- ============================================================
-- 6. INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_tenants_county       ON tenants(ke_county_id);
CREATE INDEX IF NOT EXISTS idx_tenants_subcounty    ON tenants(ke_sub_county_id);
CREATE INDEX IF NOT EXISTS idx_tenants_zone         ON tenants(ke_zone_id);
CREATE INDEX IF NOT EXISTS idx_schools_county       ON schools(ke_county_id);
CREATE INDEX IF NOT EXISTS idx_schools_subcounty    ON schools(ke_sub_county_id);
CREATE INDEX IF NOT EXISTS idx_schools_zone         ON schools(ke_zone_id);
CREATE INDEX IF NOT EXISTS idx_signups_county       ON invite_signups(ke_county_id);
CREATE INDEX IF NOT EXISTS idx_signups_subcounty    ON invite_signups(ke_sub_county_id);
CREATE INDEX IF NOT EXISTS idx_signups_zone         ON invite_signups(ke_zone_id);

-- ============================================================
-- 7. SEED: All 47 Kenya Counties
-- ============================================================

INSERT INTO ke_counties (code, name, region) VALUES
('001','Mombasa',       'Coast'),
('002','Kwale',         'Coast'),
('003','Kilifi',        'Coast'),
('004','Tana River',    'Coast'),
('005','Lamu',          'Coast'),
('006','Taita-Taveta',  'Coast'),
('007','Garissa',       'North Eastern'),
('008','Wajir',         'North Eastern'),
('009','Mandera',       'North Eastern'),
('010','Marsabit',      'Eastern'),
('011','Isiolo',        'Eastern'),
('012','Meru',          'Eastern'),
('013','Tharaka-Nithi', 'Eastern'),
('014','Embu',          'Eastern'),
('015','Kitui',         'Eastern'),
('016','Machakos',      'Eastern'),
('017','Makueni',       'Eastern'),
('018','Nyandarua',     'Central'),
('019','Nyeri',         'Central'),
('020','Kirinyaga',     'Central'),
('021','Murang''a',     'Central'),
('022','Kiambu',        'Central'),
('023','Turkana',       'Rift Valley'),
('024','West Pokot',    'Rift Valley'),
('025','Samburu',       'Rift Valley'),
('026','Trans-Nzoia',   'Rift Valley'),
('027','Uasin Gishu',   'Rift Valley'),
('028','Elgeyo-Marakwet','Rift Valley'),
('029','Nandi',         'Rift Valley'),
('030','Baringo',       'Rift Valley'),
('031','Laikipia',      'Rift Valley'),
('032','Nakuru',        'Rift Valley'),
('033','Narok',         'Rift Valley'),
('034','Kajiado',       'Rift Valley'),
('035','Kericho',       'Rift Valley'),
('036','Bomet',         'Rift Valley'),
('037','Kakamega',      'Western'),
('038','Vihiga',        'Western'),
('039','Bungoma',       'Western'),
('040','Busia',         'Western'),
('041','Siaya',         'Nyanza'),
('042','Kisumu',        'Nyanza'),
('043','Homa Bay',      'Nyanza'),
('044','Migori',        'Nyanza'),
('045','Kisii',         'Nyanza'),
('046','Nyamira',       'Nyanza'),
('047','Nairobi',       'Nairobi')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 8. SEED: Nairobi Sub-Counties (complete example)
-- Seed all other counties' sub-counties from MoE gazettement
-- ============================================================

INSERT INTO ke_sub_counties (county_id, name)
SELECT c.id, sc.name FROM ke_counties c
CROSS JOIN (VALUES
  ('Westlands'),('Dagoretti North'),('Dagoretti South'),
  ('Lang''ata'),('Kibra'),('Roysambu'),('Kasarani'),
  ('Ruaraka'),('Embakasi South'),('Embakasi North'),
  ('Embakasi Central'),('Embakasi East'),('Embakasi West'),
  ('Makadara'),('Kamukunji'),('Starehe'),('Mathare')
) AS sc(name)
WHERE c.name = 'Nairobi'
ON CONFLICT DO NOTHING;

-- ============================================================
-- 9. SEED: Sample zones (Westlands example)
-- Seed full zone list from MoE school zones gazettement
-- ============================================================

INSERT INTO ke_zones (sub_county_id, name)
SELECT sc.id, z.name FROM ke_sub_counties sc
CROSS JOIN (VALUES
  ('Westlands Zone A'),('Westlands Zone B'),('Westlands Zone C')
) AS z(name)
WHERE sc.name = 'Westlands'
  AND sc.county_id = (SELECT id FROM ke_counties WHERE name = 'Nairobi')
ON CONFLICT DO NOTHING;
