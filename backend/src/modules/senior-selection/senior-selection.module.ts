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
  Request, Res, UseGuards, BadRequestException, ForbiddenException, NotFoundException,
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

  // ── TEACHER / ADMIN: printable blank forms for manual filling ──
  // One page per Grade 9 learner, pre-filled with school name, learner name and
  // assessment number (UPI); everything else left blank for the parent to complete
  // by hand. Registered before ":id" so "bulk-print" never gets swallowed by it.
  @Get('bulk-print/html')
  async bulkPrintHtml(@Request() req: any, @Query('streamId') streamId: string, @Res() res: any) {
    if (!VIEW_ROLES.includes(req.user.role)) {
      throw new ForbiddenException('You are not permitted to print senior school selection forms.');
    }
    await this.ensureTable();
    const tenantId = req.user.tenantId;

    const school = await this.ds.query(
      `SELECT name, phone, address, sub_county AS "subCounty" FROM schools WHERE tenant_id::text = $1 LIMIT 1`,
      [tenantId],
    ).catch(() => []);
    const s = school[0] || {};

    const learners = await this.ds.query(
      `SELECT l.first_name AS "firstName", l.last_name AS "lastName",
              l.admission_number AS "admissionNumber", l.upi_number AS "upiNumber",
              s.name AS "streamName"
         FROM learners l
         LEFT JOIN streams s ON s.id::text = l.stream_id::text
        WHERE l.tenant_id::text = $1 AND l.grade_level = 'grade_9'
          AND ($2::text IS NULL OR l.stream_id::text = $2)
        ORDER BY l.first_name`,
      [tenantId, streamId || null],
    ).catch(() => []);

    const esc = (v: any) => String(v ?? '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] as string));

    const schoolLevels = [
      { cat: 'C1' }, { cat: 'C1' }, { cat: 'C1' }, { cat: 'C2' }, { cat: 'C2' }, { cat: 'C3' }, { cat: 'C3' }, { cat: 'C4' },
    ];
    const pages = learners.map((l: any) => `
      <section class="form-page">
        <h1>${esc(s.name || 'School')}</h1>
        <p class="sub">GRADE 10 SENIOR SCHOOL SELECTION — PARENT/GUARDIAN CONSULTATION AND CONSENT FORM</p>
        <table class="prefill">
          <tr><td class="lbl">Learner's full name</td><td class="val">${esc(l.firstName)} ${esc(l.lastName)}</td>
              <td class="lbl">Assessment No.</td><td class="val">${esc(l.upiNumber || l.admissionNumber || '')}</td></tr>
          <tr><td class="lbl">Stream</td><td class="val">${esc(l.streamName || '')}</td>
              <td class="lbl">Admission No.</td><td class="val">${esc(l.admissionNumber || '')}</td></tr>
        </table>

        <h2>Section B: Parent / Guardian Details</h2>
        <table class="blank">
          <tr><td class="lbl">Full name</td><td class="line"></td></tr>
          <tr><td class="lbl">National ID number</td><td class="line"></td></tr>
          <tr><td class="lbl">Relationship to learner</td><td class="line"></td></tr>
          <tr><td class="lbl">Phone (primary / alternative)</td><td class="line"></td></tr>
          <tr><td class="lbl">Village / Location / Address</td><td class="line"></td></tr>
        </table>

        <h2>Section C: Career Interest and Pathway</h2>
        <p class="line-label">Career interest / aspiration: <span class="line"></span></p>
        <table class="pathways">
          <tr><td><b>STEM</b><br>[ ] Pure Sciences<br>[ ] Applied Sciences<br>[ ] Technical Studies</td>
              <td><b>Social Sciences</b><br>[ ] Languages and Literature<br>[ ] Humanities and Business Studies</td>
              <td><b>Arts and Sports Science</b><br>[ ] Fine Arts, Theatre and Film<br>[ ] Sports and Recreation</td></tr>
        </table>

        <h2>Section D: Subject Combination</h2>
        <p>First choice: 1. _______________ 2. _______________ 3. _______________</p>
        <p>Second choice: 1. _______________ 2. _______________ 3. _______________</p>

        <h2>Section E: Senior School Choices — 8 schools</h2>
        <table class="schools">
          <tr><th>#</th><th>Cat.</th><th>Name of senior school</th><th>Code</th><th>Sub-county/County</th><th>Boarding/Day</th><th>Boys/Girls/Mixed</th><th>Comb.</th></tr>
          ${schoolLevels.map((r, i) => `<tr><td>${i + 1}</td><td>${r.cat}</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`).join('')}
        </table>

        <h2>Section F: Declaration and Consent</h2>
        <p class="small">I confirm I have discussed the career interest, pathway, subject combination and the eight school choices with my child and the class teacher; that each school listed offers the chosen pathway/combination; that the C4 day school is within reasonable travel distance; that the pathway/combination cannot be changed once submitted; and that all details given are correct.</p>
        <table class="signoff">
          <tr><td>Learner's name: <span class="line short"></span></td><td>Signature: <span class="line short"></span></td><td>Date: <span class="line short"></span></td></tr>
          <tr><td>Parent/Guardian name: <span class="line short"></span></td><td>Signature: <span class="line short"></span></td><td>Date: <span class="line short"></span></td></tr>
        </table>
      </section>
    `).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>Grade 10 Selection — Blank Forms</title>
      <style>
        @page { size: A4; margin: 10mm; }
        * { box-sizing: border-box; }
        body { font-family: Arial, sans-serif; font-size: 10px; color: #111; margin: 0; }
        .form-page {
          page-break-after: always; break-after: page;
          padding: 16px; width: 210mm; min-height: 297mm;
          margin: 0 auto 24px; background: #fff;
          box-shadow: 0 0 6px rgba(0,0,0,0.15);
        }
        .form-page:last-child { page-break-after: auto; break-after: auto; margin-bottom: 0; }
        h1 { text-align: center; font-size: 15px; margin: 0 0 4px; }
        .sub { text-align: center; font-size: 9px; font-weight: bold; margin: 0 0 10px; }
        h2 {
          font-size: 11px; background: #1a2e5a; color: #fff; padding: 3px 6px;
          margin: 10px 0 5px; break-inside: avoid;
        }
        table { width: 100%; border-collapse: collapse; margin-bottom: 5px; table-layout: fixed; break-inside: avoid; }
        table.prefill td, table.blank td { border: 1px solid #999; padding: 3px 6px; word-break: break-word; }
        table.prefill .lbl, table.blank .lbl { background: #f0f0f0; font-weight: bold; width: 24%; }
        table.blank .line { height: 16px; }
        table.pathways td { border: 1px solid #999; padding: 5px; width: 33.33%; vertical-align: top; }
        table.schools th, table.schools td { border: 1px solid #999; padding: 3px; text-align: left; font-size: 8.5px; word-break: break-word; }
        table.schools th:nth-child(1), table.schools td:nth-child(1) { width: 4%; }
        table.schools th:nth-child(2), table.schools td:nth-child(2) { width: 7%; }
        .line { display: inline-block; border-bottom: 1px solid #333; min-width: 200px; }
        .line.short { min-width: 80px; }
        .line-label { margin: 3px 0 8px; }
        .small { font-size: 8px; }
        table.signoff td { padding: 6px 4px; }
        .no-print { text-align: center; margin: 12px 0; }
        .no-print button { background: #1a2e5a; color: #fff; border: none; padding: 8px 18px; border-radius: 6px; cursor: pointer; font-size: 13px; }
        @media print {
          body { background: #fff; }
          .form-page { box-shadow: none; margin: 0; width: auto; min-height: auto; }
          .no-print { display: none; }
        }
      </style>
      </head><body>
        <div class="no-print"><button onclick="window.print()">🖨 Print / Save as PDF</button></div>
        ${pages || '<p style="padding:24px">No Grade 9 learners found.</p>'}
        <script>window.addEventListener('load', function(){ setTimeout(function(){ window.print(); }, 400); });</script>
      </body></html>`;

    res.set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.send(html);
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
