-- ============================================================
-- ZARODA SMS — Demo Seed Script
-- Run this AFTER all migrations to create demo accounts
-- ============================================================
-- Usage (Windows PowerShell):
--   psql -U zaroda_app -d zaroda_sms -f seed_demo.sql
-- ============================================================

-- ── 1. Demo Tenant (School) ───────────────────────────────
INSERT INTO tenants (
  id, name, status, subscription_tier, trial_ends_at,
  county, sub_county, zone,
  ke_county_id, ke_sub_county_id,
  location_verified, created_at, updated_at
) VALUES (
  'aaaaaaaa-0000-0000-0000-000000000001',
  'Starlight Primary School',
  'active',
  'growth',
  NOW() + INTERVAL '365 days',
  'Nairobi', 'Westlands', 'Westlands Zone A',
  47, 1,
  true,
  NOW(), NOW()
) ON CONFLICT (id) DO NOTHING;

-- ── 2. Demo School ────────────────────────────────────────
INSERT INTO schools (
  id, tenant_id, name, phone, address, knec_code,
  county, sub_county, zone,
  created_at
) VALUES (
  'bbbbbbbb-0000-0000-0000-000000000001',
  'aaaaaaaa-0000-0000-0000-000000000001',
  'Starlight Primary School',
  '+254700000000',
  'P.O. Box 1234, Westlands, Nairobi',
  'NBI001',
  'Nairobi', 'Westlands', 'Westlands Zone A',
  NOW()
) ON CONFLICT (id) DO NOTHING;

-- ── 3. Demo Streams ───────────────────────────────────────
INSERT INTO streams (
  id, tenant_id, school_id, name, grade_level,
  learners_count, academic_year, created_at
) VALUES
  ('cccccccc-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000001',
   'Grade 4 North', 'grade_4', 28, '2025/2026', NOW()),
  ('cccccccc-0000-0000-0000-000000000002',
   'aaaaaaaa-0000-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000001',
   'Grade 4 South', 'grade_4', 31, '2025/2026', NOW()),
  ('cccccccc-0000-0000-0000-000000000003',
   'aaaaaaaa-0000-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000001',
   'Grade 7 East', 'grade_7', 35, '2025/2026', NOW())
ON CONFLICT (id) DO NOTHING;

-- ── 4. Demo Users ─────────────────────────────────────────
-- ALL passwords are:  Demo@1234
-- bcrypt hash of "Demo@1234" with salt rounds 12:
DO $$
DECLARE
  demo_password TEXT := '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGX6Q0pKxLN9d5A7fJ8K3qZ0Y6i';
  -- Note: generate fresh hash with:
  -- node -e "const b=require('bcrypt');b.hash('Demo@1234',12).then(console.log)"
BEGIN

-- HOI (Head of Institution) — full access
INSERT INTO users (
  id, email, password_hash, first_name, last_name, phone,
  role, tenant_id, school_id, stream_id, stream_name,
  is_active, email_verified, created_at, updated_at
) VALUES (
  'dddddddd-0000-0000-0000-000000000001',
  'hoi@demo.zaroda.app',
  demo_password,
  'Grace', 'Wanjiru', '+254711000001',
  'hoi',
  'aaaaaaaa-0000-0000-0000-000000000001',
  'bbbbbbbb-0000-0000-0000-000000000001',
  NULL, NULL,
  true, true, NOW(), NOW()
) ON CONFLICT (id) DO NOTHING;

-- Class Teacher — Grade 4 North
INSERT INTO users (
  id, email, password_hash, first_name, last_name, phone,
  role, tenant_id, school_id, stream_id, stream_name,
  is_active, email_verified, created_at, updated_at
) VALUES (
  'dddddddd-0000-0000-0000-000000000002',
  'teacher@demo.zaroda.app',
  demo_password,
  'John', 'Kamau', '+254711000002',
  'class_teacher',
  'aaaaaaaa-0000-0000-0000-000000000001',
  'bbbbbbbb-0000-0000-0000-000000000001',
  'cccccccc-0000-0000-0000-000000000001',
  'Grade 4 North',
  true, true, NOW(), NOW()
) ON CONFLICT (id) DO NOTHING;

-- Bursar
INSERT INTO users (
  id, email, password_hash, first_name, last_name, phone,
  role, tenant_id, school_id, stream_id, stream_name,
  is_active, email_verified, created_at, updated_at
) VALUES (
  'dddddddd-0000-0000-0000-000000000003',
  'bursar@demo.zaroda.app',
  demo_password,
  'Mary', 'Otieno', '+254711000003',
  'bursar',
  'aaaaaaaa-0000-0000-0000-000000000001',
  'bbbbbbbb-0000-0000-0000-000000000001',
  NULL, NULL,
  true, true, NOW(), NOW()
) ON CONFLICT (id) DO NOTHING;

-- Parent
INSERT INTO users (
  id, email, password_hash, first_name, last_name, phone,
  role, tenant_id, school_id, stream_id, stream_name,
  is_active, email_verified, created_at, updated_at
) VALUES (
  'dddddddd-0000-0000-0000-000000000004',
  'parent@demo.zaroda.app',
  demo_password,
  'James', 'Mwangi', '+254711000004',
  'parent',
  'aaaaaaaa-0000-0000-0000-000000000001',
  'bbbbbbbb-0000-0000-0000-000000000001',
  NULL, NULL,
  true, true, NOW(), NOW()
) ON CONFLICT (id) DO NOTHING;

END $$;

-- ── 5. Update streams with teacher names ──────────────────
UPDATE streams
SET class_teacher_id   = 'dddddddd-0000-0000-0000-000000000002',
    class_teacher_name = 'John Kamau'
WHERE id = 'cccccccc-0000-0000-0000-000000000001';

-- ── 6. Demo Learners (Grade 4 North) ─────────────────────
INSERT INTO learners (
  id, tenant_id, stream_id, grade_level,
  first_name, last_name, admission_number, gender,
  guardian_name, guardian_phone, guardian_email,
  is_active, created_at
) VALUES
  (gen_random_uuid(),'aaaaaaaa-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001','grade_4','Amina','Hassan','2025001','female','Hassan Omar','+254722001001','hassan@email.com',true,NOW()),
  (gen_random_uuid(),'aaaaaaaa-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001','grade_4','Brian','Ochieng','2025002','male','Peter Ochieng','+254722001002','peter@email.com',true,NOW()),
  (gen_random_uuid(),'aaaaaaaa-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001','grade_4','Cynthia','Wambua','2025003','female','Joseph Wambua','+254722001003','joseph@email.com',true,NOW()),
  (gen_random_uuid(),'aaaaaaaa-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001','grade_4','David','Kiprotich','2025004','male','Samuel Kiprotich','+254722001004','samuel@email.com',true,NOW()),
  (gen_random_uuid(),'aaaaaaaa-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001','grade_4','Elizabeth','Njeri','2025005','female','Charles Njeri','+254722001005','charles@email.com',true,NOW()),
  (gen_random_uuid(),'aaaaaaaa-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001','grade_4','Francis','Mutua','2025006','male','Daniel Mutua','+254722001006','daniel@email.com',true,NOW()),
  (gen_random_uuid(),'aaaaaaaa-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001','grade_4','Grace','Akinyi','2025007','female','Michael Akinyi','+254722001007','michael@email.com',true,NOW()),
  (gen_random_uuid(),'aaaaaaaa-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001','grade_4','Henry','Maina','2025008','male','George Maina','+254722001008','george@email.com',true,NOW()),
  (gen_random_uuid(),'aaaaaaaa-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001','grade_4','Irene','Chebet','2025009','female','Robert Chebet','+254722001009','robert@email.com',true,NOW()),
  (gen_random_uuid(),'aaaaaaaa-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001','grade_4','James','Otieno','2025010','male','Patrick Otieno','+254722001010','patrick@email.com',true,NOW())
ON CONFLICT DO NOTHING;

-- ── 7. Demo Library Books ─────────────────────────────────
INSERT INTO library_books (
  id, tenant_id, title, author, accession_number, barcode, is_available, created_at
) VALUES
  (gen_random_uuid(),'aaaaaaaa-0000-0000-0000-000000000001','Mathematics Grade 4','Kenya Literature Bureau','LIB-2025-0001','ZARLIB20250001',true,NOW()),
  (gen_random_uuid(),'aaaaaaaa-0000-0000-0000-000000000001','English Activity Book Grade 4','Oxford University Press','LIB-2025-0002','ZARLIB20250002',true,NOW()),
  (gen_random_uuid(),'aaaaaaaa-0000-0000-0000-000000000001','Kiswahili Darasa la 4','KLB','LIB-2025-0003','ZARLIB20250003',true,NOW()),
  (gen_random_uuid(),'aaaaaaaa-0000-0000-0000-000000000001','Science and Technology Grade 4','Longhorn','LIB-2025-0004','ZARLIB20250004',false,NOW()),
  (gen_random_uuid(),'aaaaaaaa-0000-0000-0000-000000000001','Social Studies Grade 4','Mentor','LIB-2025-0005','ZARLIB20250005',true,NOW())
ON CONFLICT DO NOTHING;

-- ── 8. Verify seed worked ──────────────────────────────────
SELECT '✓ Tenants'  AS check, COUNT(*) AS count FROM tenants  WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'
UNION ALL
SELECT '✓ Schools',  COUNT(*) FROM schools  WHERE tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001'
UNION ALL
SELECT '✓ Streams',  COUNT(*) FROM streams  WHERE tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001'
UNION ALL
SELECT '✓ Users',    COUNT(*) FROM users    WHERE tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001'
UNION ALL
SELECT '✓ Learners', COUNT(*) FROM learners WHERE tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001'
UNION ALL
SELECT '✓ Books',    COUNT(*) FROM library_books WHERE tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001';
