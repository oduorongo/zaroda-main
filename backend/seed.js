// ============================================================
// ZARODA SMS — Demo Seed Script (Node.js)
// Generates correct bcrypt hashes and inserts all demo data
// ============================================================
// Usage:
//   cd backend
//   node seed.js
// ============================================================

const { Client } = require('pg');
const bcrypt     = require('bcryptjs');
require('dotenv').config();

const TENANT_ID  = 'aaaaaaaa-0000-0000-0000-000000000001';
const SCHOOL_ID  = 'bbbbbbbb-0000-0000-0000-000000000001';
const STREAM_4N  = 'cccccccc-0000-0000-0000-000000000001';
const STREAM_4S  = 'cccccccc-0000-0000-0000-000000000002';
const STREAM_7E  = 'cccccccc-0000-0000-0000-000000000003';
const DEMO_PASS  = 'Demo@1234';

const USERS = [
  { id: 'dddddddd-0000-0000-0000-000000000001', email: 'hoi@demo.zaroda.app',     firstName: 'Grace',   lastName: 'Wanjiru',  phone: '+254711000001', role: 'hoi',           streamId: null,     streamName: null            },
  { id: 'dddddddd-0000-0000-0000-000000000002', email: 'teacher@demo.zaroda.app', firstName: 'John',    lastName: 'Kamau',    phone: '+254711000002', role: 'class_teacher', streamId: STREAM_4N, streamName: 'Grade 4 North' },
  { id: 'dddddddd-0000-0000-0000-000000000003', email: 'bursar@demo.zaroda.app',  firstName: 'Mary',    lastName: 'Otieno',   phone: '+254711000003', role: 'bursar',         streamId: null,     streamName: null            },
  { id: 'dddddddd-0000-0000-0000-000000000004', email: 'parent@demo.zaroda.app',  firstName: 'James',   lastName: 'Mwangi',   phone: '+254711000004', role: 'parent',         streamId: null,     streamName: null            },
  { id: 'dddddddd-0000-0000-0000-000000000005', email: 'dhois@demo.zaroda.app',   firstName: 'Robert',  lastName: 'Njoroge',  phone: '+254711000005', role: 'dhois',          streamId: null,     streamName: null            },
  { id: 'dddddddd-0000-0000-0000-000000000006', email: 'teacher2@demo.zaroda.app',firstName: 'Alice',   lastName: 'Wambui',   phone: '+254711000006', role: 'class_teacher', streamId: STREAM_4S, streamName: 'Grade 4 South' },
];

const LEARNERS = [
  { firstName:'Amina',    lastName:'Hassan',    admNo:'2025001', gender:'female', guardianName:'Hassan Omar',     guardianPhone:'+254722001001' },
  { firstName:'Brian',    lastName:'Ochieng',   admNo:'2025002', gender:'male',   guardianName:'Peter Ochieng',   guardianPhone:'+254722001002' },
  { firstName:'Cynthia',  lastName:'Wambua',    admNo:'2025003', gender:'female', guardianName:'Joseph Wambua',   guardianPhone:'+254722001003' },
  { firstName:'David',    lastName:'Kiprotich', admNo:'2025004', gender:'male',   guardianName:'Samuel Kiprotich',guardianPhone:'+254722001004' },
  { firstName:'Elizabeth',lastName:'Njeri',     admNo:'2025005', gender:'female', guardianName:'Charles Njeri',   guardianPhone:'+254722001005' },
  { firstName:'Francis',  lastName:'Mutua',     admNo:'2025006', gender:'male',   guardianName:'Daniel Mutua',    guardianPhone:'+254722001006' },
  { firstName:'Grace',    lastName:'Akinyi',    admNo:'2025007', gender:'female', guardianName:'Michael Akinyi',  guardianPhone:'+254722001007' },
  { firstName:'Henry',    lastName:'Maina',     admNo:'2025008', gender:'male',   guardianName:'George Maina',    guardianPhone:'+254722001008' },
  { firstName:'Irene',    lastName:'Chebet',    admNo:'2025009', gender:'female', guardianName:'Robert Chebet',   guardianPhone:'+254722001009' },
  { firstName:'James',    lastName:'Otieno',    admNo:'2025010', gender:'male',   guardianName:'Patrick Otieno',  guardianPhone:'+254722001010' },
];

async function seed() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL ||
      `postgresql://${process.env.DB_USER||'zaroda_app'}:${process.env.DB_PASS||'password'}@${process.env.DB_HOST||'localhost'}:${process.env.DB_PORT||5432}/${process.env.DB_NAME||'zaroda_sms'}`,
  });

  try {
    await client.connect();
    console.log('✓ Connected to database\n');

    // Hash password once
    console.log(`⏳ Hashing password "${DEMO_PASS}"...`);
    const hash = await bcrypt.hash(DEMO_PASS, 12);
    console.log('✓ Password hashed\n');

    // ── Tenant ──────────────────────────────────────────────
    await client.query(`
      INSERT INTO tenants (id, name, status, subscription_tier, trial_ends_at, county, sub_county, zone, ke_county_id, ke_sub_county_id, location_verified, created_at, updated_at)
      VALUES ($1,'Starlight Primary School','active','growth', NOW() + INTERVAL '365 days','Nairobi','Westlands','Westlands Zone A',47,1,true,NOW(),NOW())
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
      [TENANT_ID]
    );
    console.log('✓ Tenant created: Starlight Primary School');

    // ── School ───────────────────────────────────────────────
    await client.query(`
      INSERT INTO schools (id, tenant_id, name, phone, address, knec_code, county, sub_county, zone, created_at)
      VALUES ($1,$2,'Starlight Primary School','+254700000000','P.O. Box 1234, Westlands, Nairobi','NBI001','Nairobi','Westlands','Westlands Zone A',NOW())
      ON CONFLICT (id) DO NOTHING`,
      [SCHOOL_ID, TENANT_ID]
    );
    console.log('✓ School created');

    // ── Streams ──────────────────────────────────────────────
    const streams = [
      [STREAM_4N, 'Grade 4 North', 'grade_4', 28],
      [STREAM_4S, 'Grade 4 South', 'grade_4', 31],
      [STREAM_7E, 'Grade 7 East',  'grade_7', 35],
    ];
    for (const [id, name, grade, count] of streams) {
      await client.query(`
        INSERT INTO streams (id, tenant_id, school_id, name, grade_level, learners_count, academic_year, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,'2025/2026',NOW())
        ON CONFLICT (id) DO NOTHING`,
        [id, TENANT_ID, SCHOOL_ID, name, grade, count]
      );
    }
    console.log('✓ 3 streams created');

    // ── Users ────────────────────────────────────────────────
    for (const u of USERS) {
      await client.query(`
        INSERT INTO users (id, email, password_hash, first_name, last_name, phone, role, tenant_id, school_id, stream_id, stream_name, is_active, email_verified, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true,true,NOW(),NOW())
        ON CONFLICT (id) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
        [u.id, u.email, hash, u.firstName, u.lastName, u.phone, u.role, TENANT_ID, SCHOOL_ID, u.streamId, u.streamName]
      );
      console.log(`  ✓ ${u.role.padEnd(15)} → ${u.email}`);
    }

    // ── Update stream teacher name ───────────────────────────
    await client.query(
      `UPDATE streams SET class_teacher_id=$1, class_teacher_name='John Kamau' WHERE id=$2`,
      ['dddddddd-0000-0000-0000-000000000002', STREAM_4N]
    );
    await client.query(
      `UPDATE streams SET class_teacher_id=$1, class_teacher_name='Alice Wambui' WHERE id=$2`,
      ['dddddddd-0000-0000-0000-000000000006', STREAM_4S]
    );

    // ── Learners ─────────────────────────────────────────────
    for (const l of LEARNERS) {
      await client.query(`
        INSERT INTO learners (id, tenant_id, stream_id, grade_level, first_name, last_name, admission_number, gender, guardian_name, guardian_phone, is_active, created_at)
        VALUES (gen_random_uuid(),$1,$2,'grade_4',$3,$4,$5,$6,$7,$8,true,NOW())
        ON CONFLICT DO NOTHING`,
        [TENANT_ID, STREAM_4N, l.firstName, l.lastName, l.admNo, l.gender, l.guardianName, l.guardianPhone]
      );
    }
    console.log(`\n✓ ${LEARNERS.length} learners added to Grade 4 North`);

    // ── Library books ────────────────────────────────────────
    const books = [
      ['Mathematics Grade 4',          'Kenya Literature Bureau', 'LIB-2025-0001', 'ZARLIB20250001', true ],
      ['English Activity Book Grade 4', 'Oxford University Press', 'LIB-2025-0002', 'ZARLIB20250002', true ],
      ['Kiswahili Darasa la 4',         'KLB',                    'LIB-2025-0003', 'ZARLIB20250003', true ],
      ['Science and Technology Grade 4','Longhorn Publishers',     'LIB-2025-0004', 'ZARLIB20250004', false],
      ['Social Studies Grade 4',        'Mentor Publishers',       'LIB-2025-0005', 'ZARLIB20250005', true ],
    ];
    for (const [title, author, acc, barcode, avail] of books) {
      await client.query(`
        INSERT INTO library_books (id, tenant_id, title, author, accession_number, barcode, is_available, created_at)
        VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6,NOW())
        ON CONFLICT DO NOTHING`,
        [TENANT_ID, title, author, acc, barcode, avail]
      );
    }
    console.log(`✓ ${books.length} library books added`);

    // ── Summary ──────────────────────────────────────────────
    console.log(`
╔══════════════════════════════════════════════════════════╗
║           ZARODA SMS — DEMO ACCOUNTS READY               ║
╠══════════════════════════════════════════════════════════╣
║  School:   Starlight Primary School (Nairobi)            ║
║  Password: Demo@1234  (all accounts)                     ║
╠══════════════════════════════════════════════════════════╣
║  ROLE              EMAIL                                  ║
║  ─────────────     ───────────────────────────────────   ║
║  HOI               hoi@demo.zaroda.app                   ║
║  Deputy HOI        dhois@demo.zaroda.app                  ║
║  Class Teacher     teacher@demo.zaroda.app               ║
║  Class Teacher 2   teacher2@demo.zaroda.app              ║
║  Bursar            bursar@demo.zaroda.app                ║
║  Parent            parent@demo.zaroda.app                ║
╠══════════════════════════════════════════════════════════╣
║  Login at:  http://localhost:3001/auth/login              ║
╚══════════════════════════════════════════════════════════╝
`);

  } catch (err) {
    console.error('\n❌ Seed failed:', err.message);
    console.error('\nMake sure:');
    console.error('  1. PostgreSQL is running');
    console.error('  2. You ran all migrations first (001_*.sql, 002_*.sql etc)');
    console.error('  3. DB credentials in .env are correct');
  } finally {
    await client.end();
  }
}

seed();
