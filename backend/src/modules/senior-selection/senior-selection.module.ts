// ============================================================
// GRADE 10 SENIOR SCHOOL SELECTION
// Digital version of the paper "Parent/Guardian Consultation and
// Consent Form": a parent submits career interest, pathway,
// subject combination and 8 senior-school choices for their
// current Grade 9 learner. Class teachers see it for their own
// stream; HOI/DHOI/school admin/tenant owner see it school-wide.
// ============================================================

import {
  Module, Controller, Get, Post, Patch, Param, Query, Body,
  Request, UseGuards, BadRequestException, ForbiddenException, NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

const VIEW_ROLES = ['class_teacher', 'subject_teacher', 'overall_class_teacher', 'hoi', 'dhois', 'school_admin', 'tenant_owner', 'super_admin'];
const PATHWAYS = [
  'pure_sciences', 'applied_sciences', 'technical_studies',
  'languages_and_literature', 'humanities_and_business_studies',
  'fine_arts_theatre_film', 'sports_and_recreation',
];

@Controller('senior-selection')
@UseGuards(JwtAuthGuard)
export class SeniorSelectionController {
  constructor(private readonly ds: DataSource) {}

  private async ensureTable() {
    await this.ds.query(
      `CREATE TABLE IF NOT EXISTS senior_selection_forms (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         tenant_id uuid NOT NULL,
         created_at timestamptz DEFAULT NOW()
       )`,
    ).catch(() => null);
    const cols: [string, string][] = [
      ['school_id', 'uuid'],
      ['learner_id', 'uuid'],
      ['guardian_name', 'text'],
      ['guardian_id_number', 'text'],
      ['relationship', 'text'],
      ['phone_primary', 'text'],
      ['phone_alternative', 'text'],
      ['address', 'text'],
      ['career_interest', 'text'],
      ['pathway', 'text'],
      ['combination_1', "jsonb DEFAULT '[]'"],
      ['combination_2', "jsonb DEFAULT '[]'"],
      ['schools', "jsonb DEFAULT '[]'"],
      ['consent_confirmed', 'boolean DEFAULT false'],
      ['consent_at', 'timestamptz'],
      ['status', "text DEFAULT 'draft'"],
      ['submitted_at', 'timestamptz'],
      ['received_at', 'timestamptz'],
      ['keyed_by', 'uuid'],
      ['keyed_at', 'timestamptz'],
      ['created_by', 'uuid'],
      ['updated_at', 'timestamptz DEFAULT NOW()'],
      ['deleted_at', 'timestamptz'],
    ];
    for (const [name, type] of cols) {
      await this.ds.query(`ALTER TABLE senior_selection_forms ADD COLUMN IF NOT EXISTS ${name} ${type}`).catch(() => null);
    }
    await this.ds.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_senior_selection_tenant_learner ON senior_selection_forms(tenant_id, learner_id)`,
    ).catch(() => null);
  }

  // ── PARENT: my Grade 9 children + any existing form ───────
  @Get('my-children')
  async myChildren(@Request() req: any) {
    await this.ensureTable();
    const tenantId = req.user.tenantId;
    const email = String(req.user.email || '').toLowerCase().trim();
    if (!email) return [];

    const school = await this.ds.query(
      `SELECT name FROM schools WHERE tenant_id::text = $1 LIMIT 1`, [tenantId],
    ).catch(() => []);
    const schoolName = school[0]?.name || '';

    const learners = await this.ds.query(
      `SELECT l.id::text AS id, l.first_name AS "firstName", l.last_name AS "lastName",
              l.admission_number AS "admissionNumber", l.upi_number AS "upiNumber",
              l.guardian_name AS "guardianName", l.guardian_phone AS "guardianPhone",
              l.guardian_relation AS "guardianRelation", l.guardian_id_no AS "guardianIdNo",
              l.residence AS "residence"
         FROM learners l
        WHERE l.tenant_id::text = $1 AND LOWER(l.guardian_email) = $2 AND l.grade_level = 'grade_9'
        ORDER BY l.first_name`,
      [tenantId, email],
    ).catch(() => []);

    const out = [];
    for (const l of learners) {
      const forms = await this.ds.query(
        `SELECT * FROM senior_selection_forms WHERE tenant_id::text = $1 AND learner_id::text = $2 AND deleted_at IS NULL`,
        [tenantId, l.id],
      ).catch(() => []);
      out.push({ ...l, schoolName, form: forms[0] ? this.mapForm(forms[0]) : null });
    }
    return out;
  }

  private mapForm(r: any) {
    return {
      id: r.id,
      guardianName: r.guardian_name,
      guardianIdNumber: r.guardian_id_number,
      relationship: r.relationship,
      phonePrimary: r.phone_primary,
      phoneAlternative: r.phone_alternative,
      address: r.address,
      careerInterest: r.career_interest,
      pathway: r.pathway,
      combination1: r.combination_1 || [],
      combination2: r.combination_2 || [],
      schools: r.schools || [],
      consentConfirmed: r.consent_confirmed,
      status: r.status,
      submittedAt: r.submitted_at,
      receivedAt: r.received_at,
      keyedAt: r.keyed_at,
    };
  }

  // ── PARENT: create/update a draft or submit ───────────────
  @Post(':learnerId')
  async upsert(@Request() req: any, @Param('learnerId') learnerId: string, @Body() dto: any) {
    if (req.user.role !== 'parent') {
      throw new ForbiddenException('Only a parent/guardian can submit this form.');
    }
    await this.ensureTable();
    const tenantId = req.user.tenantId;
    const email = String(req.user.email || '').toLowerCase().trim();

    const learner = await this.ds.query(
      `SELECT id::text AS id, grade_level AS "gradeLevel"
         FROM learners WHERE id::text = $1 AND tenant_id::text = $2 AND LOWER(guardian_email) = $3`,
      [learnerId, tenantId, email],
    ).catch(() => []);
    if (!learner.length) throw new NotFoundException('Learner not found for this parent account.');

    const school = await this.ds.query(`SELECT id FROM schools WHERE tenant_id::text = $1 LIMIT 1`, [tenantId]).catch(() => []);
    const schoolId = school[0]?.id || null;

    const existing = await this.ds.query(
      `SELECT status FROM senior_selection_forms WHERE tenant_id::text = $1 AND learner_id::text = $2 AND deleted_at IS NULL`,
      [tenantId, learnerId],
    ).catch(() => []);
    if (existing.length && existing[0].status !== 'draft') {
      throw new BadRequestException('This form has already been submitted and can no longer be changed.');
    }

    if (dto.pathway && !PATHWAYS.includes(dto.pathway)) {
      throw new BadRequestException('Invalid pathway selected.');
    }
    if (!dto.guardianName || !dto.phonePrimary) {
      throw new BadRequestException('Guardian name and primary phone are required.');
    }

    const submit = !!dto.submit;
    if (submit && !dto.consentConfirmed) {
      throw new BadRequestException('You must confirm the declaration before submitting.');
    }
    if (submit) {
      const schools = Array.isArray(dto.schools) ? dto.schools : [];
      if (schools.length !== 8) {
        throw new BadRequestException('Exactly 8 senior school choices are required before submitting.');
      }
    }

    const status = submit ? 'submitted' : 'draft';
    const now = new Date();
    const consentAt = dto.consentConfirmed ? now : null;
    const submittedAt = submit ? now : null;
    const rows = await this.ds.query(
      `INSERT INTO senior_selection_forms
         (tenant_id, school_id, learner_id, guardian_name, guardian_id_number, relationship,
          phone_primary, phone_alternative, address, career_interest, pathway,
          combination_1, combination_2, schools, consent_confirmed, consent_at,
          status, submitted_at, created_by, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,NOW())
       ON CONFLICT (tenant_id, learner_id) DO UPDATE SET
         guardian_name = EXCLUDED.guardian_name, guardian_id_number = EXCLUDED.guardian_id_number,
         relationship = EXCLUDED.relationship, phone_primary = EXCLUDED.phone_primary,
         phone_alternative = EXCLUDED.phone_alternative, address = EXCLUDED.address,
         career_interest = EXCLUDED.career_interest, pathway = EXCLUDED.pathway,
         combination_1 = EXCLUDED.combination_1, combination_2 = EXCLUDED.combination_2,
         schools = EXCLUDED.schools, consent_confirmed = EXCLUDED.consent_confirmed,
         consent_at = EXCLUDED.consent_at, status = EXCLUDED.status,
         submitted_at = EXCLUDED.submitted_at, updated_at = NOW()
       RETURNING *`,
      [
        tenantId, schoolId, learnerId, dto.guardianName, dto.guardianIdNumber || null, dto.relationship || null,
        dto.phonePrimary, dto.phoneAlternative || null, dto.address || null, dto.careerInterest || null, dto.pathway || null,
        JSON.stringify(dto.combination1 || []), JSON.stringify(dto.combination2 || []), JSON.stringify(dto.schools || []),
        !!dto.consentConfirmed, consentAt, status, submittedAt, req.user.id,
      ],
    );
    return this.mapForm(rows[0]);
  }

  // ── TEACHER / ADMIN: list Grade 9 learners + form status ──
  @Get()
  async list(@Request() req: any) {
    if (!VIEW_ROLES.includes(req.user.role)) {
      throw new ForbiddenException('You are not permitted to view senior school selections.');
    }
    await this.ensureTable();
    const tenantId = req.user.tenantId;
    return this.ds.query(
      `SELECT l.id::text AS "learnerId", l.first_name AS "firstName", l.last_name AS "lastName",
              l.admission_number AS "admissionNumber", l.upi_number AS "upiNumber",
              l.stream_id::text AS "streamId", s.name AS "streamName",
              f.id::text AS "formId", COALESCE(f.status, 'not_started') AS status,
              f.submitted_at AS "submittedAt", f.received_at AS "receivedAt", f.keyed_at AS "keyedAt"
         FROM learners l
         LEFT JOIN streams s ON s.id::text = l.stream_id::text
         LEFT JOIN senior_selection_forms f ON f.learner_id::text = l.id::text
                                            AND f.tenant_id::text = l.tenant_id::text AND f.deleted_at IS NULL
        WHERE l.tenant_id::text = $1 AND l.grade_level = 'grade_9'
        ORDER BY l.first_name`,
      [tenantId],
    ).catch(() => []);
  }

  // ── TEACHER / ADMIN / owning PARENT: full form detail ─────
  @Get(':id')
  async detail(@Request() req: any, @Param('id') id: string) {
    await this.ensureTable();
    const tenantId = req.user.tenantId;
    const rows = await this.ds.query(
      `SELECT f.*, l.first_name AS "learnerFirstName", l.last_name AS "learnerLastName",
              l.admission_number AS "admissionNumber", l.upi_number AS "upiNumber",
              l.guardian_email AS "guardianEmail"
         FROM senior_selection_forms f
         JOIN learners l ON l.id::text = f.learner_id::text
        WHERE f.id::text = $1 AND f.tenant_id::text = $2 AND f.deleted_at IS NULL`,
      [id, tenantId],
    ).catch(() => []);
    if (!rows.length) throw new NotFoundException('Form not found.');
    const row = rows[0];

    const isOwner = req.user.role === 'parent'
      && String(row.guardianEmail || '').toLowerCase() === String(req.user.email || '').toLowerCase().trim();
    if (!isOwner && !VIEW_ROLES.includes(req.user.role)) {
      throw new ForbiddenException('You are not permitted to view this form.');
    }

    return {
      ...this.mapForm(row),
      learnerFirstName: row.learnerFirstName,
      learnerLastName: row.learnerLastName,
      admissionNumber: row.admissionNumber,
      upiNumber: row.upiNumber,
    };
  }

  // ── TEACHER / ADMIN: "FOR SCHOOL USE ONLY" — mark received / keyed in ──
  @Patch(':id/receive')
  async markReceived(@Request() req: any, @Param('id') id: string) {
    if (!VIEW_ROLES.includes(req.user.role)) {
      throw new ForbiddenException('You are not permitted to update this form.');
    }
    await this.ensureTable();
    const tenantId = req.user.tenantId;
    const result = await this.ds.query(
      `UPDATE senior_selection_forms
          SET status = 'keyed_in', received_at = COALESCE(received_at, NOW()),
              keyed_by = $3, keyed_at = NOW(), updated_at = NOW()
        WHERE id::text = $1 AND tenant_id::text = $2 AND deleted_at IS NULL AND status = 'submitted'
        RETURNING *`,
      [id, tenantId, req.user.id],
    ).catch(() => []);
    // TypeORM's raw UPDATE/DELETE ... RETURNING returns a [rows, rowCount] tuple,
    // unlike INSERT ... RETURNING which returns the rows array directly.
    const rows = Array.isArray(result[0]) ? result[0] : result;
    if (!rows.length) throw new NotFoundException('Submitted form not found.');
    return this.mapForm(rows[0]);
  }
}

@Module({
  controllers: [SeniorSelectionController],
})
export class SeniorSelectionModule {}
