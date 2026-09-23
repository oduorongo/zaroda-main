// ============================================================
// ZARODA SMS — Stub Modules
// These return proper empty API responses so the frontend
// renders gracefully while the full business logic is wired.
// Replace each stub with the full service as you build out.
// ============================================================

import { Module, Controller, Get, Post, Patch, Delete, Param, Query, Body, Request, Res, UseGuards, BadRequestException, ForbiddenException, Injectable, HttpCode, HttpStatus } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, DataSource } from 'typeorm';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { getGradeLearningAreas, resolveLearningArea } from './pdf/learning-area.util';
import { sendSms, sendEmail, smsSegmentCount, normalisePhone } from '../common/messaging';
import { initiateStkPush, checkPaymentStatus, parseTumaCallback, normalisePhoneForTuma } from '../common/tuma';
import { requireProPlan } from '../common/plan';
import { feeStructureTableHtml } from '../common/fee-structure-table';
import { PRINT_FOOTER_CSS, PRINT_FOOTER_HTML } from '../common/print-footer';

// Persists numbers Africa's Talking has told us are opted-out recipients (status
// UserInBlacklist, statusCode 406) so a future send can warn in-app before trying
// them again — the number itself can never be warned by SMS since the telco
// blocks it outright. Shared across every SMS-sending controller in this file.
async function recordBlacklistedNumbers(ds: DataSource, blacklisted: { number: string; statusCode: number | null }[]) {
  if (!blacklisted.length) return;
  for (const b of blacklisted) {
    await ds.query(
      // A number that gets re-flagged despite a prior "confirmed opted back in" mark
      // clearly hasn't actually re-activated — un-confirm it rather than let a stale
      // flag keep it treated as sendable.
      `INSERT INTO sms_blacklist (phone_number, status_code, status_text, first_flagged_at, last_flagged_at, flagged_count)
       VALUES ($1,$2,'UserInBlacklist',NOW(),NOW(),1)
       ON CONFLICT (phone_number) DO UPDATE SET
         status_code = EXCLUDED.status_code, last_flagged_at = NOW(), flagged_count = sms_blacklist.flagged_count + 1,
         opted_in_confirmed = false, opted_in_confirmed_at = NULL, opted_in_confirmed_by = NULL`,
      [b.number, b.statusCode],
    ).catch(() => null);
  }
}

// Numbers telco-blocked and not yet confirmed opted back in shouldn't be sent to
// again blind (AT support's own guidance) — split a recipient list into what's
// actually worth attempting vs. what to skip before spending an SMS unit on it.
async function filterOptedOutNumbers(ds: DataSource, numbers: string[]): Promise<{ toSend: string[]; skipped: string[] }> {
  if (!numbers.length) return { toSend: numbers, skipped: [] };
  const blocked = await ds.query(
    `SELECT phone_number FROM sms_blacklist WHERE phone_number = ANY($1) AND opted_in_confirmed = false`,
    [numbers],
  ).catch(() => []);
  const blockedSet = new Set((blocked as any[]).map(r => r.phone_number));
  if (!blockedSet.size) return { toSend: numbers, skipped: [] };
  return { toSend: numbers.filter(n => !blockedSet.has(n)), skipped: numbers.filter(n => blockedSet.has(n)) };
}

// ── M-Pesa Paybill (per-tenant) helpers ───────────────────────────────────
// Each school can register its OWN Paybill/Till with Safaricom's Daraja API —
// distinct from the platform-wide Tuma account used for ZARODA's own
// subscription/wallet billing (src/common/tuma.ts), which only ever moves
// money into ZARODA's account, not a school's. Credentials live per tenant in
// tenant_mpesa_settings; self-healing tables (ensure* below) follow this
// file's established convention rather than a migration.
const MPESA_SANDBOX = 'https://sandbox.safaricom.co.ke';
const MPESA_PROD = 'https://api.safaricom.co.ke';
const mpesaBaseUrl = (environment: string) => (environment === 'sandbox' ? MPESA_SANDBOX : MPESA_PROD);

async function ensureMpesaSettingsTable(ds: DataSource) {
  await ds.query(
    `CREATE TABLE IF NOT EXISTS tenant_mpesa_settings (
       id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       tenant_id uuid UNIQUE,
       created_at timestamptz DEFAULT NOW()
     )`,
  ).catch(() => null);
  const cols: [string, string][] = [
    ['shortcode', 'text'], ['consumer_key', 'text'], ['consumer_secret', 'text'],
    ['passkey', 'text'], ['environment', "text DEFAULT 'production'"],
    // gateway: 'daraja' (school's own Safaricom Daraja app — supports STK push AND
    // C2B/walk-up payments) or 'tuma' (school's own Tuma account — STK push only,
    // no C2B; simpler onboarding since it skips Safaricom's developer approval).
    ['gateway', "text DEFAULT 'daraja'"], ['tuma_email', 'text'], ['tuma_api_key', 'text'],
    ['updated_at', 'timestamptz DEFAULT NOW()'],
  ];
  for (const [n, t] of cols) {
    await ds.query(`ALTER TABLE tenant_mpesa_settings ADD COLUMN IF NOT EXISTS ${n} ${t}`).catch(() => null);
  }
}

async function ensureMpesaTransactionsTable(ds: DataSource) {
  await ds.query(
    `CREATE TABLE IF NOT EXISTS mpesa_transactions (
       id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       tenant_id uuid, created_at timestamptz DEFAULT NOW()
     )`,
  ).catch(() => null);
  const cols: [string, string][] = [
    ['type', 'text'],                    // 'stk' | 'c2b'
    ['checkout_request_id', 'text'], ['merchant_request_id', 'text'],
    ['phone', 'text'], ['amount', 'numeric'], ['account_reference', 'text'],
    ['learner_id', 'uuid'],              // pre-matched at STK push time (parent chosen from a list)
    ['mpesa_receipt_number', 'text'],
    ['status', "text DEFAULT 'pending'"], // pending | completed | failed | matched | unmatched
    ['matched_learner_id', 'uuid'], ['matched_payment_id', 'uuid'],
    ['raw_callback', 'jsonb'],
  ];
  for (const [n, t] of cols) {
    await ds.query(`ALTER TABLE mpesa_transactions ADD COLUMN IF NOT EXISTS ${n} ${t}`).catch(() => null);
  }
}

async function getMpesaSettingsRow(ds: DataSource, tenantId: string): Promise<any | null> {
  await ensureMpesaSettingsTable(ds);
  const rows = await ds.query(
    `SELECT shortcode, consumer_key AS "consumerKey", consumer_secret AS "consumerSecret",
            passkey, environment, COALESCE(gateway, 'daraja') AS gateway,
            tuma_email AS "tumaEmail", tuma_api_key AS "tumaApiKey"
       FROM tenant_mpesa_settings WHERE tenant_id::text = $1 LIMIT 1`,
    [tenantId],
  ).catch(() => []);
  return rows[0] || null;
}

async function getDarajaToken(environment: string, consumerKey: string, consumerSecret: string): Promise<string> {
  const creds = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
  const resp = await fetch(`${mpesaBaseUrl(environment)}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${creds}` },
  });
  const data: any = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.access_token) {
    throw new Error(`M-Pesa auth failed: ${JSON.stringify(data).slice(0, 200)}`);
  }
  return data.access_token;
}

// ═══════════════════════════════════════════════════════════
// FINANCE MODULE
// ═══════════════════════════════════════════════════════════
@Entity('invoices')
class Invoice {
  @PrimaryGeneratedColumn('uuid') id:            string;
  @Column({ name: 'tenant_id' })  tenantId:      string;
  @Column({ name: 'learner_id', nullable: true }) learnerId: string;
  @Column({ name: 'invoice_number', nullable: true }) invoiceNumber: string;
  @Column({ name: 'total_amount', type: 'decimal', default: 0 }) totalAmount: number;
  @Column({ name: 'amount_paid', type: 'decimal', default: 0 }) amountPaid: number;
  @Column({ default: 'unpaid' })  status:        string;
  @Column({ nullable: true })     term:          string;
  @Column({ name: 'academic_year', nullable: true }) academicYear: string;
  @Column({ name: 'due_date', nullable: true })   dueDate: Date;
  @Column({ name: 'issued_date', nullable: true }) issuedDate: Date;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}

// Also @Injectable() (in addition to @Controller) so MpesaPaybillController /
// MpesaCallbackController can inject it below to reuse createAndAllocatePayment
// — the single path that actually records a payment and its vote-head
// allocations, whether triggered by a bursar's manual entry or an M-Pesa
// auto-reconciliation.
@Injectable()
@Controller('finance')
@UseGuards(JwtAuthGuard)
class FinanceController {
  constructor(private readonly ds: DataSource) {}

  // ── Class-teacher fee-collection override ─────────────────
  // Off by default (platform-wide) — many primary/JS schools let the class teacher
  // collect fees directly instead of running everything through a bursar's office.
  // The HOI/admin flips this on per tenant; once on, a class_teacher/overall_class_teacher
  // may record payments, but ONLY for learners in a stream where they're the
  // registered class teacher (streams.class_teacher_id) — never school-wide.
  private async ensureClassTeacherOverrideColumn() {
    await this.ds.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS class_teachers_collect_fees boolean DEFAULT false`).catch(() => null);
  }

  @Get('settings/class-teacher-override')
  async getClassTeacherOverride(@Request() req: any) {
    await this.ensureClassTeacherOverrideColumn();
    const enabled = await this.ds.query(
      `SELECT COALESCE(class_teachers_collect_fees, false) AS e FROM tenants WHERE id::text = $1`,
      [req.user.tenantId],
    ).then((r: any[]) => !!r[0]?.e).catch(() => false);
    return { enabled };
  }

  @Patch('settings/class-teacher-override')
  async setClassTeacherOverride(@Request() req: any, @Body() dto: { enabled: boolean }) {
    if (!['hoi', 'dhois', 'tenant_owner', 'school_admin'].includes(req.user.role)) {
      throw new BadRequestException('Only the HOI or administrator can change this setting.');
    }
    await this.ensureClassTeacherOverrideColumn();
    await this.ds.query(
      `UPDATE tenants SET class_teachers_collect_fees = $1 WHERE id::text = $2`,
      [!!dto.enabled, req.user.tenantId],
    );
    return { enabled: !!dto.enabled };
  }

  // Throws unless this class teacher may record a payment for this exact learner —
  // the override must be on AND the learner must sit in a stream this teacher is
  // registered as class teacher of.
  private async assertClassTeacherCanRecordPayment(tenantId: string, teacherId: string, learnerId: string) {
    if (!learnerId) throw new BadRequestException('Please select a learner.');
    await this.ensureClassTeacherOverrideColumn();
    const enabled = await this.ds.query(
      `SELECT COALESCE(class_teachers_collect_fees, false) AS e FROM tenants WHERE id::text = $1`,
      [tenantId],
    ).then((r: any[]) => !!r[0]?.e).catch(() => false);
    if (!enabled) throw new BadRequestException('Class teachers cannot record payments here yet — ask your HOI/administrator to enable this in Finance → M-Pesa Settings.');
    const owns = await this.ds.query(
      `SELECT 1 FROM learners l JOIN streams s ON s.id::text = l.stream_id::text
        WHERE l.id::text = $1 AND l.tenant_id::text = $2 AND s.class_teacher_id::text = $3 LIMIT 1`,
      [learnerId, tenantId, teacherId],
    ).catch(() => []);
    if (!owns.length) throw new BadRequestException('You can only record payments for learners in your own class.');
  }

  // The JWT only carries id/email/role — look up the actual name so payment
  // records show "who" in a way a parent or auditor can recognise, not an email.
  // Not private: MpesaPaybillController (below) also needs it when a bursar
  // manually assigns an unmatched M-Pesa transaction to a learner.
  async getUserDisplayName(userId: string, fallback: string): Promise<string> {
    if (!userId) return fallback;
    const rows = await this.ds.query(
      `SELECT first_name AS "firstName", last_name AS "lastName" FROM users WHERE id::text = $1 LIMIT 1`,
      [userId],
    ).catch(() => []);
    const u = rows[0];
    const name = u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() : '';
    return name || fallback;
  }

  // ── FEE STRUCTURES (set by HOI / bursar / admin) ──────────
  /**
   * The fee structure as a table, for printing on its own or as a page of
   * something else. Returns markup rather than a whole document so the report
   * card can carry the same table as its second page without either copy
   * drifting from the other.
   */
  @Get('fee-structures/print')
  async printFeeStructure(@Request() req: any, @Query() q: any, @Res() res: any) {
    const tenantId = req.user.tenantId;
    const esc = (s: any) => String(s ?? '').replace(/[&<>]/g, (c: string) => ({ '&':'&amp;','<':'&lt;','>':'&gt;' }[c] || c));
    const school = await this.ds.query(
      `SELECT name, address, phone FROM schools WHERE tenant_id::text = $1 LIMIT 1`, [tenantId],
    ).then((r: any[]) => r[0] || {}).catch(() => ({} as any));
    await this.ensureFeeItemsTable();
    const table = await feeStructureTableHtml(this.ds, tenantId, {
      gradeLevel: q.gradeLevel, term: q.term, academicYear: q.academicYear,
    });
    const scope = [
      q.gradeLevel ? String(q.gradeLevel).replace(/_/g, ' ') : 'All classes',
      q.term ? String(q.term).replace('term_', 'Term ') : '',
      q.academicYear || '',
    ].filter(Boolean).join(' · ');

    res.set('Content-Type', 'text/html').send(`<!doctype html><html><head><meta charset="utf-8">
      <title>Fee Structure</title><style>
      @page{size:A4 portrait;margin:14mm}
      body{font-family:Arial,sans-serif;color:#1a2e5a;margin:22px}
      .head{text-align:center;border-bottom:3px solid #1a2e5a;padding-bottom:10px;margin-bottom:8px}
      .head h1{margin:0;font-size:20px}.head h2{margin:4px 0 0;font-size:13px;font-weight:400;color:#555}
      table{width:100%;border-collapse:collapse;margin-top:10px;font-size:12px}
      th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}
      th{background:#1a2e5a;color:#fff}
      td.n,th.n{text-align:right}
      tfoot td{font-weight:bold;background:#f0f2f8}
      .print{margin:14px 0;text-align:center}
      button{background:#f5820a;color:#fff;border:none;padding:8px 18px;border-radius:6px;cursor:pointer;font-weight:bold}
      @media print{.print{display:none}}
      ${PRINT_FOOTER_CSS}
      </style></head><body>
      <div class="head"><h1>${esc(school.name || 'School')}</h1>
        <h2>Fee Structure · ${esc(scope)}</h2></div>
      <div class="print"><button onclick="window.print()">🖨 Print / Save as PDF</button></div>
      ${table || '<p>No fee items have been set up for this selection.</p>'}
      ${PRINT_FOOTER_HTML}</body></html>`);
  }

  @Get('fee-structures')
  async getFeeStructures(@Request() req: any) {
    await this.ensureFeeItemsTable();
    return this.ds.query(
      `SELECT id, name, grade_level AS "gradeLevel", term, academic_year AS "academicYear",
              category, amount, is_mandatory AS "isMandatory", COALESCE(priority,100) AS priority,
              created_at AS "createdAt"
         FROM fee_items WHERE tenant_id = $1 ORDER BY COALESCE(priority,100) ASC, created_at DESC`,
      [req.user.tenantId],
    ).catch(() => []);
  }

  private async ensureFeeItemsTable() {
    await this.ds.query(
      `CREATE TABLE IF NOT EXISTS fee_items (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         tenant_id uuid,
         created_at timestamptz DEFAULT NOW()
       )`,
    ).catch(() => null);
    // The table may pre-exist from an older version with a different shape. Add any columns
    // our INSERT/SELECT needs, so it works regardless of how it was originally created.
    const cols: [string, string][] = [
      ['school_id', 'uuid'],
      ['name', 'text'],
      ['grade_level', 'text'],
      ['term', 'text'],
      ['academic_year', 'text'],
      ['category', 'text'],
      ['amount', 'numeric'],
      ['is_mandatory', 'boolean DEFAULT true'],
      ['priority', 'integer DEFAULT 100'],
      ['created_at', 'timestamptz DEFAULT NOW()'],
    ];
    for (const [name, type] of cols) {
      await this.ds.query(`ALTER TABLE fee_items ADD COLUMN IF NOT EXISTS ${name} ${type}`).catch(() => null);
    }
    // The table may have been created as a CHILD of a fee_structures table, leaving NOT-NULL
    // columns our simplified insert doesn't use (e.g. fee_structure_id, fee_type). Find any
    // NOT-NULL column that isn't one we deliberately populate, and drop its NOT-NULL so a
    // standalone fee item can be saved. This is self-healing against any legacy table shape.
    const keep = new Set(['id', 'tenant_id']);  // these stay NOT NULL / have defaults
    const notNullCols = await this.ds.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'fee_items' AND is_nullable = 'NO' AND column_default IS NULL`,
    ).catch(() => []);
    for (const row of (notNullCols as any[])) {
      const c = row.column_name;
      if (keep.has(c)) continue;
      await this.ds.query(`ALTER TABLE fee_items ALTER COLUMN ${c} DROP NOT NULL`).catch(() => null);
    }
  }

  @Post('fee-structures')
  async createFeeStructure(@Request() req: any, @Body() dto: any) {
    const role = req.user.role;
    if (!['hoi', 'dhois', 'tenant_owner', 'school_admin', 'bursar'].includes(role)) {
      throw new BadRequestException('Only the HOI, bursar or administrator can set fee structures.');
    }
    if (!dto?.name || !String(dto.name).trim()) {
      throw new BadRequestException('Fee name is required.');
    }
    await this.ensureFeeItemsTable();
    // Accept either a single gradeLevel or an array of gradeLevels (apply one fee per class).
    // An empty/"all" selection means a single school-wide item (grade_level = null).
    let grades: (string | null)[] = [];
    if (Array.isArray(dto.gradeLevels) && dto.gradeLevels.length) {
      grades = dto.gradeLevels.map((g: any) => (g && String(g).trim()) ? String(g).trim() : null);
    } else {
      grades = [dto.gradeLevel ? String(dto.gradeLevel).trim() : null];
    }
    // De-duplicate (and collapse a stray null alongside real grades into just the real ones).
    grades = Array.from(new Set(grades.map(g => g === null ? '' : g))).map(g => g === '' ? null : g);
    try {
      const created: any[] = [];
      for (const grade_level of grades) {
        const rows = await this.ds.query(
          `INSERT INTO fee_items
             (tenant_id, school_id, name, grade_level, term, academic_year, category, amount, is_mandatory, priority, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
           RETURNING id, name, grade_level AS "gradeLevel", term, academic_year AS "academicYear",
                     category, amount, is_mandatory AS "isMandatory", priority`,
          [
            req.user.tenantId, req.user.schoolId || null,
            String(dto.name).trim(), grade_level, dto.term || null,
            dto.academicYear || null, dto.category || 'tuition',
            Number(dto.amount) || 0, dto.isMandatory !== false,
            dto.priority != null ? Number(dto.priority) : 100,
          ],
        );
        created.push(rows[0]);
      }
      return { created, count: created.length, items: created };
    } catch (e: any) {
      throw new BadRequestException(`Could not save fee structure: ${e.message}`);
    }
  }

  @Delete('fee-structures/:id')
  async deleteFeeStructure(@Request() req: any, @Param('id') id: string) {
    if (!['hoi', 'dhois', 'tenant_owner', 'school_admin', 'bursar'].includes(req.user.role)) {
      throw new BadRequestException('Only the HOI, bursar or administrator can delete fee structures.');
    }
    await this.ds.query(`DELETE FROM fee_items WHERE id = $1 AND tenant_id = $2`, [id, req.user.tenantId]).catch(() => null);
    return { deleted: true };
  }

  // ── Vote-head (fee category) priority: controls the order a lump sum auto-fills balances ──
  @Patch('fee-structures/:id/priority')
  async setFeePriority(@Request() req: any, @Param('id') id: string, @Body() dto: any) {
    if (!['hoi', 'dhois', 'tenant_owner', 'school_admin', 'bursar'].includes(req.user.role)) {
      throw new BadRequestException('Only the bursar or an administrator can set priority.');
    }
    await this.ensureFeeItemsTable();
    await this.ds.query(
      `UPDATE fee_items SET priority = $3 WHERE id = $1 AND tenant_id = $2`,
      [id, req.user.tenantId, Number(dto.priority) || 100],
    ).catch(() => null);
    return { ok: true };
  }

  // Bulk reorder: accepts an ordered array of fee-item ids; assigns priority 1,2,3… in that order.
  @Patch('fee-structures/reorder')
  async reorderFees(@Request() req: any, @Body() dto: any) {
    if (!['hoi', 'dhois', 'tenant_owner', 'school_admin', 'bursar'].includes(req.user.role)) {
      throw new BadRequestException('Only the bursar or an administrator can reorder vote heads.');
    }
    await this.ensureFeeItemsTable();
    const ids: string[] = Array.isArray(dto.ids) ? dto.ids : [];
    for (let i = 0; i < ids.length; i++) {
      await this.ds.query(`UPDATE fee_items SET priority = $3 WHERE id = $1 AND tenant_id = $2`,
        [ids[i], req.user.tenantId, i + 1]).catch(() => null);
    }
    return { ok: true, count: ids.length };
  }

  // Records which payment paid how much toward which vote head (fee item). This is what makes
  // per-vote-head balances possible — a lump sum is split into several allocation rows.
  private async ensureAllocationsTable() {
    await this.ds.query(
      `CREATE TABLE IF NOT EXISTS payment_allocations (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         tenant_id uuid, payment_id uuid, learner_id uuid,
         fee_item_id uuid, vote_head text, amount numeric,
         term text, academic_year text, created_at timestamptz DEFAULT NOW())`,
    ).catch(() => null);
    for (const [n, t] of [['payment_id','uuid'],['learner_id','uuid'],['fee_item_id','uuid'],
      ['vote_head','text'],['amount','numeric'],['term','text'],['academic_year','text']] as [string,string][]) {
      await this.ds.query(`ALTER TABLE payment_allocations ADD COLUMN IF NOT EXISTS ${n} ${t}`).catch(() => null);
    }
    // Self-heal against a pre-existing table shape with a NOT NULL fee_item_id (or any other
    // column we don't populate): an overpayment/credit row deliberately has fee_item_id = NULL,
    // and a NOT NULL constraint there would make that insert fail silently (callers .catch it),
    // so the money would vanish from payment_allocations entirely with no trace to reconcile.
    const keep = new Set(['id', 'tenant_id']);
    const notNullCols = await this.ds.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'payment_allocations' AND is_nullable = 'NO' AND column_default IS NULL`,
    ).catch(() => []);
    for (const row of (notNullCols as any[])) {
      const c = row.column_name;
      if (keep.has(c)) continue;
      await this.ds.query(`ALTER TABLE payment_allocations ALTER COLUMN ${c} DROP NOT NULL`).catch(() => null);
    }
  }

  // One-time repair for payments whose full amount never made it into payment_allocations —
  // either because a term-agnostic fee item was wrongly excluded once the payment had a
  // specific term (now fixed below), or because the resulting "Credit / Overpayment" insert
  // (fee_item_id = NULL) silently failed against a stricter legacy table shape and the error
  // was swallowed. Either way the symptom is the same: sum(payment_allocations) for a payment
  // is less than what was actually paid, so this compares every payment against its own
  // allocations and tops up any shortfall using the (now-fixed) priority auto-fill.
  @Post('vote-heads/reconcile')
  async reconcileVoteHeads(@Request() req: any) {
    if (!['hoi', 'dhois', 'tenant_owner', 'school_admin', 'bursar'].includes(req.user.role)) {
      throw new BadRequestException('Only the bursar or an administrator can reconcile balances.');
    }
    await this.ensurePaymentsTable();
    await this.ensureFeeItemsTable();
    await this.ensureAllocationsTable();
    const tenantId = req.user.tenantId;
    const shortfalls = await this.ds.query(
      `SELECT * FROM (
         SELECT p.id, p.learner_id AS "learnerId", p.amount, p.term, p.academic_year AS "academicYear",
                p.amount - COALESCE((SELECT SUM(a.amount) FROM payment_allocations a WHERE a.payment_id = p.id), 0) AS shortfall
           FROM payments p
          WHERE p.tenant_id = $1 AND p.learner_id IS NOT NULL
       ) x WHERE shortfall > 0.01`,
      [tenantId],
    ).catch(() => []);
    let reconciled = 0, stillCredited = 0;
    for (const s of (shortfalls as any[])) {
      const grade = await this.ds.query(
        `SELECT grade_level AS g FROM learners WHERE id::text = $1 LIMIT 1`, [s.learnerId],
      ).then((r: any[]) => r[0]?.g || null).catch(() => null);
      const heads = await this.ds.query(
        `SELECT id, name, amount, COALESCE(priority,100) AS priority FROM fee_items
          WHERE tenant_id = $1 AND (grade_level IS NULL OR grade_level = $2)
            AND ($3::text IS NULL OR term = $3 OR term IS NULL)
          ORDER BY COALESCE(priority,100) ASC, created_at ASC`,
        [tenantId, grade, s.term || null],
      ).catch(() => []);
      const paidRows = await this.ds.query(
        `SELECT fee_item_id, COALESCE(SUM(amount),0) AS paid FROM payment_allocations
          WHERE tenant_id = $1 AND learner_id = $2 AND fee_item_id IS NOT NULL GROUP BY fee_item_id`,
        [tenantId, s.learnerId],
      ).catch(() => []);
      const paidByItem: Record<string, number> = {};
      for (const r of (paidRows as any[])) paidByItem[r.fee_item_id] = Number(r.paid || 0);
      let remaining = Number(s.shortfall);
      const fills: { feeItemId: string | null; name: string; amount: number }[] = [];
      for (const h of (heads as any[])) {
        if (remaining <= 0) break;
        const outstanding = Math.max(0, Number(h.amount || 0) - (paidByItem[h.id] || 0));
        if (outstanding <= 0) continue;
        const put = Math.min(outstanding, remaining);
        fills.push({ feeItemId: h.id, name: h.name, amount: put });
        remaining -= put;
      }
      if (remaining > 0) { fills.push({ feeItemId: null, name: 'Credit / Overpayment', amount: remaining }); stillCredited++; }
      for (const f of fills) {
        await this.ds.query(
          `INSERT INTO payment_allocations
             (tenant_id, payment_id, learner_id, fee_item_id, vote_head, amount, term, academic_year)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [tenantId, s.id, s.learnerId, f.feeItemId, f.name, f.amount, s.term, s.academicYear],
        );
      }
      reconciled++;
    }
    return { reconciled, stillCredited, total: (shortfalls as any[]).length };
  }

  // ── Financial years & opening balances ──────────────────────
  // A set of books runs over a period and opens from the previous period's
  // close. Without this the reports could only ever show a school its first
  // year, because everything before was folded into the same running total.

  private async ensureFinancialYears() {
    await this.ds.query(
      `CREATE TABLE IF NOT EXISTS financial_years (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         tenant_id uuid, year_label text, start_date date, end_date date,
         is_current boolean DEFAULT false, created_at timestamptz DEFAULT NOW())`,
    ).catch(() => null);
    for (const [n, t] of [['opening_cash','numeric(14,2) DEFAULT 0'], ['opening_bank','numeric(14,2) DEFAULT 0'],
      ['opening_source','text'], ['opening_set_at','timestamptz'], ['opening_set_by','uuid']] as [string,string][]) {
      await this.ds.query(`ALTER TABLE financial_years ADD COLUMN IF NOT EXISTS ${n} ${t}`).catch(() => null);
    }
  }

  /** The year a report should run over: the one asked for, else the current one. */
  private async resolveYear(tenantId: string, yearId?: string) {
    await this.ensureFinancialYears();
    const rows = await this.ds.query(
      yearId
        ? `SELECT * FROM financial_years WHERE tenant_id::text = $1 AND id::text = $2 LIMIT 1`
        : `SELECT * FROM financial_years WHERE tenant_id::text = $1
            ORDER BY is_current DESC, start_date DESC LIMIT 1`,
      yearId ? [tenantId, yearId] : [tenantId],
    ).catch(() => []);
    return (rows as any[])[0] || null;
  }

  @Get('financial-years')
  async listFinancialYears(@Request() req: any) {
    await this.ensureFinancialYears();
    return this.ds.query(
      `SELECT id, year_label AS "yearLabel", start_date AS "startDate", end_date AS "endDate",
              is_current AS "isCurrent", opening_cash AS "openingCash", opening_bank AS "openingBank",
              opening_source AS "openingSource", opening_set_at AS "openingSetAt"
         FROM financial_years WHERE tenant_id::text = $1
        ORDER BY start_date DESC`, [req.user.tenantId],
    ).catch(() => []);
  }

  @Post('financial-years')
  async createFinancialYear(@Request() req: any, @Body() dto: any) {
    if (!['hoi', 'dhois', 'tenant_owner', 'school_admin', 'bursar'].includes(req.user.role)) {
      throw new BadRequestException('You do not have permission to manage financial years.');
    }
    await this.ensureFinancialYears();
    const { yearLabel, startDate, endDate } = dto || {};
    if (!yearLabel || !startDate || !endDate) {
      throw new BadRequestException('A year needs a label, a start date and an end date.');
    }
    if (String(startDate) >= String(endDate)) {
      throw new BadRequestException('The year must end after it starts.');
    }
    const tenantId = req.user.tenantId;
    const clash = await this.ds.query(
      `SELECT year_label FROM financial_years
        WHERE tenant_id::text = $1 AND start_date <= $3::date AND end_date >= $2::date LIMIT 1`,
      [tenantId, startDate, endDate],
    ).catch(() => []);
    if ((clash as any[]).length) {
      throw new BadRequestException(`These dates overlap ${(clash as any[])[0].year_label}. Books cannot run over two years at once.`);
    }
    // A new year becomes the one being posted into; the partial unique index
    // permits only one current year, so the old one is stood down first.
    await this.ds.query(`UPDATE financial_years SET is_current = FALSE WHERE tenant_id::text = $1`, [tenantId]).catch(() => null);
    const rows = await this.ds.query(
      `INSERT INTO financial_years (tenant_id, year_label, start_date, end_date, is_current)
       VALUES ($1,$2,$3,$4,TRUE) RETURNING id`, [tenantId, yearLabel, startDate, endDate],
    );
    return { id: (rows as any[])[0]?.id, ok: true };
  }

  @Patch('financial-years/:id/opening')
  async setOpeningBalance(@Request() req: any, @Param('id') id: string, @Body() dto: any) {
    if (!['hoi', 'dhois', 'tenant_owner', 'school_admin', 'bursar'].includes(req.user.role)) {
      throw new BadRequestException('You do not have permission to set opening balances.');
    }
    await this.ensureFinancialYears();
    const cash = Number(dto?.openingCash ?? 0);
    const bank = Number(dto?.openingBank ?? 0);
    if (!isFinite(cash) || !isFinite(bank) || cash < 0 || bank < 0) {
      throw new BadRequestException('Opening balances must be zero or a positive amount.');
    }
    await this.ds.query(
      `UPDATE financial_years
          SET opening_cash = $1, opening_bank = $2, opening_source = $3,
              opening_set_at = NOW(), opening_set_by = $4
        WHERE id::text = $5 AND tenant_id::text = $6`,
      [cash, bank, dto?.source || 'entered by hand', req.user.id, id, req.user.tenantId],
    );
    return { ok: true };
  }

  /**
   * Carry a year's closing cash and bank into the following year as its opening
   * balance. Computed from the books rather than typed, which is the whole point
   * of carrying forward: the two years then cannot disagree.
   */
  @Post('financial-years/:id/carry-forward')
  async carryForward(@Request() req: any, @Param('id') id: string) {
    if (!['hoi', 'dhois', 'tenant_owner', 'school_admin', 'bursar'].includes(req.user.role)) {
      throw new BadRequestException('You do not have permission to close a financial year.');
    }
    const tenantId = req.user.tenantId;
    const from = await this.resolveYear(tenantId, id);
    if (!from) throw new BadRequestException('That financial year was not found.');

    const next = await this.ds.query(
      `SELECT id, year_label FROM financial_years
        WHERE tenant_id::text = $1 AND start_date > $2::date
        ORDER BY start_date ASC LIMIT 1`, [tenantId, from.end_date],
    ).catch(() => []);
    if (!(next as any[]).length) {
      throw new BadRequestException('There is no later financial year to carry these balances into. Create one first.');
    }

    const { closingCash, closingBank } = await this.closingBalancesFor(tenantId, from);
    const target = (next as any[])[0];
    await this.ds.query(
      `UPDATE financial_years
          SET opening_cash = $1, opening_bank = $2,
              opening_source = $3, opening_set_at = NOW(), opening_set_by = $4
        WHERE id::text = $5 AND tenant_id::text = $6`,
      [closingCash, closingBank, `carried forward from ${from.year_label}`, req.user.id, target.id, tenantId],
    );
    return { ok: true, into: target.year_label, openingCash: closingCash, openingBank: closingBank };
  }

  /** Closing cash and bank for one year, from its opening plus that year's movements. */
  private async closingBalancesFor(tenantId: string, year: any) {
    await this.ensurePaymentsTable();
    await this.ensureExpensesTable().catch(() => null);
    const [inRow] = await this.ds.query(
      `SELECT COALESCE(SUM(CASE WHEN lower(COALESCE(method,'')) = 'cash' THEN amount ELSE 0 END),0) AS cash,
              COALESCE(SUM(CASE WHEN lower(COALESCE(method,'')) <> 'cash' THEN amount ELSE 0 END),0) AS bank
         FROM payments WHERE tenant_id::text = $1
          AND COALESCE(paid_on, created_at::date) BETWEEN $2::date AND $3::date`,
      [tenantId, year.start_date, year.end_date],
    ).catch(() => [{ cash: 0, bank: 0 }]);
    const [outRow] = await this.ds.query(
      `SELECT COALESCE(SUM(CASE WHEN lower(COALESCE(payment_method,'')) = 'cash' THEN amount ELSE 0 END),0) AS cash,
              COALESCE(SUM(CASE WHEN lower(COALESCE(payment_method,'')) <> 'cash' THEN amount ELSE 0 END),0) AS bank
         FROM expenses WHERE tenant_id::text = $1
          AND COALESCE(spent_on, created_at::date) BETWEEN $2::date AND $3::date`,
      [tenantId, year.start_date, year.end_date],
    ).catch(() => [{ cash: 0, bank: 0 }]);
    return {
      closingCash: Number(year.opening_cash || 0) + Number(inRow?.cash || 0) - Number(outRow?.cash || 0),
      closingBank: Number(year.opening_bank || 0) + Number(inRow?.bank || 0) - Number(outRow?.bank || 0),
    };
  }

  // School-wide total received per vote head (all learners), optionally filtered by
  // term/academic year. Declared before the ':learnerId' route below so "summary" isn't
  // captured as a learner id.
  @Get('vote-heads/summary')
  async voteHeadSummary(@Request() req: any, @Query() q: any) {
    await this.ensureAllocationsTable();
    const tenantId = req.user.tenantId;
    const rows = await this.ds.query(
      `SELECT COALESCE(vote_head,'Unallocated') AS "voteHead",
              COALESCE(SUM(amount),0) AS "totalReceived",
              COUNT(DISTINCT payment_id) AS "paymentCount"
         FROM payment_allocations
        WHERE tenant_id = $1
          AND ($2::text IS NULL OR term = $2)
          AND ($3::text IS NULL OR academic_year = $3)
        GROUP BY vote_head
        ORDER BY "totalReceived" DESC`,
      [tenantId, q.term || null, q.academicYear || null],
    ).catch(() => []);
    const totalReceived = (rows as any[]).reduce((s, r) => s + Number(r.totalReceived || 0), 0);
    return { voteHeads: rows, totalReceived };
  }

  // The vote heads that apply to a learner (their class's fee items), each with billed amount,
  // amount already paid (from allocations), and outstanding balance — ordered by priority.
  @Get('vote-heads/:learnerId')
  async learnerVoteHeads(@Request() req: any, @Param('learnerId') learnerId: string, @Query() q: any) {
    await this.ensureFeeItemsTable();
    await this.ensureAllocationsTable();
    const tenantId = req.user.tenantId;
    const grade = await this.ds.query(
      `SELECT grade_level AS g FROM learners WHERE id::text = $1 LIMIT 1`, [learnerId],
    ).then((r: any[]) => r[0]?.g || null).catch(() => null);
    const term = q.term || null;
    // Vote heads (fee items) for this learner's class (or school-wide), ordered by priority.
    const heads = await this.ds.query(
      `SELECT id, name, category, amount, COALESCE(priority,100) AS priority
         FROM fee_items
        WHERE tenant_id = $1 AND (grade_level IS NULL OR grade_level = $2)
          AND ($3::text IS NULL OR term = $3 OR term IS NULL)
        ORDER BY COALESCE(priority,100) ASC, created_at ASC`,
      [tenantId, grade, term],
    ).catch(() => []);
    // Amount paid per fee item so far.
    const paidRows = await this.ds.query(
      `SELECT fee_item_id, COALESCE(SUM(amount),0) AS paid
         FROM payment_allocations WHERE tenant_id = $1 AND learner_id = $2
         GROUP BY fee_item_id`,
      [tenantId, learnerId],
    ).catch(() => []);
    const paidByItem: Record<string, number> = {};
    for (const r of (paidRows as any[])) paidByItem[r.fee_item_id] = Number(r.paid || 0);
    const result = (heads as any[]).map(h => {
      const billed = Number(h.amount || 0);
      const paid = paidByItem[h.id] || 0;
      return { feeItemId: h.id, name: h.name, category: h.category, priority: h.priority,
               billed, paid, balance: Math.max(0, billed - paid) };
    });
    const totalBilled = result.reduce((s, h) => s + h.billed, 0);
    const totalPaid = result.reduce((s, h) => s + h.paid, 0);
    return { voteHeads: result, totalBilled, totalPaid, totalBalance: Math.max(0, totalBilled - totalPaid) };
  }

  /**
   * Printable fee invoices — one learner or a whole class.
   *
   * The PDF route at /pdf/invoice/:id cannot serve these: it looks the id up in
   * the invoices table, but this system never writes one. An "invoice" here is
   * derived from the learner's fee items and what they have paid, so the id the
   * Fee Invoices screen holds is a LEARNER id and that lookup always 404s.
   * Built from the same source as the list instead, so the two always agree.
   */
  @Get('invoices/print')
  async printInvoices(@Request() req: any, @Query() q: any, @Res() res: any) {
    if (!['hoi', 'dhois', 'tenant_owner', 'school_admin', 'bursar'].includes(req.user.role)) {
      res.status(403).send('<p>Not authorised.</p>'); return;
    }
    const tenantId = req.user.tenantId;
    const esc = (s: any) => String(s ?? '').replace(/[&<>]/g, (c: string) => ({ '&':'&amp;','<':'&lt;','>':'&gt;' }[c] || c));
    const ksh = (n: any) => 'KES ' + Number(n || 0).toLocaleString('en-KE');

    const school = await this.ds.query(
      `SELECT name, address, phone FROM schools WHERE tenant_id::text = $1 LIMIT 1`, [tenantId],
    ).then((r: any[]) => r[0] || {}).catch(() => ({} as any));

    // One learner, or every learner matching the class filter.
    const learners = await this.ds.query(
      `SELECT l.id, l.first_name AS "firstName", l.last_name AS "lastName",
              l.admission_number AS "admissionNumber", l.grade_level AS "gradeLevel",
              l.guardian_name AS "guardianName", l.guardian_phone AS "guardianPhone",
              s.name AS "streamName"
         FROM learners l LEFT JOIN streams s ON s.id::text = l.stream_id::text
        WHERE l.tenant_id::text = $1 AND l.is_active = true
          AND ($2::text IS NULL OR l.id::text = $2)
          AND ($3::text IS NULL OR l.grade_level = $3)
          AND ($4::text IS NULL OR l.stream_id::text = $4)
        ORDER BY l.grade_level, s.name, l.first_name`,
      [tenantId, q.learnerId || null, q.gradeLevel || null, q.streamId || null],
    ).catch(() => []);

    if (!(learners as any[]).length) {
      res.set('Content-Type', 'text/html').send('<p>No learners matched. Check the class filter.</p>'); return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const pages: string[] = [];
    for (const l of learners as any[]) {
      const v = await this.learnerVoteHeads(req, l.id, q);
      const rows = (v.voteHeads || []).map((h: any) =>
        `<tr><td>${esc(h.name)}</td><td class="n">${ksh(h.billed)}</td>`
        + `<td class="n">${ksh(h.paid)}</td><td class="n">${ksh(h.balance)}</td></tr>`).join('')
        || '<tr><td colspan="4">No fee items billed for this class</td></tr>';
      pages.push(`<section class="inv">
        <div class="ih">
          <div><div class="sn">${esc(school.name || 'School')}</div>
            <div class="sm">${esc(school.address || '')}${school.phone ? ` · ${esc(school.phone)}` : ''}</div></div>
          <div class="ttl">FEE INVOICE</div>
        </div>
        <table class="meta"><tbody>
          <tr><td><strong>Learner</strong></td><td>${esc(`${l.firstName || ''} ${l.lastName || ''}`.trim())}</td>
              <td><strong>Adm No</strong></td><td>${esc(l.admissionNumber || '')}</td></tr>
          <tr><td><strong>Class</strong></td><td>${esc(l.streamName || String(l.gradeLevel || '').replace(/_/g, ' '))}</td>
              <td><strong>Date</strong></td><td>${esc(today)}</td></tr>
          <tr><td><strong>Guardian</strong></td><td>${esc(l.guardianName || '')}</td>
              <td><strong>Phone</strong></td><td>${esc(l.guardianPhone || '')}</td></tr>
        </tbody></table>
        <table><thead><tr><th>Vote head</th><th class="n">Billed</th><th class="n">Paid</th><th class="n">Balance</th></tr></thead>
          <tbody>${rows}</tbody>
          <tfoot><tr><td>Total</td><td class="n">${ksh(v.totalBilled)}</td>
            <td class="n">${ksh(v.totalPaid)}</td><td class="n">${ksh(v.totalBalance)}</td></tr></tfoot></table>
        <p class="note">Balance due: <strong>${ksh(v.totalBalance)}</strong>. Please quote the admission number on payment.</p>
      </section>`);
    }

    res.set('Content-Type', 'text/html').send(`<!doctype html><html><head><meta charset="utf-8">
      <title>Fee Invoice${(learners as any[]).length > 1 ? 's' : ''}</title><style>
      @page{size:A4 portrait;margin:14mm}
      body{font-family:Arial,sans-serif;color:#1a2e5a;margin:20px}
      .inv{padding-bottom:10px}
      .inv + .inv{border-top:2px dashed #bbb;margin-top:22px;padding-top:22px}
      .ih{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #1a2e5a;padding-bottom:8px}
      .sn{font-size:18px;font-weight:bold}.sm{font-size:11px;color:#555}
      .ttl{font-size:15px;font-weight:bold;letter-spacing:.08em}
      table{width:100%;border-collapse:collapse;margin-top:10px;font-size:12px}
      th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}
      th{background:#1a2e5a;color:#fff}
      td.n,th.n{text-align:right}
      tfoot td{font-weight:bold;background:#f0f2f8}
      .meta td{border:none;padding:3px 6px;font-size:12px}
      .note{font-size:12px;margin-top:8px}
      .print{margin:16px 0;text-align:center}
      button{background:#f5820a;color:#fff;border:none;padding:8px 18px;border-radius:6px;cursor:pointer;font-weight:bold}
      @media print{.print{display:none}.inv{page-break-after:always}.inv:last-child{page-break-after:auto}
        .inv + .inv{border-top:none;margin-top:0;padding-top:0}}
      ${PRINT_FOOTER_CSS}
      </style></head><body>
      <div class="print"><button onclick="window.print()">🖨 Print / Save as PDF</button>
        &nbsp;<span style="font-size:12px;color:#555">${(learners as any[]).length} invoice(s)</span></div>
      ${pages.join('')}
      ${PRINT_FOOTER_HTML}</body></html>`);
  }

  @Get('invoices')
  async getInvoices(@Request() req: any, @Query() q: any) {
    // An "invoice" here is a learner's current statement: what they've been billed across vote
    // heads vs paid. Returns one row per learner with balances, filterable by class/term/search.
    // Shape matches what the Finance "Fee Invoices" screen renders (totalAmount/amountPaid/
    // status/invoiceNumber/learner.{firstName,lastName,admissionNumber,guardianPhone,stream}).
    await this.ensureFeeItemsTable();
    await this.ensureAllocationsTable();
    const tenantId = req.user.tenantId;
    const term = q.term || null;
    const academicYear = q.academicYear || null;
    const learners = await this.ds.query(
      `SELECT l.id, l.first_name AS "firstName", l.last_name AS "lastName",
              l.admission_number AS "admissionNumber", l.grade_level AS "gradeLevel",
              l.guardian_phone AS "guardianPhone", s.name AS "streamName"
         FROM learners l LEFT JOIN streams s ON s.id::text = l.stream_id::text
        WHERE l.tenant_id::text = $1 AND l.is_active = true
          AND ($2::text IS NULL OR l.grade_level = $2)
          AND ($3::text IS NULL OR (l.first_name || ' ' || COALESCE(l.last_name,'')) ILIKE '%' || $3 || '%')
          AND ($4::text IS NULL OR l.stream_id::text = $4)
        ORDER BY l.grade_level, s.name, l.first_name`,
      [tenantId, q.gradeLevel || null, q.search || null, q.streamId || null],
    ).catch(() => []);
    // Billed per grade (sum of fee items for the selected term/year), and paid per learner
    // (sum of allocations for the same term/year) — so switching term/year updates the totals.
    const billedRows = await this.ds.query(
      `SELECT grade_level AS g, COALESCE(SUM(amount),0) AS billed FROM fee_items
        WHERE tenant_id = $1
          AND ($2::text IS NULL OR term = $2 OR term IS NULL)
          AND ($3::text IS NULL OR academic_year = $3 OR academic_year IS NULL)
        GROUP BY grade_level`,
      [tenantId, term, academicYear],
    ).catch(() => []);
    const billedByGrade: Record<string, number> = {};
    let schoolWide = 0;
    for (const r of (billedRows as any[])) { if (r.g === null) schoolWide += Number(r.billed); else billedByGrade[r.g] = Number(r.billed); }
    const paidRows = await this.ds.query(
      `SELECT learner_id, COALESCE(SUM(amount),0) AS paid FROM payment_allocations
        WHERE tenant_id = $1
          AND ($2::text IS NULL OR term = $2)
          AND ($3::text IS NULL OR academic_year = $3)
        GROUP BY learner_id`,
      [tenantId, term, academicYear],
    ).catch(() => []);
    const paidByLearner: Record<string, number> = {};
    for (const r of (paidRows as any[])) paidByLearner[r.learner_id] = Number(r.paid || 0);
    return (learners as any[])
      // A learner with nothing billed for this term/year has no invoice at all — showing them
      // as "unpaid" would falsely inflate the unpaid count and clutter the list with every
      // learner in the school whenever a fee structure is only set for some classes.
      .filter(l => (billedByGrade[l.gradeLevel] || 0) + schoolWide > 0)
      .map(l => {
        const totalAmount = (billedByGrade[l.gradeLevel] || 0) + schoolWide;
        const amountPaid = paidByLearner[l.id] || 0;
        const balance = totalAmount - amountPaid;
        const status = balance > 0 ? (amountPaid > 0 ? 'partial' : 'unpaid')
          : balance < 0 ? 'overpaid' : 'paid';
        return {
          id: l.id,
          invoiceNumber: `INV-${String(l.admissionNumber || l.id).slice(0, 8).toUpperCase()}`,
          totalAmount, amountPaid, status,
          learner: {
            firstName: l.firstName, lastName: l.lastName, admissionNumber: l.admissionNumber,
            guardianPhone: l.guardianPhone, stream: { name: l.streamName },
          },
        };
      });
  }

  @Get('invoices/:id')
  async getInvoice(@Request() req: any, @Param('id') learnerId: string, @Query() q: any) {
    // Full statement for one learner: vote-head breakdown + payment history.
    return this.learnerVoteHeads(req, learnerId, q);
  }

  @Post('invoices')
  createInvoice(@Request() req: any, @Body() dto: any) { return { id: 'stub', ...dto }; }

  @Get('receipts')
  async getReceipts(@Request() req: any, @Query() q: any) {
    await this.ensurePaymentsTable();
    return this.ds.query(
      `SELECT id, receipt_number AS "receiptNumber", learner_name AS "learnerName",
              admission_number AS "admissionNumber", amount, method, reference,
              term, academic_year AS "academicYear", paid_on AS "paidOn", created_at AS "createdAt"
         FROM payments WHERE tenant_id = $1
         ORDER BY COALESCE(paid_on, created_at::date) DESC LIMIT 500`,
      [req.user.tenantId],
    ).catch(() => []);
  }

  // Accounting reports as printable HTML (the browser prints to PDF). Real data from payments,
  // allocations, expenses, and fee items. key ∈ cashbook|ledger|trial_balance|income|fee_statement
  @Get('reports/:key')
  async financeReport(@Request() req: any, @Param('key') key: string, @Query() q: any, @Res() res: any) {
    try {
      await this.financeReportInner(req, key, q, res);
    } catch (e: any) {
      // Any unexpected failure here previously bubbled up as a bare 500 with no body, which
      // axios (and the "View / Print" button) surfaced only as a generic "Could not generate"
      // toast — impossible to debug from the UI. Return a readable error page instead.
      res.status(500).set('Content-Type', 'text/html').send(`<p>Could not generate this report: ${String(e?.message || e).replace(/[<>&]/g, '')}</p>`);
    }
  }

  private async financeReportInner(req: any, key: string, q: any, res: any) {
    if (!['hoi', 'dhois', 'tenant_owner', 'school_admin', 'bursar'].includes(req.user.role)) {
      res.status(403).send('<p>Not authorised.</p>'); return;
    }
    await this.ensurePaymentsTable();
    await this.ensureAllocationsTable();
    await this.ensureFeeItemsTable();
    await this.ensureExpensesTable().catch(() => null);
    const tenantId = req.user.tenantId;
    const esc = (s: any) => String(s ?? '').replace(/[&<>]/g, (c: string) => ({ '&':'&amp;','<':'&lt;','>':'&gt;' }[c] || c));
    const ksh = (n: any) => 'KES ' + Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 0 });
    // A DATE column comes back from pg as a JS Date, whose default toString is
    // "Tue Sep 01 2026 00:00:00 GMT+0300 (East Africa Time)" — unreadable in a
    // cash book column. Render the calendar date only.
    // Built from the local date parts, never toISOString(): pg hands back a DATE
    // as midnight local time, and in Nairobi (UTC+3) converting that to UTC
    // rolls it onto the previous day — a year starting 2027-01-01 printed as
    // 2026-12-31.
    const dmy = (v: any) => {
      if (!v) return '';
      if (typeof v === 'string') return v.slice(0, 10);
      const d = v instanceof Date ? v : new Date(String(v));
      if (isNaN(d.getTime())) return String(v);
      const p = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    };
    const school = await this.ds.query(`SELECT name FROM schools WHERE tenant_id = $1 LIMIT 1`, [tenantId]).then((r: any[]) => r[0]?.name || 'School').catch(() => 'School');
    const today = new Date().toISOString().slice(0, 10);

    // Books run over a financial year. Where a school has not set one up, fall
    // back to every transaction it has — the reports then behave as they did
    // before, rather than showing an empty book.
    const year = await this.resolveYear(tenantId, q.yearId);
    const from = year?.start_date || '1900-01-01';
    const to   = year?.end_date   || '2999-12-31';

    const payments = await this.ds.query(
      `SELECT id, receipt_number, learner_name, admission_number, amount, method, reference,
              COALESCE(paid_on, created_at::date) AS d
         FROM payments WHERE tenant_id = $1
          AND COALESCE(paid_on, created_at::date) BETWEEN $2::date AND $3::date
        ORDER BY d ASC`, [tenantId, from, to],
    ).catch(() => []);
    const expenses = await this.ds.query(
      // Analysed by the vote head it was charged to, falling back to category for
      // expenses recorded before that was captured (migration 070) — so no past
      // report changes and the two sides of a head can finally net off.
      `SELECT id, description, category, vote_head, amount, payment_method,
              voucher_number, cheque_number,
              COALESCE(NULLIF(vote_head,''), NULLIF(category,''), 'Uncategorised') AS head,
              COALESCE(spent_on, created_at::date) AS d
         FROM expenses WHERE tenant_id = $1
          AND COALESCE(spent_on, created_at::date) BETWEEN $2::date AND $3::date
        ORDER BY d ASC`, [tenantId, from, to],
    ).catch(() => []);
    const totalIn = (payments as any[]).reduce((s, p) => s + Number(p.amount || 0), 0);
    const totalOut = (expenses as any[]).reduce((s, e) => s + Number(e.amount || 0), 0);

    // ── Final books: shared groundwork ──────────────────────────
    // Modelled on the Zaroda Books workbooks. House convention: a receipt
    // allocated to a vote head CREDITS it (funds voted), a payment allocated to
    // one DEBITS it (funds spent), so an unspent vote carries a credit balance.
    // Scoped through the payment, so an allocation follows the receipt it came
    // from into whichever year that receipt falls in.
    const allocRows = await this.ds.query(
      `SELECT a.payment_id, COALESCE(a.vote_head,'Unallocated') AS head, COALESCE(SUM(a.amount),0) AS amount
         FROM payment_allocations a
         JOIN payments p ON p.id::text = a.payment_id::text
        WHERE a.tenant_id = $1
          AND COALESCE(p.paid_on, p.created_at::date) BETWEEN $2::date AND $3::date
        GROUP BY a.payment_id, a.vote_head`, [tenantId, from, to],
    ).catch(() => []);

    // payment id -> { head: amount }, so each cash-book row can be analysed.
    const allocByPayment = new Map<string, Record<string, number>>();
    for (const r of allocRows as any[]) {
      const key = String(r.payment_id);
      const bucket = allocByPayment.get(key) || {};
      bucket[r.head] = (bucket[r.head] || 0) + Number(r.amount || 0);
      allocByPayment.set(key, bucket);
    }

    // The chart is the school's own: fee vote heads on the receipts side,
    // expense categories on the payments side. Unlike a capitation book there is
    // no Ministry circular fixing these — they are whatever the school bills and
    // spends on, so they are read from the data rather than hard-coded.
    const receiptHeads = [...new Set((allocRows as any[]).map(r => String(r.head)))].sort();
    const paymentHeads = [...new Set((expenses as any[]).map(e => String(e.head || 'Uncategorised')))].sort();

    // A school's own money is cash unless it moved through a bank or M-Pesa.
    const isCashMethod = (m: any) => String(m || '').toLowerCase().trim() === 'cash';

    const allocatedTotal = (allocRows as any[]).reduce((s, r) => s + Number(r.amount || 0), 0);
    const unallocated = totalIn - allocatedTotal;

    let receiptsCash = 0, receiptsBank = 0;
    for (const p of payments as any[]) {
      if (isCashMethod(p.method)) receiptsCash += Number(p.amount || 0);
      else receiptsBank += Number(p.amount || 0);
    }
    let paymentsCash = 0, paymentsBank = 0;
    for (const e of expenses as any[]) {
      // Expenses default to bank: a school pays suppliers by cheque or transfer
      // far more often than in cash, and an unrecorded method is not evidence of
      // a cash payment.
      if (isCashMethod(e.payment_method)) paymentsCash += Number(e.amount || 0);
      else paymentsBank += Number(e.amount || 0);
    }
    const openingCash = Number(year?.opening_cash || 0);
    const openingBank = Number(year?.opening_bank || 0);
    const closingCash = openingCash + receiptsCash - paymentsCash;
    const closingBank = openingBank + receiptsBank - paymentsBank;

    const spendByHead: Record<string, number> = {};
    for (const e of expenses as any[]) {
      const h = String(e.head || 'Uncategorised');
      spendByHead[h] = (spendByHead[h] || 0) + Number(e.amount || 0);
    }
    const votedByHead: Record<string, number> = {};
    for (const r of allocRows as any[]) {
      votedByHead[String(r.head)] = (votedByHead[String(r.head)] || 0) + Number(r.amount || 0);
    }

    // The analysed cash book grows a column per vote head, so it only fits
    // across the page. Every other book is a few narrow columns and stays upright.
    const landscape = key === 'cashbook';

    const wrap = (title: string, inner: string) => `<!doctype html><html><head><meta charset="utf-8">
      <title>${esc(title)}</title><style>
      @page{size:${landscape ? 'A4 landscape' : 'A4 portrait'};margin:12mm}
      body{font-family:Arial,sans-serif;margin:24px;color:#1a2e5a}
      .head{text-align:center;border-bottom:3px solid #1a2e5a;padding-bottom:10px;margin-bottom:16px}
      .head h1{margin:0;font-size:20px}.head h2{margin:4px 0 0;font-size:14px;font-weight:400;color:#555}
      table{width:100%;border-collapse:collapse;margin-top:10px;font-size:12px}
      th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}
      th{background:#1a2e5a;color:#fff}
      td.n,th.n{text-align:right}
      tfoot td{font-weight:bold;background:#f0f2f8}
      .print{margin:16px 0;text-align:center}
      button{background:#f5820a;color:#fff;border:none;padding:8px 18px;border-radius:6px;cursor:pointer;font-weight:bold}
      @media print{.print{display:none}${landscape ? 'table{font-size:10px}th,td{padding:4px 5px}' : ''}}
      ${PRINT_FOOTER_CSS}
      </style></head><body>
      <div class="head"><h1>${esc(school)}</h1><h2>${esc(title)}${
        year ? ` · ${esc(year.year_label)} (${esc(dmy(year.start_date))} to ${esc(dmy(year.end_date))})` : ''
      } · printed ${esc(today)}</h2></div>
      <div class="print"><button onclick="window.print()">🖨 Print / Save as PDF</button></div>
      ${inner}
      ${PRINT_FOOTER_HTML}</body></html>`;

    let inner = '';
    if (key === 'cashbook') {
      // Analysed cash book: receipts above, payments below, each row split into
      // cash and bank and then analysed across the school's vote heads — the
      // layout the Zaroda Books workbooks use.
      const inCols = receiptHeads.length ? receiptHeads : ['Unallocated'];
      const outCols = paymentHeads.length ? paymentHeads : ['Uncategorised'];

      // Fee collections are summarised to one line per day. Naming every learner
      // here would run to thousands of rows and duplicates the fee statement,
      // which is where a per-learner account belongs. The day's total is still
      // analysed across the vote heads, so nothing is lost from the book.
      const byDay = new Map<string, {
        cash: number; bank: number; total: number; count: number; analysis: Record<string, number>;
      }>();
      for (const p of payments as any[]) {
        const day = dmy(p.d);
        const row = byDay.get(day) || { cash: 0, bank: 0, total: 0, count: 0, analysis: {} };
        const amt = Number(p.amount || 0);
        if (isCashMethod(p.method)) row.cash += amt; else row.bank += amt;
        row.total += amt;
        row.count += 1;
        for (const [h, v] of Object.entries(allocByPayment.get(String(p.id)) || {})) {
          row.analysis[h] = (row.analysis[h] || 0) + Number(v || 0);
        }
        byDay.set(day, row);
      }

      const inTotals: Record<string, number> = {};
      const rowsIn = [...byDay.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([day, r]) => {
          const cells = inCols.map(h => {
            const v = Number(r.analysis[h] || 0);
            inTotals[h] = (inTotals[h] || 0) + v;
            return `<td class="n">${v ? ksh(v) : ''}</td>`;
          }).join('');
          return `<tr><td>${esc(day)}</td><td class="n">${r.count}</td>`
            + `<td>Received from learners</td>`
            + `<td class="n">${r.cash ? ksh(r.cash) : ''}</td><td class="n">${r.bank ? ksh(r.bank) : ''}</td>`
            + `<td class="n">${ksh(r.total)}</td>${cells}</tr>`;
        }).join('') || `<tr><td colspan="${6 + inCols.length}">No receipts recorded</td></tr>`;

      const outTotals: Record<string, number> = {};
      const rowsOut = (expenses as any[]).map(e => {
        const amt = Number(e.amount || 0);
        const cash = isCashMethod(e.payment_method) ? amt : 0;
        const bank = isCashMethod(e.payment_method) ? 0 : amt;
        const head = String(e.head || 'Uncategorised');
        const cells = outCols.map(h => {
          const v = h === head ? amt : 0;
          if (v) outTotals[h] = (outTotals[h] || 0) + v;
          return `<td class="n">${v ? ksh(v) : ''}</td>`;
        }).join('');
        return `<tr><td>${esc(dmy(e.d))}</td><td>${esc(e.voucher_number || e.cheque_number || '')}</td>`
          + `<td>${esc(e.description || '')}</td>`
          + `<td class="n">${cash ? ksh(cash) : ''}</td><td class="n">${bank ? ksh(bank) : ''}</td>`
          + `<td class="n">${ksh(amt)}</td>${cells}</tr>`;
      }).join('') || `<tr><td colspan="${6 + outCols.length}">No payments recorded</td></tr>`;

      const head = (cols: string[], second: string) =>
        `<tr><th>Date</th><th class="n">${second}</th><th>Particulars</th><th class="n">Cash</th><th class="n">Bank</th>`
        + `<th class="n">Total</th>${cols.map(c => `<th class="n">${esc(c)}</th>`).join('')}</tr>`;

      inner = `
        <h3>Receipts</h3>
        <table><thead>${head(inCols, 'Receipts')}</thead><tbody>
          <tr><td colspan="3"><em>Balance brought forward</em></td><td class="n">${ksh(openingCash)}</td><td class="n">${ksh(openingBank)}</td><td class="n"></td>${inCols.map(() => '<td></td>').join('')}</tr>
          ${rowsIn}
        </tbody><tfoot><tr><td colspan="3">Totals</td><td class="n">${ksh(receiptsCash)}</td><td class="n">${ksh(receiptsBank)}</td><td class="n">${ksh(totalIn)}</td>${inCols.map(h => `<td class="n">${ksh(inTotals[h] || 0)}</td>`).join('')}</tr></tfoot></table>

        <h3>Payments</h3>
        <table><thead>${head(outCols, 'Voucher')}</thead><tbody>${rowsOut}</tbody>
        <tfoot>
          <tr><td colspan="3">Totals</td><td class="n">${ksh(paymentsCash)}</td><td class="n">${ksh(paymentsBank)}</td><td class="n">${ksh(totalOut)}</td>${outCols.map(h => `<td class="n">${ksh(outTotals[h] || 0)}</td>`).join('')}</tr>
          <tr><td colspan="3">Balance carried down</td><td class="n">${ksh(closingCash)}</td><td class="n">${ksh(closingBank)}</td><td class="n">${ksh(closingCash + closingBank)}</td>${outCols.map(() => '<td></td>').join('')}</tr>
        </tfoot></table>
        <p style="font-size:11px;color:#666">Fee collections are summarised to one line a day, with the number of receipts behind it; the individual learner accounts are in the Fee Statements report. Receipts are analysed by fee vote head; payments by expense category. A receipt taken by M-Pesa or bank transfer is shown in the bank column, one taken in cash in the cash column; an expense with no recorded method is treated as bank.${
          year ? (Number(year.opening_cash || 0) || Number(year.opening_bank || 0)
            ? ` Opening balances ${esc(year.opening_source || 'as recorded')}.`
            : ' No opening balance has been set for this year — the book runs from nil.')
          : ' No financial year has been set up, so this covers every transaction recorded.'}</p>
        ${unallocated ? `<p style="font-size:11px;color:#a00">${ksh(unallocated)} of receipts is not analysed to any vote head. Use <strong>Reconcile balances</strong> on the Accounting page to attribute it.</p>` : ''}`;
    } else if (key === 'cash_flow') {
      inner = `<table><tbody>
          <tr><td>Opening cash in hand</td><td class="n">${ksh(openingCash)}</td></tr>
          <tr><td>Opening cash at bank</td><td class="n">${ksh(openingBank)}</td></tr>
          <tr><td><strong>Opening balance</strong></td><td class="n"><strong>${ksh(openingCash + openingBank)}</strong></td></tr>
          <tr><td>Add: receipts — cash</td><td class="n">${ksh(receiptsCash)}</td></tr>
          <tr><td>Add: receipts — bank</td><td class="n">${ksh(receiptsBank)}</td></tr>
          <tr><td>Less: payments — cash</td><td class="n">(${ksh(paymentsCash)})</td></tr>
          <tr><td>Less: payments — bank</td><td class="n">(${ksh(paymentsBank)})</td></tr>
          <tr><td>Closing cash in hand</td><td class="n">${ksh(closingCash)}</td></tr>
          <tr><td>Closing cash at bank</td><td class="n">${ksh(closingBank)}</td></tr>
        </tbody>
        <tfoot><tr><td>Closing balance</td><td class="n">${ksh(closingCash + closingBank)}</td></tr></tfoot></table>`;
    } else if (key === 'income') {
      // Income statement: revenue by vote head − expenses by category.
      const rev = await this.ds.query(
        `SELECT COALESCE(vote_head,'Unallocated') AS head, COALESCE(SUM(amount),0) AS total
           FROM payment_allocations WHERE tenant_id = $1 GROUP BY vote_head ORDER BY total DESC`, [tenantId],
      ).catch(() => []);
      const exp = await this.ds.query(
        `SELECT COALESCE(NULLIF(vote_head,''), NULLIF(category,''), 'Other') AS cat,
                COALESCE(SUM(amount),0) AS total
           FROM expenses WHERE tenant_id = $1
          GROUP BY COALESCE(NULLIF(vote_head,''), NULLIF(category,''), 'Other')
          ORDER BY total DESC`, [tenantId],
      ).catch(() => []);
      const revRows = (rev as any[]).map(r => `<tr><td>${esc(r.head)}</td><td class="n">${ksh(r.total)}</td></tr>`).join('') || '<tr><td>No revenue recorded</td><td class="n">KES 0</td></tr>';
      const expRows = (exp as any[]).map(r => `<tr><td>${esc(r.cat)}</td><td class="n">${ksh(r.total)}</td></tr>`).join('') || '<tr><td>No expenses recorded</td><td class="n">KES 0</td></tr>';
      inner = `<h3>Revenue (Fee Collections by Vote Head)</h3>
        <table><tbody>${revRows}</tbody><tfoot><tr><td>Total Revenue</td><td class="n">${ksh(totalIn)}</td></tr></tfoot></table>
        <h3>Expenditure</h3>
        <table><tbody>${expRows}</tbody><tfoot><tr><td>Total Expenditure</td><td class="n">${ksh(totalOut)}</td></tr></tfoot></table>
        <h3>Surplus / (Deficit)</h3>
        <table><tfoot><tr><td>Net</td><td class="n">${ksh(totalIn - totalOut)}</td></tr></tfoot></table>`;
    } else if (key === 'trial_balance') {
      // Year-to-date trial balance in the workbook layout: vote head balances,
      // with opening cash and bank on the credit side and closing cash and bank
      // on the debit side. It is expected to balance, and says so when it does not.
      const heads = [...new Set([...receiptHeads, ...paymentHeads])].sort();
      const rows = heads.map(h => {
        const dr = spendByHead[h] || 0;   // spent
        const cr = votedByHead[h] || 0;   // voted
        return `<tr><td>${esc(h)}</td><td class="n">${dr ? ksh(dr) : ''}</td><td class="n">${cr ? ksh(cr) : ''}</td></tr>`;
      }).join('') || '<tr><td colspan="3">No vote head activity</td></tr>';

      const totalDr = totalOut + closingCash + closingBank;
      const totalCr = allocatedTotal + openingCash + openingBank;
      const diff = totalDr - totalCr;

      inner = `<table><thead><tr><th>Vote head</th><th class="n">Debit (spent)</th><th class="n">Credit (voted)</th></tr></thead>
        <tbody>
          <tr><td><em>Opening cash in hand</em></td><td class="n"></td><td class="n">${ksh(openingCash)}</td></tr>
          <tr><td><em>Opening cash at bank</em></td><td class="n"></td><td class="n">${ksh(openingBank)}</td></tr>
          ${rows}
          <tr><td>Closing cash in hand</td><td class="n">${ksh(closingCash)}</td><td class="n"></td></tr>
          <tr><td>Closing cash at bank</td><td class="n">${ksh(closingBank)}</td><td class="n"></td></tr>
        </tbody>
        <tfoot><tr><td>Totals</td><td class="n">${ksh(totalDr)}</td><td class="n">${ksh(totalCr)}</td></tr></tfoot></table>
        ${diff === 0
          ? '<p style="font-size:12px;color:#0a7">The books balance.</p>'
          : `<p style="font-size:12px;color:#a00"><strong>Out of balance by ${ksh(Math.abs(diff))}.</strong> `
            + `${unallocated ? `${ksh(unallocated)} of receipts has not been analysed to a vote head — run <strong>Reconcile balances</strong> on the Accounting page.` : 'Check that every receipt and expense carries a vote head.'}</p>`}`;
    } else if (key === 'ledger') {
      // One account per vote head, in the workbook convention: receipts credit a
      // head (funds voted), payments debit it (funds spent), so an unspent vote
      // carries a credit balance.
      const heads = [...new Set([...receiptHeads, ...paymentHeads])].sort();
      const rows = heads.map(h => {
        const cr = votedByHead[h] || 0;
        const dr = spendByHead[h] || 0;
        const bal = cr - dr;
        return `<tr><td>${esc(h)}</td><td class="n">${cr ? ksh(cr) : ''}</td><td class="n">${dr ? ksh(dr) : ''}</td>`
          + `<td class="n">${ksh(Math.abs(bal))} ${bal < 0 ? 'Dr' : 'Cr'}</td></tr>`;
      }).join('') || '<tr><td colspan="4">No transactions</td></tr>';
      inner = `<table><thead><tr><th>Vote head</th><th class="n">Voted (Cr)</th><th class="n">Spent (Dr)</th><th class="n">Balance</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td>Totals</td><td class="n">${ksh(allocatedTotal)}</td><td class="n">${ksh(totalOut)}</td><td class="n">${ksh(allocatedTotal - totalOut)} Cr</td></tr></tfoot></table>
        <p style="font-size:11px;color:#666">A credit balance is a vote with funds still unspent; a debit balance means more has been spent on that head than was voted to it.</p>`;
    } else if (key === 'fee_statement') {
      const invoices = await this.getInvoices(req, q);
      const rows = (invoices as any[]).map(i => `<tr><td>${esc(i.learner?.admissionNumber || '')}</td><td>${esc(`${i.learner?.firstName || ''} ${i.learner?.lastName || ''}`.trim())}</td><td>${esc(i.learner?.stream?.name || '')}</td><td class="n">${ksh(i.totalAmount)}</td><td class="n">${ksh(i.amountPaid)}</td><td class="n">${ksh(i.totalAmount - i.amountPaid)}</td></tr>`).join('') || '<tr><td colspan="6">No learners</td></tr>';
      const tb = (invoices as any[]).reduce((s, i) => s + i.totalAmount, 0);
      const tp = (invoices as any[]).reduce((s, i) => s + i.amountPaid, 0);
      // A printed statement must say who it covers, or a stack of them is
      // indistinguishable once the filter is forgotten.
      const streamName = q.streamId
        ? await this.ds.query(`SELECT name FROM streams WHERE id::text = $1 LIMIT 1`, [q.streamId])
            .then((r: any[]) => r[0]?.name || '').catch(() => '')
        : '';
      const scope = [
        q.gradeLevel ? String(q.gradeLevel).replace(/_/g, ' ') : '',
        streamName,
        q.search ? `matching “${q.search}”` : '',
      ].filter(Boolean).join(' · ');
      inner = `<p style="font-size:12px;margin:0 0 6px"><strong>${esc(scope || 'All classes')}</strong> — ${(invoices as any[]).length} learner(s)</p>
        <table><thead><tr><th>Adm No</th><th>Learner</th><th>Class</th><th class="n">Billed</th><th class="n">Paid</th><th class="n">Balance</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td colspan="3">Totals</td><td class="n">${ksh(tb)}</td><td class="n">${ksh(tp)}</td><td class="n">${ksh(tb - tp)}</td></tr></tfoot></table>`;
    } else {
      res.status(400).send('<p>Unknown report.</p>'); return;
    }
    res.set('Content-Type', 'text/html').send(wrap(
      ({ cashbook:'Analysed Cash Book', income:'Income & Expenditure', trial_balance:'Trial Balance',
         ledger:'Vote Head Ledger', cash_flow:'Cash Flow Statement', fee_statement:'Fee Statements' } as any)[key] || 'Report',
      inner));
  }

  // Parent-safe: a parent's OWN child's balance + payment history (read-only). Verifies the
  // learner's guardian_email matches the requesting parent's account email.
  @Get('payments/my-child/:learnerId')
  async parentChildFinance(@Request() req: any, @Param('learnerId') learnerId: string) {
    await this.ensurePaymentsTable();
    const tenantId = req.user.tenantId;
    // Parents may only view their own child; staff (bursar/admin) may view any learner.
    if (req.user.role === 'parent') {
      const ok = await this.ds.query(
        `SELECT 1 FROM learners WHERE id::text = $1 AND tenant_id = $2
            AND LOWER(guardian_email) = LOWER($3) LIMIT 1`,
        [learnerId, tenantId, String(req.user.email || '')],
      ).catch(() => []);
      if (!ok.length) throw new BadRequestException('You can only view your own child’s account.');
    }
    const payments = await this.ds.query(
      `SELECT id, amount, method, reference, term, academic_year AS "academicYear",
              receipt_number AS "receiptNumber", paid_on AS "paidOn", created_at AS "createdAt"
         FROM payments WHERE tenant_id = $1 AND learner_id = $2
        ORDER BY COALESCE(paid_on, created_at::date) DESC`,
      [tenantId, learnerId],
    ).catch(() => []);
    const totalPaid = payments.reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
    const grade = await this.ds.query(
      `SELECT grade_level AS g FROM learners WHERE id::text = $1 LIMIT 1`, [learnerId],
    ).then((r: any[]) => r[0]?.g || null).catch(() => null);
    const billedRows = await this.ds.query(
      `SELECT COALESCE(SUM(amount),0) AS billed FROM fee_items
        WHERE tenant_id = $1 AND (grade_level IS NULL OR grade_level = $2)`,
      [tenantId, grade],
    ).catch(() => [{ billed: 0 }]);
    const totalBilled = Number(billedRows[0]?.billed || 0);
    return { payments, totalPaid, totalBilled, balance: totalBilled - totalPaid };
  }

  // Edit a recorded payment (bursar/admin only).
  @Patch('payments/:id')
  async updatePayment(@Request() req: any, @Param('id') id: string, @Body() dto: any) {
    const role = req.user.role;
    if (!['hoi', 'dhois', 'tenant_owner', 'school_admin', 'bursar'].includes(role)) {
      throw new BadRequestException('Only the bursar or an administrator can edit payments.');
    }
    await this.ensurePaymentsTable();
    const fields: string[] = []; const vals: any[] = []; let i = 1;
    const map: Record<string, string> = {
      amount: 'amount', method: 'method', reference: 'reference', note: 'note',
      term: 'term', academicYear: 'academic_year', paidOn: 'paid_on',
    };
    for (const [k, col] of Object.entries(map)) {
      if (dto[k] !== undefined) {
        let v = dto[k];
        if (k === 'amount') { v = Number(v); if (!v || v <= 0) throw new BadRequestException('Enter a valid amount.'); }
        if ((k === 'paidOn' || k === 'term' || k === 'academicYear') && v === '') v = null;
        fields.push(`${col} = $${i++}`); vals.push(v);
      }
    }
    if (!fields.length) return { updated: false };
    const editorName = await this.getUserDisplayName(req.user.id, req.user.email || '');
    fields.push(`updated_by = $${i++}`); vals.push(req.user.id || null);
    fields.push(`updated_by_name = $${i++}`); vals.push(editorName);
    fields.push(`updated_at = NOW()`);
    vals.push(id, req.user.tenantId);
    try {
      const rows = await this.ds.query(
        `UPDATE payments SET ${fields.join(', ')} WHERE id::text = $${i++} AND tenant_id = $${i}
         RETURNING id, learner_id AS "learnerId", amount, method, term, academic_year AS "academicYear",
                   receipt_number AS "receiptNumber", paid_on AS "paidOn",
                   updated_by_name AS "updatedByName", updated_at AS "updatedAt"`,
        vals,
      );
      if (!rows.length) throw new BadRequestException('Payment not found.');
      const payment = rows[0];

      // If the amount (or term/year, which change the vote-head set) was edited, the old
      // allocations are stale. Rebuild them: clear this payment's allocations and re-split the
      // new amount across the learner's vote heads — honouring an explicit override if supplied,
      // otherwise auto-filling by priority (same rules as recording a fresh payment).
      const amountChanged = dto.amount !== undefined || dto.term !== undefined || dto.academicYear !== undefined || dto.allocations !== undefined;
      if (amountChanged && payment.learnerId) {
        await this.ensureAllocationsTable();
        await this.ds.query(`DELETE FROM payment_allocations WHERE payment_id = $1 AND tenant_id = $2`, [id, req.user.tenantId]).catch(() => null);
        const amount = Number(payment.amount);
        const term = payment.term || null;
        const academicYear = payment.academicYear || null;

        const grade = await this.ds.query(
          `SELECT grade_level AS g FROM learners WHERE id::text = $1 LIMIT 1`, [payment.learnerId],
        ).then((r: any[]) => r[0]?.g || null).catch(() => null);
        const heads = await this.ds.query(
          `SELECT id, name, amount, COALESCE(priority,100) AS priority FROM fee_items
            WHERE tenant_id = $1 AND (grade_level IS NULL OR grade_level = $2)
              AND ($3::text IS NULL OR term = $3 OR term IS NULL)
            ORDER BY COALESCE(priority,100) ASC, created_at ASC`,
          [req.user.tenantId, grade, term],
        ).catch(() => []);
        // Amount already paid to each vote head by OTHER payments (exclude this one, just cleared).
        const paidRows = await this.ds.query(
          `SELECT fee_item_id, COALESCE(SUM(amount),0) AS paid FROM payment_allocations
            WHERE tenant_id = $1 AND learner_id = $2 GROUP BY fee_item_id`,
          [req.user.tenantId, payment.learnerId],
        ).catch(() => []);
        const paidByItem: Record<string, number> = {};
        for (const r of (paidRows as any[])) paidByItem[r.fee_item_id] = Number(r.paid || 0);

        let allocations: { feeItemId: string; name: string; amount: number }[] = [];
        const overrides = Array.isArray(dto.allocations) ? dto.allocations.filter((a: any) => a && a.feeItemId && Number(a.amount) > 0) : [];
        if (overrides.length) {
          const nameById: Record<string, string> = {};
          for (const h of (heads as any[])) nameById[h.id] = h.name;
          allocations = overrides.map((a: any) => ({ feeItemId: a.feeItemId, name: nameById[a.feeItemId] || 'Fee', amount: Number(a.amount) }));
        } else {
          let remaining = amount;
          for (const h of (heads as any[])) {
            if (remaining <= 0) break;
            const outstanding = Math.max(0, Number(h.amount || 0) - (paidByItem[h.id] || 0));
            if (outstanding <= 0) continue;
            const put = Math.min(outstanding, remaining);
            allocations.push({ feeItemId: h.id, name: h.name, amount: put });
            remaining -= put;
          }
          if (remaining > 0) allocations.push({ feeItemId: '', name: 'Credit / Overpayment', amount: remaining });
        }
        for (const a of allocations) {
          await this.ds.query(
            `INSERT INTO payment_allocations
               (tenant_id, payment_id, learner_id, fee_item_id, vote_head, amount, term, academic_year)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [req.user.tenantId, id, payment.learnerId, a.feeItemId || null, a.name, a.amount, term, academicYear],
          ).catch(() => null);
        }
        return { ...payment, allocations };
      }
      return payment;
    } catch (e: any) {
      throw new BadRequestException(`Could not update payment: ${e.message}`);
    }
  }

  @Delete('payments/:id')
  async deletePayment(@Request() req: any, @Param('id') id: string) {
    const role = req.user.role;
    if (!['hoi', 'dhois', 'tenant_owner', 'school_admin', 'bursar'].includes(role)) {
      throw new BadRequestException('Only the bursar or an administrator can delete payments.');
    }
    // Remove the payment AND its vote-head allocations, so vote-head balances stay correct.
    await this.ensureAllocationsTable();
    await this.ds.query(`DELETE FROM payment_allocations WHERE payment_id::text = $1 AND tenant_id = $2`, [id, req.user.tenantId]).catch(() => null);
    await this.ds.query(`DELETE FROM payments WHERE id::text = $1 AND tenant_id = $2`, [id, req.user.tenantId]).catch(() => null);
    return { deleted: true };
  }

  // ── Manual payments (cash / m-pesa manual / bank-cheque) ──────
  private async ensurePaymentsTable() {
    await this.ds.query(
      `CREATE TABLE IF NOT EXISTS payments (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         tenant_id uuid, created_at timestamptz DEFAULT NOW()
       )`,
    ).catch(() => null);
    const cols: [string, string][] = [
      ['school_id', 'uuid'], ['learner_id', 'uuid'], ['learner_name', 'text'],
      ['admission_number', 'text'], ['amount', 'numeric'], ['method', 'text'],
      ['reference', 'text'], ['note', 'text'], ['term', 'text'], ['academic_year', 'text'],
      ['receipt_number', 'text'], ['recorded_by', 'text'], ['recorded_by_name', 'text'], ['paid_on', 'date'],
      ['updated_by', 'text'], ['updated_by_name', 'text'], ['updated_at', 'timestamptz'],
      ['created_at', 'timestamptz DEFAULT NOW()'],
    ];
    for (const [n, t] of cols) {
      await this.ds.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS ${n} ${t}`).catch(() => null);
    }
    const notNull = await this.ds.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'payments' AND is_nullable = 'NO' AND column_default IS NULL`,
    ).catch(() => []);
    for (const row of (notNull as any[])) {
      if (['id', 'tenant_id'].includes(row.column_name)) continue;
      await this.ds.query(`ALTER TABLE payments ALTER COLUMN ${row.column_name} DROP NOT NULL`).catch(() => null);
    }
  }

  @Post('payments')
  async recordPayment(@Request() req: any, @Body() dto: any) {
    const role = req.user.role;
    const staffRoles = ['hoi', 'dhois', 'tenant_owner', 'school_admin', 'bursar'];
    if (!staffRoles.includes(role)) {
      if (['class_teacher', 'overall_class_teacher'].includes(role)) {
        await this.assertClassTeacherCanRecordPayment(req.user.tenantId, req.user.id, dto?.learnerId);
      } else {
        throw new BadRequestException('Only the bursar or an administrator can record payments.');
      }
    }
    if (!dto?.learnerId) throw new BadRequestException('Please select a learner.');
    const amount = Number(dto.amount);
    if (!amount || amount <= 0) throw new BadRequestException('Enter a valid amount.');
    const recorderName = await this.getUserDisplayName(req.user.id, req.user.email || '');
    return this.createAndAllocatePayment(req.user.tenantId, req.user.schoolId || null, dto, req.user.id || null, recorderName);
  }

  // Shared by the manual "record payment" form above and the M-Pesa
  // auto-reconciliation path (MpesaPaybillController) — inserts the payment
  // row and fills vote-head allocations the same way regardless of who/what
  // triggered it, so a parent's Paybill payment behaves identically to a
  // bursar manually recording cash.
  async createAndAllocatePayment(
    tenantId: string, schoolId: string | null, dto: any,
    recorder: string | null, recorderName: string,
  ) {
    const amount = Number(dto.amount);
    await this.ensurePaymentsTable();
    await this.ensureAllocationsTable();
    await this.ensureFeeItemsTable();

    // Receipt number: ZRD-<short tenant>-<YYMMDD>-<random>
    const receiptNumber = `ZRD-${String(tenantId).slice(0, 4).toUpperCase()}-${new Date().toISOString().slice(2,10).replace(/-/g,'')}-${Math.floor(1000 + Math.random()*9000)}`;
    try {
      const rows = await this.ds.query(
        `INSERT INTO payments
           (tenant_id, school_id, learner_id, learner_name, admission_number, amount, method,
            reference, note, term, academic_year, receipt_number, recorded_by, recorded_by_name, paid_on, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW())
         RETURNING id, receipt_number AS "receiptNumber", amount, method, paid_on AS "paidOn"`,
        [
          tenantId, schoolId, dto.learnerId,
          dto.learnerName || null, dto.admissionNumber || null, amount,
          dto.method || 'cash', dto.reference || null, dto.note || null,
          dto.term || null, dto.academicYear || null, receiptNumber, recorder, recorderName,
          dto.paidOn || new Date().toISOString().slice(0, 10),
        ],
      );
      const payment = rows[0];

      // ── Allocate this payment across vote heads ──
      // If the bursar supplied an explicit split (dto.allocations = [{feeItemId, amount}]), use it.
      // Otherwise auto-fill each vote head's outstanding balance in PRIORITY order until the
      // money runs out.
      const grade = await this.ds.query(
        `SELECT grade_level AS g FROM learners WHERE id::text = $1 LIMIT 1`, [dto.learnerId],
      ).then((r: any[]) => r[0]?.g || null).catch(() => null);
      const heads = await this.ds.query(
        `SELECT id, name, amount, COALESCE(priority,100) AS priority FROM fee_items
          WHERE tenant_id = $1 AND (grade_level IS NULL OR grade_level = $2)
            AND ($3::text IS NULL OR term = $3 OR term IS NULL)
          ORDER BY COALESCE(priority,100) ASC, created_at ASC`,
        [tenantId, grade, dto.term || null],
      ).catch(() => []);
      const paidRows = await this.ds.query(
        `SELECT fee_item_id, COALESCE(SUM(amount),0) AS paid FROM payment_allocations
          WHERE tenant_id = $1 AND learner_id = $2 GROUP BY fee_item_id`,
        [tenantId, dto.learnerId],
      ).catch(() => []);
      const paidByItem: Record<string, number> = {};
      for (const r of (paidRows as any[])) paidByItem[r.fee_item_id] = Number(r.paid || 0);

      let allocations: { feeItemId: string; name: string; amount: number }[] = [];
      const overrides = Array.isArray(dto.allocations) ? dto.allocations.filter((a: any) => a && a.feeItemId && Number(a.amount) > 0) : [];
      if (overrides.length) {
        // Bursar-specified split. Match names for the receipt.
        const nameById: Record<string, string> = {};
        for (const h of (heads as any[])) nameById[h.id] = h.name;
        allocations = overrides.map((a: any) => ({ feeItemId: a.feeItemId, name: nameById[a.feeItemId] || 'Fee', amount: Number(a.amount) }));
      } else {
        // Auto-fill by priority.
        let remaining = amount;
        for (const h of (heads as any[])) {
          if (remaining <= 0) break;
          const outstanding = Math.max(0, Number(h.amount || 0) - (paidByItem[h.id] || 0));
          if (outstanding <= 0) continue;
          const put = Math.min(outstanding, remaining);
          allocations.push({ feeItemId: h.id, name: h.name, amount: put });
          remaining -= put;
        }
        // Any money left after all balances are cleared → record as an overpayment/credit.
        if (remaining > 0) allocations.push({ feeItemId: '', name: 'Credit / Overpayment', amount: remaining });
      }

      for (const a of allocations) {
        await this.ds.query(
          `INSERT INTO payment_allocations
             (tenant_id, payment_id, learner_id, fee_item_id, vote_head, amount, term, academic_year)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [tenantId, payment.id, dto.learnerId, a.feeItemId || null, a.name, a.amount, dto.term || null, dto.academicYear || null],
        ).catch(() => null);
      }

      return { ...payment, allocations };
    } catch (e: any) {
      throw new BadRequestException(`Could not record payment: ${e.message}`);
    }
  }

  // A learner's payment history + total paid + balance (vs mandatory fee items for them).
  @Get('payments/learner/:learnerId')
  async learnerPayments(@Request() req: any, @Param('learnerId') learnerId: string, @Query() q: any) {
    await this.ensurePaymentsTable();
    const tenantId = req.user.tenantId;
    const payments = await this.ds.query(
      `SELECT id, amount, method, reference, note, term, academic_year AS "academicYear",
              receipt_number AS "receiptNumber", paid_on AS "paidOn", created_at AS "createdAt",
              recorded_by_name AS "recordedByName", updated_by_name AS "updatedByName", updated_at AS "updatedAt"
         FROM payments WHERE tenant_id = $1 AND learner_id = $2
        ORDER BY COALESCE(paid_on, created_at::date) DESC`,
      [tenantId, learnerId],
    ).catch(() => []);
    const totalPaid = payments.reduce((s: number, p: any) => s + Number(p.amount || 0), 0);

    // Total billed = sum of fee items matching the learner's grade (or grade-agnostic items).
    const grade = await this.ds.query(
      `SELECT grade_level AS g FROM learners WHERE id::text = $1 LIMIT 1`, [learnerId],
    ).then((r: any[]) => r[0]?.g || null).catch(() => null);
    const billedRows = await this.ds.query(
      `SELECT COALESCE(SUM(amount),0) AS billed FROM fee_items
        WHERE tenant_id = $1 AND (grade_level IS NULL OR grade_level = $2)
          AND ($3::text IS NULL OR term = $3)`,
      [tenantId, grade, q.term || null],
    ).catch(() => [{ billed: 0 }]);
    const totalBilled = Number(billedRows[0]?.billed || 0);

    return { payments, totalPaid, totalBilled, balance: totalBilled - totalPaid };
  }

  // Printable receipt HTML for a recorded payment.
  @Get('payments/:id/receipt/html')
  async paymentReceiptHtml(@Request() req: any, @Param('id') id: string, @Res() res: any) {
    await this.ensurePaymentsTable();
    const rows = await this.ds.query(
      `SELECT p.*, (SELECT name FROM schools s WHERE s.tenant_id = p.tenant_id LIMIT 1) AS "schoolName",
              (SELECT settings->>'phone'   FROM schools s WHERE s.tenant_id = p.tenant_id LIMIT 1) AS "schoolPhone",
              (SELECT settings->>'email'   FROM schools s WHERE s.tenant_id = p.tenant_id LIMIT 1) AS "schoolEmail",
              (SELECT settings->>'address' FROM schools s WHERE s.tenant_id = p.tenant_id LIMIT 1) AS "schoolAddress"
         FROM payments p WHERE p.id::text = $1 AND p.tenant_id = $2 LIMIT 1`,
      [id, req.user.tenantId],
    ).catch(() => []);
    if (!rows.length) { res.status(404).send('<p>Receipt not found</p>'); return; }
    const p = rows[0];
    const esc = (s: any) => String(s ?? '').replace(/[&<>]/g, (c: string) => ({ '&':'&amp;','<':'&lt;','>':'&gt;' }[c] || c));
    const ksh = (n: any) => 'KES ' + Number(n || 0).toLocaleString('en-KE');
    const contacts = [p.schoolPhone && ('Tel: ' + esc(p.schoolPhone)), p.schoolEmail && esc(p.schoolEmail), p.schoolAddress && esc(p.schoolAddress)].filter(Boolean).join(' · ');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Receipt ${esc(p.receipt_number)}</title>
      <style>body{font-family:Arial,sans-serif;color:#1a2e5a;max-width:640px;margin:24px auto;padding:0 16px}
      .h{text-align:center;border-bottom:3px solid #d4af37;padding-bottom:10px}.h h1{margin:0;font-size:20px}
      .meta{font-size:12px;color:#555;margin-top:2px}.box{border:1px solid #ddd;border-radius:8px;padding:16px;margin-top:16px}
      table{width:100%;border-collapse:collapse;margin-top:10px}td{padding:6px 4px;font-size:14px}.r{text-align:right}
      .total{font-size:18px;font-weight:bold;border-top:2px solid #1a2e5a;margin-top:8px}.foot{margin-top:24px;font-size:11px;color:#777;text-align:center}
      @media print{button{display:none}}</style></head><body>
      <div class="h"><h1>${esc(p.schoolName || 'ZARODA School')}</h1>${contacts ? `<div class="meta">${contacts}</div>` : ''}
      <div class="meta">OFFICIAL FEE RECEIPT</div></div>
      <div class="box">
        <table>
          <tr><td>Receipt No.</td><td class="r"><b>${esc(p.receipt_number)}</b></td></tr>
          <tr><td>Date</td><td class="r">${esc(p.paid_on || (p.created_at && String(p.created_at).slice(0,10)))}</td></tr>
          <tr><td>Learner</td><td class="r">${esc(p.learner_name || '')}${p.admission_number ? ' · Adm ' + esc(p.admission_number) : ''}</td></tr>
          <tr><td>Method</td><td class="r">${esc((p.method || '').replace('_',' ').toUpperCase())}${p.reference ? ' · Ref ' + esc(p.reference) : ''}</td></tr>
          ${p.term ? `<tr><td>Term</td><td class="r">${esc(String(p.term).replace('term_','Term '))} ${esc(p.academic_year || '')}</td></tr>` : ''}
          ${p.note ? `<tr><td>Note</td><td class="r">${esc(p.note)}</td></tr>` : ''}
          <tr class="total"><td>Amount Paid</td><td class="r">${ksh(p.amount)}</td></tr>
        </table>
      </div>
      <div class="foot">Received by ${esc(p.recorded_by_name || p.recorded_by || 'school')} · Generated by ZARODA SOLUTIONS<br>This is a computer-generated receipt.</div>
      <div style="text-align:center;margin-top:16px"><button onclick="window.print()" style="background:#1a2e5a;color:#fff;border:none;padding:10px 22px;border-radius:8px;cursor:pointer">Print / Save as PDF</button></div>
      </body></html>`;
    res.set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.send(html);
  }

  // Real M-Pesa Paybill integration (STK push, C2B, settings, reconciliation)
  // lives in MpesaPaybillController/MpesaCallbackController below — this used
  // to be a stub here ("configure MPESA_* env vars") that never actually
  // called Safaricom, and even if it had, this controller is JwtAuthGuard'd
  // at the class level, which would have 401'd Safaricom's own callback.

  // Real payroll lives in PayrollController below (finance/payroll/*) — this stub
  // used to just return [] with nothing behind it.

  @Get('expenses')
  async getExpenses(@Request() req: any) {
    await this.ensureExpensesTable();
    return this.ds.query(
      `SELECT id, category, vote_head AS "voteHead", description, amount, payment_method AS "paymentMethod",
              supplier_name AS "payee", spent_on AS "spentOn", created_at AS "createdAt"
         FROM expenses WHERE tenant_id = $1 ORDER BY COALESCE(spent_on, created_at) DESC`,
      [req.user.tenantId],
    ).catch(() => []);
  }

  private async ensureExpensesTable() {
    await this.ds.query(
      `CREATE TABLE IF NOT EXISTS expenses (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         tenant_id uuid,
         created_at timestamptz DEFAULT NOW()
       )`,
    ).catch(() => null);
    const cols: [string, string][] = [
      ['school_id', 'uuid'], ['category', 'text'], ['description', 'text'],
      ['amount', 'numeric'], ['spent_on', 'date'], ['created_at', 'timestamptz DEFAULT NOW()'],
      // Needed to split the analysed cash book into its cash and bank columns.
      ['payment_method', 'text'], ['voucher_number', 'text'], ['cheque_number', 'text'],
      // Which fund the money came out of — see migration 070.
      ['vote_head', 'text'],
      // The form has always collected a payee and the insert has always dropped
      // it, so every supplier name a bursar typed was silently lost.
      ['supplier_name', 'text'],
    ];
    for (const [name, type] of cols) {
      await this.ds.query(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS ${name} ${type}`).catch(() => null);
    }
    const keep = new Set(['id', 'tenant_id']);
    const notNullCols = await this.ds.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'expenses' AND is_nullable = 'NO' AND column_default IS NULL`,
    ).catch(() => []);
    for (const row of (notNullCols as any[])) {
      if (keep.has(row.column_name)) continue;
      await this.ds.query(`ALTER TABLE expenses ALTER COLUMN ${row.column_name} DROP NOT NULL`).catch(() => null);
    }
  }

  @Post('expenses')
  async createExpense(@Request() req: any, @Body() dto: any) {
    const role = req.user.role;
    if (!['hoi', 'dhois', 'tenant_owner', 'school_admin', 'bursar'].includes(role)) {
      return { error: 'Only the HOI, bursar or administrator can record expenses.' };
    }
    if (!dto?.amount || isNaN(Number(dto.amount))) return { error: 'A valid amount is required.' };
    await this.ensureExpensesTable();
    const rows = await this.ds.query(
      `INSERT INTO expenses (tenant_id, school_id, category, vote_head, description, amount,
                             payment_method, supplier_name, spent_on, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
       RETURNING id, category, vote_head AS "voteHead", description, amount,
                 supplier_name AS "payee", spent_on AS "spentOn"`,
      [req.user.tenantId, req.user.schoolId || null, dto.category || 'General',
       // Null rather than a guess: an expense with no vote head still analyses by
       // category in the books, exactly as every expense did before migration 070.
       dto.voteHead || null,
       dto.description || null, Number(dto.amount),
       dto.paymentMethod || null,
       dto.payee || dto.supplierName || null,
       dto.spentOn || dto.date || new Date().toISOString().slice(0, 10)],
    ).catch((e: any) => { throw new BadRequestException(e.message); });
    return rows[0];
  }

  /**
   * The vote heads an expense may be charged to: the school's own fee heads,
   * which is what receipts are analysed into. Returned with what each has
   * collected and spent so far, so a bursar can see what is left before
   * committing money against it.
   */
  @Get('expenses/vote-heads')
  async expenseVoteHeads(@Request() req: any) {
    await this.ensureFeeItemsTable();
    await this.ensureAllocationsTable();
    await this.ensureExpensesTable().catch(() => null);
    const tenantId = req.user.tenantId;

    // Every head the school bills, plus any already used on a receipt — a head
    // can have been collected against and later removed from the structure.
    const rows = await this.ds.query(
      `SELECT name AS head FROM fee_items WHERE tenant_id::text = $1 AND name IS NOT NULL
       UNION
       SELECT DISTINCT vote_head FROM payment_allocations
        WHERE tenant_id::text = $1 AND vote_head IS NOT NULL`,
      [tenantId],
    ).catch(() => []);

    const received = await this.ds.query(
      `SELECT COALESCE(vote_head,'Unallocated') AS head, COALESCE(SUM(amount),0) AS total
         FROM payment_allocations WHERE tenant_id::text = $1 GROUP BY vote_head`, [tenantId],
    ).catch(() => []);
    const spent = await this.ds.query(
      `SELECT COALESCE(vote_head, category) AS head, COALESCE(SUM(amount),0) AS total
         FROM expenses WHERE tenant_id::text = $1 GROUP BY COALESCE(vote_head, category)`, [tenantId],
    ).catch(() => []);

    const inBy: Record<string, number> = {};
    for (const r of received as any[]) inBy[String(r.head)] = Number(r.total || 0);
    const outBy: Record<string, number> = {};
    for (const r of spent as any[]) outBy[String(r.head)] = Number(r.total || 0);

    return [...new Set((rows as any[]).map(r => String(r.head)))].sort().map(head => ({
      head,
      received: inBy[head] || 0,
      spent:    outBy[head] || 0,
      balance:  (inBy[head] || 0) - (outBy[head] || 0),
    }));
  }

  // Not private: PayrollController (below) posts payroll costs into the cashbook
  // through this same path when a run is finalized, so payroll shows up in the
  // Cashbook/Income Statement/Trial Balance like any other expense.
  async recordExpenseRow(tenantId: string, schoolId: string | null, category: string, description: string, amount: number, spentOn: string) {
    if (!amount || amount <= 0) return null;
    await this.ensureExpensesTable();
    const rows = await this.ds.query(
      `INSERT INTO expenses (tenant_id, school_id, category, description, amount, spent_on, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW()) RETURNING id`,
      [tenantId, schoolId, category, description, amount, spentOn],
    ).catch(() => []);
    return rows[0] || null;
  }

  @Get('dashboard')
  getDashboard(@Request() req: any) {
    return { totalCollected: 0, outstanding: 0, totalLearners: 0, fullyPaid: 0 };
  }
}

// ── M-Pesa Paybill: authenticated side (settings, STK push, activity log) ──
const MPESA_STAFF_ROLES = ['hoi', 'dhois', 'tenant_owner', 'school_admin', 'bursar'];
const MPESA_ADMIN_ROLES = ['hoi', 'dhois', 'tenant_owner', 'school_admin'];

@Controller('finance/mpesa')
@UseGuards(JwtAuthGuard)
class MpesaPaybillController {
  constructor(private readonly ds: DataSource, private readonly financeController: FinanceController) {}

  // Never returns the raw secrets back to the browser — only whether each is set,
  // so the settings form can show "configured" without re-exposing the value.
  @Get('settings')
  async getSettings(@Request() req: any) {
    if (!MPESA_STAFF_ROLES.includes(req.user.role)) return { error: 'forbidden' };
    await ensureMpesaSettingsTable(this.ds);
    const rows = await this.ds.query(
      `SELECT shortcode, environment, COALESCE(gateway, 'daraja') AS gateway, tuma_email AS "tumaEmail",
              (consumer_key IS NOT NULL AND consumer_key <> '')       AS "hasConsumerKey",
              (consumer_secret IS NOT NULL AND consumer_secret <> '') AS "hasConsumerSecret",
              (passkey IS NOT NULL AND passkey <> '')                 AS "hasPasskey",
              (tuma_api_key IS NOT NULL AND tuma_api_key <> '')       AS "hasTumaApiKey",
              updated_at AS "updatedAt"
         FROM tenant_mpesa_settings WHERE tenant_id::text = $1 LIMIT 1`,
      [req.user.tenantId],
    ).catch(() => []);
    return rows[0] || null;
  }

  @Post('settings')
  async saveSettings(@Request() req: any, @Body() dto: any) {
    if (!MPESA_ADMIN_ROLES.includes(req.user.role)) {
      throw new BadRequestException('Only an administrator can configure the Paybill.');
    }
    const gateway = dto?.gateway === 'tuma' ? 'tuma' : 'daraja';
    if (gateway === 'daraja' && !dto?.shortcode) {
      throw new BadRequestException('Enter the Paybill (or Till) shortcode.');
    }
    if (gateway === 'tuma' && !dto?.tumaEmail) {
      throw new BadRequestException('Enter the email address for your school\'s Tuma account.');
    }
    await ensureMpesaSettingsTable(this.ds);
    // COALESCE on the secret fields: leave a previously-saved key/secret/passkey in
    // place if the admin didn't retype it this time (the form never shows them back).
    await this.ds.query(
      `INSERT INTO tenant_mpesa_settings
         (tenant_id, shortcode, consumer_key, consumer_secret, passkey, environment, gateway, tuma_email, tuma_api_key, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
       ON CONFLICT (tenant_id) DO UPDATE SET
         shortcode = EXCLUDED.shortcode,
         consumer_key = COALESCE(NULLIF(EXCLUDED.consumer_key, ''), tenant_mpesa_settings.consumer_key),
         consumer_secret = COALESCE(NULLIF(EXCLUDED.consumer_secret, ''), tenant_mpesa_settings.consumer_secret),
         passkey = COALESCE(NULLIF(EXCLUDED.passkey, ''), tenant_mpesa_settings.passkey),
         environment = EXCLUDED.environment,
         gateway = EXCLUDED.gateway,
         tuma_email = EXCLUDED.tuma_email,
         tuma_api_key = COALESCE(NULLIF(EXCLUDED.tuma_api_key, ''), tenant_mpesa_settings.tuma_api_key),
         updated_at = NOW()`,
      [req.user.tenantId, dto.shortcode || null, dto.consumerKey || '', dto.consumerSecret || '', dto.passkey || '',
       dto.environment === 'sandbox' ? 'sandbox' : 'production', gateway, dto.tumaEmail || null, dto.tumaApiKey || ''],
    );
    return { message: 'M-Pesa settings saved.' };
  }

  // Tells Safaricom where to send C2B payments for THIS shortcode — a parent
  // paying directly from their own M-Pesa menu, not triggered by the school.
  // Safaricom requires both URLs even though only the confirmation one does
  // anything here (the validation one always accepts).
  @Post('settings/register-c2b')
  async registerC2b(@Request() req: any) {
    if (!MPESA_ADMIN_ROLES.includes(req.user.role)) {
      throw new BadRequestException('Only an administrator can do this.');
    }
    const settings = await getMpesaSettingsRow(this.ds, req.user.tenantId);
    if (settings?.gateway === 'tuma') {
      throw new BadRequestException('C2B (parents paying unprompted) isn\'t available on Tuma — only STK push is. Switch to a Daraja Paybill in settings for C2B.');
    }
    if (!settings?.shortcode || !settings.consumerKey || !settings.consumerSecret) {
      throw new BadRequestException('Save your shortcode, consumer key and consumer secret first.');
    }
    const base = (process.env.APP_URL || '').replace(/\/+$/, '');
    if (!base) throw new BadRequestException('Server is missing APP_URL — contact ZARODA support.');
    let token: string;
    try {
      token = await getDarajaToken(settings.environment, settings.consumerKey, settings.consumerSecret);
    } catch (e: any) {
      throw new BadRequestException(`Could not authenticate with Safaricom: ${e.message}`);
    }
    const resp = await fetch(`${mpesaBaseUrl(settings.environment)}/mpesa/c2b/v1/registerurl`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ShortCode: settings.shortcode,
        ResponseType: 'Completed',
        ConfirmationURL: `${base}/api/v1/finance/mpesa/c2b/confirmation/${req.user.tenantId}`,
        ValidationURL: `${base}/api/v1/finance/mpesa/c2b/validation/${req.user.tenantId}`,
      }),
    });
    const data: any = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new BadRequestException(`Safaricom rejected the URL registration: ${JSON.stringify(data).slice(0, 300)}`);
    }
    return { message: 'C2B payment URLs registered with Safaricom. Parents can now pay this Paybill directly.', response: data };
  }

  // Triggers a push to the PARENT'S phone — distinct from C2B, where the
  // parent pays unprompted from their own M-Pesa menu. Branches on the
  // school's chosen gateway: 'daraja' talks to Safaricom directly using the
  // school's own Paybill; 'tuma' goes through the school's own Tuma account
  // instead — simpler onboarding (no Safaricom developer approval needed),
  // STK push only (no C2B/walk-up payments).
  //
  // Two ways in: staff (bursar/admin) requesting on a parent's behalf from
  // the Fee Invoices list, OR the parent themselves, self-service, from
  // their own ZARODA account — same idea as a teacher topping up their own
  // Professional Records wallet. A parent may only trigger this for a
  // learner actually linked to their account (verified below); staff may
  // trigger it for anyone.
  @Post('stk-push')
  async stkPush(@Request() req: any, @Body() dto: { learnerId: string; phone: string; amount: number }) {
    const isParent = req.user.role === 'parent';
    if (!MPESA_STAFF_ROLES.includes(req.user.role) && !isParent) {
      throw new BadRequestException('Only the bursar, an administrator, or the learner\'s own parent can request a payment.');
    }
    const tenantId = req.user.tenantId;
    const settings = await getMpesaSettingsRow(this.ds, tenantId);
    if (!settings) {
      throw new BadRequestException('This school hasn\'t set up M-Pesa payments yet — ask the bursar to configure it in Finance → M-Pesa Settings.');
    }
    const phone = normalisePhoneForTuma(dto.phone || '');
    if (!phone) throw new BadRequestException('Enter a valid M-Pesa phone number.');
    const amount = Number(dto.amount);
    if (!amount || amount <= 0) throw new BadRequestException('Enter a valid amount.');
    if (!dto.learnerId) throw new BadRequestException('Select a learner.');

    const learnerRows = await this.ds.query(
      `SELECT admission_number AS "admissionNumber", first_name AS "firstName", last_name AS "lastName",
              guardian_email AS "guardianEmail"
         FROM learners WHERE id::text = $1 AND tenant_id::text = $2`,
      [dto.learnerId, tenantId],
    ).catch(() => []);
    const learner = learnerRows[0];
    if (isParent && (!learner || String(learner.guardianEmail || '').toLowerCase() !== String(req.user.email || '').toLowerCase())) {
      throw new BadRequestException('You can only pay fees for your own child.');
    }
    const accountRef = (learner?.admissionNumber || 'FEES').slice(0, 20); // Daraja caps this field
    const base = (process.env.APP_URL || '').replace(/\/+$/, '');

    if (settings.gateway === 'tuma') {
      if (!settings.tumaEmail || !settings.tumaApiKey) {
        throw new BadRequestException('Your school\'s Tuma account isn\'t set up yet — add the email and API key in Finance → M-Pesa Settings first.');
      }
      const result = await initiateStkPush({
        amount, phone,
        description: `School fees${learner ? ` — ${learner.firstName} ${learner.lastName}` : ''}`.slice(0, 100),
        callbackUrl: `${base}/api/v1/finance/mpesa/tuma-callback`,
        creds: { email: settings.tumaEmail, apiKey: settings.tumaApiKey },
      });
      if (!result.ok || !result.merchantRequestId) {
        throw new BadRequestException(result.detail || 'Could not send the M-Pesa prompt.');
      }
      await ensureMpesaTransactionsTable(this.ds);
      await this.ds.query(
        `INSERT INTO mpesa_transactions
           (tenant_id, type, merchant_request_id, phone, amount, account_reference, learner_id, status, created_at)
         VALUES ($1,'tuma_stk',$2,$3,$4,$5,$6,'pending',NOW())`,
        [tenantId, result.merchantRequestId, phone, amount, accountRef, dto.learnerId],
      );
      return { merchantRequestId: result.merchantRequestId, message: `STK push sent to ${phone}. Ask the parent to enter their M-Pesa PIN.` };
    }

    // ── Daraja (direct Safaricom Paybill) ──
    if (!settings.shortcode || !settings.consumerKey || !settings.consumerSecret || !settings.passkey) {
      throw new BadRequestException('M-Pesa Paybill is not set up yet — configure it in Finance → M-Pesa Settings first.');
    }
    let token: string;
    try {
      token = await getDarajaToken(settings.environment, settings.consumerKey, settings.consumerSecret);
    } catch (e: any) {
      throw new BadRequestException(`Could not authenticate with Safaricom: ${e.message}`);
    }
    const timestamp = new Date().toISOString().replace(/[-T:.Z]/g, '').slice(0, 14);
    const password = Buffer.from(`${settings.shortcode}${settings.passkey}${timestamp}`).toString('base64');

    let data: any;
    try {
      const resp = await fetch(`${mpesaBaseUrl(settings.environment)}/mpesa/stkpush/v1/processrequest`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          BusinessShortCode: settings.shortcode,
          Password: password,
          Timestamp: timestamp,
          TransactionType: 'CustomerPayBillOnline',
          Amount: Math.ceil(amount),
          PartyA: phone,
          PartyB: settings.shortcode,
          PhoneNumber: phone,
          CallBackURL: `${base}/api/v1/finance/mpesa/stk-callback`,
          AccountReference: accountRef,
          TransactionDesc: `School fees${learner ? ` — ${learner.firstName} ${learner.lastName}` : ''}`.slice(0, 100),
        }),
      });
      data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.CheckoutRequestID) {
        throw new Error(data.errorMessage || JSON.stringify(data).slice(0, 200));
      }
    } catch (e: any) {
      throw new BadRequestException(`Could not send the M-Pesa prompt: ${e.message}`);
    }

    await ensureMpesaTransactionsTable(this.ds);
    await this.ds.query(
      `INSERT INTO mpesa_transactions
         (tenant_id, type, checkout_request_id, merchant_request_id, phone, amount, account_reference, learner_id, status, created_at)
       VALUES ($1,'stk',$2,$3,$4,$5,$6,$7,'pending',NOW())`,
      [tenantId, data.CheckoutRequestID, data.MerchantRequestID, phone, amount, accountRef, dto.learnerId],
    );

    return { checkoutRequestId: data.CheckoutRequestID, message: `STK push sent to ${phone}. Ask the parent to enter their M-Pesa PIN.` };
  }

  @Get('transactions')
  async listTransactions(@Request() req: any) {
    if (!MPESA_STAFF_ROLES.includes(req.user.role)) return [];
    await ensureMpesaTransactionsTable(this.ds);
    return this.ds.query(
      `SELECT id, type, phone, amount, account_reference AS "accountReference",
              mpesa_receipt_number AS "mpesaReceiptNumber", status, created_at AS "createdAt"
         FROM mpesa_transactions WHERE tenant_id::text = $1 ORDER BY created_at DESC LIMIT 100`,
      [req.user.tenantId],
    ).catch(() => []);
  }

  // Payments that arrived (usually via C2B — a parent typo'd the account
  // number/admission number, or paid before the learner existed in the
  // system) but couldn't be matched to a learner automatically.
  @Get('unmatched')
  async listUnmatched(@Request() req: any) {
    if (!MPESA_STAFF_ROLES.includes(req.user.role)) return [];
    await ensureMpesaTransactionsTable(this.ds);
    return this.ds.query(
      `SELECT id, type, phone, amount, account_reference AS "accountReference",
              mpesa_receipt_number AS "mpesaReceiptNumber", created_at AS "createdAt"
         FROM mpesa_transactions WHERE tenant_id::text = $1 AND status = 'unmatched'
        ORDER BY created_at DESC`,
      [req.user.tenantId],
    ).catch(() => []);
  }

  @Post('unmatched/:id/assign')
  async assignUnmatched(@Request() req: any, @Param('id') id: string, @Body() dto: { learnerId: string }) {
    if (!MPESA_STAFF_ROLES.includes(req.user.role)) {
      throw new BadRequestException('Only the bursar or an administrator can do this.');
    }
    if (!dto?.learnerId) throw new BadRequestException('Select which learner this payment belongs to.');
    const rows = await this.ds.query(
      `SELECT * FROM mpesa_transactions WHERE id::text = $1 AND tenant_id::text = $2 AND status = 'unmatched'`,
      [id, req.user.tenantId],
    ).catch(() => []);
    const txn = rows[0];
    if (!txn) throw new BadRequestException('This payment was not found, or has already been matched.');

    const learnerRows = await this.ds.query(
      `SELECT school_id AS "schoolId", first_name AS "firstName", last_name AS "lastName", admission_number AS "admissionNumber"
         FROM learners WHERE id::text = $1 AND tenant_id::text = $2`,
      [dto.learnerId, req.user.tenantId],
    ).catch(() => []);
    const learner = learnerRows[0];
    if (!learner) throw new BadRequestException('Learner not found.');

    const recorderName = await this.financeController.getUserDisplayName(req.user.id, req.user.email || '');
    const payment = await this.financeController.createAndAllocatePayment(
      req.user.tenantId, learner.schoolId || null,
      {
        learnerId: dto.learnerId, learnerName: `${learner.firstName} ${learner.lastName}`,
        admissionNumber: learner.admissionNumber, amount: Number(txn.amount), method: 'mpesa',
        reference: txn.mpesa_receipt_number, note: `M-Pesa payment manually matched (was: "${txn.account_reference || ''}")`,
      },
      req.user.id || null, recorderName,
    );
    await this.ds.query(
      `UPDATE mpesa_transactions SET status = 'matched', matched_learner_id = $2, matched_payment_id = $3 WHERE id::text = $1`,
      [id, dto.learnerId, payment.id],
    ).catch(() => null);
    return { message: 'Payment matched and recorded.', payment };
  }
}

// ── M-Pesa Paybill: public side (Safaricom calls these — no auth) ──────────
@Controller('finance/mpesa')
class MpesaCallbackController {
  constructor(private readonly ds: DataSource, private readonly financeController: FinanceController) {}

  // Reconciles by admission number — finds the learner, then records the
  // payment through the exact same path a bursar's manual entry uses, so
  // balances, receipts and the cashbook all stay consistent regardless of
  // who/what triggered the payment.
  private async reconcile(
    tenantId: string, txnId: string, learnerIdHint: string | null,
    accountReference: string, amount: number, phone: string, mpesaReceiptNumber: string,
  ) {
    let learnerId = learnerIdHint;
    if (!learnerId && accountReference) {
      const rows = await this.ds.query(
        `SELECT id FROM learners WHERE tenant_id::text = $1 AND admission_number = $2 LIMIT 1`,
        [tenantId, accountReference],
      ).catch(() => []);
      learnerId = rows[0]?.id || null;
    }
    if (!learnerId) {
      await this.ds.query(`UPDATE mpesa_transactions SET status = 'unmatched' WHERE id::text = $1`, [txnId]).catch(() => null);
      return;
    }
    try {
      const learnerRows = await this.ds.query(
        `SELECT school_id AS "schoolId", first_name AS "firstName", last_name AS "lastName"
           FROM learners WHERE id::text = $1`,
        [learnerId],
      ).catch(() => []);
      const learner = learnerRows[0];
      const payment = await this.financeController.createAndAllocatePayment(
        tenantId, learner?.schoolId || null,
        {
          learnerId, learnerName: learner ? `${learner.firstName} ${learner.lastName}` : undefined,
          admissionNumber: accountReference, amount, method: 'mpesa', reference: mpesaReceiptNumber,
          note: 'Auto-reconciled M-Pesa payment',
        },
        null, 'M-Pesa (auto-reconciled)',
      );
      await this.ds.query(
        `UPDATE mpesa_transactions SET status = 'matched', matched_learner_id = $2, matched_payment_id = $3 WHERE id::text = $1`,
        [txnId, learnerId, payment.id],
      ).catch(() => null);
    } catch {
      await this.ds.query(`UPDATE mpesa_transactions SET status = 'unmatched' WHERE id::text = $1`, [txnId]).catch(() => null);
    }
  }

  // STK result — Safaricom doesn't echo back which tenant this belongs to, so
  // the tenant is recovered from our own mpesa_transactions row saved at
  // push time, keyed by CheckoutRequestID (same pattern as every other
  // STK integration in this app — see WalletService/SmsWalletService).
  @Post('stk-callback')
  async stkCallback(@Body() body: any) {
    const stk = body?.Body?.stkCallback;
    if (!stk) return { ResultCode: 0, ResultDesc: 'Accepted' };
    const rows = await this.ds.query(
      `SELECT * FROM mpesa_transactions WHERE checkout_request_id = $1 LIMIT 1`,
      [stk.CheckoutRequestID],
    ).catch(() => []);
    const txn = rows[0];
    if (!txn) return { ResultCode: 0, ResultDesc: 'Accepted' };

    if (stk.ResultCode === 0) {
      const items = stk.CallbackMetadata?.Item || [];
      const get = (name: string) => items.find((i: any) => i.Name === name)?.Value;
      const mpesaReceiptNumber = get('MpesaReceiptNumber');
      const amount = Number(get('Amount') ?? txn.amount);
      const phone = String(get('PhoneNumber') ?? txn.phone ?? '');

      await this.ds.query(
        `UPDATE mpesa_transactions SET status = 'completed', mpesa_receipt_number = $2, raw_callback = $3 WHERE id::text = $1`,
        [txn.id, mpesaReceiptNumber, JSON.stringify(body)],
      ).catch(() => null);
      await this.reconcile(txn.tenant_id, txn.id, txn.learner_id, txn.account_reference, amount, phone, mpesaReceiptNumber);
    } else {
      await this.ds.query(
        `UPDATE mpesa_transactions SET status = 'failed', raw_callback = $2 WHERE id::text = $1`,
        [txn.id, JSON.stringify(body)],
      ).catch(() => null);
    }
    return { ResultCode: 0, ResultDesc: 'Accepted' };
  }

  // Tuma's equivalent of stk-callback above, for schools using their own Tuma
  // account instead of a direct Daraja Paybill (see stkPush's gateway branch).
  // Tuma has no published webhook schema — parseTumaCallback is deliberately
  // permissive (see src/common/tuma.ts) and the raw body is always kept.
  @Post('tuma-callback')
  async tumaCallback(@Body() body: any) {
    const parsed = parseTumaCallback(body);
    if (!parsed.merchantRequestId) return { ok: true };
    const rows = await this.ds.query(
      `SELECT * FROM mpesa_transactions WHERE merchant_request_id = $1 AND type = 'tuma_stk' LIMIT 1`,
      [parsed.merchantRequestId],
    ).catch(() => []);
    const txn = rows[0];
    if (!txn) return { ok: true };

    if (parsed.success) {
      await this.ds.query(
        `UPDATE mpesa_transactions SET status = 'completed', mpesa_receipt_number = $2, raw_callback = $3 WHERE id::text = $1`,
        [txn.id, parsed.mpesaReceipt || null, JSON.stringify(body)],
      ).catch(() => null);
      await this.reconcile(txn.tenant_id, txn.id, txn.learner_id, txn.account_reference, Number(txn.amount), txn.phone, parsed.mpesaReceipt || '');
    } else {
      await this.ds.query(
        `UPDATE mpesa_transactions SET status = 'failed', raw_callback = $2 WHERE id::text = $1`,
        [txn.id, JSON.stringify(body)],
      ).catch(() => null);
    }
    return { ok: true };
  }

  // Safaricom requires a Validation URL to exist even though we don't use it
  // to reject anything — always accept, and do the real work in Confirmation.
  @Post('c2b/validation/:tenantId')
  c2bValidation() {
    return { ResultCode: 0, ResultDesc: 'Accepted' };
  }

  // A parent paid this Paybill directly from their own M-Pesa menu — no
  // school-side trigger at all. :tenantId comes from the URL Safaricom was
  // registered with per school (see registerC2b above), so there's no
  // ambiguity about which tenant this payment belongs to even if two schools
  // somehow shared a shortcode in testing.
  @Post('c2b/confirmation/:tenantId')
  async c2bConfirmation(@Param('tenantId') tenantId: string, @Body() body: any) {
    await ensureMpesaTransactionsTable(this.ds);
    const phone = body?.MSISDN ? String(body.MSISDN) : '';
    const amount = Number(body?.TransAmount || 0);
    const accountReference = String(body?.BillRefNumber || '').trim();
    const mpesaReceiptNumber = body?.TransID || null;

    const rows = await this.ds.query(
      `INSERT INTO mpesa_transactions
         (tenant_id, type, phone, amount, account_reference, mpesa_receipt_number, status, raw_callback, created_at)
       VALUES ($1,'c2b',$2,$3,$4,$5,'pending',$6,NOW()) RETURNING id`,
      [tenantId, phone, amount, accountReference, mpesaReceiptNumber, JSON.stringify(body)],
    ).catch(() => []);
    const txnId = rows[0]?.id;
    if (txnId) await this.reconcile(tenantId, txnId, null, accountReference, amount, phone, mpesaReceiptNumber);

    // Safaricom expects exactly this shape to accept the C2B payment.
    return { ResultCode: 0, ResultDesc: 'Success' };
  }
}

// ── PAYROLL ─────────────────────────────────────────────────
// Kenyan statutory-deduction rates as legislated at the time this was written
// (PAYE bands per the Finance Act 2023, NSSF Tier limits per the 2024
// revision, SHA replacing NHIF from Oct 2024, Housing Levy at 1.5%/1.5%).
// These change by government notice from time to time — review against the
// current KRA/SHA/NSSF guidance before relying on a payslip for compliance,
// and update the constants below (not scattered inline) if a rate changes.
const PAYE_BANDS: { upTo: number; rate: number }[] = [
  { upTo: 24_000, rate: 0.10 },
  { upTo: 32_333, rate: 0.25 },
  { upTo: 500_000, rate: 0.30 },
  { upTo: 800_000, rate: 0.325 },
  { upTo: Infinity, rate: 0.35 },
];
const PAYE_PERSONAL_RELIEF = 2_400; // monthly, KES
const NSSF_TIER1_LIMIT = 8_000;     // monthly pensionable pay ceiling for Tier I
const NSSF_TIER2_LIMIT = 72_000;    // monthly pensionable pay ceiling for Tier II
const NSSF_RATE = 0.06;             // employee and employer each
const SHA_RATE = 0.0275;            // of gross pay
const SHA_MINIMUM = 300;            // KES/month
const HOUSING_LEVY_RATE = 0.015;    // employee and employer each, of gross pay

function calcNssf(pensionablePay: number): { employee: number; employer: number } {
  const tier1 = Math.min(pensionablePay, NSSF_TIER1_LIMIT);
  const tier2 = Math.max(0, Math.min(pensionablePay, NSSF_TIER2_LIMIT) - NSSF_TIER1_LIMIT);
  const employee = Math.round((tier1 + tier2) * NSSF_RATE);
  return { employee, employer: employee };
}
function calcSha(grossPay: number): number {
  return Math.max(SHA_MINIMUM, Math.round(grossPay * SHA_RATE));
}
function calcHousingLevy(grossPay: number): { employee: number; employer: number } {
  const levy = Math.round(grossPay * HOUSING_LEVY_RATE);
  return { employee: levy, employer: levy };
}
function calcPaye(taxablePay: number): number {
  let tax = 0, prev = 0;
  for (const b of PAYE_BANDS) {
    if (taxablePay <= prev) break;
    tax += (Math.min(taxablePay, b.upTo) - prev) * b.rate;
    prev = b.upTo;
  }
  return Math.max(0, Math.round(tax - PAYE_PERSONAL_RELIEF));
}

const PAYROLL_STAFF_ROLES = [
  'hoi', 'dhois', 'tenant_owner', 'school_admin', 'bursar',
  'class_teacher', 'subject_teacher', 'overall_class_teacher', 'games_dept',
];

@Controller('finance/payroll')
@UseGuards(JwtAuthGuard)
class PayrollController {
  constructor(private readonly ds: DataSource, private readonly financeController: FinanceController) {}

  private async staffRoleOnly(req: any) {
    if (!['hoi', 'dhois', 'tenant_owner', 'school_admin', 'bursar'].includes(req.user.role)) {
      throw new BadRequestException('Only the HOI, bursar or administrator can manage payroll.');
    }
    await requireProPlan(this.ds, req.user.tenantId, 'Payroll');
  }

  private async ensureTables() {
    await this.ds.query(
      `CREATE TABLE IF NOT EXISTS staff_salaries (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid, staff_id uuid,
         created_at timestamptz DEFAULT NOW()
       )`,
    ).catch(() => null);
    for (const [n, t] of [
      ['basic_pay', 'numeric DEFAULT 0'], ['house_allowance', 'numeric DEFAULT 0'],
      ['transport_allowance', 'numeric DEFAULT 0'], ['other_allowance', 'numeric DEFAULT 0'],
      ['other_allowance_label', 'text'], ['updated_at', 'timestamptz DEFAULT NOW()'],
      // Most public-school teachers are paid by TSC, not the school — the school's payroll
      // must not assume everyone on it. 'tsc' staff are skipped by a normal run unless they
      // also have remedial (per-lesson) pay entered for that month.
      ['payment_source', "text DEFAULT 'school'"], // school | tsc
      ['remedial_rate', 'numeric DEFAULT 0'],       // KES paid per remedial lesson taught
    ] as [string, string][]) {
      await this.ds.query(`ALTER TABLE staff_salaries ADD COLUMN IF NOT EXISTS ${n} ${t}`).catch(() => null);
    }
    await this.ds.query(`CREATE UNIQUE INDEX IF NOT EXISTS staff_salaries_tenant_staff_uq ON staff_salaries (tenant_id, staff_id)`).catch(() => null);

    await this.ds.query(
      `CREATE TABLE IF NOT EXISTS payroll_runs (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid, created_at timestamptz DEFAULT NOW()
       )`,
    ).catch(() => null);
    for (const [n, t] of [
      ['month', 'text'], ['status', "text DEFAULT 'draft'"], ['finalized_at', 'timestamptz'],
      ['finalized_by', 'uuid'], ['finalized_by_name', 'text'],
    ] as [string, string][]) {
      await this.ds.query(`ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS ${n} ${t}`).catch(() => null);
    }
    await this.ds.query(`CREATE UNIQUE INDEX IF NOT EXISTS payroll_runs_tenant_month_uq ON payroll_runs (tenant_id, month)`).catch(() => null);

    await this.ds.query(
      `CREATE TABLE IF NOT EXISTS payroll_entries (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid, payroll_run_id uuid, created_at timestamptz DEFAULT NOW()
       )`,
    ).catch(() => null);
    for (const [n, t] of [
      ['staff_id', 'uuid'], ['staff_name', 'text'], ['role', 'text'],
      ['basic_pay', 'numeric DEFAULT 0'], ['allowances_total', 'numeric DEFAULT 0'], ['gross_pay', 'numeric DEFAULT 0'],
      ['paye', 'numeric DEFAULT 0'], ['nssf_employee', 'numeric DEFAULT 0'], ['nssf_employer', 'numeric DEFAULT 0'],
      ['sha', 'numeric DEFAULT 0'], ['housing_levy_employee', 'numeric DEFAULT 0'], ['housing_levy_employer', 'numeric DEFAULT 0'],
      ['loan_id', 'uuid'], ['loan_deduction', 'numeric DEFAULT 0'],
      ['payment_source', "text DEFAULT 'school'"], ['remedial_lessons', 'numeric DEFAULT 0'], ['remedial_pay', 'numeric DEFAULT 0'],
      ['net_pay', 'numeric DEFAULT 0'],
    ] as [string, string][]) {
      await this.ds.query(`ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS ${n} ${t}`).catch(() => null);
    }

    // Staff loans/advances — one active loan per staff member at a time, kept
    // simple deliberately: a second loan just isn't offered until the first is
    // cleared, so payroll never has to reason about splitting a deduction across
    // more than one loan.
    await this.ds.query(
      `CREATE TABLE IF NOT EXISTS staff_loans (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid, staff_id uuid, created_at timestamptz DEFAULT NOW()
       )`,
    ).catch(() => null);
    for (const [n, t] of [
      ['staff_name', 'text'], ['principal_amount', 'numeric DEFAULT 0'], ['monthly_deduction', 'numeric DEFAULT 0'],
      ['balance_remaining', 'numeric DEFAULT 0'], ['reason', 'text'],
      ['status', "text DEFAULT 'active'"], // active | completed | cancelled
      ['created_by', 'uuid'], ['created_by_name', 'text'], ['updated_at', 'timestamptz DEFAULT NOW()'],
    ] as [string, string][]) {
      await this.ds.query(`ALTER TABLE staff_loans ADD COLUMN IF NOT EXISTS ${n} ${t}`).catch(() => null);
    }
  }

  // Every active staff member, with their current salary record if one's been set.
  @Get('staff')
  async getStaff(@Request() req: any) {
    await this.staffRoleOnly(req);
    await this.ensureTables();
    return this.ds.query(
      `SELECT u.id, u.first_name AS "firstName", u.last_name AS "lastName", u.role,
              s.basic_pay AS "basicPay", s.house_allowance AS "houseAllowance",
              s.transport_allowance AS "transportAllowance", s.other_allowance AS "otherAllowance",
              s.other_allowance_label AS "otherAllowanceLabel",
              COALESCE(s.payment_source, 'school') AS "paymentSource", s.remedial_rate AS "remedialRate"
         FROM users u LEFT JOIN staff_salaries s ON s.staff_id::text = u.id::text AND s.tenant_id::text = u.tenant_id::text
        WHERE u.tenant_id::text = $1 AND u.role = ANY($2) AND u.is_active = true
        ORDER BY u.first_name`,
      [req.user.tenantId, PAYROLL_STAFF_ROLES],
    ).catch(() => []);
  }

  @Post('salaries')
  async setSalary(@Request() req: any, @Body() dto: any) {
    await this.staffRoleOnly(req);
    if (!dto?.staffId) throw new BadRequestException('Select a staff member.');
    await this.ensureTables();
    const paymentSource = dto.paymentSource === 'tsc' ? 'tsc' : 'school';
    await this.ds.query(
      `INSERT INTO staff_salaries
         (tenant_id, staff_id, basic_pay, house_allowance, transport_allowance, other_allowance, other_allowance_label,
          payment_source, remedial_rate, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
       ON CONFLICT (tenant_id, staff_id) DO UPDATE SET
         basic_pay = $3, house_allowance = $4, transport_allowance = $5,
         other_allowance = $6, other_allowance_label = $7, payment_source = $8, remedial_rate = $9, updated_at = NOW()`,
      [
        req.user.tenantId, dto.staffId, Number(dto.basicPay) || 0, Number(dto.houseAllowance) || 0,
        Number(dto.transportAllowance) || 0, Number(dto.otherAllowance) || 0, dto.otherAllowanceLabel || null,
        paymentSource, Number(dto.remedialRate) || 0,
      ],
    ).catch((e: any) => { throw new BadRequestException(`Could not save salary: ${e.message}`); });
    return { saved: true };
  }

  @Get('runs')
  async listRuns(@Request() req: any) {
    await this.staffRoleOnly(req);
    await this.ensureTables();
    return this.ds.query(
      `SELECT r.id, r.month, r.status, r.finalized_at AS "finalizedAt", r.finalized_by_name AS "finalizedByName",
              COUNT(e.id) AS "staffCount", COALESCE(SUM(e.net_pay),0) AS "totalNetPay"
         FROM payroll_runs r LEFT JOIN payroll_entries e ON e.payroll_run_id::text = r.id::text
        WHERE r.tenant_id::text = $1
        GROUP BY r.id ORDER BY r.month DESC`,
      [req.user.tenantId],
    ).catch(() => []);
  }

  @Get('runs/:id')
  async getRun(@Request() req: any, @Param('id') id: string) {
    await this.staffRoleOnly(req);
    await this.ensureTables();
    const runRows = await this.ds.query(
      `SELECT id, month, status, finalized_at AS "finalizedAt", finalized_by_name AS "finalizedByName"
         FROM payroll_runs WHERE id::text = $1 AND tenant_id::text = $2`,
      [id, req.user.tenantId],
    ).catch(() => []);
    if (!runRows.length) throw new BadRequestException('Payroll run not found.');
    const entries = await this.ds.query(
      `SELECT id, staff_id AS "staffId", staff_name AS "staffName", role,
              basic_pay AS "basicPay", allowances_total AS "allowancesTotal", gross_pay AS "grossPay",
              paye, nssf_employee AS "nssfEmployee", nssf_employer AS "nssfEmployer",
              sha, housing_levy_employee AS "housingLevyEmployee", housing_levy_employer AS "housingLevyEmployer",
              loan_id AS "loanId", loan_deduction AS "loanDeduction",
              payment_source AS "paymentSource", remedial_lessons AS "remedialLessons", remedial_pay AS "remedialPay",
              net_pay AS "netPay"
         FROM payroll_entries WHERE payroll_run_id::text = $1 ORDER BY staff_name`,
      [id],
    ).catch(() => []);
    return { ...runRows[0], entries };
  }

  // Computes (or recomputes, if still a draft) every entry for the given month from
  // each staff member's current salary record. Re-running a draft replaces its
  // entries outright — nothing is ever half-updated.
  @Post('runs')
  async runPayroll(@Request() req: any, @Body() dto: any) {
    await this.staffRoleOnly(req);
    const month = String(dto?.month || '').trim();
    if (!/^\d{4}-\d{2}$/.test(month)) throw new BadRequestException('Provide a month as YYYY-MM.');
    await this.ensureTables();
    const tenantId = req.user.tenantId;

    let runRows = await this.ds.query(
      `SELECT id, status FROM payroll_runs WHERE tenant_id::text = $1 AND month = $2`,
      [tenantId, month],
    ).catch(() => []);
    if (runRows.length && runRows[0].status === 'finalized') {
      throw new BadRequestException('This month is already finalized — it cannot be recomputed.');
    }
    let runId: string;
    if (runRows.length) {
      runId = runRows[0].id;
      await this.ds.query(`DELETE FROM payroll_entries WHERE payroll_run_id::text = $1`, [runId]).catch(() => null);
    } else {
      const created = await this.ds.query(
        `INSERT INTO payroll_runs (tenant_id, month, status, created_at) VALUES ($1,$2,'draft',NOW()) RETURNING id`,
        [tenantId, month],
      );
      runId = created[0].id;
    }

    // Lessons taught this run, per staff — how TSC-paid staff (paid by government, not the
    // school) can still get a remedial payment without being pulled into the normal payroll.
    const remedialLessons: Record<string, number> = {};
    for (const [k, v] of Object.entries(dto?.remedialLessons || {})) {
      const n = Number(v);
      if (n > 0) remedialLessons[k] = n;
    }

    const candidates = await this.ds.query(
      `SELECT u.id, u.first_name AS "firstName", u.last_name AS "lastName", u.role,
              s.basic_pay AS "basicPay", s.house_allowance AS "houseAllowance",
              s.transport_allowance AS "transportAllowance", s.other_allowance AS "otherAllowance",
              COALESCE(s.payment_source, 'school') AS "paymentSource", s.remedial_rate AS "remedialRate"
         FROM users u JOIN staff_salaries s ON s.staff_id::text = u.id::text AND s.tenant_id::text = u.tenant_id::text
        WHERE u.tenant_id::text = $1 AND u.role = ANY($2) AND u.is_active = true`,
      [tenantId, PAYROLL_STAFF_ROLES],
    ).catch(() => []);
    // TSC-paid staff (public-school teachers paid by the government) are excluded from the
    // school's own payroll by default — they only appear in a run if remedial lessons were
    // entered for them this month. School-paid staff still need a basic pay set to appear.
    const staff = (candidates as any[]).filter(s =>
      s.paymentSource === 'tsc' ? remedialLessons[s.id] > 0 : Number(s.basicPay) > 0);
    if (!staff.length) throw new BadRequestException('No staff to pay this month — set a school-paid salary, or enter remedial lessons for TSC-paid staff, under Payroll → Staff Salaries first.');

    // Active loans, keyed by staff — enforced one-active-loan-at-a-time at
    // creation time, so this is at most one row per staff member.
    const loans = await this.ds.query(
      `SELECT id, staff_id AS "staffId", monthly_deduction AS "monthlyDeduction", balance_remaining AS "balanceRemaining"
         FROM staff_loans WHERE tenant_id::text = $1 AND status = 'active' AND balance_remaining > 0`,
      [tenantId],
    ).catch(() => []);
    const loanByStaff: Record<string, any> = {};
    for (const l of (loans as any[])) loanByStaff[l.staffId] = l;

    for (const s of (staff as any[])) {
      const basicPay = Number(s.basicPay) || 0;
      const lessons = remedialLessons[s.id] || 0;
      const remedialPay = lessons * (Number(s.remedialRate) || 0);
      const allowancesTotal = Number(s.houseAllowance || 0) + Number(s.transportAllowance || 0) + Number(s.otherAllowance || 0) + remedialPay;
      const grossPay = basicPay + allowancesTotal;
      const nssf = calcNssf(grossPay);
      const sha = calcSha(grossPay);
      const housing = calcHousingLevy(grossPay);
      const taxablePay = Math.max(0, grossPay - nssf.employee - sha - housing.employee);
      const paye = calcPaye(taxablePay);
      const loan = loanByStaff[s.id];
      const loanDeduction = loan ? Math.min(Number(loan.monthlyDeduction), Number(loan.balanceRemaining)) : 0;
      const netPay = grossPay - paye - nssf.employee - sha - housing.employee - loanDeduction;
      await this.ds.query(
        `INSERT INTO payroll_entries
           (tenant_id, payroll_run_id, staff_id, staff_name, role, basic_pay, allowances_total, gross_pay,
            paye, nssf_employee, nssf_employer, sha, housing_levy_employee, housing_levy_employer,
            loan_id, loan_deduction, payment_source, remedial_lessons, remedial_pay, net_pay, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,NOW())`,
        [
          tenantId, runId, s.id, `${s.firstName} ${s.lastName}`, s.role, basicPay, allowancesTotal, grossPay,
          paye, nssf.employee, nssf.employer, sha, housing.employee, housing.employer,
          loan ? loan.id : null, loanDeduction, s.paymentSource, lessons, remedialPay, netPay,
        ],
      ).catch(() => null);
    }
    return this.getRun(req, runId);
  }

  // Locks the run and posts its cost into Expenses (Cashbook/Income Statement/Trial
  // Balance) as separate line items — net pay plus each statutory remittance —
  // so a finalized payroll shows up in the rest of Finance automatically.
  @Post('runs/:id/finalize')
  async finalizeRun(@Request() req: any, @Param('id') id: string) {
    await this.staffRoleOnly(req);
    await this.ensureTables();
    const tenantId = req.user.tenantId;
    const run = await this.getRun(req, id);
    if (run.status === 'finalized') throw new BadRequestException('Already finalized.');
    if (!run.entries.length) throw new BadRequestException('This run has no staff in it — run payroll first.');

    const sum = (k: string) => (run.entries as any[]).reduce((s, e) => s + Number(e[k] || 0), 0);
    const spentOn = `${run.month}-28`; // last-ish day of the month, close enough for a cashbook date
    const label = `Payroll ${run.month}`;
    await this.financeController.recordExpenseRow(tenantId, req.user.schoolId || null, 'Salaries — Net Pay', label, sum('netPay'), spentOn);
    await this.financeController.recordExpenseRow(tenantId, req.user.schoolId || null, 'Statutory — PAYE', label, sum('paye'), spentOn);
    await this.financeController.recordExpenseRow(tenantId, req.user.schoolId || null, 'Statutory — NSSF (employee)', label, sum('nssfEmployee'), spentOn);
    await this.financeController.recordExpenseRow(tenantId, req.user.schoolId || null, 'Statutory — NSSF (employer)', label, sum('nssfEmployer'), spentOn);
    await this.financeController.recordExpenseRow(tenantId, req.user.schoolId || null, 'Statutory — SHA', label, sum('sha'), spentOn);
    await this.financeController.recordExpenseRow(tenantId, req.user.schoolId || null, 'Statutory — Housing Levy (employee)', label, sum('housingLevyEmployee'), spentOn);
    await this.financeController.recordExpenseRow(tenantId, req.user.schoolId || null, 'Statutory — Housing Levy (employer)', label, sum('housingLevyEmployer'), spentOn);

    // Recover any loan deductions computed for this run — the disbursed principal
    // was already expensed when the loan was created, so this just pays it down,
    // no separate expense entry.
    for (const e of (run.entries as any[])) {
      if (!e.loanId || !Number(e.loanDeduction)) continue;
      const rows = await this.ds.query(
        `UPDATE staff_loans SET balance_remaining = GREATEST(0, balance_remaining - $1), updated_at = NOW()
           WHERE id::text = $2 AND tenant_id::text = $3 RETURNING balance_remaining AS "balanceRemaining"`,
        [Number(e.loanDeduction), e.loanId, tenantId],
      ).catch(() => []);
      if (rows[0] && Number(rows[0].balanceRemaining) <= 0) {
        await this.ds.query(`UPDATE staff_loans SET status = 'completed' WHERE id::text = $1`, [e.loanId]).catch(() => null);
      }
    }

    const name = await this.financeController.getUserDisplayName(req.user.id, req.user.email || '');
    await this.ds.query(
      `UPDATE payroll_runs SET status = 'finalized', finalized_at = NOW(), finalized_by = $1, finalized_by_name = $2
        WHERE id::text = $3 AND tenant_id::text = $4`,
      [req.user.id || null, name, id, tenantId],
    );
    return this.getRun(req, id);
  }

  @Delete('runs/:id')
  async deleteRun(@Request() req: any, @Param('id') id: string) {
    await this.staffRoleOnly(req);
    await this.ensureTables();
    const rows = await this.ds.query(
      `SELECT status FROM payroll_runs WHERE id::text = $1 AND tenant_id::text = $2`, [id, req.user.tenantId],
    ).catch(() => []);
    if (!rows.length) throw new BadRequestException('Payroll run not found.');
    if (rows[0].status === 'finalized') throw new BadRequestException('A finalized run cannot be deleted.');
    await this.ds.query(`DELETE FROM payroll_entries WHERE payroll_run_id::text = $1`, [id]).catch(() => null);
    await this.ds.query(`DELETE FROM payroll_runs WHERE id::text = $1 AND tenant_id::text = $2`, [id, req.user.tenantId]).catch(() => null);
    return { deleted: true };
  }

  @Get('payslip/:entryId/html')
  async payslipHtml(@Request() req: any, @Param('entryId') entryId: string, @Res() res: any) {
    await this.staffRoleOnly(req);
    await this.ensureTables();
    const rows = await this.ds.query(
      `SELECT e.*, r.month, r.status FROM payroll_entries e
         JOIN payroll_runs r ON r.id::text = e.payroll_run_id::text
        WHERE e.id::text = $1 AND e.tenant_id::text = $2`,
      [entryId, req.user.tenantId],
    ).catch(() => []);
    if (!rows.length) { res.status(404).send('<p>Payslip not found.</p>'); return; }
    const p = rows[0];
    const school = await this.ds.query(`SELECT name FROM schools WHERE tenant_id::text = $1 LIMIT 1`, [req.user.tenantId])
      .then((r: any[]) => r[0]?.name || 'School').catch(() => 'School');
    const esc = (s: any) => String(s ?? '').replace(/[&<>]/g, (c: string) => ({ '&':'&amp;','<':'&lt;','>':'&gt;' }[c] || c));
    const ksh = (n: any) => 'KES ' + Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 });
    const row = (label: string, amt: any) => `<tr><td>${esc(label)}</td><td class="n">${ksh(amt)}</td></tr>`;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Payslip ${esc(p.month)}</title><style>
      body{font-family:Arial,sans-serif;margin:24px;color:#1a2e5a}
      .head{text-align:center;border-bottom:3px solid #1a2e5a;padding-bottom:10px;margin-bottom:16px}
      .head h1{margin:0;font-size:20px}.head h2{margin:4px 0 0;font-size:14px;font-weight:400;color:#555}
      table{width:100%;border-collapse:collapse;margin-top:6px;font-size:13px}
      th,td{border:1px solid #ccc;padding:6px 10px;text-align:left}
      th{background:#1a2e5a;color:#fff} td.n,th.n{text-align:right}
      tfoot td{font-weight:bold;background:#f0f2f8}
      .print{margin:16px 0;text-align:center}
      button{background:#f5820a;color:#fff;border:none;padding:8px 18px;border-radius:6px;cursor:pointer;font-weight:bold}
      @media print{.print{display:none}}
      </style></head><body>
      <div class="head"><h1>${esc(school)}</h1><h2>Payslip · ${esc(p.month)}${p.status === 'draft' ? ' (DRAFT — not yet finalized)' : ''}</h2></div>
      <div class="print"><button onclick="window.print()">🖨 Print / Save as PDF</button></div>
      <p><b>${esc(p.staff_name)}</b> · ${esc(String(p.role || '').replace(/_/g,' '))}</p>
      <table>
        <thead><tr><th>Earnings</th><th class="n">Amount</th></tr></thead>
        <tbody>
          ${row('Basic Pay', p.basic_pay)}
          ${row('Allowances', p.allowances_total)}
        </tbody>
        <tfoot>${row('Gross Pay', p.gross_pay)}</tfoot>
      </table>
      <table>
        <thead><tr><th>Deductions</th><th class="n">Amount</th></tr></thead>
        <tbody>
          ${row('PAYE', p.paye)}
          ${row('NSSF', p.nssf_employee)}
          ${row('SHA', p.sha)}
          ${row('Housing Levy', p.housing_levy_employee)}
          ${Number(p.loan_deduction) > 0 ? row('Loan Repayment', p.loan_deduction) : ''}
        </tbody>
        <tfoot>${row('Total Deductions', Number(p.paye)+Number(p.nssf_employee)+Number(p.sha)+Number(p.housing_levy_employee)+Number(p.loan_deduction||0))}</tfoot>
      </table>
      <table><tfoot>${row('NET PAY', p.net_pay)}</tfoot></table>
      <p style="font-size:11px;color:#666;margin-top:16px">Employer also remits NSSF ${ksh(p.nssf_employer)} and Housing Levy ${ksh(p.housing_levy_employer)} on top of this payslip — not deducted from the employee.</p>
      </body></html>`;
    res.set('Content-Type', 'text/html').send(html);
  }

  // ── Staff loans/advances ───────────────────────────────────
  @Get('loans')
  async listLoans(@Request() req: any) {
    await this.staffRoleOnly(req);
    await this.ensureTables();
    return this.ds.query(
      `SELECT id, staff_id AS "staffId", staff_name AS "staffName", principal_amount AS "principalAmount",
              monthly_deduction AS "monthlyDeduction", balance_remaining AS "balanceRemaining",
              reason, status, created_by_name AS "createdByName", created_at AS "createdAt"
         FROM staff_loans WHERE tenant_id::text = $1 ORDER BY created_at DESC`,
      [req.user.tenantId],
    ).catch(() => []);
  }

  // Creating a loan expenses the disbursed principal immediately (the cash left
  // the school then) — the monthly payroll deductions afterwards just pay it
  // down and are NOT posted as a second expense (see finalizeRun).
  @Post('loans')
  async createLoan(@Request() req: any, @Body() dto: any) {
    await this.staffRoleOnly(req);
    await this.ensureTables();
    if (!dto?.staffId) throw new BadRequestException('Select a staff member.');
    const principal = Number(dto.principalAmount);
    const monthly = Number(dto.monthlyDeduction);
    if (!principal || principal <= 0) throw new BadRequestException('Enter a valid loan amount.');
    if (!monthly || monthly <= 0) throw new BadRequestException('Enter a valid monthly deduction.');
    const existing = await this.ds.query(
      `SELECT id FROM staff_loans WHERE tenant_id::text = $1 AND staff_id::text = $2 AND status = 'active'`,
      [req.user.tenantId, dto.staffId],
    ).catch(() => []);
    if (existing.length) throw new BadRequestException('This staff member already has an active loan — it must be cleared or cancelled first.');
    const staffRow = await this.ds.query(
      `SELECT first_name AS "firstName", last_name AS "lastName" FROM users WHERE id::text = $1 AND tenant_id::text = $2`,
      [dto.staffId, req.user.tenantId],
    ).catch(() => []);
    if (!staffRow.length) throw new BadRequestException('Staff member not found.');
    const staffName = `${staffRow[0].firstName} ${staffRow[0].lastName}`;
    const name = await this.financeController.getUserDisplayName(req.user.id, req.user.email || '');
    const rows = await this.ds.query(
      `INSERT INTO staff_loans
         (tenant_id, staff_id, staff_name, principal_amount, monthly_deduction, balance_remaining, reason,
          status, created_by, created_by_name, updated_at)
       VALUES ($1,$2,$3,$4,$5,$4,$6,'active',$7,$8,NOW()) RETURNING id`,
      [req.user.tenantId, dto.staffId, staffName, principal, monthly, dto.reason || null, req.user.id, name],
    ).catch((e: any) => { throw new BadRequestException(`Could not save: ${e.message}`); });
    await this.financeController.recordExpenseRow(
      req.user.tenantId, req.user.schoolId || null, 'Staff Loans/Advances (Disbursed)',
      `Loan to ${staffName}${dto.reason ? ` — ${dto.reason}` : ''}`, principal,
      new Date().toISOString().slice(0, 10),
    );
    return { id: rows[0].id };
  }

  @Patch('loans/:id')
  async updateLoan(@Request() req: any, @Param('id') id: string, @Body() dto: any) {
    await this.staffRoleOnly(req);
    await this.ensureTables();
    const fields: string[] = []; const vals: any[] = []; let i = 1;
    if (dto.monthlyDeduction !== undefined) { fields.push(`monthly_deduction = $${i++}`); vals.push(Number(dto.monthlyDeduction) || 0); }
    if (dto.status !== undefined) { fields.push(`status = $${i++}`); vals.push(dto.status); }
    if (dto.reason !== undefined) { fields.push(`reason = $${i++}`); vals.push(dto.reason || null); }
    if (!fields.length) return { updated: false };
    fields.push('updated_at = NOW()');
    vals.push(id, req.user.tenantId);
    await this.ds.query(
      `UPDATE staff_loans SET ${fields.join(', ')} WHERE id::text = $${i++} AND tenant_id::text = $${i}`,
      vals,
    ).catch((e: any) => { throw new BadRequestException(`Could not update: ${e.message}`); });
    return { updated: true };
  }

  @Delete('loans/:id')
  async deleteLoan(@Request() req: any, @Param('id') id: string) {
    await this.staffRoleOnly(req);
    await this.ensureTables();
    const rows = await this.ds.query(
      `SELECT principal_amount AS "principalAmount", balance_remaining AS "balanceRemaining"
         FROM staff_loans WHERE id::text = $1 AND tenant_id::text = $2`,
      [id, req.user.tenantId],
    ).catch(() => []);
    if (!rows.length) throw new BadRequestException('Loan not found.');
    if (Number(rows[0].balanceRemaining) < Number(rows[0].principalAmount)) {
      throw new BadRequestException('Deductions have already been recovered against this loan — cancel it instead of deleting.');
    }
    await this.ds.query(`DELETE FROM staff_loans WHERE id::text = $1 AND tenant_id::text = $2`, [id, req.user.tenantId]).catch(() => null);
    return { deleted: true };
  }

  // ── Annual PAYE summary (P9-style) ────────────────────────
  // A month-by-month breakdown for one staff member across a calendar year,
  // from FINALIZED payroll runs only — draft runs aren't real pay yet. This
  // mirrors the structure of KRA's P9A form closely enough to use as a
  // reference when filing, but isn't a pixel-perfect copy of the official
  // template — cross-check against the current P9A before submitting.
  @Get('p9/:staffId/html')
  async p9Html(@Request() req: any, @Param('staffId') staffId: string, @Query('year') year: string, @Res() res: any) {
    await this.staffRoleOnly(req);
    await this.ensureTables();
    const y = year || String(new Date().getFullYear());
    const rows = await this.ds.query(
      `SELECT r.month, e.basic_pay AS "basicPay", e.allowances_total AS "allowancesTotal", e.gross_pay AS "grossPay",
              e.nssf_employee AS "nssfEmployee", e.sha, e.housing_levy_employee AS "housingLevyEmployee",
              (e.gross_pay - e.nssf_employee - e.sha - e.housing_levy_employee) AS "taxablePay", e.paye
         FROM payroll_entries e JOIN payroll_runs r ON r.id::text = e.payroll_run_id::text
        WHERE e.staff_id::text = $1 AND e.tenant_id::text = $2 AND r.status = 'finalized' AND r.month LIKE $3
        ORDER BY r.month ASC`,
      [staffId, req.user.tenantId, `${y}-%`],
    ).catch(() => []);
    const staffRow = await this.ds.query(
      `SELECT first_name AS "firstName", last_name AS "lastName" FROM users WHERE id::text = $1 AND tenant_id::text = $2`,
      [staffId, req.user.tenantId],
    ).catch(() => []);
    const staffName = staffRow[0] ? `${staffRow[0].firstName} ${staffRow[0].lastName}` : 'Staff';
    const school = await this.ds.query(`SELECT name FROM schools WHERE tenant_id::text = $1 LIMIT 1`, [req.user.tenantId])
      .then((r: any[]) => r[0]?.name || 'School').catch(() => 'School');
    const esc = (s: any) => String(s ?? '').replace(/[&<>]/g, (c: string) => ({ '&':'&amp;','<':'&lt;','>':'&gt;' }[c] || c));
    const ksh = (n: any) => Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 });
    const sum = (k: string) => (rows as any[]).reduce((s, r) => s + Number(r[k] || 0), 0);
    const body = (rows as any[]).map((r: any) => `<tr>
        <td>${esc(r.month)}</td><td class="n">${ksh(r.basicPay)}</td><td class="n">${ksh(r.allowancesTotal)}</td>
        <td class="n">${ksh(r.grossPay)}</td><td class="n">${ksh(r.nssfEmployee)}</td><td class="n">${ksh(r.sha)}</td>
        <td class="n">${ksh(r.housingLevyEmployee)}</td><td class="n">${ksh(r.taxablePay)}</td><td class="n">${ksh(r.paye)}</td>
      </tr>`).join('') || `<tr><td colspan="9" style="text-align:center">No finalized payroll for ${esc(y)} yet.</td></tr>`;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Annual PAYE Summary ${esc(y)}</title><style>
      body{font-family:Arial,sans-serif;margin:24px;color:#1a2e5a}
      .head{text-align:center;border-bottom:3px solid #1a2e5a;padding-bottom:10px;margin-bottom:16px}
      .head h1{margin:0;font-size:20px}.head h2{margin:4px 0 0;font-size:14px;font-weight:400;color:#555}
      table{width:100%;border-collapse:collapse;margin-top:6px;font-size:11px}
      th,td{border:1px solid #ccc;padding:5px 7px;text-align:left}
      th{background:#1a2e5a;color:#fff} td.n,th.n{text-align:right}
      tfoot td{font-weight:bold;background:#f0f2f8}
      .print{margin:16px 0;text-align:center}
      button{background:#f5820a;color:#fff;border:none;padding:8px 18px;border-radius:6px;cursor:pointer;font-weight:bold}
      @media print{.print{display:none}}
      </style></head><body>
      <div class="head"><h1>${esc(school)}</h1><h2>Annual PAYE Summary (P9-style) · ${esc(staffName)} · ${esc(y)}</h2></div>
      <div class="print"><button onclick="window.print()">🖨 Print / Save as PDF</button></div>
      <table>
        <thead><tr><th>Month</th><th class="n">Basic Pay</th><th class="n">Allowances</th><th class="n">Gross Pay</th>
          <th class="n">NSSF</th><th class="n">SHA</th><th class="n">Housing Levy</th><th class="n">Taxable Pay</th><th class="n">PAYE</th></tr></thead>
        <tbody>${body}</tbody>
        <tfoot><tr><td>Total</td><td class="n">${ksh(sum('basicPay'))}</td><td class="n">${ksh(sum('allowancesTotal'))}</td>
          <td class="n">${ksh(sum('grossPay'))}</td><td class="n">${ksh(sum('nssfEmployee'))}</td><td class="n">${ksh(sum('sha'))}</td>
          <td class="n">${ksh(sum('housingLevyEmployee'))}</td><td class="n">${ksh(sum('taxablePay'))}</td><td class="n">${ksh(sum('paye'))}</td></tr></tfoot>
      </table>
      <p style="font-size:11px;color:#666;margin-top:16px">Based on finalized payroll runs only. This is a reference summary in the shape of KRA's P9A form — verify against the current official P9A template before filing.</p>
      </body></html>`;
    res.set('Content-Type', 'text/html').send(html);
  }

  // ── Bulk disbursement export (bank/M-Pesa bulk-payment upload) ───────────
  // Generic Name/Phone/Amount/Reference CSV — close to Safaricom's bulk B2C
  // template and most banks' generic salary-upload format, but check the
  // exact column order/headers your bank or M-Pesa bulk portal expects before
  // uploading; this is a starting point, not guaranteed to match every bank.
  @Get('runs/:id/disbursement.csv')
  async disbursementCsv(@Request() req: any, @Param('id') id: string, @Res() res: any) {
    await this.staffRoleOnly(req);
    await this.ensureTables();
    const run = await this.getRun(req, id);
    if (run.status !== 'finalized') throw new BadRequestException('Finalize this payroll run before exporting a disbursement file.');
    const phones = await this.ds.query(
      `SELECT id, phone FROM users WHERE tenant_id::text = $1 AND id = ANY($2)`,
      [req.user.tenantId, (run.entries as any[]).map(e => e.staffId)],
    ).catch(() => []);
    const phoneById: Record<string, string> = {};
    for (const p of (phones as any[])) phoneById[p.id] = p.phone || '';
    const esc = (s: any) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const lines = ['Name,Phone,Amount,Reference'];
    for (const e of (run.entries as any[])) {
      lines.push([esc(e.staffName), esc(phoneById[e.staffId] || ''), Number(e.netPay).toFixed(2), esc(`Salary ${run.month}`)].join(','));
    }
    res.set('Content-Type', 'text/csv');
    res.set('Content-Disposition', `attachment; filename="payroll-disbursement-${run.month}.csv"`);
    res.send(lines.join('\n'));
  }
}

const TRANSPORT_MANAGER_ROLES = ['hoi', 'dhois', 'tenant_owner', 'school_admin', 'bursar'];

// Student transport: vehicles/drivers, routes with stops, and which learner rides
// which route+stop. A route's fee is picked up by FeeService.generateStreamInvoices
// as an extra per-learner line item — see getActiveTransportFee() there.
@Controller('transport')
@UseGuards(JwtAuthGuard)
class TransportController {
  constructor(private readonly ds: DataSource) {}

  private async managerOnly(req: any) {
    if (!TRANSPORT_MANAGER_ROLES.includes(req.user.role)) {
      throw new BadRequestException('Only the HOI, bursar or administrator can manage transport.');
    }
    await requireProPlan(this.ds, req.user.tenantId, 'Student Transport');
  }

  private async ensureTables() {
    await this.ds.query(
      `CREATE TABLE IF NOT EXISTS transport_vehicles (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid, created_at timestamptz DEFAULT NOW()
       )`,
    ).catch(() => null);
    for (const [n, t] of [
      ['registration_number', 'text'], ['make_model', 'text'], ['capacity', 'integer DEFAULT 0'],
      ['driver_name', 'text'], ['driver_phone', 'text'],
      ['status', "text DEFAULT 'active'"], // active | inactive
      ['updated_at', 'timestamptz DEFAULT NOW()'],
    ] as [string, string][]) {
      await this.ds.query(`ALTER TABLE transport_vehicles ADD COLUMN IF NOT EXISTS ${n} ${t}`).catch(() => null);
    }

    await this.ds.query(
      `CREATE TABLE IF NOT EXISTS transport_routes (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid, created_at timestamptz DEFAULT NOW()
       )`,
    ).catch(() => null);
    for (const [n, t] of [
      ['name', 'text'], ['description', 'text'], ['vehicle_id', 'uuid'],
      ['fee_amount', 'numeric DEFAULT 0'], // charged every term a learner is actively assigned
      ['status', "text DEFAULT 'active'"], // active | inactive
      ['updated_at', 'timestamptz DEFAULT NOW()'],
    ] as [string, string][]) {
      await this.ds.query(`ALTER TABLE transport_routes ADD COLUMN IF NOT EXISTS ${n} ${t}`).catch(() => null);
    }

    await this.ds.query(
      `CREATE TABLE IF NOT EXISTS transport_stops (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid, route_id uuid, created_at timestamptz DEFAULT NOW()
       )`,
    ).catch(() => null);
    for (const [n, t] of [
      ['name', 'text'], ['pickup_time', 'text'], ['dropoff_time', 'text'], ['order_index', 'integer DEFAULT 0'],
    ] as [string, string][]) {
      await this.ds.query(`ALTER TABLE transport_stops ADD COLUMN IF NOT EXISTS ${n} ${t}`).catch(() => null);
    }

    // One active route+stop per learner at a time — reassigning just overwrites it,
    // the same "at most one live record" idiom as staff_salaries / staff_loans.
    await this.ds.query(
      `CREATE TABLE IF NOT EXISTS transport_assignments (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid, learner_id uuid, created_at timestamptz DEFAULT NOW()
       )`,
    ).catch(() => null);
    for (const [n, t] of [
      ['route_id', 'uuid'], ['stop_id', 'uuid'],
      ['status', "text DEFAULT 'active'"], // active | inactive
      ['updated_at', 'timestamptz DEFAULT NOW()'],
    ] as [string, string][]) {
      await this.ds.query(`ALTER TABLE transport_assignments ADD COLUMN IF NOT EXISTS ${n} ${t}`).catch(() => null);
    }
    await this.ds.query(`CREATE UNIQUE INDEX IF NOT EXISTS transport_assignments_tenant_learner_uq ON transport_assignments (tenant_id, learner_id)`).catch(() => null);
  }

  // ── Vehicles ──────────────────────────────────────────────
  @Get('vehicles')
  async listVehicles(@Request() req: any) {
    await this.managerOnly(req);
    await this.ensureTables();
    return this.ds.query(
      `SELECT id, registration_number AS "registrationNumber", make_model AS "makeModel", capacity,
              driver_name AS "driverName", driver_phone AS "driverPhone", status
         FROM transport_vehicles WHERE tenant_id::text = $1 ORDER BY registration_number`,
      [req.user.tenantId],
    ).catch(() => []);
  }

  @Post('vehicles')
  async createVehicle(@Request() req: any, @Body() dto: any) {
    await this.managerOnly(req);
    if (!dto?.registrationNumber) throw new BadRequestException('Registration number is required.');
    await this.ensureTables();
    const rows = await this.ds.query(
      `INSERT INTO transport_vehicles (tenant_id, registration_number, make_model, capacity, driver_name, driver_phone, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW()) RETURNING id`,
      [req.user.tenantId, dto.registrationNumber, dto.makeModel || null, Number(dto.capacity) || 0, dto.driverName || null, dto.driverPhone || null],
    ).catch((e: any) => { throw new BadRequestException(`Could not save vehicle: ${e.message}`); });
    return { id: rows[0].id, saved: true };
  }

  @Patch('vehicles/:id')
  async updateVehicle(@Request() req: any, @Param('id') id: string, @Body() dto: any) {
    await this.managerOnly(req);
    await this.ensureTables();
    await this.ds.query(
      `UPDATE transport_vehicles SET
         registration_number = COALESCE($3, registration_number), make_model = COALESCE($4, make_model),
         capacity = COALESCE($5, capacity), driver_name = COALESCE($6, driver_name),
         driver_phone = COALESCE($7, driver_phone), status = COALESCE($8, status), updated_at = NOW()
       WHERE id::text = $1 AND tenant_id::text = $2`,
      [id, req.user.tenantId, dto.registrationNumber ?? null, dto.makeModel ?? null, dto.capacity != null ? Number(dto.capacity) : null,
       dto.driverName ?? null, dto.driverPhone ?? null, dto.status ?? null],
    ).catch((e: any) => { throw new BadRequestException(`Could not update vehicle: ${e.message}`); });
    return { saved: true };
  }

  @Delete('vehicles/:id')
  async deleteVehicle(@Request() req: any, @Param('id') id: string) {
    await this.managerOnly(req);
    await this.ensureTables();
    const inUse = await this.ds.query(`SELECT id FROM transport_routes WHERE vehicle_id::text = $1 AND tenant_id::text = $2`, [id, req.user.tenantId]).catch(() => []);
    if (inUse.length) throw new BadRequestException('This vehicle is assigned to a route — reassign or delete the route first.');
    await this.ds.query(`DELETE FROM transport_vehicles WHERE id::text = $1 AND tenant_id::text = $2`, [id, req.user.tenantId]).catch(() => null);
    return { deleted: true };
  }

  // ── Routes ────────────────────────────────────────────────
  @Get('routes')
  async listRoutes(@Request() req: any) {
    await this.managerOnly(req);
    await this.ensureTables();
    return this.ds.query(
      `SELECT r.id, r.name, r.description, r.fee_amount AS "feeAmount", r.status,
              r.vehicle_id AS "vehicleId", v.registration_number AS "vehicleReg", v.driver_name AS "driverName",
              (SELECT COUNT(*) FROM transport_stops st WHERE st.route_id::text = r.id::text) AS "stopCount",
              (SELECT COUNT(*) FROM transport_assignments a WHERE a.route_id::text = r.id::text AND a.status = 'active') AS "learnerCount"
         FROM transport_routes r LEFT JOIN transport_vehicles v ON v.id::text = r.vehicle_id::text
        WHERE r.tenant_id::text = $1 ORDER BY r.name`,
      [req.user.tenantId],
    ).catch(() => []);
  }

  @Post('routes')
  async createRoute(@Request() req: any, @Body() dto: any) {
    await this.managerOnly(req);
    if (!dto?.name) throw new BadRequestException('Route name is required.');
    await this.ensureTables();
    const rows = await this.ds.query(
      `INSERT INTO transport_routes (tenant_id, name, description, vehicle_id, fee_amount, updated_at)
       VALUES ($1,$2,$3,$4,$5,NOW()) RETURNING id`,
      [req.user.tenantId, dto.name, dto.description || null, dto.vehicleId || null, Number(dto.feeAmount) || 0],
    ).catch((e: any) => { throw new BadRequestException(`Could not save route: ${e.message}`); });
    return { id: rows[0].id, saved: true };
  }

  @Patch('routes/:id')
  async updateRoute(@Request() req: any, @Param('id') id: string, @Body() dto: any) {
    await this.managerOnly(req);
    await this.ensureTables();
    await this.ds.query(
      `UPDATE transport_routes SET
         name = COALESCE($3, name), description = COALESCE($4, description), vehicle_id = $5,
         fee_amount = COALESCE($6, fee_amount), status = COALESCE($7, status), updated_at = NOW()
       WHERE id::text = $1 AND tenant_id::text = $2`,
      [id, req.user.tenantId, dto.name ?? null, dto.description ?? null, dto.vehicleId || null,
       dto.feeAmount != null ? Number(dto.feeAmount) : null, dto.status ?? null],
    ).catch((e: any) => { throw new BadRequestException(`Could not update route: ${e.message}`); });
    return { saved: true };
  }

  @Delete('routes/:id')
  async deleteRoute(@Request() req: any, @Param('id') id: string) {
    await this.managerOnly(req);
    await this.ensureTables();
    await this.ds.query(`DELETE FROM transport_assignments WHERE route_id::text = $1 AND tenant_id::text = $2`, [id, req.user.tenantId]).catch(() => null);
    await this.ds.query(`DELETE FROM transport_stops WHERE route_id::text = $1 AND tenant_id::text = $2`, [id, req.user.tenantId]).catch(() => null);
    await this.ds.query(`DELETE FROM transport_routes WHERE id::text = $1 AND tenant_id::text = $2`, [id, req.user.tenantId]).catch(() => null);
    return { deleted: true };
  }

  // ── Stops ─────────────────────────────────────────────────
  @Get('routes/:routeId/stops')
  async listStops(@Request() req: any, @Param('routeId') routeId: string) {
    await this.managerOnly(req);
    await this.ensureTables();
    return this.ds.query(
      `SELECT id, name, pickup_time AS "pickupTime", dropoff_time AS "dropoffTime", order_index AS "orderIndex"
         FROM transport_stops WHERE route_id::text = $1 AND tenant_id::text = $2 ORDER BY order_index, name`,
      [routeId, req.user.tenantId],
    ).catch(() => []);
  }

  @Post('stops')
  async createStop(@Request() req: any, @Body() dto: any) {
    await this.managerOnly(req);
    if (!dto?.routeId || !dto?.name) throw new BadRequestException('Route and stop name are required.');
    await this.ensureTables();
    const rows = await this.ds.query(
      `INSERT INTO transport_stops (tenant_id, route_id, name, pickup_time, dropoff_time, order_index)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [req.user.tenantId, dto.routeId, dto.name, dto.pickupTime || null, dto.dropoffTime || null, Number(dto.orderIndex) || 0],
    ).catch((e: any) => { throw new BadRequestException(`Could not save stop: ${e.message}`); });
    return { id: rows[0].id, saved: true };
  }

  @Delete('stops/:id')
  async deleteStop(@Request() req: any, @Param('id') id: string) {
    await this.managerOnly(req);
    await this.ensureTables();
    await this.ds.query(`UPDATE transport_assignments SET stop_id = NULL WHERE stop_id::text = $1 AND tenant_id::text = $2`, [id, req.user.tenantId]).catch(() => null);
    await this.ds.query(`DELETE FROM transport_stops WHERE id::text = $1 AND tenant_id::text = $2`, [id, req.user.tenantId]).catch(() => null);
    return { deleted: true };
  }

  // A parent may check their own child's route/stop/vehicle — read-only, no
  // ability to change it. Same guardian_email ownership check used by the
  // parent fees/library endpoints elsewhere in this file.
  @Get('my-child/:learnerId')
  async myChildTransport(@Request() req: any, @Param('learnerId') learnerId: string) {
    const tenantId = req.user.tenantId;
    if (req.user.role === 'parent') {
      const ok = await this.ds.query(
        `SELECT 1 FROM learners WHERE id::text = $1 AND tenant_id = $2
            AND LOWER(guardian_email) = LOWER($3) LIMIT 1`,
        [learnerId, tenantId, String(req.user.email || '')],
      ).catch(() => []);
      if (!ok.length) throw new BadRequestException('You can only view your own child’s transport details.');
    } else {
      await this.managerOnly(req);
    }
    await this.ensureTables();
    const rows = await this.ds.query(
      `SELECT a.route_id AS "routeId", r.name AS "routeName", r.fee_amount AS "feeAmount",
              a.stop_id AS "stopId", s.name AS "stopName", s.pickup_time AS "pickupTime", s.dropoff_time AS "dropoffTime",
              v.registration_number AS "vehicleReg", v.driver_name AS "driverName", v.driver_phone AS "driverPhone"
         FROM transport_assignments a
         JOIN transport_routes r ON r.id::text = a.route_id::text
         LEFT JOIN transport_stops s ON s.id::text = a.stop_id::text
         LEFT JOIN transport_vehicles v ON v.id::text = r.vehicle_id::text
        WHERE a.tenant_id::text = $1 AND a.learner_id::text = $2 AND a.status = 'active'`,
      [tenantId, learnerId],
    ).catch(() => []);
    return rows[0] || null;
  }

  // ── Learner assignments ───────────────────────────────────
  @Get('assignments')
  async listAssignments(@Request() req: any, @Query('routeId') routeId?: string) {
    await this.managerOnly(req);
    await this.ensureTables();
    const params: any[] = [req.user.tenantId];
    let where = `a.tenant_id::text = $1 AND a.status = 'active'`;
    if (routeId) { params.push(routeId); where += ` AND a.route_id::text = $${params.length}`; }
    return this.ds.query(
      `SELECT a.id, a.learner_id AS "learnerId", l.first_name AS "firstName", l.last_name AS "lastName",
              l.admission_number AS "admissionNumber", a.route_id AS "routeId", r.name AS "routeName",
              a.stop_id AS "stopId", s.name AS "stopName"
         FROM transport_assignments a
         JOIN learners l ON l.id::text = a.learner_id::text
         LEFT JOIN transport_routes r ON r.id::text = a.route_id::text
         LEFT JOIN transport_stops s ON s.id::text = a.stop_id::text
        WHERE ${where} ORDER BY l.first_name`,
      params,
    ).catch(() => []);
  }

  @Post('assignments')
  async setAssignment(@Request() req: any, @Body() dto: any) {
    await this.managerOnly(req);
    if (!dto?.learnerId || !dto?.routeId) throw new BadRequestException('Select a learner and a route.');
    await this.ensureTables();
    await this.ds.query(
      `INSERT INTO transport_assignments (tenant_id, learner_id, route_id, stop_id, status, updated_at)
       VALUES ($1,$2,$3,$4,'active',NOW())
       ON CONFLICT (tenant_id, learner_id) DO UPDATE SET
         route_id = $3, stop_id = $4, status = 'active', updated_at = NOW()`,
      [req.user.tenantId, dto.learnerId, dto.routeId, dto.stopId || null],
    ).catch((e: any) => { throw new BadRequestException(`Could not save assignment: ${e.message}`); });
    return { saved: true };
  }

  @Delete('assignments/:learnerId')
  async removeAssignment(@Request() req: any, @Param('learnerId') learnerId: string) {
    await this.managerOnly(req);
    await this.ensureTables();
    await this.ds.query(`DELETE FROM transport_assignments WHERE learner_id::text = $1 AND tenant_id::text = $2`, [learnerId, req.user.tenantId]).catch(() => null);
    return { deleted: true };
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Invoice])],
  controllers: [FinanceController, MpesaPaybillController, MpesaCallbackController, PayrollController, TransportController],
  providers: [FinanceController],
})
export class FinanceModule {}


// ═══════════════════════════════════════════════════════════
// COMMUNICATION MODULE
// ═══════════════════════════════════════════════════════════

// Revenue channel: schools top up a per-tenant SMS wallet (M-Pesa STK push via
// Tuma, same pattern as the Professional Records wallet — see wallet.service.ts)
// and every SMS sent through Communication debits it at a markup over what
// Africa's Talking actually charges us (confirmed KES 0.8/SMS in production).
// Priced at just above cost (not a big multiple) to keep adoption friction low —
// revisit once volume is meaningful.
export const SMS_PRICE_KES = 1;
export const SMS_COST_KES = 0.8; // Africa's Talking's actual per-SMS cost, for owner margin reporting

function smsCallbackUrl(): string {
  const base = (process.env.APP_URL || '').replace(/\/$/, '');
  return `${base}/api/v1/communication/sms-wallet/mpesa/callback`;
}

@Injectable()
class SmsWalletService {
  constructor(private readonly ds: DataSource) {}

  private async findOrCreateWallet(tenantId: string) {
    const rows = await this.ds.query(`SELECT * FROM sms_wallets WHERE tenant_id = $1`, [tenantId]);
    if (rows[0]) return rows[0];
    const inserted = await this.ds.query(
      `INSERT INTO sms_wallets (tenant_id, balance) VALUES ($1, 0) ON CONFLICT (tenant_id) DO UPDATE SET tenant_id = $1 RETURNING *`,
      [tenantId],
    );
    return inserted[0];
  }

  async getBalance(tenantId: string) {
    const wallet = await this.findOrCreateWallet(tenantId);
    return { balance: Number(wallet.balance), pricePerSms: SMS_PRICE_KES };
  }

  async getTransactions(tenantId: string) {
    return this.ds.query(
      `SELECT id, type, amount, sms_count AS "smsCount", balance_after AS "balanceAfter",
              description, status, created_at AS "createdAt"
         FROM sms_wallet_transactions WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [tenantId],
    );
  }

  // `units` = recipients × segments-per-message — a 2-segment message to 10 people
  // is 20 billed units, matching what Africa's Talking actually charges us for.
  async assertAffordable(tenantId: string, units: number) {
    const wallet = await this.findOrCreateWallet(tenantId);
    const cost = units * SMS_PRICE_KES;
    if (Number(wallet.balance) < cost) {
      throw new BadRequestException(
        `Insufficient SMS wallet balance. Sending this costs KES ${cost} (${units} SMS unit${units === 1 ? '' : 's'}), wallet has KES ${Number(wallet.balance)}. Top up to continue.`,
      );
    }
  }

  // Debits for units actually sent (AT only charges for what it accepted) — never
  // for the attempted count, so a blacklisted/invalid number never costs the
  // school anything since AT itself never billed us for it either. `units` must
  // already account for message segments (see assertAffordable).
  async debit(tenantId: string, units: number, description: string) {
    if (units <= 0) return;
    const cost = units * SMS_PRICE_KES;
    const wallet = await this.findOrCreateWallet(tenantId);
    const balanceAfter = Number(wallet.balance) - cost;
    await this.ds.query(`UPDATE sms_wallets SET balance = $2, updated_at = NOW() WHERE tenant_id = $1`, [tenantId, balanceAfter]);
    await this.ds.query(
      `INSERT INTO sms_wallet_transactions (tenant_id, type, amount, sms_count, balance_after, description, status)
       VALUES ($1,'debit',$2,$3,$4,$5,'completed')`,
      [tenantId, cost, units, balanceAfter, description],
    );
  }

  async topUp(tenantId: string, phone: string, amount: number) {
    const normalizedPhone = normalisePhoneForTuma(phone);
    if (!normalizedPhone) throw new BadRequestException('Enter a valid M-Pesa phone number.');
    if (!amount || amount < 10) throw new BadRequestException('Enter an amount of at least KES 10.');

    const rows = await this.ds.query(
      `INSERT INTO sms_wallet_transactions (tenant_id, type, amount, phone, status, description)
       VALUES ($1,'topup',$2,$3,'pending','SMS wallet top-up') RETURNING id`,
      [tenantId, amount, normalizedPhone],
    );
    const txnId = rows[0].id;

    const result = await initiateStkPush({
      amount, phone: normalizedPhone,
      description: 'ZARODA — SMS wallet top-up',
      callbackUrl: smsCallbackUrl(),
    });
    if (!result.ok) {
      await this.ds.query(`UPDATE sms_wallet_transactions SET status = 'failed' WHERE id = $1`, [txnId]);
      throw new BadRequestException(result.detail || 'Could not start the M-Pesa payment. Please try again.');
    }
    await this.ds.query(`UPDATE sms_wallet_transactions SET merchant_request_id = $2 WHERE id = $1`, [txnId, result.merchantRequestId]);

    return {
      transactionId: txnId,
      message: `STK push sent to ${normalizedPhone}. Enter your M-Pesa PIN to top up KES ${amount}.`,
    };
  }

  private async creditTopUp(txn: any, mpesaReceiptNumber?: string) {
    const fresh = await this.ds.query(`SELECT * FROM sms_wallet_transactions WHERE id = $1`, [txn.id]);
    if (!fresh[0] || fresh[0].status !== 'pending') return; // already settled
    const wallet = await this.findOrCreateWallet(fresh[0].tenant_id);
    const balanceAfter = Number(wallet.balance) + Number(fresh[0].amount);
    await this.ds.query(`UPDATE sms_wallets SET balance = $2, updated_at = NOW() WHERE tenant_id = $1`, [fresh[0].tenant_id, balanceAfter]);
    await this.ds.query(
      `UPDATE sms_wallet_transactions SET status = 'paid', mpesa_receipt_number = $2, balance_after = $3 WHERE id = $1`,
      [txn.id, mpesaReceiptNumber, balanceAfter],
    );
  }

  async handleCallback(body: any): Promise<void> {
    const parsed = parseTumaCallback(body);
    if (!parsed.merchantRequestId) return;
    const rows = await this.ds.query(`SELECT id FROM sms_wallet_transactions WHERE merchant_request_id = $1`, [parsed.merchantRequestId]);
    if (!rows[0]) return;
    if (parsed.success) await this.creditTopUp(rows[0], parsed.mpesaReceipt);
    else await this.ds.query(`UPDATE sms_wallet_transactions SET status = 'failed' WHERE id = $1`, [rows[0].id]);
  }

  async getTopUpStatus(tenantId: string, id: string) {
    const rows = await this.ds.query(`SELECT * FROM sms_wallet_transactions WHERE id = $1 AND tenant_id = $2 AND type = 'topup'`, [id, tenantId]);
    const txn = rows[0];
    if (!txn) throw new BadRequestException('Top-up not found.');
    if (txn.status !== 'pending' || !txn.merchant_request_id) return { status: txn.status, transactionId: txn.id };

    const result = await checkPaymentStatus(txn.merchant_request_id);
    if (result.ok && result.status && /success|completed/i.test(result.status)) {
      await this.creditTopUp(txn, result.mpesaReceipt);
      return { status: 'paid', transactionId: txn.id };
    }
    return { status: txn.status, transactionId: txn.id };
  }
}

@Controller('communication')
@UseGuards(JwtAuthGuard)
class CommunicationController {
  constructor(
    private readonly ds: DataSource,
    private readonly smsWallet: SmsWalletService,
  ) {}

  @Get('sms-wallet')
  getSmsWallet(@Request() req: any) { return this.smsWallet.getBalance(req.user.tenantId); }

  @Get('sms-wallet/transactions')
  getSmsWalletTransactions(@Request() req: any) { return this.smsWallet.getTransactions(req.user.tenantId); }

  @Post('sms-wallet/topup')
  topUpSmsWallet(@Request() req: any, @Body() dto: { phone: string; amount: number }) {
    return this.smsWallet.topUp(req.user.tenantId, dto.phone, dto.amount);
  }

  @Get('sms-wallet/topup/status/:id')
  getSmsWalletTopUpStatus(@Request() req: any, @Param('id') id: string) {
    return this.smsWallet.getTopUpStatus(req.user.tenantId, id);
  }

  // The real `announcements` table (migration 005) uses body/school_id/a stricter
  // priority CHECK ('low'|'normal'|'high'|'urgent') — there used to be a mismatched
  // TypeORM entity here (wrong column names, no school_id) that silently worked only
  // because the old stub never actually inserted anything. Raw SQL against the real
  // schema instead of an out-of-sync entity.
  @Get('announcements')
  async getAnnouncements(@Request() req: any) {
    try {
      // audience_filter doubles as a place to persist delivery stats (sms/email
      // sent-failed counts) since the table has no dedicated columns for that.
      return await this.ds.query(
        `SELECT id, title, body AS content, audience, priority, created_at AS "createdAt",
                published_at AS "sentAt", audience_filter AS "delivery"
           FROM announcements WHERE tenant_id::text = $1 AND deleted_at IS NULL
           ORDER BY created_at DESC`,
        [req.user.tenantId],
      );
    } catch (e: any) {
      // Was silently swallowed into an empty array before — indistinguishable from
      // "no announcements yet" and hid a real failure completely. Surface it instead.
      console.error('getAnnouncements failed:', e?.message);
      throw new BadRequestException(`Could not load announcement history: ${e?.message || 'unknown error'}`);
    }
  }

  // Looks up phone/email for the requested audience — staff (users table, filtered by
  // role) and/or parents (learners.guardian_phone / guardian_email, deduped by contact
  // since siblings share a guardian). 'learners' has no phone/email of its own in this
  // schema, so it's treated the same as 'parents'.
  private async resolveRecipients(tenantId: string, audience: string): Promise<{ phone: string | null; email: string | null }[]> {
    const staffRoles = ['class_teacher', 'subject_teacher', 'overall_class_teacher', 'hoi', 'dhois', 'school_admin', 'tenant_owner'];
    const adminRoles = ['hoi', 'dhois', 'school_admin', 'tenant_owner'];
    const out: { phone: string | null; email: string | null }[] = [];

    if (audience === 'teachers' || audience === 'all') {
      const rows = await this.ds.query(
        `SELECT phone, email FROM users WHERE tenant_id::text = $1 AND role = ANY($2) AND COALESCE(is_active, true) = true`,
        [tenantId, staffRoles],
      ).catch(() => []);
      out.push(...rows);
    }
    if (audience === 'admins') {
      const rows = await this.ds.query(
        `SELECT phone, email FROM users WHERE tenant_id::text = $1 AND role = ANY($2) AND COALESCE(is_active, true) = true`,
        [tenantId, adminRoles],
      ).catch(() => []);
      out.push(...rows);
    }
    if (audience === 'parents' || audience === 'learners' || audience === 'all') {
      const rows = await this.ds.query(
        `SELECT DISTINCT guardian_phone AS phone, guardian_email AS email FROM learners
          WHERE tenant_id::text = $1 AND is_active = true
            AND (guardian_phone IS NOT NULL OR guardian_email IS NOT NULL)`,
        [tenantId],
      ).catch(() => []);
      out.push(...rows);
    }
    return out;
  }

  // Sends via Africa's Talking (SMS) / Resend (email) — same shared platform-wide
  // senders the owner's broadcast uses (backend/src/common/messaging.ts), batched to
  // stay under each provider's rate limit.
  private async dispatch(tenantId: string, recipients: { phone: string | null; email: string | null }[], title: string, content: string, channel: string) {
    const wantsSms = channel === 'sms' || channel === 'all';
    const wantsEmail = channel === 'email' || channel === 'all';
    const result: any = {};

    if (wantsSms) {
      const allPhones = Array.from(new Set(recipients.map(r => r.phone).filter(Boolean))) as string[];
      const { toSend: phones, skipped } = await filterOptedOutNumbers(this.ds, allPhones.map(p => normalisePhone(p) || p));
      // Title is a record label / email subject, not part of the SMS text — folding
      // it into the SMS body wasted characters and could tip a message into an
      // extra billed segment for no reason.
      const body = content;
      const segments = smsSegmentCount(body);
      await this.smsWallet.assertAffordable(tenantId, phones.length * segments);
      let sent = 0, failed = skipped.length, detail: string | undefined = skipped.length
        ? `${skipped.length} number${skipped.length === 1 ? '' : 's'} skipped — telco-blocked (dial *456*9# to opt back in), not yet confirmed reactivated.`
        : undefined;
      const failedNumbers: string[] = [...skipped];
      for (let i = 0; i < phones.length; i += 100) {
        const r = await sendSms(phones.slice(i, i + 100), body);
        sent += r.sent; failed += r.failed; detail = detail || r.detail;
        failedNumbers.push(...r.failedNumbers);
        await recordBlacklistedNumbers(this.ds, r.blacklistedNumbers);
      }
      if (sent > 0) await this.smsWallet.debit(tenantId, sent * segments, `Announcement: ${title}`);
      // Kept so a retry can target only these numbers — resending to everyone
      // again would re-annoy recipients who already got it successfully.
      result.sms = { attempted: phones.length, sent, failed, segments, detail, failedNumbers };
    }
    if (wantsEmail) {
      const emails = Array.from(new Set(recipients.map(r => r.email).filter(Boolean))) as string[];
      const html = `<p>${content.replace(/\n/g, '<br/>')}</p>`;
      const outcomes: any[] = [];
      for (let i = 0; i < emails.length; i += 8) {
        const batch = emails.slice(i, i + 8);
        outcomes.push(...await Promise.allSettled(batch.map(e => sendEmail(e, title, html, content))));
        if (i + 8 < emails.length) await new Promise(res => setTimeout(res, 1100));
      }
      const sent = outcomes.filter(o => o.status === 'fulfilled' && (o.value as any).ok).length;
      const firstFailure = outcomes.find(o => o.status === 'fulfilled' && !(o.value as any).ok) as any;
      result.email = { attempted: emails.length, sent, failed: emails.length - sent, detail: firstFailure?.value?.detail };
    }
    return result;
  }

  // Pre-send warning: how many of this audience's phone numbers are known, from
  // past sends, to be blacklisted (opted out) recipients — so the admin can be
  // warned in-app before sending, since the numbers themselves can never be
  // warned by SMS (the telco blocks it outright).
  @Get('sms-blacklist-check')
  async checkSmsBlacklist(@Request() req: any, @Query('audience') audience: string) {
    const recipients = await this.resolveRecipients(req.user.tenantId, audience || 'all');
    const phones = Array.from(new Set(recipients.map(r => r.phone).filter(Boolean).map(p => normalisePhone(p as string)).filter(Boolean)));
    if (!phones.length) return { checked: 0, blacklisted: 0 };
    const rows = await this.ds.query(
      `SELECT COUNT(*)::int AS count FROM sms_blacklist WHERE phone_number = ANY($1)`, [phones],
    ).catch(() => [{ count: 0 }]);
    return { checked: phones.length, blacklisted: rows[0]?.count || 0 };
  }

  // Numbers this tenant has actually sent to that Africa's Talking rejected as
  // telco-blocked — so an admin can follow up (per AT support: have the guardian
  // dial *456*9# -> 5 Marketing messages -> Activate all promo messages) and mark
  // it confirmed once done, instead of it staying permanently skipped.
  @Get('sms-blacklist')
  async listSmsBlacklist(@Request() req: any) {
    const recipients = await this.resolveRecipients(req.user.tenantId, 'all');
    const phones = Array.from(new Set(recipients.map(r => r.phone).filter(Boolean).map(p => normalisePhone(p as string)).filter(Boolean)));
    if (!phones.length) return [];
    return this.ds.query(
      `SELECT phone_number AS "phoneNumber", status_code AS "statusCode", flagged_count AS "flaggedCount",
              first_flagged_at AS "firstFlaggedAt", last_flagged_at AS "lastFlaggedAt",
              opted_in_confirmed AS "optedInConfirmed", opted_in_confirmed_at AS "optedInConfirmedAt"
         FROM sms_blacklist WHERE phone_number = ANY($1) ORDER BY last_flagged_at DESC`,
      [phones],
    ).catch(() => []);
  }

  @Post('sms-blacklist/:phone/confirm-opt-in')
  async confirmOptIn(@Request() req: any, @Param('phone') phone: string) {
    const normalised = normalisePhone(phone);
    if (!normalised) return { error: 'Invalid phone number.' };
    await this.ds.query(
      `UPDATE sms_blacklist SET opted_in_confirmed = true, opted_in_confirmed_at = NOW(), opted_in_confirmed_by = $2 WHERE phone_number = $1`,
      [normalised, req.user.id],
    );
    return { ok: true };
  }

  @Delete('sms-blacklist/:phone/confirm-opt-in')
  async revokeOptIn(@Param('phone') phone: string) {
    const normalised = normalisePhone(phone);
    if (!normalised) return { error: 'Invalid phone number.' };
    await this.ds.query(
      `UPDATE sms_blacklist SET opted_in_confirmed = false, opted_in_confirmed_at = NULL, opted_in_confirmed_by = NULL WHERE phone_number = $1`,
      [normalised],
    );
    return { ok: true };
  }

  @Post('announcements')
  async createAnnouncement(@Request() req: any, @Body() dto: any) {
    const tenantId = req.user.tenantId;
    const schoolId = req.user.schoolId;
    // Constrained by the announcements table's CHECK constraints — anything else falls
    // back to a safe default rather than letting the insert fail on a bad value.
    const audience = ['all', 'admins', 'teachers', 'learners', 'parents'].includes(dto.audience) ? dto.audience : 'all';
    const priority = ['low', 'normal', 'high', 'urgent'].includes(dto.priority) ? dto.priority : 'normal';
    const channel = dto.channel || 'push'; // 'push' has no automated sender yet — logged only
    const recipients = channel === 'push' ? [] : await this.resolveRecipients(tenantId, audience);
    const sendResult = recipients.length ? await this.dispatch(tenantId, recipients, dto.title, dto.content, channel) : {};

    const rows = await this.ds.query(
      `INSERT INTO announcements (tenant_id, school_id, title, body, audience, priority, is_published, published_at, created_by, audience_filter)
       VALUES ($1,$2,$3,$4,$5,$6,true,NOW(),$7,$8)
       RETURNING id, title, body AS content, audience, priority, created_at AS "createdAt", published_at AS "sentAt", audience_filter AS "delivery"`,
      [tenantId, schoolId, dto.title, dto.content, audience, priority, req.user.id, JSON.stringify({ channel, ...sendResult })],
    );

    return { ...rows[0], ...sendResult, message: 'Announcement sent' };
  }

  // Removes it from the history list — the SMS/email already went out and can't
  // be unsent, this just clears the record. Soft-delete so it's recoverable if
  // ever needed, same pattern as exams.
  @Delete('announcements/:id')
  async deleteAnnouncement(@Request() req: any, @Param('id') id: string) {
    await this.ds.query(
      `UPDATE announcements SET deleted_at = NOW() WHERE id::text = $1 AND tenant_id::text = $2`,
      [id, req.user.tenantId],
    ).catch(() => null);
    return { deleted: true };
  }

  // Resends SMS only to the numbers that failed last time — never re-sends to
  // anyone who already received it, so a retry can't double/triple-annoy the
  // recipients that already went through.
  @Post('announcements/:id/retry-sms')
  async retryAnnouncementSms(@Request() req: any, @Param('id') id: string) {
    const tenantId = req.user.tenantId;
    const rows = await this.ds.query(
      `SELECT body AS content, audience_filter AS delivery FROM announcements WHERE id::text = $1 AND tenant_id::text = $2`,
      [id, tenantId],
    );
    if (!rows.length) return { error: 'Announcement not found.' };
    const delivery = rows[0].delivery || {};
    const failedNumbers: string[] = delivery.sms?.failedNumbers || [];
    if (!failedNumbers.length) return { error: 'Nothing to retry — no recorded failed SMS recipients.' };

    const segments = smsSegmentCount(rows[0].content);
    await this.smsWallet.assertAffordable(tenantId, failedNumbers.length * segments);
    const r = await sendSms(failedNumbers, rows[0].content);
    if (r.sent > 0) await this.smsWallet.debit(tenantId, r.sent * segments, 'Announcement SMS retry');
    await recordBlacklistedNumbers(this.ds, r.blacklistedNumbers);

    // Merge into the stored delivery record: successes move out of failedNumbers,
    // sent/failed counts accumulate, detail reflects this retry's outcome.
    const updated = {
      ...delivery,
      sms: {
        attempted: (delivery.sms?.attempted || 0),
        sent: (delivery.sms?.sent || 0) + r.sent,
        failed: (delivery.sms?.failed || 0) - r.sent,
        segments, detail: r.detail,
        failedNumbers: r.failedNumbers,
      },
    };
    await this.ds.query(`UPDATE announcements SET audience_filter = $2 WHERE id::text = $1`, [id, JSON.stringify(updated)]);

    return { message: `Retried ${failedNumbers.length} — ${r.sent} sent, ${r.failedNumbers.length} still failed.`, sms: updated.sms };
  }

  @Get('messages')
  getMessages(@Request() req: any) { return []; }

  @Post('messages')
  sendMessage(@Request() req: any, @Body() dto: any) { return { id: 'stub', ...dto }; }

  @Post('fee-reminders')
  async sendFeeReminders(@Request() req: any, @Body() dto: any) {
    const tenantId = req.user.tenantId;
    const term = dto.term || null;
    const academicYear = dto.academicYear || null;
    const channel = ['sms', 'email', 'all'].includes(dto.channel) ? dto.channel : 'sms';
    const wantsSms = channel === 'sms' || channel === 'all';
    const wantsEmail = channel === 'email' || channel === 'all';

    // Same billed-vs-paid computation the live Finance "Invoices" screen uses
    // (fee_items per grade + payment_allocations per learner) — reused here rather
    // than duplicated logic drifting out of sync.
    const learners = await this.ds.query(
      `SELECT l.id, l.first_name AS "firstName", l.grade_level AS "gradeLevel",
              l.guardian_phone AS "guardianPhone", l.guardian_email AS "guardianEmail"
         FROM learners l WHERE l.tenant_id::text = $1 AND l.is_active = true`,
      [tenantId],
    ).catch(() => []);
    const billedRows = await this.ds.query(
      `SELECT grade_level AS g, COALESCE(SUM(amount),0) AS billed FROM fee_items
        WHERE tenant_id = $1
          AND ($2::text IS NULL OR term = $2 OR term IS NULL)
          AND ($3::text IS NULL OR academic_year = $3 OR academic_year IS NULL)
        GROUP BY grade_level`,
      [tenantId, term, academicYear],
    ).catch(() => []);
    const billedByGrade: Record<string, number> = {};
    let schoolWide = 0;
    for (const r of billedRows as any[]) { if (r.g === null) schoolWide += Number(r.billed); else billedByGrade[r.g] = Number(r.billed); }
    const paidRows = await this.ds.query(
      `SELECT learner_id, COALESCE(SUM(amount),0) AS paid FROM payment_allocations
        WHERE tenant_id = $1
          AND ($2::text IS NULL OR term = $2)
          AND ($3::text IS NULL OR academic_year = $3)
        GROUP BY learner_id`,
      [tenantId, term, academicYear],
    ).catch(() => []);
    const paidByLearner: Record<string, number> = {};
    for (const r of paidRows as any[]) paidByLearner[r.learner_id] = Number(r.paid || 0);

    const debtors = (learners as any[])
      .map(l => {
        const totalAmount = (billedByGrade[l.gradeLevel] || 0) + schoolWide;
        const amountPaid = paidByLearner[l.id] || 0;
        return { ...l, balance: totalAmount - amountPaid };
      })
      .filter(l => l.balance > 0 && (l.guardianPhone || l.guardianEmail));

    // Message length (and therefore segment count) varies per debtor, since the
    // balance amount is interpolated — sum each one's actual segments for an exact
    // affordability check rather than assuming every message is a single unit.
    const feeText = (d: any) => `Dear parent, ${d.firstName} has an outstanding school fee balance of KES ${d.balance.toLocaleString('en-KE')}. Please clear it at your earliest convenience. — ZARODA`;
    if (wantsSms) {
      const estimatedUnits = debtors.filter(d => d.guardianPhone).reduce((sum, d) => sum + smsSegmentCount(feeText(d)), 0);
      await this.smsWallet.assertAffordable(tenantId, estimatedUnits);
    }

    let smsSent = 0, smsFailed = 0, smsDetail: string | undefined, smsUnits = 0;
    let emailSent = 0, emailFailed = 0, emailDetail: string | undefined;
    for (const d of debtors) {
      const text = feeText(d);
      if (wantsSms && d.guardianPhone) {
        const r = await sendSms([d.guardianPhone], text);
        smsSent += r.sent; smsFailed += r.failed; smsDetail = smsDetail || r.detail;
        smsUnits += r.sent * r.segments;
        await recordBlacklistedNumbers(this.ds, r.blacklistedNumbers);
      }
      if (wantsEmail && d.guardianEmail) {
        const r = await sendEmail(d.guardianEmail, 'Outstanding Fee Balance', `<p>${text}</p>`, text);
        if (r.ok) emailSent++; else { emailFailed++; emailDetail = emailDetail || r.detail; }
      }
    }
    if (smsUnits > 0) await this.smsWallet.debit(tenantId, smsUnits, 'Fee reminder SMS');

    const sent = smsSent + emailSent;
    return {
      message: `Fee reminders sent to ${sent} of ${debtors.length} parents with outstanding balances.`,
      count: sent, attempted: debtors.length,
      sms: wantsSms ? { sent: smsSent, failed: smsFailed, detail: smsDetail } : undefined,
      email: wantsEmail ? { sent: emailSent, failed: emailFailed, detail: emailDetail } : undefined,
    };
  }

  // ── IN-APP NOTIFICATION BELL ───────────────────────────────
  // The bell icon in both dashboards used to be decorative — no data behind it.
  // This reads the same `announcements` table admins already publish to (and
  // that an owner cross-tenant broadcast now also writes into, see
  // AdminController.sendBroadcast below), filtered to whatever this viewer's
  // role is meant to see, with real read/unread state via `announcement_reads`.
  private roleToAudience(role: string): string {
    if (['class_teacher', 'subject_teacher', 'overall_class_teacher'].includes(role)) return 'teachers';
    if (['tenant_owner', 'school_admin', 'hoi', 'dhois'].includes(role)) return 'admins';
    if (role === 'parent') return 'parents';
    if (role === 'learner') return 'learners';
    return 'all';
  }

  @Get('notifications')
  async getNotifications(@Request() req: any) {
    const audience = this.roleToAudience(req.user.role);
    const rows = await this.ds.query(
      `SELECT a.id, a.title, a.body, a.category, a.priority, a.created_at AS "createdAt",
              (ar.id IS NOT NULL) AS "isRead"
         FROM announcements a
         LEFT JOIN announcement_reads ar ON ar.announcement_id = a.id AND ar.user_id = $2
        WHERE a.tenant_id::text = $1 AND a.is_published = true AND a.deleted_at IS NULL
          AND (a.expires_at IS NULL OR a.expires_at > NOW())
          AND (a.audience = 'all' OR a.audience = $3)
        ORDER BY a.created_at DESC LIMIT 30`,
      [req.user.tenantId, req.user.id, audience],
    ).catch(() => []);
    return { unreadCount: rows.filter((r: any) => !r.isRead).length, notifications: rows };
  }

  @Post('notifications/:id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  async markNotificationRead(@Request() req: any, @Param('id') id: string) {
    await this.ds.query(
      `INSERT INTO announcement_reads (tenant_id, announcement_id, user_id)
       VALUES ($1, $2, $3) ON CONFLICT (announcement_id, user_id) DO NOTHING`,
      [req.user.tenantId, id, req.user.id],
    ).catch(() => null);
  }
}

// Tuma calls this — no auth, so it must live outside the JwtAuthGuard-protected
// CommunicationController above (same pattern as ProfessionalRecordsPaymentsController).
@Controller('communication')
class SmsWalletCallbackController {
  constructor(private readonly smsWallet: SmsWalletService) {}

  @Post('sms-wallet/mpesa/callback')
  async handleCallback(@Body() body: any) {
    await this.smsWallet.handleCallback(body);
    return { ResultCode: 0, ResultDesc: 'Accepted' };
  }
}

// Africa's Talking calls this — no auth. AT's "Sent" response only means the
// message was handed to the telco; this Delivery Report callback (registered on
// the AT dashboard under SMS -> Delivery Reports) is how the real outcome (did
// the phone actually get it?) arrives, asynchronously, sometime after the send.
// AT posts form-urlencoded fields: id (the messageId from the send response),
// status (Success/Sent/Failed/Rejected/Buffered/etc.), phoneNumber, networkCode,
// failureReason, retryCount — parsed permissively since, like Tuma's callback,
// there's no fully reliable public field-name reference to pin to.
@Controller()
class SmsDeliveryReportController {
  constructor(private readonly ds: DataSource) {}

  @Post('sms/dlr')
  async handleDeliveryReport(@Body() body: any) {
    // Temporary — confirms in Render's logs whether Africa's Talking is calling this
    // at all, since the owner-facing Delivery Reports panel is still showing nothing.
    console.log('[SMS DLR] received:', JSON.stringify(body));
    const messageId = body?.id ?? body?.messageId ?? null;
    const phoneNumber = body?.phoneNumber ?? body?.number ?? null;
    const status = body?.status ?? null;
    const networkCode = body?.networkCode ?? null;
    const failureReason = body?.failureReason ?? null;
    const retryCount = body?.retryCount != null ? Number(body.retryCount) : null;
    await this.ds.query(
      `INSERT INTO sms_delivery_reports (message_id, phone_number, status, network_code, failure_reason, retry_count, raw_payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [messageId, phoneNumber, status, networkCode, failureReason, retryCount, JSON.stringify(body || {})],
    ).catch(() => null);
    return { ok: true };
  }
}

@Module({
  imports: [],
  controllers: [CommunicationController, SmsWalletCallbackController, SmsDeliveryReportController],
  providers: [SmsWalletService],
})
export class CommunicationModule {}


// ═══════════════════════════════════════════════════════════
// PROFESSIONAL RECORDS MODULE — replaced by the real module at
// src/modules/professional-records/professional-records.module.ts
// ═══════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════
// LIBRARY MODULE  (No fines — ever)
// ═══════════════════════════════════════════════════════════
@Entity('library_books')
class LibraryBook {
  @PrimaryGeneratedColumn('uuid') id:               string;
  @Column({ name: 'tenant_id' })  tenantId:         string;
  @Column()                       title:            string;
  @Column({ nullable: true })     author:           string;
  @Column({ name: 'accession_number', nullable: true }) accessionNumber: string;
  @Column({ name: 'barcode', nullable: true })      barcode: string;
  @Column({ name: 'is_available', default: true })  isAvailable: boolean;
  @CreateDateColumn({ name: 'created_at' })         createdAt: Date;
}

@Entity('library_loans')
class LibraryLoan {
  @PrimaryGeneratedColumn('uuid') id:           string;
  @Column({ name: 'tenant_id' })  tenantId:     string;
  @Column({ name: 'book_id' })    bookId:       string;
  @Column({ name: 'borrower_name', nullable: true }) borrowerName: string;
  @Column({ name: 'borrower_id', nullable: true })   borrowerId:   string;
  @Column({ name: 'borrower_type', default: 'learner' }) borrowerType: string;
  @Column({ name: 'issued_date', nullable: true })  issuedDate: Date;
  @Column({ name: 'due_date', nullable: true })     dueDate:    Date;
  @Column({ name: 'returned_date', nullable: true })returnedDate: Date;
  @Column({ default: 'active' })  status:       string;
  // NO fine_amount column — library is completely free
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}

@Controller('library')
@UseGuards(JwtAuthGuard)
class LibraryController {
  constructor(private readonly ds: DataSource) {}

  private async ensureTables() {
    await this.ds.query(`CREATE TABLE IF NOT EXISTS library_books (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid, created_at timestamptz DEFAULT NOW())`).catch(() => null);
    for (const [n, t] of [['school_id','uuid'],['title','text'],['author','text'],['category','text'],['publisher','text'],['isbn','text'],['code','text'],['copy_no','integer'],['total_copies','integer'],['condition','text'],['status',"text DEFAULT 'available'"],['received_by','uuid'],['received_on','date'],['notes','text'],['updated_at','timestamptz DEFAULT NOW()']] as [string,string][]) {
      await this.ds.query(`ALTER TABLE library_books ADD COLUMN IF NOT EXISTS ${n} ${t}`).catch(() => null);
    }
    await this.ds.query(`CREATE TABLE IF NOT EXISTS library_loans (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid, created_at timestamptz DEFAULT NOW())`).catch(() => null);
    for (const [n, t] of [['book_id','uuid'],['book_code','text'],['book_title','text'],['borrower_type','text'],['borrower_id','uuid'],['borrower_name','text'],['borrower_class','text'],['issued_by','uuid'],['issued_by_name','text'],['issued_on','date'],['due_on','date'],['returned_on','date'],['return_condition','text'],['status',"text DEFAULT 'issued'"],['notes','text'],['updated_at','timestamptz DEFAULT NOW()']] as [string,string][]) {
      await this.ds.query(`ALTER TABLE library_loans ADD COLUMN IF NOT EXISTS ${n} ${t}`).catch(() => null);
    }
    for (const tbl of ['library_books', 'library_loans']) {
      const nn = await this.ds.query(`SELECT column_name FROM information_schema.columns WHERE table_name = '${tbl}' AND is_nullable = 'NO' AND column_default IS NULL`).catch(() => []);
      for (const r of (nn as any[])) { if (!['id','tenant_id'].includes(r.column_name)) await this.ds.query(`ALTER TABLE ${tbl} ALTER COLUMN ${r.column_name} DROP NOT NULL`).catch(() => null); }
      // Drop legacy CHECK and FOREIGN KEY constraints. The old library_loans_status_check
      // restricted statuses; the old borrower_id FK forced borrowers to reference one table,
      // but here a borrower may be a learner OR a teacher, so the rigid FK must go.
      const checks = await this.ds.query(
        `SELECT con.conname FROM pg_constraint con
           JOIN pg_class rel ON rel.oid = con.conrelid
          WHERE rel.relname = '${tbl}' AND con.contype IN ('c','f')`,
      ).catch(() => []);
      for (const c of (checks as any[])) {
        await this.ds.query(`ALTER TABLE ${tbl} DROP CONSTRAINT IF EXISTS "${c.conname}"`).catch(() => null);
      }
    }
  }

  private isAdmin(role: string) { return ['hoi','dhois','tenant_owner','school_admin'].includes(role); }

  // Library config lives in schools.settings.library (JSONB) — no schema change needed.
  private async getLibrarySettings(tenantId: string): Promise<any> {
    const rows = await this.ds.query(
      `SELECT settings->'library' AS lib FROM schools WHERE tenant_id = $1 LIMIT 1`, [tenantId],
    ).catch(() => []);
    return rows[0]?.lib || {};
  }

  @Get('settings')
  async getSettings(@Request() req: any) {
    const s = await this.getLibrarySettings(req.user.tenantId);
    return {
      codePrefix: s.codePrefix || 'LIB',
      codeIncludeCategory: s.codeIncludeCategory !== false,
      codeStart: s.codeStart || 1,
      classTeachersCanIssue: s.classTeachersCanIssue !== false,   // default allow
      subjectTeachersCanIssue: s.subjectTeachersCanIssue !== false,
    };
  }

  @Patch('settings')
  async saveSettings(@Request() req: any, @Body() dto: any) {
    if (!this.isAdmin(req.user.role)) throw new BadRequestException('Only an administrator can change library settings.');
    const tenantId = req.user.tenantId;
    const current = await this.getLibrarySettings(tenantId);
    const next = {
      ...current,
      ...(dto.codePrefix !== undefined ? { codePrefix: String(dto.codePrefix).toUpperCase().replace(/[^A-Z0-9-]/g,'').slice(0,8) } : {}),
      ...(dto.codeIncludeCategory !== undefined ? { codeIncludeCategory: !!dto.codeIncludeCategory } : {}),
      ...(dto.codeStart !== undefined ? { codeStart: Math.max(1, Number(dto.codeStart) || 1) } : {}),
      ...(dto.classTeachersCanIssue !== undefined ? { classTeachersCanIssue: !!dto.classTeachersCanIssue } : {}),
      ...(dto.subjectTeachersCanIssue !== undefined ? { subjectTeachersCanIssue: !!dto.subjectTeachersCanIssue } : {}),
    };
    await this.ds.query(
      `UPDATE schools SET settings = jsonb_set(COALESCE(settings,'{}'::jsonb), '{library}', $2::jsonb, true) WHERE tenant_id = $1`,
      [tenantId, JSON.stringify(next)],
    ).catch((e: any) => { throw new BadRequestException(e.message); });
    return next;
  }

  // Whether THIS user may issue/receive, honoring the school's configured policy.
  private async canIssueAsync(user: any): Promise<boolean> {
    if (this.isAdmin(user.role) || user.role === 'librarian') return true;
    const s = await this.getLibrarySettings(user.tenantId);
    const role = String(user.role);
    if (role === 'class_teacher' || role === 'overall_class_teacher') return s.classTeachersCanIssue !== false;
    if (role === 'subject_teacher') return s.subjectTeachersCanIssue !== false;
    return false;
  }

  // Receive a batch of a new book — creates N coded copies. Admin only.
  @Post('books')
  async receiveBooks(@Request() req: any, @Body() dto: any) {
    if (!this.isAdmin(req.user.role) && req.user.role !== 'librarian') {
      throw new BadRequestException('Only an administrator or librarian can receive new books.');
    }
    if (!dto?.title || !String(dto.title).trim()) throw new BadRequestException('Book title is required.');
    const qty = Math.max(1, Math.min(500, Number(dto.copies) || 1));
    await this.ensureTables();
    const tenantId = req.user.tenantId;

    // School's own coding scheme (set in settings), else a sensible default.
    const settings = await this.getLibrarySettings(tenantId);
    const prefix = (settings.codePrefix || 'LIB').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 8) || 'LIB';
    const useCategory = settings.codeIncludeCategory !== false;  // default true
    const startAt = Math.max(1, Number(settings.codeStart) || 1);
    const cat = String(dto.category || 'GEN').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'GEN';

    // Sequence: continue from the highest existing number for this prefix(+category), but never
    // below the school's chosen start. Code: <PREFIX>[-<CAT>]-<NNNNN>, with /copyNo per copy.
    const codeLike = useCategory ? `${prefix}-${cat}-%` : `${prefix}-%`;
    const seqRow = await this.ds.query(
      `SELECT COALESCE(MAX( (regexp_replace(regexp_replace(code,'/[0-9]+$',''),'^.*-',''))::int ),0) AS maxn
         FROM library_books WHERE tenant_id = $1 AND code LIKE $2
           AND regexp_replace(regexp_replace(code,'/[0-9]+$',''),'^.*-','') ~ '^[0-9]+$'`,
      [tenantId, codeLike],
    ).catch(() => [{ maxn: 0 }]);
    const nextSeq = Math.max(startAt, (Number(seqRow[0]?.maxn) || 0) + 1);
    const baseCode = useCategory
      ? `${prefix}-${cat}-${String(nextSeq).padStart(5, '0')}`
      : `${prefix}-${String(nextSeq).padStart(5, '0')}`;

    const made: any[] = [];
    for (let c = 1; c <= qty; c++) {
      const code = `${baseCode}/${c}`;
      const rows = await this.ds.query(
        `INSERT INTO library_books
           (tenant_id, school_id, title, author, category, publisher, isbn, code, copy_no, total_copies, condition, status, received_by, received_on, notes, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'available',$12,$13,$14,NOW(),NOW())
         RETURNING id, code, title, copy_no AS "copyNo"`,
        [tenantId, req.user.schoolId || null, String(dto.title).trim(), dto.author || null,
         dto.category || 'General', dto.publisher || null, dto.isbn || null, code, c, qty,
         dto.condition || 'New', req.user.id, dto.receivedOn || new Date().toISOString().slice(0, 10), dto.notes || null],
      ).catch((e: any) => { throw new BadRequestException(`Could not receive books: ${e.message}`); });
      made.push(rows[0]);
    }
    return { received: made.length, baseCode, copies: made };
  }

  // Bulk issue: give a book (by title) to several learners at once — for schools with class
  // sets or few titles. Creates a coded copy per learner and a loan for each.
  @Post('loans/bulk')
  async bulkIssue(@Request() req: any, @Body() dto: any) {
    if (!(await this.canIssueAsync(req.user))) throw new BadRequestException('You are not permitted to issue books. Ask an administrator.');
    await this.ensureTables();
    const tenantId = req.user.tenantId;
    const learners = Array.isArray(dto.learners) ? dto.learners.filter((l: any) => l && (l.id || l.name)) : [];
    if (!learners.length) throw new BadRequestException('Select at least one learner.');

    // Determine the title/details. Either an existing catalogued title (by code/baseCode) or a
    // new title entered now.
    let title = dto.title, author = dto.author || null, category = dto.category || 'General', condition = dto.condition || 'Good';
    if ((!title || !String(title).trim()) && (dto.code || dto.baseCode)) {
      const ref = await this.ds.query(
        `SELECT title, author, category FROM library_books WHERE tenant_id = $1
           AND (code = $2 OR regexp_replace(code,'/[0-9]+$','') = $2) LIMIT 1`,
        [tenantId, dto.code || dto.baseCode],
      ).catch(() => []);
      if (ref.length) { title = ref[0].title; author = ref[0].author; category = ref[0].category; }
    }
    if (!title || !String(title).trim()) throw new BadRequestException('Enter the book title (or pick an existing book) to bulk-issue.');

    // Code scheme.
    const settings = await this.getLibrarySettings(tenantId);
    const prefix = (settings.codePrefix || 'LIB').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 8) || 'LIB';
    const useCategory = settings.codeIncludeCategory !== false;
    const startAt = Math.max(1, Number(settings.codeStart) || 1);
    const cat = String(category || 'GEN').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'GEN';
    const codeLike = useCategory ? `${prefix}-${cat}-%` : `${prefix}-%`;
    const seqRow = await this.ds.query(
      `SELECT COALESCE(MAX( (regexp_replace(regexp_replace(code,'/[0-9]+$',''),'^.*-',''))::int ),0) AS maxn
         FROM library_books WHERE tenant_id = $1 AND code LIKE $2
           AND regexp_replace(regexp_replace(code,'/[0-9]+$',''),'^.*-','') ~ '^[0-9]+$'`,
      [tenantId, codeLike],
    ).catch(() => [{ maxn: 0 }]);
    let seq = Math.max(startAt, (Number(seqRow[0]?.maxn) || 0) + 1);
    const base = useCategory ? `${prefix}-${cat}-${String(seq).padStart(5, '0')}` : `${prefix}-${String(seq).padStart(5, '0')}`;

    const days = Math.max(1, Number(dto.loanDays) || 14);
    const due = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);

    let issued = 0; const failures: string[] = [];
    let copyNo = 0;
    for (const ln of learners) {
      copyNo += 1;
      const code = `${base}/${copyNo}`;
      try {
        const created = await this.ds.query(
          `INSERT INTO library_books
             (tenant_id, school_id, title, author, category, code, copy_no, total_copies, condition, status, received_by, received_on, notes, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'available',$10,$11,$12,NOW(),NOW())
           RETURNING id, code, title`,
          [tenantId, req.user.schoolId || null, String(title).trim(), author, category, code, copyNo, learners.length, condition, req.user.id, today, 'Bulk-issued class set'],
        );
        const b = created[0];
        await this.ds.query(
          `INSERT INTO library_loans
             (tenant_id, book_id, book_code, book_title, borrower_type, borrower_id, borrower_name, borrower_class, issued_by, issued_by_name, issued_on, due_on, status, created_at, updated_at)
           VALUES ($1,$2,$3,$4,'learner',$5,$6,$7,$8,$9,$10,$11,'issued',NOW(),NOW())`,
          [tenantId, b.id, b.code, b.title, ln.id || null, ln.name || null, ln.class || ln.stream || null, req.user.id, req.user.email || null, today, due],
        );
        await this.ds.query(`UPDATE library_books SET status = 'issued', updated_at = NOW() WHERE id = $1`, [b.id]).catch(() => null);
        issued += 1;
      } catch (e: any) {
        failures.push(ln.name || ln.id);
      }
    }
    return { issued, total: learners.length, baseCode: base, title, failures };
  }

  @Get('my-child/:learnerId')
  async getChildLoans(@Request() req: any, @Param('learnerId') learnerId: string) {
    await this.ensureTables();
    const tenantId = req.user.tenantId;
    const owns = await this.ds.query(
      `SELECT id, (first_name || ' ' || COALESCE(last_name,'')) AS name FROM learners
        WHERE id::text = $1 AND tenant_id::text = $2 AND LOWER(guardian_email) = LOWER($3) LIMIT 1`,
      [learnerId, tenantId, req.user.email || ''],
    ).catch(() => []);
    if (!owns.length) throw new BadRequestException('This learner is not linked to your account.');

    const loans = await this.ds.query(
      `SELECT book_title AS "bookTitle", book_code AS "bookCode", issued_on AS "issuedOn",
              due_on AS "dueOn", status, returned_on AS "returnedOn", return_condition AS "returnCondition",
              (status <> 'returned' AND due_on < CURRENT_DATE) AS overdue
         FROM library_loans
        WHERE tenant_id = $1 AND borrower_type = 'learner' AND borrower_id::text = $2
        ORDER BY issued_on DESC`,
      [tenantId, learnerId],
    ).catch(() => []);
    const out = (loans as any[]);
    return {
      learnerName: String(owns[0].name).trim(),
      current: out.filter(l => l.status !== 'returned'),
      history: out.filter(l => l.status === 'returned'),
      currentCount: out.filter(l => l.status !== 'returned').length,
    };
  }

  // Delete a book copy (admin) — by id or exact code. Also clears any loan rows for it.
  // Use to remove stray copies, e.g. ones created during a failed issue attempt.
  @Delete('books/:idOrCode')
  async deleteBook(@Request() req: any, @Param('idOrCode') idOrCode: string) {
    if (!this.isAdmin(req.user.role)) throw new BadRequestException('Only an administrator can delete books.');
    await this.ensureTables();
    const tenantId = req.user.tenantId;
    const rows = await this.ds.query(
      `SELECT id FROM library_books WHERE tenant_id = $1
         AND (id::text = $2 OR code = $2 OR regexp_replace(code,'/[0-9]+$','') = $2)`,
      [tenantId, idOrCode],
    ).catch(() => []);
    const ids = rows.map((r: any) => r.id);
    if (!ids.length) throw new BadRequestException('No book found with that id/code.');
    for (const id of ids) {
      await this.ds.query(`DELETE FROM library_loans WHERE tenant_id = $1 AND book_id = $2`, [tenantId, id]).catch(() => null);
      await this.ds.query(`DELETE FROM library_books WHERE tenant_id = $1 AND id = $2`, [tenantId, id]).catch(() => null);
    }
    return { deleted: ids.length };
  }

  // enrolment so the librarian selects rather than types.
  @Get('borrowers')
  async getBorrowers(@Request() req: any, @Query() q: any) {
    const tenantId = req.user.tenantId;
    if (q.type === 'teacher') {
      const t = await this.ds.query(
        `SELECT id, (first_name || ' ' || COALESCE(last_name,'')) AS name, role
           FROM users WHERE tenant_id::text = $1
             AND role IN ('class_teacher','subject_teacher','overall_class_teacher','hoi','dhois')
          ORDER BY first_name`,
        [tenantId],
      ).catch(() => []);
      return t.map((r: any) => ({ id: r.id, name: String(r.name).trim(), sub: (r.role || '').replace('_', ' ') }));
    }
    // learners — optionally filtered by stream
    const params: any[] = [tenantId];
    let where = `l.tenant_id::text = $1 AND l.is_active = true`;
    if (q.streamId) { params.push(q.streamId); where += ` AND l.stream_id::text = $${params.length}`; }
    const learners = await this.ds.query(
      `SELECT l.id, (l.first_name || ' ' || COALESCE(l.last_name,'')) AS name,
              l.admission_number AS adm, s.name AS stream
         FROM learners l LEFT JOIN streams s ON s.id::text = l.stream_id::text
        WHERE ${where} ORDER BY l.first_name LIMIT 500`,
      params,
    ).catch(() => []);
    return learners.map((r: any) => ({ id: r.id, name: String(r.name).trim(), sub: `${r.stream || ''}${r.adm ? ' · ' + r.adm : ''}`, stream: r.stream, adm: r.adm }));
  }

  async getBooks(@Request() req: any, @Query() q: any) {
    await this.ensureTables();
    const params: any[] = [req.user.tenantId];
    let where = `tenant_id = $1`;
    if (q.search) { params.push(`%${q.search}%`); where += ` AND (title ILIKE $${params.length} OR author ILIKE $${params.length} OR code ILIKE $${params.length})`; }
    const rows = await this.ds.query(
      `SELECT title, author, category, code,
              COUNT(*)::int AS copies,
              COUNT(*) FILTER (WHERE status = 'available')::int AS available,
              COUNT(*) FILTER (WHERE status = 'issued')::int AS issued,
              COUNT(*) FILTER (WHERE condition ILIKE 'damaged' OR condition ILIKE 'poor')::int AS damaged
         FROM library_books WHERE ${where}
        GROUP BY regexp_replace(code, '/[0-9]+$', ''), title, author, category, code
        ORDER BY title`,
      params,
    ).catch(() => []);
    // Collapse by base code (title-level).
    const byTitle: Record<string, any> = {};
    for (const r of rows) {
      const base = String(r.code).replace(/\/[0-9]+$/, '');
      if (!byTitle[base]) byTitle[base] = { baseCode: base, title: r.title, author: r.author, category: r.category, copies: 0, available: 0, issued: 0, damaged: 0 };
      byTitle[base].copies += r.copies; byTitle[base].available += r.available; byTitle[base].issued += r.issued; byTitle[base].damaged += r.damaged;
    }
    return Object.values(byTitle);
  }

  // Individual copies for a title (to issue/inspect a specific copy).
  @Get('books/copies')
  async getCopies(@Request() req: any, @Query() q: any) {
    await this.ensureTables();
    return this.ds.query(
      `SELECT id, code, title, copy_no AS "copyNo", condition, status FROM library_books
        WHERE tenant_id = $1 AND code LIKE $2 ORDER BY copy_no`,
      [req.user.tenantId, `${q.baseCode}/%`],
    ).catch(() => []);
  }

  // Look up a single copy by its exact code (for quick issue).
  @Get('books/lookup')
  async lookupBook(@Request() req: any, @Query('q') code: string) {
    await this.ensureTables();
    const rows = await this.ds.query(
      `SELECT id, code, title, author, condition, status FROM library_books
        WHERE tenant_id = $1 AND code = $2 LIMIT 1`,
      [req.user.tenantId, (code || '').trim()],
    ).catch(() => []);
    if (!rows.length) return { found: false };
    return { found: true, ...rows[0] };
  }

  // Update a copy's condition / mark lost / withdraw.
  @Patch('books/:id')
  async updateCopy(@Request() req: any, @Param('id') id: string, @Body() dto: any) {
    if (!this.isAdmin(req.user.role) && req.user.role !== 'librarian') throw new BadRequestException('Only an administrator can update stock.');
    await this.ensureTables();
    const fields: string[] = []; const vals: any[] = []; let i = 1;
    if (dto.condition !== undefined) { fields.push(`condition = $${i++}`); vals.push(dto.condition); }
    if (dto.status !== undefined) { fields.push(`status = $${i++}`); vals.push(dto.status); }
    if (dto.notes !== undefined) { fields.push(`notes = $${i++}`); vals.push(dto.notes); }
    if (!fields.length) return { updated: false };
    fields.push('updated_at = NOW()'); vals.push(id, req.user.tenantId);
    const rows = await this.ds.query(`UPDATE library_books SET ${fields.join(', ')} WHERE id::text = $${i++} AND tenant_id = $${i} RETURNING id, condition, status`, vals).catch((e: any) => { throw new BadRequestException(e.message); });
    if (!rows.length) throw new BadRequestException('Copy not found.');
    return rows[0];
  }

  // Issue a copy to a learner or teacher.
  @Post('loans')
  async issueBook(@Request() req: any, @Body() dto: any) {
    if (!(await this.canIssueAsync(req.user))) throw new BadRequestException('You are not permitted to issue books. Ask an administrator.');
    await this.ensureTables();
    const tenantId = req.user.tenantId;

    let book: any = null;

    // Path A: an existing catalogued copy (by id or code).
    if (dto?.bookId || dto?.code) {
      const bookRows = await this.ds.query(
        `SELECT id, code, title, status FROM library_books WHERE tenant_id = $1 AND (${dto.bookId ? 'id::text = $2' : 'code = $2'}) LIMIT 1`,
        [tenantId, dto.bookId || dto.code],
      ).catch(() => []);
      if (bookRows.length) {
        book = bookRows[0];
        if (book.status === 'issued') throw new BadRequestException('That copy is already issued.');
      }
    }

    // Path B: book isn't catalogued yet — capture its details now and add it to the library,
    // so schools with existing stock can issue without pre-cataloguing everything first.
    if (!book) {
      if (!dto?.title || !String(dto.title).trim()) {
        throw new BadRequestException('Select an existing book, or enter the new book’s title to add and issue it.');
      }
      // Generate a code using the school's scheme (same as receiving).
      const settings = await this.getLibrarySettings(tenantId);
      const prefix = (settings.codePrefix || 'LIB').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 8) || 'LIB';
      const useCategory = settings.codeIncludeCategory !== false;
      const startAt = Math.max(1, Number(settings.codeStart) || 1);
      const cat = String(dto.category || 'GEN').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'GEN';
      const codeLike = useCategory ? `${prefix}-${cat}-%` : `${prefix}-%`;
      const seqRow = await this.ds.query(
        `SELECT COALESCE(MAX( (regexp_replace(regexp_replace(code,'/[0-9]+$',''),'^.*-',''))::int ),0) AS maxn
           FROM library_books WHERE tenant_id = $1 AND code LIKE $2
             AND regexp_replace(regexp_replace(code,'/[0-9]+$',''),'^.*-','') ~ '^[0-9]+$'`,
        [tenantId, codeLike],
      ).catch(() => [{ maxn: 0 }]);
      const nextSeq = Math.max(startAt, (Number(seqRow[0]?.maxn) || 0) + 1);
      const code = (useCategory ? `${prefix}-${cat}-${String(nextSeq).padStart(5, '0')}` : `${prefix}-${String(nextSeq).padStart(5, '0')}`) + '/1';

      const created = await this.ds.query(
        `INSERT INTO library_books
           (tenant_id, school_id, title, author, category, publisher, isbn, code, copy_no, total_copies, condition, status, received_by, received_on, notes, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1,1,$9,'available',$10,$11,$12,NOW(),NOW())
         RETURNING id, code, title, status`,
        [tenantId, req.user.schoolId || null, String(dto.title).trim(), dto.author || null,
         dto.category || 'General', dto.publisher || null, dto.isbn || null, code,
         dto.condition || 'Good', req.user.id, new Date().toISOString().slice(0, 10),
         'Added during issue (existing school stock)'],
      ).catch((e: any) => { throw new BadRequestException(`Could not add the book: ${e.message}`); });
      book = created[0];
    }

    const days = Math.max(1, Number(dto.loanDays) || 14);
    const due = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
    const loan = await this.ds.query(
      `INSERT INTO library_loans
         (tenant_id, book_id, book_code, book_title, borrower_type, borrower_id, borrower_name, borrower_class, issued_by, issued_by_name, issued_on, due_on, status, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'issued',NOW(),NOW())
       RETURNING id, book_code AS "bookCode", book_title AS "bookTitle", borrower_name AS "borrowerName", due_on AS "dueOn"`,
      [tenantId, book.id, book.code, book.title, dto.borrowerType || 'learner', dto.borrowerId || null,
       dto.borrowerName || null, dto.borrowerClass || null, req.user.id, req.user.email || null,
       dto.issuedOn || new Date().toISOString().slice(0, 10), due],
    ).catch((e: any) => { throw new BadRequestException(`Could not issue: ${e.message}`); });
    await this.ds.query(`UPDATE library_books SET status = 'issued', updated_at = NOW() WHERE id = $1`, [book.id]).catch(() => null);
    return { ...loan[0], newlyCatalogued: !dto.bookId && !dto.code, bookCode: book.code };
  }

  @Get('loans')
  async getLoans(@Request() req: any, @Query() q: any) {
    await this.ensureTables();
    const params: any[] = [req.user.tenantId];
    let where = `tenant_id = $1`;
    if (q.status === 'overdue') where += ` AND status = 'issued' AND due_on < CURRENT_DATE`;
    else if (q.status === 'active' || q.status === 'issued') where += ` AND status = 'issued'`;
    else if (q.status === 'returned') where += ` AND status = 'returned'`;
    return this.ds.query(
      `SELECT id, book_code AS "bookCode", book_title AS "bookTitle", borrower_type AS "borrowerType",
              borrower_name AS "borrowerName", borrower_class AS "borrowerClass",
              issued_by_name AS "issuedByName", issued_on AS "issuedOn", due_on AS "dueOn",
              returned_on AS "returnedOn", return_condition AS "returnCondition", status,
              (status = 'issued' AND due_on < CURRENT_DATE) AS overdue
         FROM library_loans WHERE ${where} ORDER BY issued_on DESC`,
      params,
    ).catch(() => []);
  }

  // Return a book; optionally record its condition on return.
  @Patch('loans/:id/return')
  async returnBook(@Request() req: any, @Param('id') id: string, @Body() dto: any) {
    if (!(await this.canIssueAsync(req.user))) throw new BadRequestException('You are not permitted to receive returns.');
    await this.ensureTables();
    const loans = await this.ds.query(`SELECT book_id FROM library_loans WHERE id::text = $1 AND tenant_id = $2 LIMIT 1`, [id, req.user.tenantId]).catch(() => []);
    if (!loans.length) throw new BadRequestException('Loan not found.');
    await this.ds.query(
      `UPDATE library_loans SET status = 'returned', returned_on = CURRENT_DATE, return_condition = $3, updated_at = NOW() WHERE id::text = $1 AND tenant_id = $2`,
      [id, req.user.tenantId, dto?.condition || null],
    ).catch(() => null);
    // Free the copy; if a return condition was given, update the copy's condition too.
    if (loans[0].book_id) {
      await this.ds.query(`UPDATE library_books SET status = 'available'${dto?.condition ? ', condition = $2' : ''}, updated_at = NOW() WHERE id = $1`,
        dto?.condition ? [loans[0].book_id, dto.condition] : [loans[0].book_id]).catch(() => null);
    }
    return { id, status: 'returned' };
  }

  // Library stock summary.
  @Get('stats')
  async getStats(@Request() req: any) {
    await this.ensureTables();
    const s = await this.ds.query(
      `SELECT COUNT(*)::int AS "totalCopies",
              COUNT(DISTINCT regexp_replace(code,'/[0-9]+$',''))::int AS titles,
              COUNT(*) FILTER (WHERE status='available')::int AS available,
              COUNT(*) FILTER (WHERE status='issued')::int AS issued,
              COUNT(*) FILTER (WHERE condition ILIKE 'damaged' OR condition ILIKE 'poor')::int AS damaged
         FROM library_books WHERE tenant_id = $1`,
      [req.user.tenantId],
    ).catch(() => [{}]);
    const overdue = await this.ds.query(`SELECT COUNT(*)::int AS n FROM library_loans WHERE tenant_id = $1 AND status='issued' AND due_on < CURRENT_DATE`, [req.user.tenantId]).catch(() => [{ n: 0 }]);
    return { ...(s[0] || {}), overdue: overdue[0]?.n || 0 };
  }
}

@Module({
  controllers: [LibraryController],
})
export class LibraryModule {}


// ═══════════════════════════════════════════════════════════
// SPORTS MODULE
// ═══════════════════════════════════════════════════════════
@Controller('sports')
@UseGuards(JwtAuthGuard)
class SportsController {
  constructor(private readonly ds: DataSource) {}

  private async ensureTeamsTable() {
    await this.ds.query(
      `CREATE TABLE IF NOT EXISTS sports_teams (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         tenant_id uuid, created_at timestamptz DEFAULT NOW()
       )`,
    ).catch(() => null);
    const cols: [string, string][] = [
      ['school_id', 'uuid'], ['name', 'text'], ['sport', 'text'], ['category', 'text'],
      ['age_category', 'text'], ['gender', 'text'], ['athletes', 'jsonb'],
      ['coach', 'text'], ['created_by', 'uuid'], ['updated_at', 'timestamptz DEFAULT NOW()'],
      ['created_at', 'timestamptz DEFAULT NOW()'],
    ];
    for (const [n, t] of cols) {
      await this.ds.query(`ALTER TABLE sports_teams ADD COLUMN IF NOT EXISTS ${n} ${t}`).catch(() => null);
    }
    const notNull = await this.ds.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'sports_teams' AND is_nullable = 'NO' AND column_default IS NULL`,
    ).catch(() => []);
    for (const row of (notNull as any[])) {
      if (['id', 'tenant_id'].includes(row.column_name)) continue;
      await this.ds.query(`ALTER TABLE sports_teams ALTER COLUMN ${row.column_name} DROP NOT NULL`).catch(() => null);
    }
  }

  @Get('teams')
  async getTeams(@Request() req: any) {
    await this.ensureTeamsTable();
    return this.ds.query(
      `SELECT id, name, sport, age_category AS "ageCategory", gender, athletes, coach,
              created_at AS "createdAt"
         FROM sports_teams WHERE tenant_id = $1 ORDER BY sport, name`,
      [req.user.tenantId],
    ).then((rows: any[]) => rows.map(r => {
      // athletes is JSONB — the driver may hand it back as a string OR an array. Normalise.
      let athletes: any[] = [];
      if (Array.isArray(r.athletes)) athletes = r.athletes;
      else if (typeof r.athletes === 'string') { try { athletes = JSON.parse(r.athletes); } catch { athletes = []; } }
      if (!Array.isArray(athletes)) athletes = [];
      return { ...r, athletes, athleteCount: athletes.length };
    }))
     .catch(() => []);
  }

  @Post('teams')
  async createTeam(@Request() req: any, @Body() dto: any) {
    const role = req.user.role;
    if (!['hoi', 'dhois', 'tenant_owner', 'school_admin', 'class_teacher', 'subject_teacher', 'overall_class_teacher'].includes(role)) {
      throw new BadRequestException('You do not have permission to create teams.');
    }
    if (!dto?.name || !String(dto.name).trim()) throw new BadRequestException('Team name is required.');
    if (!dto?.sport) throw new BadRequestException('Please choose a sport / event.');
    await this.ensureTeamsTable();
    const athletes = Array.isArray(dto.athletes) ? dto.athletes : [];
    try {
      const rows = await this.ds.query(
        `INSERT INTO sports_teams (tenant_id, school_id, name, sport, age_category, gender, athletes, coach, created_by, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,NOW(),NOW())
         RETURNING id, name, sport, age_category AS "ageCategory", gender, athletes, coach`,
        [
          req.user.tenantId, req.user.schoolId || null, String(dto.name).trim(), dto.sport,
          dto.ageCategory || null, dto.gender || null, JSON.stringify(athletes), dto.coach || null, req.user.id,
        ],
      );
      return { ...rows[0], athleteCount: athletes.length };
    } catch (e: any) {
      throw new BadRequestException(`Could not create team: ${e.message}`);
    }
  }

  @Patch('teams/:id')
  async updateTeam(@Request() req: any, @Param('id') id: string, @Body() dto: any) {
    await this.ensureTeamsTable();
    const fields: string[] = []; const vals: any[] = []; let i = 1;
    for (const [k, col] of Object.entries({ name: 'name', sport: 'sport', ageCategory: 'age_category', gender: 'gender', coach: 'coach' })) {
      if (dto[k] !== undefined) { fields.push(`${col} = $${i++}`); vals.push(dto[k]); }
    }
    if (dto.athletes !== undefined) { fields.push(`athletes = $${i++}::jsonb`); vals.push(JSON.stringify(Array.isArray(dto.athletes) ? dto.athletes : [])); }
    if (!fields.length) return { updated: false };
    fields.push(`updated_at = NOW()`);
    vals.push(id, req.user.tenantId);
    const rows = await this.ds.query(
      `UPDATE sports_teams SET ${fields.join(', ')} WHERE id::text = $${i++} AND tenant_id = $${i}
       RETURNING id, name, sport, age_category AS "ageCategory", gender, athletes, coach`,
      vals,
    ).catch((e: any) => { throw new BadRequestException(e.message); });
    if (!rows.length) throw new BadRequestException('Team not found.');
    const r = rows[0];
    return { ...r, athleteCount: Array.isArray(r.athletes) ? r.athletes.length : 0 };
  }

  @Delete('teams/:id')
  async deleteTeam(@Request() req: any, @Param('id') id: string) {
    await this.ensureTeamsTable();
    await this.ds.query(`DELETE FROM sports_teams WHERE id::text = $1 AND tenant_id = $2`, [id, req.user.tenantId]).catch(() => null);
    return { deleted: true };
  }

  // ── Fixtures (inter-class matches & races) ──────────────────
  private async ensureFixturesTable() {
    await this.ds.query(
      `CREATE TABLE IF NOT EXISTS sports_fixtures (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         tenant_id uuid, created_at timestamptz DEFAULT NOW()
       )`,
    ).catch(() => null);
    const cols: [string, string][] = [
      ['school_id', 'uuid'], ['discipline', 'text'], ['kind', 'text'],
      ['home_team', 'text'], ['away_team', 'text'], ['venue', 'text'],
      ['fixture_date', 'date'], ['type', 'text'], ['status', "text DEFAULT 'scheduled'"],
      ['home_score', 'integer'], ['away_score', 'integer'], ['winner', 'text'],
      ['results', 'jsonb'], ['notes', 'text'],
      ['created_by', 'uuid'], ['updated_at', 'timestamptz DEFAULT NOW()'],
    ];
    for (const [n, t] of cols) {
      await this.ds.query(`ALTER TABLE sports_fixtures ADD COLUMN IF NOT EXISTS ${n} ${t}`).catch(() => null);
    }
    const notNull = await this.ds.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'sports_fixtures' AND is_nullable = 'NO' AND column_default IS NULL`,
    ).catch(() => []);
    for (const row of (notNull as any[])) {
      if (['id', 'tenant_id'].includes(row.column_name)) continue;
      await this.ds.query(`ALTER TABLE sports_fixtures ALTER COLUMN ${row.column_name} DROP NOT NULL`).catch(() => null);
    }
  }

  @Get('fixtures')
  async getFixtures(@Request() req: any, @Query() q: any) {
    try { await this.ensureFixturesTable(); } catch { /* never let table setup 500 the page */ }
    const tenantId = req.user.tenantId;
    const params: any[] = [tenantId];
    let where = `tenant_id = $1`;
    // Tab maps: 'results' = completed; 'interclass' = type inter_class; 'fixtures' = upcoming.
    const tab = q.type || 'fixtures';
    if (tab === 'results') {
      where += ` AND status = 'completed'`;
    } else if (tab === 'interclass') {
      params.push('inter_class'); where += ` AND type = $${params.length}`;
    } else {
      where += ` AND status <> 'completed'`;
    }
    const rows = await this.ds.query(
      `SELECT id, discipline, kind, home_team AS "homeTeam", away_team AS "awayTeam",
              venue, fixture_date AS "date", type, status,
              home_score AS "homeScore", away_score AS "awayScore", winner, results, notes
         FROM sports_fixtures WHERE ${where}
        ORDER BY fixture_date NULLS LAST, created_at DESC`,
      params,
    ).catch(() => []);
    return rows;
  }

  @Post('fixtures')
  async createFixture(@Request() req: any, @Body() dto: any) {
    if (!dto?.homeTeam && !dto?.discipline) throw new BadRequestException('A discipline or teams are required.');
    await this.ensureFixturesTable();
    // kind: 'race' for athletics/swimming (positions), else 'match' (home vs away).
    const disc = String(dto.discipline || '').toLowerCase();
    const kind = (disc.includes('athletics') || disc.includes('swimming') || disc.includes('race') || disc.includes('cross country')) ? 'race' : 'match';
    const rows = await this.ds.query(
      `INSERT INTO sports_fixtures
         (tenant_id, school_id, discipline, kind, home_team, away_team, venue, fixture_date, type, status, created_by, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'scheduled',$10,NOW(),NOW())
       RETURNING id, discipline, kind, home_team AS "homeTeam", away_team AS "awayTeam", venue, fixture_date AS "date", type, status`,
      [
        req.user.tenantId, req.user.schoolId || null, dto.discipline || null, kind,
        dto.homeTeam || null, dto.awayTeam || null, dto.venue || null,
        dto.date || null, dto.type || 'inter_class', req.user.id,
      ],
    ).catch((e: any) => { throw new BadRequestException(`Could not schedule fixture: ${e.message}`); });
    return rows[0];
  }

  // Record a result: for matches send homeScore/awayScore; for races send results:[{position,name,class,time}].
  @Patch('fixtures/:id/result')
  async recordResult(@Request() req: any, @Param('id') id: string, @Body() dto: any) {
    await this.ensureFixturesTable();
    const fields: string[] = ['status = \'completed\'', 'updated_at = NOW()'];
    const vals: any[] = []; let i = 1;
    if (dto.homeScore !== undefined) { fields.push(`home_score = $${i++}`); vals.push(Number(dto.homeScore)); }
    if (dto.awayScore !== undefined) { fields.push(`away_score = $${i++}`); vals.push(Number(dto.awayScore)); }
    if (dto.winner !== undefined)    { fields.push(`winner = $${i++}`);     vals.push(dto.winner || null); }
    if (dto.results !== undefined)   { fields.push(`results = $${i++}::jsonb`); vals.push(JSON.stringify(dto.results || [])); }
    if (dto.notes !== undefined)     { fields.push(`notes = $${i++}`);      vals.push(dto.notes || null); }
    vals.push(id, req.user.tenantId);
    const rows = await this.ds.query(
      `UPDATE sports_fixtures SET ${fields.join(', ')} WHERE id::text = $${i++} AND tenant_id = $${i}
       RETURNING id, status, home_score AS "homeScore", away_score AS "awayScore", winner, results`,
      vals,
    ).catch((e: any) => { throw new BadRequestException(e.message); });
    if (!rows.length) throw new BadRequestException('Fixture not found.');
    return rows[0];
  }

  @Delete('fixtures/:id')
  async deleteFixture(@Request() req: any, @Param('id') id: string) {
    await this.ensureFixturesTable();
    await this.ds.query(`DELETE FROM sports_fixtures WHERE id::text = $1 AND tenant_id = $2`, [id, req.user.tenantId]).catch(() => null);
    return { deleted: true };
  }

  // ── School team formation (from inter-class results) ──────────
  private async ensureSquadTable() {
    await this.ds.query(
      `CREATE TABLE IF NOT EXISTS school_squads (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         tenant_id uuid, created_at timestamptz DEFAULT NOW()
       )`,
    ).catch(() => null);
    const cols: [string, string][] = [
      ['school_id', 'uuid'], ['sport', 'text'], ['members', 'jsonb'],
      ['status', "text DEFAULT 'draft'"], ['updated_at', 'timestamptz DEFAULT NOW()'],
    ];
    for (const [n, t] of cols) {
      await this.ds.query(`ALTER TABLE school_squads ADD COLUMN IF NOT EXISTS ${n} ${t}`).catch(() => null);
    }
    const notNull = await this.ds.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'school_squads' AND is_nullable = 'NO' AND column_default IS NULL`,
    ).catch(() => []);
    for (const row of (notNull as any[])) {
      if (['id', 'tenant_id'].includes(row.column_name)) continue;
      await this.ds.query(`ALTER TABLE school_squads ALTER COLUMN ${row.column_name} DROP NOT NULL`).catch(() => null);
    }
  }

  // Suggest top performers for a sport from COMPLETED fixtures/races.
  // - Races: athletes who placed top 3 (with their best position & class).
  // - Matches: the players of winning teams (from the team rosters).
  @Get('school-team/suggestions')
  async squadSuggestions(@Request() req: any, @Query() q: any) {
    try { await this.ensureFixturesTable(); await this.ensureTeamsTable(); } catch { /* */ }
    const tenantId = req.user.tenantId;
    const sport = q.sport || null;
    const fixtures = await this.ds.query(
      `SELECT discipline, kind, home_team AS "homeTeam", away_team AS "awayTeam",
              home_score AS "homeScore", away_score AS "awayScore", winner, results
         FROM sports_fixtures
        WHERE tenant_id = $1 AND status = 'completed'
          AND ($2::text IS NULL OR discipline = $2)`,
      [tenantId, sport],
    ).catch(() => []);

    // Tally a "merit" score for each candidate so the strongest float to the top.
    const merit: Record<string, any> = {};
    const bump = (key: string, info: any, points: number) => {
      if (!merit[key]) merit[key] = { ...info, points: 0, appearances: 0 };
      merit[key].points += points; merit[key].appearances += 1;
      if (info.bestPosition && (!merit[key].bestPosition || info.bestPosition < merit[key].bestPosition)) merit[key].bestPosition = info.bestPosition;
    };

    for (const f of fixtures) {
      if (f.kind === 'race' && Array.isArray(f.results)) {
        for (const r of f.results) {
          const pos = Number(r.position) || 99;
          if (pos <= 3 && r.name) {
            const pts = pos === 1 ? 5 : pos === 2 ? 3 : 2;
            bump(`${r.name}|${r.class || r.cls || ''}`, { name: r.name, class: r.class || r.cls || '', discipline: f.discipline, bestPosition: pos, source: 'race' }, pts);
          }
        }
      } else if (f.kind !== 'race') {
        // Ball games: include players from BOTH participating teams (not only the winner),
        // so the games dept can form a school squad from across all who took part. Winners
        // get a higher merit weight so they still rank above the rest.
        for (const side of [{ team: f.homeTeam, won: f.winner === f.homeTeam }, { team: f.awayTeam, won: f.winner === f.awayTeam }]) {
          if (!side.team) continue;
          const teamRow = await this.ds.query(
            `SELECT athletes FROM sports_teams WHERE tenant_id = $1 AND name = $2 LIMIT 1`,
            [tenantId, side.team],
          ).catch(() => []);
          let roster: any[] = [];
          try { roster = Array.isArray(teamRow[0]?.athletes) ? teamRow[0].athletes : JSON.parse(teamRow[0]?.athletes || '[]'); } catch { roster = []; }
          const weight = side.won ? 4 : 2;   // winners weighted higher, but all participants surface
          if (roster.length) {
            for (const p of roster) bump(`${p.name}|${p.stream || ''}`, { name: p.name, class: p.stream || '', discipline: f.discipline, source: side.won ? 'match-winner' : 'match-participant', team: side.team }, weight);
          } else {
            bump(`team:${side.team}`, { name: side.team, class: '', discipline: f.discipline, source: side.won ? 'match-winner' : 'match-participant' }, weight);
          }
        }
      }
    }

    const suggestions = Object.values(merit).sort((a: any, b: any) =>
      b.points - a.points || (a.bestPosition || 99) - (b.bestPosition || 99));

    // Baseline pool: every player in every team for this sport, so a squad can be formed even
    // before results exist. Players already surfaced from results keep their (higher) merit.
    let pool: any[] = [];
    if (sport) {
      const teams = await this.ds.query(
        `SELECT name, athletes FROM sports_teams WHERE tenant_id = $1 AND sport = $2`,
        [tenantId, sport],
      ).catch(() => []);
      const seen = new Set(suggestions.map((s: any) => `${s.name}|${s.class || ''}`));
      for (const t of teams) {
        let roster: any[] = [];
        try { roster = Array.isArray(t.athletes) ? t.athletes : JSON.parse(t.athletes || '[]'); } catch { roster = []; }
        for (const p of roster) {
          const key = `${p.name}|${p.stream || ''}`;
          if (!seen.has(key)) { seen.add(key); pool.push({ name: p.name, class: p.stream || '', discipline: sport, source: 'team-pool', team: t.name, points: 0 }); }
        }
      }
    }

    return { sport, count: suggestions.length, suggestions, pool };
  }

  @Get('school-team')
  async getSquads(@Request() req: any, @Query() q: any) {
    await this.ensureSquadTable();
    const params: any[] = [req.user.tenantId];
    let where = `tenant_id = $1`;
    if (q.sport) { params.push(q.sport); where += ` AND sport = $2`; }
    const rows = await this.ds.query(
      `SELECT id, sport, members, status, updated_at AS "updatedAt" FROM school_squads WHERE ${where} ORDER BY sport`,
      params,
    ).catch(() => []);
    return rows.map((r: any) => {
      let members: any[] = [];
      try { members = Array.isArray(r.members) ? r.members : JSON.parse(r.members || '[]'); } catch { members = []; }
      return { ...r, members, memberCount: members.length };
    });
  }

  // Save (create or replace) the school squad for a sport.
  @Post('school-team')
  async saveSquad(@Request() req: any, @Body() dto: any) {
    if (!['hoi', 'dhois', 'tenant_owner', 'school_admin'].includes(req.user.role) && !String(req.user.role).includes('teacher')) {
      throw new BadRequestException('Only staff can form the school team.');
    }
    if (!dto?.sport) throw new BadRequestException('Sport is required.');
    await this.ensureSquadTable();
    const members = Array.isArray(dto.members) ? dto.members : [];
    const existing = await this.ds.query(
      `SELECT id FROM school_squads WHERE tenant_id = $1 AND sport = $2 LIMIT 1`,
      [req.user.tenantId, dto.sport],
    ).catch(() => []);
    if (existing.length) {
      await this.ds.query(
        `UPDATE school_squads SET members = $1::jsonb, status = $2, updated_at = NOW() WHERE id = $3`,
        [JSON.stringify(members), dto.status || 'draft', existing[0].id],
      ).catch((e: any) => { throw new BadRequestException(e.message); });
      return { id: existing[0].id, updated: true, memberCount: members.length };
    }
    const rows = await this.ds.query(
      `INSERT INTO school_squads (tenant_id, school_id, sport, members, status, created_at, updated_at)
       VALUES ($1,$2,$3,$4::jsonb,$5,NOW(),NOW()) RETURNING id`,
      [req.user.tenantId, req.user.schoolId || null, dto.sport, JSON.stringify(members), dto.status || 'draft'],
    ).catch((e: any) => { throw new BadRequestException(e.message); });
    return { id: rows[0].id, created: true, memberCount: members.length };
  }

  @Get('qualifications')
  getQualifications(@Request() req: any) { return []; }

  @Post('qualifications')
  createQualification(@Request() req: any, @Body() dto: any) { return { id: 'stub', ...dto }; }

  @Post('push-to-base')
  pushToBase(@Request() req: any, @Body() dto: any) {
    return { message: 'Athletes registered at ZARODA Sports Base. Bib numbers assigned.', dto };
  }

  @Get('base/championships')
  getBaseChampionships(@Query() q: any) { return []; }

  @Get('dashboard')
  async getDashboard(@Request() req: any) {
    await this.ensureTeamsTable();
    const r = await this.ds.query(
      `SELECT COUNT(*)::int AS teams,
              COALESCE(SUM(jsonb_array_length(COALESCE(athletes,'[]'::jsonb))),0)::int AS athletes
         FROM sports_teams WHERE tenant_id = $1`,
      [req.user.tenantId],
    ).catch(() => [{ teams: 0, athletes: 0 }]);
    return { totalTeams: r[0]?.teams || 0, totalAthletes: r[0]?.athletes || 0, activeChampionships: 0 };
  }
}

@Module({ controllers: [SportsController] })
export class SportsModule {}


// ═══════════════════════════════════════════════════════════
// DISCIPLINE MODULE
// ═══════════════════════════════════════════════════════════
@Entity('incidents')
class Incident {
  @PrimaryGeneratedColumn('uuid') id:          string;
  @Column({ name: 'tenant_id' })  tenantId:    string;
  @Column({ name: 'learner_id', nullable: true }) learnerId: string;
  @Column({ nullable: true })     category:    string;
  @Column({ default: 'minor' })   severity:    string;
  @Column({ type: 'text', nullable: true }) description: string;
  @Column({ name: 'action_taken', nullable: true }) actionTaken: string;
  @Column({ default: 'open' })    status:      string;
  @Column({ name: 'parent_notified', default: false }) parentNotified: boolean;
  @Column({ name: 'reported_by', nullable: true }) reportedBy: string;
  @Column({ name: 'reported_at', nullable: true }) reportedAt: Date;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}

@Controller('discipline')
@UseGuards(JwtAuthGuard)
class DisciplineController {
  constructor(private readonly ds: DataSource) {}

  private async ensureTable() {
    await this.ds.query(`CREATE TABLE IF NOT EXISTS incidents (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid, created_at timestamptz DEFAULT NOW())`).catch(() => null);
    for (const [n, t] of [['school_id','uuid'],['learner_id','uuid'],['learner_name','text'],['learner_class','text'],
      ['category','text'],['severity',"text DEFAULT 'minor'"],['description','text'],['action_taken','text'],
      ['status',"text DEFAULT 'open'"],['parent_notified','boolean DEFAULT false'],['reported_by','uuid'],
      ['reported_by_name','text'],['reported_at','date'],['updated_at','timestamptz DEFAULT NOW()']] as [string,string][]) {
      await this.ds.query(`ALTER TABLE incidents ADD COLUMN IF NOT EXISTS ${n} ${t}`).catch(() => null);
    }
    // Relax legacy NOT NULL / drop legacy CHECK & FK constraints (same self-healing pattern).
    const nn = await this.ds.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'incidents' AND is_nullable = 'NO' AND column_default IS NULL`).catch(() => []);
    for (const r of (nn as any[])) { if (!['id','tenant_id'].includes(r.column_name)) await this.ds.query(`ALTER TABLE incidents ALTER COLUMN ${r.column_name} DROP NOT NULL`).catch(() => null); }
    const cons = await this.ds.query(`SELECT con.conname FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid WHERE rel.relname = 'incidents' AND con.contype IN ('c','f')`).catch(() => []);
    for (const c of (cons as any[])) await this.ds.query(`ALTER TABLE incidents DROP CONSTRAINT IF EXISTS "${c.conname}"`).catch(() => null);
  }

  @Get('incidents')
  async getIncidents(@Request() req: any) {
    await this.ensureTable();
    const rows = await this.ds.query(
      `SELECT i.id, i.learner_id AS "learnerId", i.category, i.severity, i.description,
              i.action_taken AS "actionTaken", i.status, i.parent_notified AS "parentNotified",
              i.reported_at AS "reportedAt", i.reported_by_name AS "reportedByName",
              COALESCE(i.learner_name, (l.first_name || ' ' || COALESCE(l.last_name,''))) AS "learnerFullName",
              i.learner_class AS "learnerClass", l.first_name AS "firstName", l.last_name AS "lastName"
         FROM incidents i LEFT JOIN learners l ON l.id::text = i.learner_id::text
        WHERE i.tenant_id = $1 ORDER BY i.created_at DESC`,
      [req.user.tenantId],
    ).catch(() => []);
    return (rows as any[]).map(r => ({ ...r, learner: { firstName: r.firstName || (r.learnerFullName||'').split(' ')[0], lastName: r.lastName || '' } }));
  }

  @Post('incidents')
  async createIncident(@Request() req: any, @Body() dto: any) {
    await this.ensureTable();
    const rows = await this.ds.query(
      `INSERT INTO incidents
         (tenant_id, school_id, learner_id, learner_name, learner_class, category, severity,
          description, action_taken, status, parent_notified, reported_by, reported_by_name, reported_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'open',$10,$11,$12,$13,NOW(),NOW())
       RETURNING id, learner_name AS "learnerName", category, severity, status, reported_at AS "reportedAt"`,
      [req.user.tenantId, req.user.schoolId || null, dto.learnerId || null, dto.learnerName || dto.learnerQuery || null,
       dto.learnerClass || null, dto.category || null, dto.severity || 'minor', dto.description || null,
       dto.actionTaken || null, !!dto.parentNotified, req.user.id, req.user.email || null,
       new Date().toISOString().slice(0,10)],
    ).catch((e: any) => { throw new BadRequestException(`Could not record incident: ${e.message}`); });
    return rows[0];
  }

  @Patch('incidents/:id')
  async updateIncident(@Request() req: any, @Param('id') id: string, @Body() dto: any) {
    await this.ensureTable();
    await this.ds.query(
      `UPDATE incidents SET status = COALESCE($3, status), action_taken = COALESCE($4, action_taken),
              parent_notified = COALESCE($5, parent_notified), updated_at = NOW()
        WHERE id::text = $1 AND tenant_id = $2`,
      [id, req.user.tenantId, dto.status || null, dto.actionTaken || null,
       dto.parentNotified === undefined ? null : !!dto.parentNotified],
    ).catch(() => null);
    return { id, ...dto };
  }

  @Delete('incidents/:id')
  async deleteIncident(@Request() req: any, @Param('id') id: string) {
    await this.ds.query(`DELETE FROM incidents WHERE id::text = $1 AND tenant_id = $2`, [id, req.user.tenantId]).catch(() => null);
    return { deleted: true };
  }

  @Get('counselling')
  getCounselling(@Request() req: any) { return []; }

  @Post('counselling')
  createCounselling(@Request() req: any, @Body() dto: any) { return { id: 'stub', ...dto }; }

  @Get('qaso-report')
  getQasoReport(@Request() req: any) {
    return { message: 'QASO report generation — implement PDF service' };
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Incident])],
  controllers: [DisciplineController],
})
export class DisciplineModule {}


// ═══════════════════════════════════════════════════════════
// DUTY ROSTER & SCHOOL ACTIVITIES CALENDAR MODULE
// Admin (hoi/dhois/school_admin/tenant_owner) sets up teachers' duty
// assignments and school-wide activities; every staff member (any
// authenticated user in the tenant) can view both, read-only.
// ═══════════════════════════════════════════════════════════
const ADMIN_ROSTER_ROLES = ['hoi', 'dhois', 'school_admin', 'tenant_owner'];

// A term roster is published ONCE for the whole term: the admin gives a term
// label, start date and week count, the system lays out Week 1..N with dates,
// and each week can carry one or more teachers on duty (however many the
// school needs — small schools might rotate one teacher a week, bigger ones
// two or three). Only one term roster is "active" per tenant at a time;
// publishing a new one archives the old rather than deleting it outright.
@Entity('duty_roster_terms')
class DutyRosterTermEntry {
  @PrimaryGeneratedColumn('uuid') id:         string;
  @Column({ name: 'tenant_id' })  tenantId:   string;
  @Column({ nullable: true })     label:      string;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}

@Entity('school_activities')
class SchoolActivityEntry {
  @PrimaryGeneratedColumn('uuid') id:       string;
  @Column({ name: 'tenant_id' })  tenantId: string;
  @Column({ nullable: true })     title:    string;
  @Column({ name: 'start_date', nullable: true }) startDate: string;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}

@Controller('duty-roster')
@UseGuards(JwtAuthGuard)
class DutyRosterController {
  constructor(private readonly ds: DataSource) {}

  private assertAdmin(req: any) {
    if (!ADMIN_ROSTER_ROLES.includes(req.user.role)) {
      throw new ForbiddenException('Only school admins can manage the duty roster and activities calendar.');
    }
  }

  private async creatorName(userId: string): Promise<string | null> {
    const rows = await this.ds.query(
      `SELECT first_name AS "firstName", last_name AS "lastName" FROM users WHERE id::text = $1`,
      [userId],
    ).catch(() => []);
    return rows[0] ? `${rows[0].firstName} ${rows[0].lastName}`.trim() : null;
  }

  private async ensureTables() {
    await this.ds.query(`CREATE TABLE IF NOT EXISTS duty_roster_terms (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid, created_at timestamptz DEFAULT NOW())`).catch(() => null);
    for (const [n, t] of [['school_id','uuid'],['label','text'],['start_date','date'],
      ['total_weeks','int'],['teachers_per_week','int DEFAULT 1'],['is_active','boolean DEFAULT true'],
      ['created_by','uuid'],['created_by_name','text']] as [string,string][]) {
      await this.ds.query(`ALTER TABLE duty_roster_terms ADD COLUMN IF NOT EXISTS ${n} ${t}`).catch(() => null);
    }
    await this.ds.query(`CREATE TABLE IF NOT EXISTS duty_roster_weeks (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid, created_at timestamptz DEFAULT NOW())`).catch(() => null);
    for (const [n, t] of [['term_id','uuid'],['week_number','int'],['start_date','date'],['end_date','date']] as [string,string][]) {
      await this.ds.query(`ALTER TABLE duty_roster_weeks ADD COLUMN IF NOT EXISTS ${n} ${t}`).catch(() => null);
    }
    await this.ds.query(`CREATE TABLE IF NOT EXISTS duty_roster_assignments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid, created_at timestamptz DEFAULT NOW())`).catch(() => null);
    for (const [n, t] of [['week_id','uuid'],['teacher_id','uuid'],['teacher_name','text']] as [string,string][]) {
      await this.ds.query(`ALTER TABLE duty_roster_assignments ADD COLUMN IF NOT EXISTS ${n} ${t}`).catch(() => null);
    }
    await this.ds.query(`CREATE TABLE IF NOT EXISTS school_activities (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid, created_at timestamptz DEFAULT NOW())`).catch(() => null);
    for (const [n, t] of [['school_id','uuid'],['title','text'],['description','text'],
      ['category',"text DEFAULT 'other'"],['start_date','date'],['end_date','date'],
      ['start_time','text'],['end_time','text'],['location','text'],
      ['created_by','uuid'],['created_by_name','text'],['updated_at','timestamptz DEFAULT NOW()']] as [string,string][]) {
      await this.ds.query(`ALTER TABLE school_activities ADD COLUMN IF NOT EXISTS ${n} ${t}`).catch(() => null);
    }
  }

  // ── Duty roster (published once for the whole term) ─────
  @Get('term')
  async getTerm(@Request() req: any) {
    await this.ensureTables();
    const terms = await this.ds.query(
      `SELECT id, label, start_date AS "startDate", total_weeks AS "totalWeeks",
              teachers_per_week AS "teachersPerWeek", created_by_name AS "createdByName", created_at AS "createdAt"
         FROM duty_roster_terms WHERE tenant_id = $1 AND is_active = true
        ORDER BY created_at DESC LIMIT 1`,
      [req.user.tenantId],
    ).catch(() => []);
    const term = terms[0];
    if (!term) return null;
    const weeks = await this.ds.query(
      `SELECT id, week_number AS "weekNumber", start_date AS "startDate", end_date AS "endDate"
         FROM duty_roster_weeks WHERE term_id = $1 AND tenant_id = $2 ORDER BY week_number ASC`,
      [term.id, req.user.tenantId],
    ).catch(() => []);
    const assignments = await this.ds.query(
      `SELECT a.id, a.week_id AS "weekId", a.teacher_id AS "teacherId", a.teacher_name AS "teacherName"
         FROM duty_roster_assignments a
         JOIN duty_roster_weeks w ON w.id = a.week_id
        WHERE w.term_id = $1 AND a.tenant_id = $2`,
      [term.id, req.user.tenantId],
    ).catch(() => []);
    return {
      ...term,
      weeks: weeks.map((w: any) => ({ ...w, teachers: assignments.filter((a: any) => a.weekId === w.id) })),
    };
  }

  @Post('term')
  async publishTerm(@Request() req: any, @Body() dto: any) {
    this.assertAdmin(req);
    await this.ensureTables();
    if (!dto.label || !dto.startDate || !dto.totalWeeks) {
      throw new BadRequestException('Term label, start date and number of weeks are required.');
    }
    const totalWeeks = Math.max(1, Math.min(52, parseInt(dto.totalWeeks, 10) || 0));
    const teachersPerWeek = Math.max(1, parseInt(dto.teachersPerWeek, 10) || 1);
    const creatorName = await this.creatorName(req.user.id);

    // A new publish replaces the current roster — archive, don't delete, so history isn't lost.
    await this.ds.query(`UPDATE duty_roster_terms SET is_active = false WHERE tenant_id = $1`, [req.user.tenantId]).catch(() => null);

    const termRows = await this.ds.query(
      `INSERT INTO duty_roster_terms
         (tenant_id, school_id, label, start_date, total_weeks, teachers_per_week, is_active, created_by, created_by_name, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,true,$7,$8,NOW())
       RETURNING id, label, start_date AS "startDate", total_weeks AS "totalWeeks", teachers_per_week AS "teachersPerWeek"`,
      [req.user.tenantId, req.user.schoolId || null, dto.label, dto.startDate, totalWeeks, teachersPerWeek, req.user.id, creatorName],
    ).catch((e: any) => { throw new BadRequestException(`Could not publish term roster: ${e.message}`); });
    const term = termRows[0];

    const start = new Date(dto.startDate + 'T00:00:00');
    const weeks: any[] = [];
    for (let i = 0; i < totalWeeks; i++) {
      const weekStart = new Date(start); weekStart.setDate(weekStart.getDate() + i * 7);
      const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 6);
      const rows = await this.ds.query(
        `INSERT INTO duty_roster_weeks (tenant_id, term_id, week_number, start_date, end_date, created_at)
         VALUES ($1,$2,$3,$4,$5,NOW())
         RETURNING id, week_number AS "weekNumber", start_date AS "startDate", end_date AS "endDate"`,
        [req.user.tenantId, term.id, i + 1, weekStart.toISOString().slice(0, 10), weekEnd.toISOString().slice(0, 10)],
      ).catch(() => []);
      if (rows[0]) weeks.push({ ...rows[0], teachers: [] });
    }
    return { ...term, weeks };
  }

  @Delete('term')
  async clearTerm(@Request() req: any) {
    this.assertAdmin(req);
    await this.ensureTables();
    await this.ds.query(`UPDATE duty_roster_terms SET is_active = false WHERE tenant_id = $1`, [req.user.tenantId]).catch(() => null);
    return { cleared: true };
  }

  @Post('weeks/:weekId/teachers')
  async assignWeekTeacher(@Request() req: any, @Param('weekId') weekId: string, @Body() dto: any) {
    this.assertAdmin(req);
    await this.ensureTables();
    if (!dto.teacherId) throw new BadRequestException('Teacher is required.');
    const week = (await this.ds.query(`SELECT id FROM duty_roster_weeks WHERE id::text = $1 AND tenant_id = $2`, [weekId, req.user.tenantId]).catch(() => []))[0];
    if (!week) throw new BadRequestException('Week not found.');
    const existing = await this.ds.query(
      `SELECT id FROM duty_roster_assignments WHERE week_id::text = $1 AND teacher_id::text = $2 AND tenant_id = $3`,
      [weekId, dto.teacherId, req.user.tenantId],
    ).catch(() => []);
    if (existing[0]) return existing[0];
    const teacherRow = (await this.ds.query(
      `SELECT first_name AS "firstName", last_name AS "lastName" FROM users WHERE id::text = $1`,
      [dto.teacherId],
    ).catch(() => []))[0];
    const teacherName = teacherRow ? `${teacherRow.firstName} ${teacherRow.lastName}`.trim() : null;
    const rows = await this.ds.query(
      `INSERT INTO duty_roster_assignments (tenant_id, week_id, teacher_id, teacher_name, created_at)
       VALUES ($1,$2,$3,$4,NOW())
       RETURNING id, week_id AS "weekId", teacher_id AS "teacherId", teacher_name AS "teacherName"`,
      [req.user.tenantId, weekId, dto.teacherId, teacherName],
    ).catch((e: any) => { throw new BadRequestException(`Could not assign teacher: ${e.message}`); });
    return rows[0];
  }

  @Delete('weeks/:weekId/teachers/:teacherId')
  async unassignWeekTeacher(@Request() req: any, @Param('weekId') weekId: string, @Param('teacherId') teacherId: string) {
    this.assertAdmin(req);
    await this.ds.query(
      `DELETE FROM duty_roster_assignments WHERE week_id::text = $1 AND teacher_id::text = $2 AND tenant_id = $3`,
      [weekId, teacherId, req.user.tenantId],
    ).catch(() => null);
    return { removed: true };
  }

  // ── School activities calendar ──────────────────────────
  @Get('activities')
  async listActivities(@Request() req: any, @Query('from') from?: string, @Query('to') to?: string) {
    await this.ensureTables();
    return this.ds.query(
      `SELECT id, title, description, category, start_date AS "startDate", end_date AS "endDate",
              start_time AS "startTime", end_time AS "endTime", location,
              created_by_name AS "createdByName", created_at AS "createdAt"
         FROM school_activities
        WHERE tenant_id = $1
          AND ($2::date IS NULL OR end_date IS NULL OR end_date >= $2::date)
          AND ($3::date IS NULL OR start_date IS NULL OR start_date <= $3::date)
        ORDER BY start_date ASC NULLS LAST, created_at DESC`,
      [req.user.tenantId, from || null, to || null],
    ).catch(() => []);
  }

  @Post('activities')
  async createActivity(@Request() req: any, @Body() dto: any) {
    this.assertAdmin(req);
    await this.ensureTables();
    if (!dto.title || !dto.startDate) {
      throw new BadRequestException('Title and start date are required.');
    }
    const creatorName = await this.creatorName(req.user.id);
    const rows = await this.ds.query(
      `INSERT INTO school_activities
         (tenant_id, school_id, title, description, category, start_date, end_date,
          start_time, end_time, location, created_by, created_by_name, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW(),NOW())
       RETURNING id, title, description, category, start_date AS "startDate", end_date AS "endDate",
                 start_time AS "startTime", end_time AS "endTime", location`,
      [req.user.tenantId, req.user.schoolId || null, dto.title, dto.description || null,
       dto.category || 'other', dto.startDate, dto.endDate || dto.startDate,
       dto.startTime || null, dto.endTime || null, dto.location || null,
       req.user.id, creatorName],
    ).catch((e: any) => { throw new BadRequestException(`Could not create activity: ${e.message}`); });
    return rows[0];
  }

  @Patch('activities/:id')
  async updateActivity(@Request() req: any, @Param('id') id: string, @Body() dto: any) {
    this.assertAdmin(req);
    await this.ensureTables();
    await this.ds.query(
      `UPDATE school_activities SET
         title = COALESCE($3, title), description = COALESCE($4, description),
         category = COALESCE($5, category), start_date = COALESCE($6, start_date),
         end_date = COALESCE($7, end_date), start_time = COALESCE($8, start_time),
         end_time = COALESCE($9, end_time), location = COALESCE($10, location), updated_at = NOW()
       WHERE id::text = $1 AND tenant_id = $2`,
      [id, req.user.tenantId, dto.title || null, dto.description || null, dto.category || null,
       dto.startDate || null, dto.endDate || null, dto.startTime || null, dto.endTime || null, dto.location || null],
    ).catch((e: any) => { throw new BadRequestException(`Could not update activity: ${e.message}`); });
    return { id, ...dto };
  }

  @Delete('activities/:id')
  async deleteActivity(@Request() req: any, @Param('id') id: string) {
    this.assertAdmin(req);
    await this.ds.query(`DELETE FROM school_activities WHERE id::text = $1 AND tenant_id = $2`, [id, req.user.tenantId]).catch(() => null);
    return { deleted: true };
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([DutyRosterTermEntry, SchoolActivityEntry])],
  controllers: [DutyRosterController],
})
export class DutyRosterModule {}

// ═══════════════════════════════════════════════════════════
// HR MODULE — staff records (teaching + non-teaching) and leave
// ═══════════════════════════════════════════════════════════
const HR_ADMIN_ROLES = ['hoi', 'dhois', 'tenant_owner', 'school_admin'];
// Anyone with a login who counts as "staff" for leave purposes — mirrors
// PAYROLL_STAFF_ROLES above, kept as its own list since HR/payroll may
// diverge later (e.g. a role that's staff for HR but not paid via payroll).
const HR_STAFF_LOGIN_ROLES = [
  'hoi', 'dhois', 'tenant_owner', 'school_admin', 'bursar',
  'class_teacher', 'subject_teacher', 'overall_class_teacher', 'games_dept',
];

@Controller('hr')
@UseGuards(JwtAuthGuard)
class HrController {
  constructor(private readonly ds: DataSource) {}

  private async assertAdmin(req: any) {
    if (!HR_ADMIN_ROLES.includes(req.user.role)) {
      throw new BadRequestException('Only the HOI or an administrator can manage staff HR records.');
    }
    await requireProPlan(this.ds, req.user.tenantId, 'HR');
  }

  private async ensureTables() {
    await this.ds.query(
      `CREATE TABLE IF NOT EXISTS hr_staff (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid, created_at timestamptz DEFAULT NOW()
       )`,
    ).catch(() => null);
    for (const [n, t] of [
      // linked_user_id: set when this HR record belongs to someone who also has a
      // ZARODA login (a teacher/admin/bursar) — left null for non-teaching staff
      // (cooks, drivers, security, …) who have no reason to log in.
      ['linked_user_id', 'uuid'], ['first_name', 'text'], ['last_name', 'text'],
      ['job_title', 'text'], ['department', "text DEFAULT 'support'"], // 'teaching' | 'admin' | 'support'
      ['employment_type', "text DEFAULT 'permanent'"], // permanent | contract | casual
      ['id_number', 'text'], ['staff_number', 'text'], ['tsc_number', 'text'],
      ['phone', 'text'], ['email', 'text'], ['start_date', 'date'], ['end_date', 'date'],
      ['next_of_kin_name', 'text'], ['next_of_kin_phone', 'text'],
      ['is_active', 'boolean DEFAULT true'], ['updated_at', 'timestamptz DEFAULT NOW()'],
    ] as [string, string][]) {
      await this.ds.query(`ALTER TABLE hr_staff ADD COLUMN IF NOT EXISTS ${n} ${t}`).catch(() => null);
    }
    await this.ds.query(`CREATE UNIQUE INDEX IF NOT EXISTS hr_staff_tenant_user_uq ON hr_staff (tenant_id, linked_user_id) WHERE linked_user_id IS NOT NULL`).catch(() => null);

    await this.ds.query(
      `CREATE TABLE IF NOT EXISTS leave_requests (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid, created_at timestamptz DEFAULT NOW()
       )`,
    ).catch(() => null);
    for (const [n, t] of [
      // Either staff_user_id (self-service, staff with a login) or hr_staff_id (a
      // non-teaching staff member with no login, applied on their behalf) is set.
      ['staff_user_id', 'uuid'], ['hr_staff_id', 'uuid'], ['staff_name', 'text'],
      ['leave_type', 'text'], ['start_date', 'date'], ['end_date', 'date'], ['days', 'int'],
      ['reason', 'text'], ['status', "text DEFAULT 'pending'"],
      ['applied_by', 'uuid'], ['applied_by_name', 'text'],
      ['reviewed_by', 'uuid'], ['reviewed_by_name', 'text'], ['reviewed_at', 'timestamptz'],
      ['review_comment', 'text'],
    ] as [string, string][]) {
      await this.ds.query(`ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS ${n} ${t}`).catch(() => null);
    }

    await this.ds.query(
      `CREATE TABLE IF NOT EXISTS staff_appraisals (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid, created_at timestamptz DEFAULT NOW()
       )`,
    ).catch(() => null);
    for (const [n, t] of [
      ['staff_user_id', 'uuid'], ['hr_staff_id', 'uuid'], ['staff_name', 'text'],
      ['period', 'text'], // e.g. "Term 1 2026"
      ['rating', 'int'],  // 1-5
      ['goals', 'text'], ['strengths', 'text'], ['areas_for_improvement', 'text'], ['comments', 'text'],
      ['reviewed_by', 'uuid'], ['reviewed_by_name', 'text'], ['updated_at', 'timestamptz DEFAULT NOW()'],
    ] as [string, string][]) {
      await this.ds.query(`ALTER TABLE staff_appraisals ADD COLUMN IF NOT EXISTS ${n} ${t}`).catch(() => null);
    }

    await this.ds.query(
      `CREATE TABLE IF NOT EXISTS staff_incidents (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid, created_at timestamptz DEFAULT NOW()
       )`,
    ).catch(() => null);
    for (const [n, t] of [
      ['staff_user_id', 'uuid'], ['hr_staff_id', 'uuid'], ['staff_name', 'text'],
      ['category', 'text'], ['severity', "text DEFAULT 'minor'"], ['description', 'text'],
      ['action_taken', 'text'], ['status', "text DEFAULT 'open'"],
      ['reported_by', 'uuid'], ['reported_by_name', 'text'], ['reported_at', 'date'],
      ['updated_at', 'timestamptz DEFAULT NOW()'],
    ] as [string, string][]) {
      await this.ds.query(`ALTER TABLE staff_incidents ADD COLUMN IF NOT EXISTS ${n} ${t}`).catch(() => null);
    }

    await this.ds.query(
      `CREATE TABLE IF NOT EXISTS job_postings (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid, created_at timestamptz DEFAULT NOW()
       )`,
    ).catch(() => null);
    for (const [n, t] of [
      ['title', 'text'], ['department', "text DEFAULT 'teaching'"], // teaching | admin | support
      ['employment_type', "text DEFAULT 'permanent'"], ['location', 'text'],
      ['description', 'text'], ['requirements', 'text'],
      ['status', "text DEFAULT 'open'"], ['closes_on', 'date'],
      ['posted_by', 'uuid'], ['posted_by_name', 'text'], ['updated_at', 'timestamptz DEFAULT NOW()'],
    ] as [string, string][]) {
      await this.ds.query(`ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS ${n} ${t}`).catch(() => null);
    }

    await this.ds.query(
      `CREATE TABLE IF NOT EXISTS job_applications (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid, created_at timestamptz DEFAULT NOW()
       )`,
    ).catch(() => null);
    for (const [n, t] of [
      ['job_posting_id', 'uuid'], ['applicant_name', 'text'], ['applicant_email', 'text'],
      ['applicant_phone', 'text'], ['cover_note', 'text'],
      ['status', "text DEFAULT 'new'"], // new | shortlisted | interviewed | offered | rejected | hired
      ['notes', 'text'], ['updated_at', 'timestamptz DEFAULT NOW()'],
    ] as [string, string][]) {
      await this.ds.query(`ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS ${n} ${t}`).catch(() => null);
    }
  }

  private async displayName(userId: string, fallback: string): Promise<string> {
    if (!userId) return fallback;
    const rows = await this.ds.query(
      `SELECT first_name AS "firstName", last_name AS "lastName" FROM users WHERE id::text = $1 LIMIT 1`,
      [userId],
    ).catch(() => []);
    const u = rows[0];
    const name = u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() : '';
    return name || fallback;
  }

  // Every staff member for HR purposes: existing hr_staff rows, PLUS any teaching/
  // admin user who doesn't have one yet (shown so the admin can fill in employment
  // details without re-typing a name that already exists in the system).
  @Get('staff')
  async listStaff(@Request() req: any) {
    await this.assertAdmin(req);
    await this.ensureTables();
    const tenantId = req.user.tenantId;
    const hrRows = await this.ds.query(
      `SELECT h.id, h.linked_user_id AS "linkedUserId", h.first_name AS "firstName", h.last_name AS "lastName",
              h.job_title AS "jobTitle", h.department, h.employment_type AS "employmentType",
              h.id_number AS "idNumber", h.staff_number AS "staffNumber", h.tsc_number AS "tscNumber",
              h.phone, h.email, h.start_date AS "startDate", h.next_of_kin_name AS "nextOfKinName",
              h.next_of_kin_phone AS "nextOfKinPhone", u.role
         FROM hr_staff h LEFT JOIN users u ON u.id::text = h.linked_user_id::text
        WHERE h.tenant_id::text = $1 AND h.is_active = true
        ORDER BY h.first_name`,
      [tenantId],
    ).catch(() => []);
    const linkedIds = new Set((hrRows as any[]).filter(r => r.linkedUserId).map(r => r.linkedUserId));
    const unlinkedUsers = await this.ds.query(
      `SELECT id, first_name AS "firstName", last_name AS "lastName", role
         FROM users WHERE tenant_id::text = $1 AND role = ANY($2) AND is_active = true`,
      [tenantId, HR_STAFF_LOGIN_ROLES],
    ).catch(() => []);
    const noDetails = (unlinkedUsers as any[])
      .filter(u => !linkedIds.has(u.id))
      .map(u => ({
        id: `user:${u.id}`, linkedUserId: u.id, firstName: u.firstName, lastName: u.lastName,
        role: u.role, jobTitle: null, department: 'teaching', employmentType: null, noDetailsYet: true,
      }));
    return [...(hrRows as any[]), ...noDetails];
  }

  @Post('staff')
  async createStaff(@Request() req: any, @Body() dto: any) {
    await this.assertAdmin(req);
    await this.ensureTables();
    if (!dto?.firstName?.trim() || !dto?.lastName?.trim()) throw new BadRequestException('First and last name are required.');
    const rows = await this.ds.query(
      `INSERT INTO hr_staff
         (tenant_id, linked_user_id, first_name, last_name, job_title, department, employment_type,
          id_number, staff_number, tsc_number, phone, email, start_date, next_of_kin_name, next_of_kin_phone, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW())
       RETURNING id`,
      [
        req.user.tenantId, dto.linkedUserId || null, dto.firstName.trim(), dto.lastName.trim(),
        dto.jobTitle || null, dto.department || 'support', dto.employmentType || 'permanent',
        dto.idNumber || null, dto.staffNumber || null, dto.tscNumber || null,
        dto.phone || null, dto.email || null, dto.startDate || null,
        dto.nextOfKinName || null, dto.nextOfKinPhone || null,
      ],
    ).catch((e: any) => { throw new BadRequestException(`Could not save: ${e.message}`); });
    return { id: rows[0].id };
  }

  @Patch('staff/:id')
  async updateStaff(@Request() req: any, @Param('id') id: string, @Body() dto: any) {
    await this.assertAdmin(req);
    await this.ensureTables();
    const fields: string[] = []; const vals: any[] = []; let i = 1;
    const map: Record<string, string> = {
      firstName: 'first_name', lastName: 'last_name', jobTitle: 'job_title', department: 'department',
      employmentType: 'employment_type', idNumber: 'id_number', staffNumber: 'staff_number',
      tscNumber: 'tsc_number', phone: 'phone', email: 'email', startDate: 'start_date',
      endDate: 'end_date', nextOfKinName: 'next_of_kin_name', nextOfKinPhone: 'next_of_kin_phone',
    };
    for (const [k, col] of Object.entries(map)) {
      if (dto[k] !== undefined) { fields.push(`${col} = $${i++}`); vals.push(dto[k] || null); }
    }
    if (!fields.length) return { updated: false };
    fields.push('updated_at = NOW()');
    vals.push(id, req.user.tenantId);
    await this.ds.query(
      `UPDATE hr_staff SET ${fields.join(', ')} WHERE id::text = $${i++} AND tenant_id::text = $${i}`,
      vals,
    ).catch((e: any) => { throw new BadRequestException(`Could not update: ${e.message}`); });
    return { updated: true };
  }

  @Delete('staff/:id')
  async deactivateStaff(@Request() req: any, @Param('id') id: string) {
    await this.assertAdmin(req);
    await this.ensureTables();
    await this.ds.query(
      `UPDATE hr_staff SET is_active = false, updated_at = NOW() WHERE id::text = $1 AND tenant_id::text = $2`,
      [id, req.user.tenantId],
    ).catch(() => null);
    return { deactivated: true };
  }

  // ── Leave ────────────────────────────────────────────────
  // A staff member with a login applies for themselves; an admin applies on
  // behalf of a non-teaching staff member (hrStaffId) who has none.
  @Post('leave')
  async applyLeave(@Request() req: any, @Body() dto: any) {
    await this.ensureTables();
    const isAdmin = HR_ADMIN_ROLES.includes(req.user.role);
    if (!dto?.leaveType || !dto?.startDate || !dto?.endDate) {
      throw new BadRequestException('Leave type, start date and end date are required.');
    }
    let staffUserId: string | null = null, hrStaffId: string | null = null, staffName: string;
    if (dto.hrStaffId) {
      if (!isAdmin) throw new BadRequestException('Only an administrator can apply for leave on someone else\'s behalf.');
      const rows = await this.ds.query(
        `SELECT first_name AS "firstName", last_name AS "lastName" FROM hr_staff WHERE id::text = $1 AND tenant_id::text = $2`,
        [dto.hrStaffId, req.user.tenantId],
      ).catch(() => []);
      if (!rows.length) throw new BadRequestException('Staff record not found.');
      hrStaffId = dto.hrStaffId;
      staffName = `${rows[0].firstName} ${rows[0].lastName}`;
    } else {
      staffUserId = req.user.id;
      staffName = await this.displayName(req.user.id, req.user.email || '');
    }
    const start = new Date(dto.startDate), end = new Date(dto.endDate);
    if (end < start) throw new BadRequestException('End date cannot be before the start date.');
    const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
    const applierName = await this.displayName(req.user.id, req.user.email || '');
    const rows = await this.ds.query(
      `INSERT INTO leave_requests
         (tenant_id, staff_user_id, hr_staff_id, staff_name, leave_type, start_date, end_date, days,
          reason, status, applied_by, applied_by_name, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',$10,$11,NOW())
       RETURNING id`,
      [req.user.tenantId, staffUserId, hrStaffId, staffName, dto.leaveType, dto.startDate, dto.endDate, days,
       dto.reason || null, req.user.id, applierName],
    );
    return { id: rows[0].id, days };
  }

  // Admins see every request; anyone else sees only their own.
  @Get('leave')
  async listLeave(@Request() req: any, @Query() q: any) {
    await this.ensureTables();
    const isAdmin = HR_ADMIN_ROLES.includes(req.user.role);
    const params: any[] = [req.user.tenantId];
    let where = 'tenant_id::text = $1';
    if (!isAdmin) { params.push(req.user.id); where += ` AND staff_user_id::text = $${params.length}`; }
    else if (q.status) { params.push(q.status); where += ` AND status = $${params.length}`; }
    return this.ds.query(
      `SELECT id, staff_user_id AS "staffUserId", hr_staff_id AS "hrStaffId", staff_name AS "staffName",
              leave_type AS "leaveType", start_date AS "startDate", end_date AS "endDate", days,
              reason, status, applied_by_name AS "appliedByName",
              reviewed_by_name AS "reviewedByName", reviewed_at AS "reviewedAt", review_comment AS "reviewComment",
              created_at AS "createdAt"
         FROM leave_requests WHERE ${where} ORDER BY created_at DESC`,
      params,
    ).catch(() => []);
  }

  @Patch('leave/:id/review')
  async reviewLeave(@Request() req: any, @Param('id') id: string, @Body() dto: { action: 'approved' | 'rejected'; comment?: string }) {
    await this.assertAdmin(req);
    await this.ensureTables();
    if (!['approved', 'rejected'].includes(dto?.action)) throw new BadRequestException('action must be approved or rejected.');
    const name = await this.displayName(req.user.id, req.user.email || '');
    const rows = await this.ds.query(
      `UPDATE leave_requests SET status = $1, reviewed_by = $2, reviewed_by_name = $3, reviewed_at = NOW(), review_comment = $4
        WHERE id::text = $5 AND tenant_id::text = $6 RETURNING id`,
      [dto.action, req.user.id, name, dto.comment || null, id, req.user.tenantId],
    ).catch(() => []);
    if (!rows.length) throw new BadRequestException('Leave request not found.');
    return { updated: true };
  }

  @Delete('leave/:id')
  async cancelLeave(@Request() req: any, @Param('id') id: string) {
    await this.ensureTables();
    const isAdmin = HR_ADMIN_ROLES.includes(req.user.role);
    const rows = await this.ds.query(
      `SELECT staff_user_id AS "staffUserId", status FROM leave_requests WHERE id::text = $1 AND tenant_id::text = $2`,
      [id, req.user.tenantId],
    ).catch(() => []);
    if (!rows.length) throw new BadRequestException('Leave request not found.');
    if (!isAdmin && rows[0].staffUserId !== req.user.id) throw new BadRequestException('You can only cancel your own leave request.');
    if (rows[0].status !== 'pending' && !isAdmin) throw new BadRequestException('This request has already been reviewed — ask an administrator to change it.');
    await this.ds.query(`DELETE FROM leave_requests WHERE id::text = $1 AND tenant_id::text = $2`, [id, req.user.tenantId]).catch(() => null);
    return { deleted: true };
  }

  // Resolves either a staffUserId or hrStaffId into a display name, and validates
  // the target belongs to this tenant — shared by appraisals and incidents below.
  private async resolveStaffName(tenantId: string, dto: any): Promise<string> {
    if (dto.hrStaffId) {
      const rows = await this.ds.query(
        `SELECT first_name AS "firstName", last_name AS "lastName" FROM hr_staff WHERE id::text = $1 AND tenant_id::text = $2`,
        [dto.hrStaffId, tenantId],
      ).catch(() => []);
      if (!rows.length) throw new BadRequestException('Staff record not found.');
      return `${rows[0].firstName} ${rows[0].lastName}`;
    }
    if (dto.staffUserId) {
      const rows = await this.ds.query(
        `SELECT first_name AS "firstName", last_name AS "lastName" FROM users WHERE id::text = $1 AND tenant_id::text = $2`,
        [dto.staffUserId, tenantId],
      ).catch(() => []);
      if (!rows.length) throw new BadRequestException('Staff account not found.');
      return `${rows[0].firstName} ${rows[0].lastName}`;
    }
    throw new BadRequestException('Select a staff member.');
  }

  // ── Appraisals ───────────────────────────────────────────
  @Get('appraisals')
  async listAppraisals(@Request() req: any, @Query() q: any) {
    await this.assertAdmin(req);
    await this.ensureTables();
    const params: any[] = [req.user.tenantId];
    let where = 'tenant_id::text = $1';
    if (q.staffUserId) { params.push(q.staffUserId); where += ` AND staff_user_id::text = $${params.length}`; }
    if (q.hrStaffId) { params.push(q.hrStaffId); where += ` AND hr_staff_id::text = $${params.length}`; }
    return this.ds.query(
      `SELECT id, staff_user_id AS "staffUserId", hr_staff_id AS "hrStaffId", staff_name AS "staffName",
              period, rating, goals, strengths, areas_for_improvement AS "areasForImprovement", comments,
              reviewed_by_name AS "reviewedByName", updated_at AS "updatedAt", created_at AS "createdAt"
         FROM staff_appraisals WHERE ${where} ORDER BY created_at DESC`,
      params,
    ).catch(() => []);
  }

  @Post('appraisals')
  async createAppraisal(@Request() req: any, @Body() dto: any) {
    await this.assertAdmin(req);
    await this.ensureTables();
    if (!dto?.period?.trim()) throw new BadRequestException('Enter the review period (e.g. "Term 1 2026").');
    const staffName = await this.resolveStaffName(req.user.tenantId, dto);
    const reviewerName = await this.displayName(req.user.id, req.user.email || '');
    const rows = await this.ds.query(
      `INSERT INTO staff_appraisals
         (tenant_id, staff_user_id, hr_staff_id, staff_name, period, rating, goals, strengths,
          areas_for_improvement, comments, reviewed_by, reviewed_by_name, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW()) RETURNING id`,
      [
        req.user.tenantId, dto.staffUserId || null, dto.hrStaffId || null, staffName, dto.period.trim(),
        dto.rating ? Number(dto.rating) : null, dto.goals || null, dto.strengths || null,
        dto.areasForImprovement || null, dto.comments || null, req.user.id, reviewerName,
      ],
    ).catch((e: any) => { throw new BadRequestException(`Could not save: ${e.message}`); });
    return { id: rows[0].id };
  }

  @Patch('appraisals/:id')
  async updateAppraisal(@Request() req: any, @Param('id') id: string, @Body() dto: any) {
    await this.assertAdmin(req);
    await this.ensureTables();
    const fields: string[] = []; const vals: any[] = []; let i = 1;
    const map: Record<string, string> = {
      period: 'period', rating: 'rating', goals: 'goals', strengths: 'strengths',
      areasForImprovement: 'areas_for_improvement', comments: 'comments',
    };
    for (const [k, col] of Object.entries(map)) {
      if (dto[k] !== undefined) { fields.push(`${col} = $${i++}`); vals.push(k === 'rating' ? (dto[k] ? Number(dto[k]) : null) : (dto[k] || null)); }
    }
    if (!fields.length) return { updated: false };
    fields.push('updated_at = NOW()');
    vals.push(id, req.user.tenantId);
    await this.ds.query(
      `UPDATE staff_appraisals SET ${fields.join(', ')} WHERE id::text = $${i++} AND tenant_id::text = $${i}`,
      vals,
    ).catch((e: any) => { throw new BadRequestException(`Could not update: ${e.message}`); });
    return { updated: true };
  }

  @Delete('appraisals/:id')
  async deleteAppraisal(@Request() req: any, @Param('id') id: string) {
    await this.assertAdmin(req);
    await this.ensureTables();
    await this.ds.query(`DELETE FROM staff_appraisals WHERE id::text = $1 AND tenant_id::text = $2`, [id, req.user.tenantId]).catch(() => null);
    return { deleted: true };
  }

  // ── Staff disciplinary/incidents ──────────────────────────
  // Admin-only, both to view and to act on — unlike leave, a staff member does
  // not see their own disciplinary record here (kept between them and the HOI).
  @Get('incidents')
  async listStaffIncidents(@Request() req: any) {
    await this.assertAdmin(req);
    await this.ensureTables();
    return this.ds.query(
      `SELECT id, staff_user_id AS "staffUserId", hr_staff_id AS "hrStaffId", staff_name AS "staffName",
              category, severity, description, action_taken AS "actionTaken", status,
              reported_by_name AS "reportedByName", reported_at AS "reportedAt", created_at AS "createdAt"
         FROM staff_incidents WHERE tenant_id::text = $1 ORDER BY created_at DESC`,
      [req.user.tenantId],
    ).catch(() => []);
  }

  @Post('incidents')
  async createStaffIncident(@Request() req: any, @Body() dto: any) {
    await this.assertAdmin(req);
    await this.ensureTables();
    if (!dto?.description?.trim()) throw new BadRequestException('Describe the incident.');
    const staffName = await this.resolveStaffName(req.user.tenantId, dto);
    const reporterName = await this.displayName(req.user.id, req.user.email || '');
    const rows = await this.ds.query(
      `INSERT INTO staff_incidents
         (tenant_id, staff_user_id, hr_staff_id, staff_name, category, severity, description,
          action_taken, status, reported_by, reported_by_name, reported_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'open',$9,$10,$11) RETURNING id`,
      [
        req.user.tenantId, dto.staffUserId || null, dto.hrStaffId || null, staffName,
        dto.category || 'General', dto.severity || 'minor', dto.description.trim(),
        dto.actionTaken || null, req.user.id, reporterName, dto.reportedAt || new Date().toISOString().slice(0, 10),
      ],
    ).catch((e: any) => { throw new BadRequestException(`Could not save: ${e.message}`); });
    return { id: rows[0].id };
  }

  @Patch('incidents/:id')
  async updateStaffIncident(@Request() req: any, @Param('id') id: string, @Body() dto: any) {
    await this.assertAdmin(req);
    await this.ensureTables();
    const fields: string[] = []; const vals: any[] = []; let i = 1;
    const map: Record<string, string> = {
      category: 'category', severity: 'severity', description: 'description',
      actionTaken: 'action_taken', status: 'status',
    };
    for (const [k, col] of Object.entries(map)) {
      if (dto[k] !== undefined) { fields.push(`${col} = $${i++}`); vals.push(dto[k] || null); }
    }
    if (!fields.length) return { updated: false };
    fields.push('updated_at = NOW()');
    vals.push(id, req.user.tenantId);
    await this.ds.query(
      `UPDATE staff_incidents SET ${fields.join(', ')} WHERE id::text = $${i++} AND tenant_id::text = $${i}`,
      vals,
    ).catch((e: any) => { throw new BadRequestException(`Could not update: ${e.message}`); });
    return { updated: true };
  }

  @Delete('incidents/:id')
  async deleteStaffIncident(@Request() req: any, @Param('id') id: string) {
    await this.assertAdmin(req);
    await this.ensureTables();
    await this.ds.query(`DELETE FROM staff_incidents WHERE id::text = $1 AND tenant_id::text = $2`, [id, req.user.tenantId]).catch(() => null);
    return { deleted: true };
  }

  // ── Recruitment: job postings ─────────────────────────────
  @Get('jobs')
  async listJobs(@Request() req: any) {
    await this.assertAdmin(req);
    await this.ensureTables();
    return this.ds.query(
      `SELECT j.id, j.title, j.department, j.employment_type AS "employmentType", j.location,
              j.description, j.requirements, j.status, j.closes_on AS "closesOn",
              j.posted_by_name AS "postedByName", j.created_at AS "createdAt",
              COUNT(a.id) AS "applicationCount"
         FROM job_postings j LEFT JOIN job_applications a ON a.job_posting_id::text = j.id::text
        WHERE j.tenant_id::text = $1
        GROUP BY j.id ORDER BY j.created_at DESC`,
      [req.user.tenantId],
    ).catch(() => []);
  }

  @Post('jobs')
  async createJob(@Request() req: any, @Body() dto: any) {
    await this.assertAdmin(req);
    await this.ensureTables();
    if (!dto?.title?.trim()) throw new BadRequestException('Enter a job title.');
    const name = await this.displayName(req.user.id, req.user.email || '');
    const rows = await this.ds.query(
      `INSERT INTO job_postings
         (tenant_id, title, department, employment_type, location, description, requirements,
          closes_on, posted_by, posted_by_name, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW()) RETURNING id`,
      [
        req.user.tenantId, dto.title.trim(), dto.department || 'teaching', dto.employmentType || 'permanent',
        dto.location || null, dto.description || null, dto.requirements || null,
        dto.closesOn || null, req.user.id, name,
      ],
    ).catch((e: any) => { throw new BadRequestException(`Could not save: ${e.message}`); });
    return { id: rows[0].id };
  }

  @Patch('jobs/:id')
  async updateJob(@Request() req: any, @Param('id') id: string, @Body() dto: any) {
    await this.assertAdmin(req);
    await this.ensureTables();
    const fields: string[] = []; const vals: any[] = []; let i = 1;
    const map: Record<string, string> = {
      title: 'title', department: 'department', employmentType: 'employment_type', location: 'location',
      description: 'description', requirements: 'requirements', status: 'status', closesOn: 'closes_on',
    };
    for (const [k, col] of Object.entries(map)) {
      if (dto[k] !== undefined) { fields.push(`${col} = $${i++}`); vals.push(dto[k] || null); }
    }
    if (!fields.length) return { updated: false };
    fields.push('updated_at = NOW()');
    vals.push(id, req.user.tenantId);
    await this.ds.query(
      `UPDATE job_postings SET ${fields.join(', ')} WHERE id::text = $${i++} AND tenant_id::text = $${i}`,
      vals,
    ).catch((e: any) => { throw new BadRequestException(`Could not update: ${e.message}`); });
    return { updated: true };
  }

  @Delete('jobs/:id')
  async deleteJob(@Request() req: any, @Param('id') id: string) {
    await this.assertAdmin(req);
    await this.ensureTables();
    await this.ds.query(`DELETE FROM job_applications WHERE job_posting_id::text = $1 AND tenant_id::text = $2`, [id, req.user.tenantId]).catch(() => null);
    await this.ds.query(`DELETE FROM job_postings WHERE id::text = $1 AND tenant_id::text = $2`, [id, req.user.tenantId]).catch(() => null);
    return { deleted: true };
  }

  @Get('jobs/:id/applications')
  async listApplications(@Request() req: any, @Param('id') id: string) {
    await this.assertAdmin(req);
    await this.ensureTables();
    return this.ds.query(
      `SELECT id, applicant_name AS "applicantName", applicant_email AS "applicantEmail",
              applicant_phone AS "applicantPhone", cover_note AS "coverNote", status, notes,
              created_at AS "createdAt"
         FROM job_applications WHERE job_posting_id::text = $1 AND tenant_id::text = $2
        ORDER BY created_at DESC`,
      [id, req.user.tenantId],
    ).catch(() => []);
  }

  @Patch('applications/:id')
  async updateApplication(@Request() req: any, @Param('id') id: string, @Body() dto: any) {
    await this.assertAdmin(req);
    await this.ensureTables();
    const fields: string[] = []; const vals: any[] = []; let i = 1;
    if (dto.status !== undefined) { fields.push(`status = $${i++}`); vals.push(dto.status); }
    if (dto.notes !== undefined) { fields.push(`notes = $${i++}`); vals.push(dto.notes || null); }
    if (!fields.length) return { updated: false };
    fields.push('updated_at = NOW()');
    vals.push(id, req.user.tenantId);
    await this.ds.query(
      `UPDATE job_applications SET ${fields.join(', ')} WHERE id::text = $${i++} AND tenant_id::text = $${i}`,
      vals,
    ).catch((e: any) => { throw new BadRequestException(`Could not update: ${e.message}`); });
    return { updated: true };
  }

  @Delete('applications/:id')
  async deleteApplication(@Request() req: any, @Param('id') id: string) {
    await this.assertAdmin(req);
    await this.ensureTables();
    await this.ds.query(`DELETE FROM job_applications WHERE id::text = $1 AND tenant_id::text = $2`, [id, req.user.tenantId]).catch(() => null);
    return { deleted: true };
  }
}

// ── Recruitment: public side (no login — external applicants) ────────────
@Controller('public/careers')
class PublicCareersController {
  constructor(private readonly ds: DataSource) {}

  private async ensureTables() {
    // Same tables as HrController — created there on first use by any tenant, but
    // a candidate could hit this public endpoint before any admin has, so the
    // check is repeated here too (cheap once the tables exist — IF NOT EXISTS).
    await this.ds.query(
      `CREATE TABLE IF NOT EXISTS job_postings (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid, created_at timestamptz DEFAULT NOW()
       )`,
    ).catch(() => null);
    await this.ds.query(
      `CREATE TABLE IF NOT EXISTS job_applications (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid, created_at timestamptz DEFAULT NOW()
       )`,
    ).catch(() => null);
  }

  @Get(':tenantId')
  async openPostings(@Param('tenantId') tenantId: string) {
    await this.ensureTables();
    const school = await this.ds.query(`SELECT name FROM schools WHERE tenant_id::text = $1 LIMIT 1`, [tenantId])
      .then((r: any[]) => r[0]?.name || null).catch(() => null);
    const jobs = await this.ds.query(
      `SELECT id, title, department, employment_type AS "employmentType", location,
              description, requirements, closes_on AS "closesOn", created_at AS "createdAt"
         FROM job_postings
        WHERE tenant_id::text = $1 AND status = 'open' AND (closes_on IS NULL OR closes_on >= CURRENT_DATE)
        ORDER BY created_at DESC`,
      [tenantId],
    ).catch(() => []);
    return { schoolName: school, jobs };
  }

  @Post(':tenantId/:jobId/apply')
  async apply(@Param('tenantId') tenantId: string, @Param('jobId') jobId: string, @Body() dto: any) {
    await this.ensureTables();
    if (!dto?.applicantName?.trim()) throw new BadRequestException('Enter your name.');
    if (!dto?.applicantEmail?.trim() && !dto?.applicantPhone?.trim()) throw new BadRequestException('Enter an email or phone number so the school can reach you.');
    const job = await this.ds.query(
      `SELECT id FROM job_postings WHERE id::text = $1 AND tenant_id::text = $2 AND status = 'open'`,
      [jobId, tenantId],
    ).catch(() => []);
    if (!job.length) throw new BadRequestException('This position is no longer accepting applications.');
    await this.ds.query(
      `INSERT INTO job_applications
         (tenant_id, job_posting_id, applicant_name, applicant_email, applicant_phone, cover_note, status, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,'new',NOW())`,
      [tenantId, jobId, dto.applicantName.trim(), dto.applicantEmail || null, dto.applicantPhone || null, dto.coverNote || null],
    ).catch((e: any) => { throw new BadRequestException(`Could not submit application: ${e.message}`); });
    return { submitted: true };
  }
}

@Module({ controllers: [HrController, PublicCareersController] })
export class HrModule {}


// ═══════════════════════════════════════════════════════════
// REFERRAL MODULE (Share invite links)
// ═══════════════════════════════════════════════════════════
import * as crypto from 'crypto';

@Entity('class_teacher_invites')
class ClassTeacherInvite {
  @PrimaryGeneratedColumn('uuid') id:          string;
  @Column({ name: 'teacher_id' }) teacherId:   string;
  @Column({ name: 'tenant_id' })  tenantId:    string;
  @Column({ name: 'token_hash' }) tokenHash:   string; // SHA-256 only — raw token never stored
  @Column({ name: 'teacher_name' }) teacherName: string;
  @Column({ name: 'class_name', nullable: true }) className: string;
  @Column({ name: 'stream_id', nullable: true }) streamId: string;
  @Column({ name: 'uses_count', default: 0 }) usesCount: number;
  @Column({ name: 'max_uses', default: 50 })  maxUses:   number;
  @Column({ name: 'expires_at' }) expiresAt:   Date;
  @Column({ name: 'is_active', default: true }) isActive: boolean;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}

@Controller('referral')
@UseGuards(JwtAuthGuard)
class ReferralController {
  @Post('invite/generate')
  generateInvite(@Request() req: any) {
    const rawToken = crypto.randomBytes(32).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const baseUrl = process.env.APP_URL || 'http://localhost:3001';
    return {
      token:   rawToken,   // returned once, never stored
      inviteUrl: `${baseUrl}/invite/${rawToken}`,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      maxUses:   50,
    };
  }

  @Get('invite/:token/validate')
  validateInvite(@Param('token') token: string) {
    // TODO: hash token and look up in DB
    return {
      valid:       true,
      teacherName: 'Demo Teacher',
      className:   'Grade 4 North',
    };
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([ClassTeacherInvite])],
  controllers: [ReferralController],
})
export class ReferralModule {}


// ═══════════════════════════════════════════════════════════
// PDF MODULE
// ═══════════════════════════════════════════════════════════
@Controller('pdf')
@UseGuards(JwtAuthGuard)
class PdfController {
  constructor(private readonly ds: DataSource) {}

  // ── Report card customization ─────────────────────────────
  // A direct response to schools whose report card "doesn't conform" to a fixed
  // CBC letter-band layout — a bounded set of toggles (not a free-form template
  // editor) so the change surface stays small and every school's report card
  // keeps rendering from the same well-tested code path.
  private async ensureReportCardSettingsTable() {
    await this.ds.query(
      `CREATE TABLE IF NOT EXISTS tenant_report_card_settings (
         tenant_id uuid PRIMARY KEY, created_at timestamptz DEFAULT NOW()
       )`,
    ).catch(() => null);
    for (const [n, t] of [
      ['show_performance_levels', 'boolean DEFAULT true'], // EE/ME/AE/BE letter bands vs percentage-only
      ['show_points_total', 'boolean DEFAULT true'],        // "Performance-level total: X/Y" vs a plain average %
      ['show_marklist_levels', 'boolean DEFAULT true'],     // same EE/ME/AE/BE bands, but on the mark-list views
      ['updated_at', 'timestamptz DEFAULT NOW()'],
    ] as [string, string][]) {
      await this.ds.query(`ALTER TABLE tenant_report_card_settings ADD COLUMN IF NOT EXISTS ${n} ${t}`).catch(() => null);
    }
    await this.ds.query(
      `CREATE TABLE IF NOT EXISTS report_card_remarks (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid, created_at timestamptz DEFAULT NOW()
       )`,
    ).catch(() => null);
    for (const [n, t] of [
      ['learner_id', 'uuid'], ['term', 'text'], ['academic_year', 'text'],
      ['teacher_remark', 'text'], ['hoi_remark', 'text'],
      ['updated_by', 'uuid'], ['updated_by_name', 'text'], ['updated_at', 'timestamptz DEFAULT NOW()'],
    ] as [string, string][]) {
      await this.ds.query(`ALTER TABLE report_card_remarks ADD COLUMN IF NOT EXISTS ${n} ${t}`).catch(() => null);
    }
    await this.ds.query(`CREATE UNIQUE INDEX IF NOT EXISTS report_card_remarks_uq ON report_card_remarks (tenant_id, learner_id, term, academic_year)`).catch(() => null);
  }

  @Get('report-card-settings')
  async getReportCardSettings(@Request() req: any) {
    await this.ensureReportCardSettingsTable();
    const rows = await this.ds.query(
      `SELECT show_performance_levels AS "showPerformanceLevels", show_points_total AS "showPointsTotal",
              show_marklist_levels AS "showMarklistLevels"
         FROM tenant_report_card_settings WHERE tenant_id::text = $1`,
      [req.user.tenantId],
    ).catch(() => []);
    return rows[0] || { showPerformanceLevels: true, showPointsTotal: true, showMarklistLevels: true };
  }

  @Post('report-card-settings')
  async setReportCardSettings(@Request() req: any, @Body() dto: { showPerformanceLevels?: boolean; showPointsTotal?: boolean; showMarklistLevels?: boolean }) {
    if (!['hoi', 'dhois', 'tenant_owner', 'school_admin'].includes(req.user.role)) {
      throw new BadRequestException('Only the HOI or an administrator can change report card settings.');
    }
    await this.ensureReportCardSettingsTable();
    await this.ds.query(
      `INSERT INTO tenant_report_card_settings (tenant_id, show_performance_levels, show_points_total, show_marklist_levels, updated_at)
       VALUES ($1,$2,$3,$4,NOW())
       ON CONFLICT (tenant_id) DO UPDATE SET
         show_performance_levels = $2, show_points_total = $3, show_marklist_levels = $4, updated_at = NOW()`,
      [req.user.tenantId, dto.showPerformanceLevels !== false, dto.showPointsTotal !== false, dto.showMarklistLevels !== false],
    );
    return { saved: true };
  }

  // A class teacher/HOI can type a remark that overrides the auto-generated CBC
  // competency-language comment for one learner/term — left blank, the report
  // card falls back to the auto text as before.
  @Get('report-card-remarks/:learnerId')
  async getReportCardRemark(@Request() req: any, @Param('learnerId') learnerId: string, @Query() q: any) {
    await this.ensureReportCardSettingsTable();
    const rows = await this.ds.query(
      `SELECT teacher_remark AS "teacherRemark", hoi_remark AS "hoiRemark"
         FROM report_card_remarks WHERE tenant_id::text = $1 AND learner_id::text = $2 AND term = $3 AND academic_year = $4`,
      [req.user.tenantId, learnerId, q.term || '', q.academicYear || ''],
    ).catch(() => []);
    return rows[0] || { teacherRemark: '', hoiRemark: '' };
  }

  @Post('report-card-remarks')
  async saveReportCardRemark(@Request() req: any, @Body() dto: any) {
    if (!['class_teacher', 'subject_teacher', 'overall_class_teacher', 'hoi', 'dhois', 'school_admin', 'tenant_owner'].includes(req.user.role)) {
      throw new BadRequestException('Only teaching staff or an administrator can set report card remarks.');
    }
    if (!dto?.learnerId || !dto?.term || !dto?.academicYear) throw new BadRequestException('learnerId, term and academicYear are required.');
    await this.ensureReportCardSettingsTable();
    const name = await this.displayNameForUser(req.user.id, req.user.email || '');
    await this.ds.query(
      `INSERT INTO report_card_remarks
         (tenant_id, learner_id, term, academic_year, teacher_remark, hoi_remark, updated_by, updated_by_name, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
       ON CONFLICT (tenant_id, learner_id, term, academic_year) DO UPDATE SET
         teacher_remark = $5, hoi_remark = $6, updated_by = $7, updated_by_name = $8, updated_at = NOW()`,
      [req.user.tenantId, dto.learnerId, dto.term, dto.academicYear, dto.teacherRemark || null, dto.hoiRemark || null, req.user.id, name],
    ).catch((e: any) => { throw new BadRequestException(`Could not save: ${e.message}`); });
    return { saved: true };
  }

  private async displayNameForUser(userId: string, fallback: string): Promise<string> {
    if (!userId) return fallback;
    const rows = await this.ds.query(
      `SELECT first_name AS "firstName", last_name AS "lastName" FROM users WHERE id::text = $1 LIMIT 1`,
      [userId],
    ).catch(() => []);
    const u = rows[0];
    const name = u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() : '';
    return name || fallback;
  }

  // Printable RANKING for a single learning area: every learner in the stream ranked
  // high→low for one subject, showing raw score, percentage and CBC performance level.
  // For subject teachers who want a per-area ranked list.
  @Get('area-ranking/html')
  async areaRankingHtml(@Request() req: any, @Query() q: any, @Res() res: any) {
    const tenantId = req.user.tenantId;
    const { streamId, term, examId, subject, academicYear } = q;
    try {
      const stream = (await this.ds.query(
        `SELECT s.name, s.grade_level AS "gradeLevel",
                (SELECT name FROM schools WHERE tenant_id = s.tenant_id LIMIT 1) AS "schoolName",
                (SELECT settings->>'badgeBase64' FROM schools WHERE tenant_id = s.tenant_id LIMIT 1) AS "logo",
                (SELECT settings->>'phone'   FROM schools WHERE tenant_id = s.tenant_id LIMIT 1) AS "schoolPhone",
                (SELECT settings->>'email'   FROM schools WHERE tenant_id = s.tenant_id LIMIT 1) AS "schoolEmail",
                (SELECT settings->>'address' FROM schools WHERE tenant_id = s.tenant_id LIMIT 1) AS "schoolAddress",
                (SELECT settings->>'motto'   FROM schools WHERE tenant_id = s.tenant_id LIMIT 1) AS "schoolMotto"
           FROM streams s WHERE s.id::text = $1 AND s.tenant_id::text = $2 LIMIT 1`,
        [streamId, tenantId],
      ).catch(() => []))[0] || {};
      const examName = examId
        ? ((await this.ds.query(`SELECT name FROM exams WHERE id::text = $1 AND tenant_id::text = $2 AND deleted_at IS NULL LIMIT 1`, [examId, tenantId]).catch(() => []))[0]?.name || '')
        : '';
      const rows = await this.ds.query(
        `SELECT ar.learner_id AS "learnerId", l.first_name AS "firstName", l.last_name AS "lastName",
                l.admission_number AS "adm", ar.raw_score AS "raw", ar.max_score AS "max"
           FROM assessment_results ar
           LEFT JOIN learners l ON l.id::text = ar.learner_id::text
          WHERE ar.tenant_id::text = $1 AND ar.stream_id::text = $2 AND ar.subject = $3
            AND ($4::text IS NULL OR ar.term = $4)
            AND ($5::text IS NULL OR ar.exam_id::text = $5)
            AND ar.deleted_at IS NULL`,
        [tenantId, streamId, subject, term || null, examId || null],
      ).catch(() => []);

      const senior = ['grade_7','grade_8','grade_9','grade_10','grade_11','grade_12'].includes(stream.gradeLevel || '');
      const lvl = (p: number) => senior
        ? (p>=90?'EE1':p>=75?'EE2':p>=58?'ME1':p>=41?'ME2':p>=31?'AE1':p>=21?'AE2':p>=11?'BE1':'BE2')
        : (p>=76?'EE':p>=51?'ME':p>=26?'AE':'BE');

      // A subject with Paper 1 & Paper 2 has TWO rows for the same learner here — combine
      // them into one raw/max total before ranking, otherwise the same learner would
      // appear twice in the ranking, each row showing only one incomplete paper.
      const paperCfgRows = await this.ds.query(
        `SELECT paper_count AS "paperCount", paper1_max AS "paper1Max", paper2_max AS "paper2Max", tenant_id AS "tenantId"
           FROM subject_paper_config
          WHERE grade_level = $1 AND learning_area = $2 AND (tenant_id IS NULL OR tenant_id::text = $3)`,
        [stream.gradeLevel || '', subject, tenantId],
      ).catch(() => []);
      const cfg = paperCfgRows.find((r: any) => r.tenantId) || paperCfgRows.find((r: any) => !r.tenantId);
      const configuredMax = (cfg && cfg.paperCount >= 2 && cfg.paper1Max && cfg.paper2Max)
        ? Number(cfg.paper1Max) + Number(cfg.paper2Max) : 0;

      const combos: Record<string, { firstName: string; lastName: string; adm: string; rawSum: number; maxSum: number; any: boolean }> = {};
      for (const r of rows) {
        const c = (combos[r.learnerId] ||= { firstName: r.firstName, lastName: r.lastName, adm: r.adm, rawSum: 0, maxSum: configuredMax, any: false });
        if (r.raw != null) {
          c.rawSum += Number(r.raw); c.any = true;
          if (!configuredMax && r.max != null) c.maxSum += Number(r.max);
        }
      }

      const ranked = Object.values(combos)
        .filter((c: any) => c.any && c.maxSum > 0)
        .map((c: any) => ({ firstName: c.firstName, lastName: c.lastName, adm: c.adm, raw: c.rawSum, max: c.maxSum, pct: Math.round((c.rawSum / c.maxSum) * 100) }))
        .sort((a: any, b: any) => b.pct - a.pct);

      const esc = (s: any) => String(s ?? '').replace(/[&<>]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c] as string));
      const body = ranked.map((r: any, i: number) => `
        <tr>
          <td>${i+1}</td>
          <td style="text-align:left">${esc(`${r.firstName||''} ${r.lastName||''}`.trim())}</td>
          <td>${esc(r.adm||'')}</td>
          <td>${r.raw ?? ''}${r.max ? ` / ${r.max}` : ''}</td>
          <td>${r.pct}%</td>
          <td><b>${lvl(r.pct)}</b></td>
        </tr>`).join('');
      const logoTag = stream.logo ? `<img src="${stream.logo}" style="height:54px;width:auto;margin:0 auto 6px;display:block"/>` : '';

      const html = `<!doctype html><html><head><meta charset="utf-8"/>
        <title>${esc(subject)} ranking — ${esc(stream.name||'')}</title>
        <style>
          body{font-family:Arial,Helvetica,sans-serif;color:#1a2e5a;padding:24px}
          .h{text-align:center;margin-bottom:14px}
          h1{font-size:18px;margin:0}h2{font-size:13px;font-weight:normal;color:#555;margin:2px 0 0}
          table{width:100%;border-collapse:collapse;font-size:12px}
          th,td{border:1px solid #cfd6e4;padding:6px 8px;text-align:center}
          th{background:#1a2e5a;color:#fff}
          tr:nth-child(even) td{background:#f5f7fb}
          .f{text-align:center;margin-top:14px;font-size:10px;color:#999;font-style:italic}
          .no-print{text-align:center;margin:18px 0}@media print{.no-print{display:none}}
        </style></head><body>
        <div class="h">${logoTag}
          <h1>${esc(stream.schoolName||'ZARODA School')}</h1>
          ${[stream.schoolPhone && ('Tel: '+esc(stream.schoolPhone)), stream.schoolEmail && esc(stream.schoolEmail), stream.schoolAddress && esc(stream.schoolAddress)].filter(Boolean).length ? `<p style="font-size:11px;color:#555;margin:2px 0">${[stream.schoolPhone && ('Tel: '+esc(stream.schoolPhone)), stream.schoolEmail && esc(stream.schoolEmail), stream.schoolAddress && esc(stream.schoolAddress)].filter(Boolean).join(' · ')}</p>` : ''}
          <h2>${esc(subject)} — Ranking · ${esc(stream.name||'')} · ${esc(examName)} · ${esc((term||'').replace('term_','Term '))} · ${esc(academicYear||'')}</h2>
        </div>
        <table><thead><tr><th>Rank</th><th>Learner</th><th>Adm</th><th>Score</th><th>%</th><th>Level</th></tr></thead>
        <tbody>${body || `<tr><td colspan="6">No marks for ${esc(subject)} in this assessment.</td></tr>`}</tbody></table>
        <div class="f">Powered by ZARODA SOLUTIONS<br>Reliable. Innovative. Forward.</div>
        <div class="no-print"><button onclick="window.print()" style="background:#1a2e5a;color:#fff;border:none;padding:10px 22px;border-radius:8px;cursor:pointer">Print / Save as PDF</button></div>
        <script>window.addEventListener('load',function(){setTimeout(function(){window.print();},400);});</script>
        </body></html>`;
      res.set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.send(html);
    } catch (e: any) {
      res.status(500).send(`<p style="font-family:sans-serif">Could not build ranking: ${e?.message || 'error'}</p>`);
    }
  }

  // Printable mark list (HTML the browser prints / saves as PDF). Self-contained:
  // builds straight from assessment_results for the chosen stream/term/exam, so it
  // doesn't depend on the heavier PDF subsystem.
  @Get('mark-list/html')
  async markListHtml(@Request() req: any, @Query() q: any, @Res() res: any) {
    const tenantId = req.user.tenantId;
    const { streamId, term, examId, examType, academicYear } = q;
    try {
      const stream = (await this.ds.query(
        `SELECT s.name, s.grade_level AS "gradeLevel",
                (SELECT name FROM schools WHERE tenant_id = s.tenant_id LIMIT 1) AS "schoolName",
                (SELECT settings->>'badgeBase64' FROM schools WHERE tenant_id = s.tenant_id LIMIT 1) AS "logo",
                (SELECT settings->>'phone'   FROM schools WHERE tenant_id = s.tenant_id LIMIT 1) AS "schoolPhone",
                (SELECT settings->>'email'   FROM schools WHERE tenant_id = s.tenant_id LIMIT 1) AS "schoolEmail",
                (SELECT settings->>'address' FROM schools WHERE tenant_id = s.tenant_id LIMIT 1) AS "schoolAddress"
           FROM streams s WHERE s.id::text = $1 AND s.tenant_id::text = $2 LIMIT 1`,
        [streamId, tenantId],
      ).catch(() => []))[0] || {};

      const examName = examId
        ? ((await this.ds.query(`SELECT name FROM exams WHERE id::text = $1 AND tenant_id::text = $2 AND deleted_at IS NULL LIMIT 1`, [examId, tenantId]).catch(() => []))[0]?.name || '')
        : (examType || '');

      const rows = await this.ds.query(
        `SELECT ar.learner_id AS "learnerId", l.first_name AS "firstName", l.last_name AS "lastName",
                l.admission_number AS "adm", ar.subject, ar.raw_score AS "rawScore", ar.max_score AS "maxScore"
           FROM assessment_results ar
           LEFT JOIN learners l ON l.id::text = ar.learner_id::text
          WHERE ar.tenant_id::text = $1 AND ar.stream_id::text = $2
            AND ($3::text IS NULL OR ar.term = $3)
            AND ($4::text IS NULL OR ar.exam_id::text = $4)
            AND ar.deleted_at IS NULL
          ORDER BY l.first_name`,
        [tenantId, streamId, term || null, examId || null],
      ).catch(() => []);

      // Paper 1 & 2 combined totals (e.g. 40 + 60 = 100), configured via the Enter Marks
      // "out of" fields or the Paper 1 & 2 Setup page — the AUTHORITATIVE denominator for a
      // multi-paper subject. Without combining papers first, a subject with two rows per
      // learner (Paper 1 + Paper 2) would have its points counted TWICE below.
      const paperCfgRows = await this.ds.query(
        `SELECT learning_area AS "learningArea", paper_count AS "paperCount",
                paper1_max AS "paper1Max", paper2_max AS "paper2Max", tenant_id AS "tenantId"
           FROM subject_paper_config
          WHERE grade_level = $1 AND (tenant_id IS NULL OR tenant_id::text = $2)`,
        [stream.gradeLevel, tenantId],
      ).catch(() => []);
      const subjectCombinedMax: Record<string, number> = {};
      for (const r of paperCfgRows.filter((r: any) => !r.tenantId).concat(paperCfgRows.filter((r: any) => r.tenantId))) {
        const key = String(r.learningArea).toLowerCase();
        if (r.paperCount >= 2 && r.paper1Max && r.paper2Max) subjectCombinedMax[key] = Number(r.paper1Max) + Number(r.paper2Max);
        else delete subjectCombinedMax[key];
      }

      const senior = ['grade_7','grade_8','grade_9','grade_10','grade_11','grade_12'].includes(stream.gradeLevel || '');
      // Level code must match the grade band: 8-level (EE1…BE2) for Grade 7-12, 4-level (EE/ME/AE/BE) below.
      const lvl = (p: number) => senior
        ? (p>=90?'EE1':p>=75?'EE2':p>=58?'ME1':p>=41?'ME2':p>=31?'AE1':p>=21?'AE2':p>=11?'BE1':'BE2')
        : (p>=76?'EE':p>=51?'ME':p>=26?'AE':'BE');
      const pts = (p: number) => senior
        ? (p>=90?8:p>=75?7:p>=58?6:p>=41?5:p>=31?4:p>=21?3:p>=11?2:1)
        : (p>=76?4:p>=51?3:p>=26?2:1);

      // Authoritative column list = the seeded rubric areas for this grade (SAME as the on-screen
      // mark list), NOT just the subjects that happen to have marks. This guarantees identical
      // columns and an identical average denominator (missing marks count as a gap).
      let subjects: string[] = await getGradeLearningAreas(this.ds, stream.gradeLevel, tenantId);
      if (!subjects.length) subjects = Array.from(new Set<string>(rows.map((r: any) => String(r.subject)))).sort();
      const areaCount = subjects.length || 1;

      // A subject with Paper 1 & Paper 2 has TWO rows for the same learner (different
      // `paper` marker) — sum their raw/max before computing one percent per subject, so
      // it contributes ONE set of points, matching the on-screen mark list's aggregation.
      const combos: Record<string, Record<string, { rawSum: number; maxSum: number; any: boolean }>> = {};
      for (const r of rows) {
        const col = resolveLearningArea(r.subject, subjects);
        if (!col) continue;
        const configuredMax = subjectCombinedMax[String(r.subject || '').toLowerCase()];
        const acc = (combos[r.learnerId] ||= {});
        const c = (acc[col] ||= { rawSum: 0, maxSum: configuredMax || 0, any: false });
        if (r.rawScore != null) {
          c.rawSum += Number(r.rawScore); c.any = true;
          if (!configuredMax && r.maxScore != null) c.maxSum += Number(r.maxScore);
        }
      }

      // Pivot: learner → subject → {percent, level}; match marks onto canonical rubric columns,
      // tolerating spelling variants ("Creative Arts" vs the rubric's "Creative Activities").
      const byLearner: Record<string, any> = {};
      for (const r of rows) {
        const col = resolveLearningArea(r.subject, subjects);
        if (!col) continue;
        const L = (byLearner[r.learnerId] = byLearner[r.learnerId] || { name: `${r.firstName||''} ${r.lastName||''}`.trim(), adm: r.adm, marks: {}, points: 0, pctSum: 0, count: 0 });
        if (L.marks[col]) continue; // already combined below for this subject
        const combo = combos[r.learnerId][col];
        const percent = (combo.any && combo.maxSum > 0) ? (combo.rawSum / combo.maxSum) * 100 : null;
        if (percent != null) {
          L.marks[col] = { pct: Math.round(percent), level: lvl(percent) };
          L.points += pts(percent); L.pctSum += percent; L.count++;
        }
      }
      const maxPoints = subjects.length * (senior ? 8 : 4);
      // Total performance level = sum of each area's performance points (missing area = 0). This
      // SUM is the ranking basis, so the Points column IS the rank and can't contradict it.
      // Average % is shown for information and only breaks ties. Rank: Points → avg % → name,
      // IDENTICAL to the on-screen mark list.
      // Overall level = the points total mapped directly to a level: express the total as a
      // fraction of the max (areas × max-per-area) and map to the band scale. Same points ⇒ same
      // level, and the level always tracks the Points column. Identical to the on-screen list.
      const maxTotal = Math.max(1, areaCount * (senior ? 8 : 4));
      const levelFromTotal = (total: number) => {
        const p = (total / maxTotal) * 100;
        return senior
          ? (p>=90?'EE1':p>=75?'EE2':p>=58?'ME1':p>=41?'ME2':p>=31?'AE1':p>=21?'AE2':p>=11?'BE1':'BE2')
          : (p>=76?'EE':p>=51?'ME':p>=26?'AE':'BE');
      };
      const learners = Object.values(byLearner).map((L: any) => {
        L.avgPctExact = L.pctSum / areaCount;                 // precise, for tie-break + display
        L.avgPct = Math.round(L.avgPctExact);                 // rounded, for display
        L.avgLevel = L.count ? levelFromTotal(L.points) : '';
        return L;
      }).sort((a: any, b: any) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.avgPctExact !== a.avgPctExact) return b.avgPctExact - a.avgPctExact;
        return String(a.name||'').localeCompare(String(b.name||''));
      });

      const esc = (s: any) => String(s ?? '').replace(/[&<>]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c] as string));
      const head = subjects.map(s => `<th>${esc(s)}</th>`).join('');
      const body = learners.map((L: any, i: number) => `
        <tr>
          <td>${i+1}</td><td style="text-align:left">${esc(L.name)}</td><td>${esc(L.adm||'')}</td>
          ${subjects.map(s => { const m = L.marks[s]; return `<td>${m ? `${m.pct}% <b>${m.level}</b>` : '-'}</td>`; }).join('')}
          <td><b>${L.points}/${maxPoints}</b></td>
          <td><b>${L.count ? esc(L.avgLevel) : '-'}</b></td>
        </tr>`).join('');

      const logoTag = stream.logo ? `<img src="${stream.logo}" style="height:54px;width:auto;margin:0 auto 6px;display:block"/>` : '';
      const html = `<!doctype html><html><head><meta charset="utf-8"/>
        <title>Mark List — ${esc(stream.name||'')}</title>
        <style>
          body{font-family:Arial,Helvetica,sans-serif;color:#1a2e5a;padding:24px}
          .ml-head{text-align:center;margin-bottom:14px}
          h1{font-size:18px;margin:0}h2{font-size:13px;font-weight:normal;color:#555;margin:2px 0 0}
          table{width:100%;border-collapse:collapse;font-size:11px}
          th,td{border:1px solid #cfd6e4;padding:5px 6px;text-align:center}
          th{background:#1a2e5a;color:#fff}td{text-align:center}
          tr:nth-child(even) td{background:#f5f7fb}
          .ml-foot{text-align:center;margin-top:14px;font-size:10px;color:#888;font-style:italic}
          .no-print{text-align:center;margin:18px 0}
          @media print{.no-print{display:none}}
        </style></head><body>
        <div class="ml-head">
          ${logoTag}
          <h1>${esc(stream.schoolName||'ZARODA School')}</h1>
          ${[stream.schoolPhone && ('Tel: '+esc(stream.schoolPhone)), stream.schoolEmail && esc(stream.schoolEmail), stream.schoolAddress && esc(stream.schoolAddress)].filter(Boolean).length ? `<p style="font-size:11px;color:#555;margin:2px 0">${[stream.schoolPhone && ('Tel: '+esc(stream.schoolPhone)), stream.schoolEmail && esc(stream.schoolEmail), stream.schoolAddress && esc(stream.schoolAddress)].filter(Boolean).join(' · ')}</p>` : ''}
          <h2>Mark List — ${esc(stream.name||'')} · ${esc(examName)} · ${esc((term||'').replace('term_','Term '))} · ${esc(academicYear||'')}</h2>
        </div>
        <table><thead><tr><th>#</th><th>Learner</th><th>Adm</th>${head}<th>Points<br/><span style="font-weight:400;font-size:9px">out of ${maxPoints}</span></th><th>Level</th></tr></thead>
        <tbody>${body || `<tr><td colspan="${subjects.length+5}">No marks found for this assessment.</td></tr>`}</tbody></table>
        <div class="ml-foot">Powered by ZARODA SOLUTIONS<br>Reliable. Innovative. Forward.</div>
        <div class="no-print"><button onclick="window.print()" style="background:#1a2e5a;color:#fff;border:none;padding:10px 22px;border-radius:8px;cursor:pointer">Print / Save as PDF</button></div>
        <script>window.addEventListener('load',function(){setTimeout(function(){window.print();},400);});</script>
        </body></html>`;
      res.set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.send(html);
    } catch (e: any) {
      res.status(500).send(`<p style="font-family:sans-serif">Could not build mark list: ${e?.message || 'error'}</p>`);
    }
  }

  // Printable GRADE-LEVEL mark list: pools EVERY stream sharing a grade level (e.g.
  // "Grade 4 North" + "Grade 4 South") into ONE ranking, so a learner's position reflects
  // where they stand against the whole grade, not just their own stream. Pass examId to
  // rank on one assessment (mirrors the single-stream mark-list above); omit it to rank on
  // the term average across every assessment entered this term (mirrors the average mark
  // list below) — either way every stream in the grade is pooled together. A Stream column
  // shows which class each learner belongs to since the list spans more than one.
  @Get('grade-mark-list/html')
  async gradeMarkListHtml(@Request() req: any, @Query() q: any, @Res() res: any) {
    const tenantId = req.user.tenantId;
    const { gradeLevel, term, examId, academicYear } = q;
    if (!gradeLevel) { res.status(400).send('<p style="font-family:sans-serif">gradeLevel is required.</p>'); return; }
    try {
      const meta = (await this.ds.query(
        `SELECT
                (SELECT name FROM schools WHERE tenant_id = $1 LIMIT 1) AS "schoolName",
                (SELECT settings->>'badgeBase64' FROM schools WHERE tenant_id = $1 LIMIT 1) AS "logo",
                (SELECT settings->>'phone'   FROM schools WHERE tenant_id = $1 LIMIT 1) AS "schoolPhone",
                (SELECT settings->>'email'   FROM schools WHERE tenant_id = $1 LIMIT 1) AS "schoolEmail",
                (SELECT settings->>'address' FROM schools WHERE tenant_id = $1 LIMIT 1) AS "schoolAddress"`,
        [tenantId],
      ).catch(() => []))[0] || {};
      const streamRows = await this.ds.query(
        `SELECT id, name FROM streams WHERE tenant_id::text = $1 AND grade_level = $2`,
        [tenantId, gradeLevel],
      ).catch(() => []);
      const streamNameById: Record<string, string> = {};
      streamRows.forEach((s: any) => { streamNameById[s.id] = s.name; });

      const examName = examId
        ? ((await this.ds.query(`SELECT name FROM exams WHERE id::text = $1 AND tenant_id::text = $2 AND deleted_at IS NULL LIMIT 1`, [examId, tenantId]).catch(() => []))[0]?.name || '')
        : 'Term Average';

      // Pool marks across EVERY stream in this grade — the only difference from the
      // single-stream endpoints is filtering by s.grade_level instead of one stream_id.
      const rows = await this.ds.query(
        `SELECT ar.learner_id AS "learnerId", l.first_name AS "firstName", l.last_name AS "lastName",
                l.admission_number AS "adm", ar.stream_id AS "streamId", ar.subject, ar.exam_id AS "examId",
                ar.raw_score AS "rawScore", ar.max_score AS "maxScore"
           FROM assessment_results ar
           JOIN streams s ON s.id::text = ar.stream_id::text
           LEFT JOIN learners l ON l.id::text = ar.learner_id::text
          WHERE ar.tenant_id::text = $1 AND s.grade_level = $2
            AND ($3::text IS NULL OR ar.term = $3)
            AND ($4::text IS NULL OR ar.exam_id::text = $4)
            AND ar.deleted_at IS NULL`,
        [tenantId, gradeLevel, term || null, examId || null],
      ).catch(() => []);

      const paperCfgRows = await this.ds.query(
        `SELECT learning_area AS "learningArea", paper_count AS "paperCount",
                paper1_max AS "paper1Max", paper2_max AS "paper2Max", tenant_id AS "tenantId"
           FROM subject_paper_config
          WHERE grade_level = $1 AND (tenant_id IS NULL OR tenant_id::text = $2)`,
        [gradeLevel, tenantId],
      ).catch(() => []);
      const subjectCombinedMax: Record<string, number> = {};
      for (const r of paperCfgRows.filter((r: any) => !r.tenantId).concat(paperCfgRows.filter((r: any) => r.tenantId))) {
        const key = String(r.learningArea).toLowerCase();
        if (r.paperCount >= 2 && r.paper1Max && r.paper2Max) subjectCombinedMax[key] = Number(r.paper1Max) + Number(r.paper2Max);
        else delete subjectCombinedMax[key];
      }

      const senior = ['grade_7','grade_8','grade_9','grade_10','grade_11','grade_12'].includes(gradeLevel || '');
      const lvl = (p: number) => senior
        ? (p>=90?'EE1':p>=75?'EE2':p>=58?'ME1':p>=41?'ME2':p>=31?'AE1':p>=21?'AE2':p>=11?'BE1':'BE2')
        : (p>=76?'EE':p>=51?'ME':p>=26?'AE':'BE');
      const pts = (p: number) => senior
        ? (p>=90?8:p>=75?7:p>=58?6:p>=41?5:p>=31?4:p>=21?3:p>=11?2:1)
        : (p>=76?4:p>=51?3:p>=26?2:1);

      let subjects: string[] = await getGradeLearningAreas(this.ds, gradeLevel, tenantId);
      if (!subjects.length) subjects = Array.from(new Set<string>(rows.map((r: any) => String(r.subject)))).sort();
      const areaCount = subjects.length || 1;
      const maxPoints = subjects.length * (senior ? 8 : 4);

      // learner -> subject -> examId -> combined {rawSum, maxSum, any}. When examId was
      // supplied, every row already belongs to that one exam; when it wasn't, this groups
      // by whichever exams the learner actually sat, exactly like the average mark list.
      const combos: Record<string, Record<string, Record<string, { rawSum: number; maxSum: number; any: boolean }>>> = {};
      const names: Record<string, { name: string; adm: string; streamName: string }> = {};
      for (const r of rows) {
        const col = resolveLearningArea(r.subject, subjects);
        if (!col) continue;
        names[r.learnerId] ||= { name: `${r.firstName||''} ${r.lastName||''}`.trim(), adm: r.adm, streamName: streamNameById[r.streamId] || '' };
        const examKey = r.examId || 'x';
        const configuredMax = subjectCombinedMax[String(r.subject || '').toLowerCase()];
        const byArea = (combos[r.learnerId] ||= {});
        const byExam = (byArea[col] ||= {});
        const c = (byExam[examKey] ||= { rawSum: 0, maxSum: configuredMax || 0, any: false });
        if (r.rawScore != null) {
          c.rawSum += Number(r.rawScore); c.any = true;
          if (!configuredMax && r.maxScore != null) c.maxSum += Number(r.maxScore);
        }
      }

      const byLearner: Record<string, any> = {};
      for (const learnerId of Object.keys(combos)) {
        const L = (byLearner[learnerId] = { name: names[learnerId].name, adm: names[learnerId].adm, streamName: names[learnerId].streamName, marks: {} as Record<string, any>, points: 0, pctSum: 0, count: 0 });
        for (const col of subjects) {
          const byExam = combos[learnerId][col];
          if (!byExam) continue;
          const examPercents = Object.values(byExam)
            .filter((c: any) => c.any && c.maxSum > 0)
            .map((c: any) => (c.rawSum / c.maxSum) * 100);
          if (!examPercents.length) continue;
          const avg = Math.round(examPercents.reduce((a, b) => a + b, 0) / examPercents.length);
          L.marks[col] = { pct: avg, level: lvl(avg) };
          L.points += pts(avg); L.pctSum += avg; L.count++;
        }
      }
      const maxTotal = Math.max(1, areaCount * (senior ? 8 : 4));
      const levelFromTotal = (total: number) => {
        const p = (total / maxTotal) * 100;
        return senior
          ? (p>=90?'EE1':p>=75?'EE2':p>=58?'ME1':p>=41?'ME2':p>=31?'AE1':p>=21?'AE2':p>=11?'BE1':'BE2')
          : (p>=76?'EE':p>=51?'ME':p>=26?'AE':'BE');
      };
      const learners = Object.values(byLearner).map((L: any) => {
        L.avgPctExact = L.pctSum / areaCount;
        L.avgPct = Math.round(L.avgPctExact);
        L.avgLevel = L.count ? levelFromTotal(L.points) : '';
        return L;
      }).sort((a: any, b: any) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.avgPctExact !== a.avgPctExact) return b.avgPctExact - a.avgPctExact;
        return String(a.name||'').localeCompare(String(b.name||''));
      });

      const esc = (s: any) => String(s ?? '').replace(/[&<>]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c] as string));
      const head = subjects.map(s => `<th>${esc(s)}</th>`).join('');
      const body = learners.map((L: any, i: number) => `
        <tr>
          <td>${i+1}</td><td style="text-align:left">${esc(L.name)}</td><td>${esc(L.adm||'')}</td><td>${esc(L.streamName)}</td>
          ${subjects.map(s => { const m = L.marks[s]; return `<td>${m ? `${m.pct}% <b>${m.level}</b>` : '-'}</td>`; }).join('')}
          <td><b>${L.points}/${maxPoints}</b></td>
          <td><b>${L.count ? esc(L.avgLevel) : '-'}</b></td>
        </tr>`).join('');

      const gradeLabel = String(gradeLevel).replace('grade_', 'Grade ').replace(/^./, (c: string) => c.toUpperCase());
      const html = `<!doctype html><html><head><meta charset="utf-8"/>
        <title>Grade Mark List — ${esc(gradeLabel)}</title>
        <style>
          body{font-family:Arial,Helvetica,sans-serif;color:#1a2e5a;padding:24px}
          .ml-head{text-align:center;margin-bottom:14px}
          h1{font-size:18px;margin:0}h2{font-size:13px;font-weight:normal;color:#555;margin:2px 0 0}
          table{width:100%;border-collapse:collapse;font-size:11px}
          th,td{border:1px solid #cfd6e4;padding:5px 6px;text-align:center}
          th{background:#1a2e5a;color:#fff}td{text-align:center}
          tr:nth-child(even) td{background:#f5f7fb}
          .ml-foot{text-align:center;margin-top:14px;font-size:10px;color:#888;font-style:italic}
          .ml-note{text-align:center;margin-top:8px;font-size:10px;color:#b3261e}
          .no-print{text-align:center;margin:18px 0}
          @media print{.no-print{display:none}}
        </style></head><body>
        <div class="ml-head">
          <h1>${esc(meta.schoolName||'ZARODA School')}</h1>
          ${[meta.schoolPhone && ('Tel: '+esc(meta.schoolPhone)), meta.schoolEmail && esc(meta.schoolEmail), meta.schoolAddress && esc(meta.schoolAddress)].filter(Boolean).length ? `<p style="font-size:11px;color:#555;margin:2px 0">${[meta.schoolPhone && ('Tel: '+esc(meta.schoolPhone)), meta.schoolEmail && esc(meta.schoolEmail), meta.schoolAddress && esc(meta.schoolAddress)].filter(Boolean).join(' · ')}</p>` : ''}
          <h2>Grade Mark List — ${esc(gradeLabel)} (${esc(String(streamRows.length))} stream${streamRows.length===1?'':'s'} combined) · ${esc(examName)} · ${esc((term||'').replace('term_','Term '))} · ${esc(academicYear||'')}</h2>
        </div>
        <table><thead><tr><th>#</th><th>Learner</th><th>Adm</th><th>Stream</th>${head}<th>Points<br/><span style="font-weight:400;font-size:9px">out of ${maxPoints}</span></th><th>Level</th></tr></thead>
        <tbody>${body || `<tr><td colspan="${subjects.length+6}">No marks found for this grade &amp; term.</td></tr>`}</tbody></table>
        <div class="ml-note">Ranking basis: every stream in ${esc(gradeLabel)} pooled together — position reflects standing across the WHOLE grade, not one stream.</div>
        <div class="ml-foot">Powered by ZARODA SOLUTIONS<br>Reliable. Innovative. Forward.</div>
        <div class="no-print"><button onclick="window.print()" style="background:#1a2e5a;color:#fff;border:none;padding:10px 22px;border-radius:8px;cursor:pointer">Print / Save as PDF</button></div>
        <script>window.addEventListener('load',function(){setTimeout(function(){window.print();},400);});</script>
        </body></html>`;
      res.set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.send(html);
    } catch (e: any) {
      res.status(500).send(`<p style="font-family:sans-serif">Could not build grade mark list: ${e?.message || 'error'}</p>`);
    }
  }

  // Printable TERM AVERAGE mark list: ranks the whole stream on each subject's average
  // percent across EVERY assessment entered this term (Mid Term, End Term, CATs — same
  // basis the report card's "Term Average" / points total already uses), so this list
  // and the report cards issued to learners always agree on position and points, unlike
  // the single-exam mark list above which only reflects one assessment.
  @Get('average-mark-list/html')
  async averageMarkListHtml(@Request() req: any, @Query() q: any, @Res() res: any) {
    const tenantId = req.user.tenantId;
    const { streamId, term, academicYear } = q;
    try {
      const stream = (await this.ds.query(
        `SELECT s.name, s.grade_level AS "gradeLevel",
                (SELECT name FROM schools WHERE tenant_id = s.tenant_id LIMIT 1) AS "schoolName",
                (SELECT settings->>'badgeBase64' FROM schools WHERE tenant_id = s.tenant_id LIMIT 1) AS "logo",
                (SELECT settings->>'phone'   FROM schools WHERE tenant_id = s.tenant_id LIMIT 1) AS "schoolPhone",
                (SELECT settings->>'email'   FROM schools WHERE tenant_id = s.tenant_id LIMIT 1) AS "schoolEmail",
                (SELECT settings->>'address' FROM schools WHERE tenant_id = s.tenant_id LIMIT 1) AS "schoolAddress"
           FROM streams s WHERE s.id::text = $1 AND s.tenant_id::text = $2 LIMIT 1`,
        [streamId, tenantId],
      ).catch(() => []))[0] || {};

      // Every assessment result for the class this term, across ALL exams — no examId
      // filter — mirroring exactly what buildReportCardHtml averages per learner.
      const rows = await this.ds.query(
        `SELECT ar.learner_id AS "learnerId", l.first_name AS "firstName", l.last_name AS "lastName",
                l.admission_number AS "adm", ar.subject, ar.exam_id AS "examId",
                ar.raw_score AS "rawScore", ar.max_score AS "maxScore"
           FROM assessment_results ar
           LEFT JOIN learners l ON l.id::text = ar.learner_id::text
          WHERE ar.tenant_id::text = $1 AND ar.stream_id::text = $2
            AND ($3::text IS NULL OR ar.term = $3)
            AND ar.deleted_at IS NULL`,
        [tenantId, streamId, term || null],
      ).catch(() => []);

      const paperCfgRows = await this.ds.query(
        `SELECT learning_area AS "learningArea", paper_count AS "paperCount",
                paper1_max AS "paper1Max", paper2_max AS "paper2Max", tenant_id AS "tenantId"
           FROM subject_paper_config
          WHERE grade_level = $1 AND (tenant_id IS NULL OR tenant_id::text = $2)`,
        [stream.gradeLevel, tenantId],
      ).catch(() => []);
      const subjectCombinedMax: Record<string, number> = {};
      for (const r of paperCfgRows.filter((r: any) => !r.tenantId).concat(paperCfgRows.filter((r: any) => r.tenantId))) {
        const key = String(r.learningArea).toLowerCase();
        if (r.paperCount >= 2 && r.paper1Max && r.paper2Max) subjectCombinedMax[key] = Number(r.paper1Max) + Number(r.paper2Max);
        else delete subjectCombinedMax[key];
      }

      const senior = ['grade_7','grade_8','grade_9','grade_10','grade_11','grade_12'].includes(stream.gradeLevel || '');
      const lvl = (p: number) => senior
        ? (p>=90?'EE1':p>=75?'EE2':p>=58?'ME1':p>=41?'ME2':p>=31?'AE1':p>=21?'AE2':p>=11?'BE1':'BE2')
        : (p>=76?'EE':p>=51?'ME':p>=26?'AE':'BE');
      const pts = (p: number) => senior
        ? (p>=90?8:p>=75?7:p>=58?6:p>=41?5:p>=31?4:p>=21?3:p>=11?2:1)
        : (p>=76?4:p>=51?3:p>=26?2:1);

      let subjects: string[] = await getGradeLearningAreas(this.ds, stream.gradeLevel, tenantId);
      if (!subjects.length) subjects = Array.from(new Set<string>(rows.map((r: any) => String(r.subject)))).sort();
      const areaCount = subjects.length || 1;
      const maxPoints = subjects.length * (senior ? 8 : 4);

      // learner -> subject -> examId -> combined {rawSum, maxSum, any} — combine Paper 1 &
      // Paper 2 rows for the SAME exam first, exactly like the single-exam mark list.
      const combos: Record<string, Record<string, Record<string, { rawSum: number; maxSum: number; any: boolean }>>> = {};
      const names: Record<string, { name: string; adm: string }> = {};
      for (const r of rows) {
        const col = resolveLearningArea(r.subject, subjects);
        if (!col) continue;
        names[r.learnerId] ||= { name: `${r.firstName||''} ${r.lastName||''}`.trim(), adm: r.adm };
        const examKey = r.examId || 'x';
        const configuredMax = subjectCombinedMax[String(r.subject || '').toLowerCase()];
        const byArea = (combos[r.learnerId] ||= {});
        const byExam = (byArea[col] ||= {});
        const c = (byExam[examKey] ||= { rawSum: 0, maxSum: configuredMax || 0, any: false });
        if (r.rawScore != null) {
          c.rawSum += Number(r.rawScore); c.any = true;
          if (!configuredMax && r.maxScore != null) c.maxSum += Number(r.maxScore);
        }
      }

      // Average each subject's per-exam percents into ONE term-average percent per
      // learner per subject — the same figure the report card's Term Average column shows.
      const byLearner: Record<string, any> = {};
      for (const learnerId of Object.keys(combos)) {
        const L = (byLearner[learnerId] = { name: names[learnerId].name, adm: names[learnerId].adm, marks: {} as Record<string, any>, points: 0, pctSum: 0, count: 0 });
        for (const col of subjects) {
          const byExam = combos[learnerId][col];
          if (!byExam) continue;
          const examPercents = Object.values(byExam)
            .filter((c: any) => c.any && c.maxSum > 0)
            .map((c: any) => (c.rawSum / c.maxSum) * 100);
          if (!examPercents.length) continue;
          const avg = Math.round(examPercents.reduce((a, b) => a + b, 0) / examPercents.length);
          L.marks[col] = { pct: avg, level: lvl(avg) };
          L.points += pts(avg); L.pctSum += avg; L.count++;
        }
      }
      const maxTotal = Math.max(1, areaCount * (senior ? 8 : 4));
      const levelFromTotal = (total: number) => {
        const p = (total / maxTotal) * 100;
        return senior
          ? (p>=90?'EE1':p>=75?'EE2':p>=58?'ME1':p>=41?'ME2':p>=31?'AE1':p>=21?'AE2':p>=11?'BE1':'BE2')
          : (p>=76?'EE':p>=51?'ME':p>=26?'AE':'BE');
      };
      const learners = Object.values(byLearner).map((L: any) => {
        L.avgPctExact = L.pctSum / areaCount;
        L.avgPct = Math.round(L.avgPctExact);
        L.avgLevel = L.count ? levelFromTotal(L.points) : '';
        return L;
      }).sort((a: any, b: any) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.avgPctExact !== a.avgPctExact) return b.avgPctExact - a.avgPctExact;
        return String(a.name||'').localeCompare(String(b.name||''));
      });

      const esc = (s: any) => String(s ?? '').replace(/[&<>]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c] as string));
      const head = subjects.map(s => `<th>${esc(s)}</th>`).join('');
      const body = learners.map((L: any, i: number) => `
        <tr>
          <td>${i+1}</td><td style="text-align:left">${esc(L.name)}</td><td>${esc(L.adm||'')}</td>
          ${subjects.map(s => { const m = L.marks[s]; return `<td>${m ? `${m.pct}% <b>${m.level}</b>` : '-'}</td>`; }).join('')}
          <td><b>${L.points}/${maxPoints}</b></td>
          <td><b>${L.count ? esc(L.avgLevel) : '-'}</b></td>
        </tr>`).join('');

      const logoTag = stream.logo ? `<img src="${stream.logo}" style="height:54px;width:auto;margin:0 auto 6px;display:block"/>` : '';
      const html = `<!doctype html><html><head><meta charset="utf-8"/>
        <title>Term Average Mark List — ${esc(stream.name||'')}</title>
        <style>
          body{font-family:Arial,Helvetica,sans-serif;color:#1a2e5a;padding:24px}
          .ml-head{text-align:center;margin-bottom:14px}
          h1{font-size:18px;margin:0}h2{font-size:13px;font-weight:normal;color:#555;margin:2px 0 0}
          table{width:100%;border-collapse:collapse;font-size:11px}
          th,td{border:1px solid #cfd6e4;padding:5px 6px;text-align:center}
          th{background:#1a2e5a;color:#fff}td{text-align:center}
          tr:nth-child(even) td{background:#f5f7fb}
          .ml-foot{text-align:center;margin-top:14px;font-size:10px;color:#888;font-style:italic}
          .ml-note{text-align:center;margin-top:8px;font-size:10px;color:#b3261e}
          .no-print{text-align:center;margin:18px 0}
          @media print{.no-print{display:none}}
        </style></head><body>
        <div class="ml-head">
          ${logoTag}
          <h1>${esc(stream.schoolName||'ZARODA School')}</h1>
          ${[stream.schoolPhone && ('Tel: '+esc(stream.schoolPhone)), stream.schoolEmail && esc(stream.schoolEmail), stream.schoolAddress && esc(stream.schoolAddress)].filter(Boolean).length ? `<p style="font-size:11px;color:#555;margin:2px 0">${[stream.schoolPhone && ('Tel: '+esc(stream.schoolPhone)), stream.schoolEmail && esc(stream.schoolEmail), stream.schoolAddress && esc(stream.schoolAddress)].filter(Boolean).join(' · ')}</p>` : ''}
          <h2>Term Average Mark List — ${esc(stream.name||'')} · ${esc((term||'').replace('term_','Term '))} · ${esc(academicYear||'')}</h2>
        </div>
        <table><thead><tr><th>#</th><th>Learner</th><th>Adm</th>${head}<th>Points<br/><span style="font-weight:400;font-size:9px">out of ${maxPoints}</span></th><th>Level</th></tr></thead>
        <tbody>${body || `<tr><td colspan="${subjects.length+5}">No marks found for this term.</td></tr>`}</tbody></table>
        <div class="ml-note">Ranking basis: average % per subject across every assessment entered this term — the SAME basis used for the report card's Term Average and Points total.</div>
        <div class="ml-foot">Powered by ZARODA SOLUTIONS<br>Reliable. Innovative. Forward.</div>
        <div class="no-print"><button onclick="window.print()" style="background:#1a2e5a;color:#fff;border:none;padding:10px 22px;border-radius:8px;cursor:pointer">Print / Save as PDF</button></div>
        <script>window.addEventListener('load',function(){setTimeout(function(){window.print();},400);});</script>
        </body></html>`;
      res.set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.send(html);
    } catch (e: any) {
      res.status(500).send(`<p style="font-family:sans-serif">Could not build term average mark list: ${e?.message || 'error'}</p>`);
    }
  }

  @Get('report-card/:learnerId')
  getReportCard(@Param('learnerId') id: string) {
    return { message: 'PDF generation — requires Puppeteer. Run: npm install puppeteer' };
  }

  // Printable single report card (HTML → browser print / save as PDF). Self-contained:
  // builds from assessment_results for the learner across the term, averaging each
  // learning area's percentage across that term's assessments to a CBC level + points.
  @Get('report-card/:learnerId/html')
  async reportCardHtml(@Param('learnerId') learnerId: string, @Request() req: any, @Query() q: any, @Res() res: any) {
    try {
      // Parents may only view their OWN child's report card. Verify the learner's
      // guardian_email matches the requesting parent's account email.
      if (req.user?.role === 'parent') {
        const ok = await this.ds.query(
          `SELECT 1 FROM learners WHERE id::text = $1 AND tenant_id::text = $2
              AND LOWER(guardian_email) = LOWER($3) LIMIT 1`,
          [learnerId, req.user.tenantId, String(req.user.email || '')],
        ).catch(() => []);
        if (!ok.length) { res.status(403).send('<p style="font-family:sans-serif">You can only view your own child\'s report card.</p>'); return; }
      }
      let html = await this.buildReportCardHtml(req.user.tenantId, learnerId, q.term, q.academicYear || '2025/2026', true);
      if (String(q.withFeeStructure) === 'true') {
        const grade = await this.ds.query(
          `SELECT grade_level AS g FROM learners WHERE id::text = $1 LIMIT 1`, [learnerId],
        ).then((r: any[]) => r[0]?.g).catch(() => undefined);
        const fee = await this.feePageHtml(req.user.tenantId, grade, q.term, q.academicYear || '2025/2026');
        if (fee) html = html.replace(/<\/body>/i, `${fee}</body>`);
      }
      res.set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.send(html);
    } catch (e: any) {
      res.status(500).send(`<p style="font-family:sans-serif">Could not build report card: ${e?.message || 'error'}</p>`);
    }
  }

  // Printable report cards for a whole stream, one per page.
  @Get('report-cards/bulk/html')
  async bulkReportCardsHtml(@Request() req: any, @Query() q: any, @Res() res: any) {
    const tenantId = req.user.tenantId;
    const { streamId, term, academicYear } = q;
    // Bulk (whole-class) report cards are for staff only — never parents or learners.
    if (['parent', 'learner'].includes(req.user?.role)) {
      res.status(403).send('<p style="font-family:sans-serif">Not available.</p>'); return;
    }
    try {
      const learners = await this.ds.query(
        `SELECT id FROM learners WHERE tenant_id::text = $1 AND stream_id::text = $2 AND COALESCE(is_active, true) = true ORDER BY first_name`,
        [tenantId, streamId],
      ).catch(() => []);
      // Built once: every learner in a stream is billed the same structure.
      const grade = await this.ds.query(
        `SELECT grade_level AS g FROM streams WHERE id::text = $1 LIMIT 1`, [streamId],
      ).then((r: any[]) => r[0]?.g).catch(() => undefined);
      const feePage = String(q.withFeeStructure) === 'true'
        ? await this.feePageHtml(tenantId, grade, term, academicYear || '2025/2026')
        : '';

      const pages: string[] = [];
      for (const l of learners) {
        const card = await this.buildReportCardHtml(tenantId, l.id, term, academicYear || '2025/2026', false).catch(() => '');
        if (card) { pages.push(card); if (feePage) pages.push(feePage); }
      }
      const html = `<!doctype html><html><head><meta charset="utf-8"/><title>Report Cards</title>
        ${this.reportCardStyles()}
        </head><body>${pages.join('') || '<p style="font-family:sans-serif;padding:24px">No learners with marks in this class.</p>'}
        <div class="no-print" style="text-align:center;margin:18px 0"><button onclick="window.print()" style="background:#1a2e5a;color:#fff;border:none;padding:10px 22px;border-radius:8px;cursor:pointer">Print / Save as PDF</button></div>
        <script>window.addEventListener('load',function(){setTimeout(function(){window.print();},500);});</script>
        </body></html>`;
      res.set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.send(html);
    } catch (e: any) {
      res.status(500).send(`<p style="font-family:sans-serif">Could not build report cards: ${e?.message || 'error'}</p>`);
    }
  }

  /**
   * The fee structure as an extra page on a report card, when an admin asks for
   * it — end-of-year cards go home with the next year's fees on the back, which
   * is how most schools already send them. Shares the table with the Finance
   * print so a parent cannot be handed two versions that disagree.
   */
  private async feePageHtml(tenantId: string, gradeLevel?: string, term?: string, academicYear?: string) {
    const table = await feeStructureTableHtml(this.ds, tenantId, { gradeLevel, term, academicYear });
    if (!table) return '';
    const esc = (s: any) => String(s ?? '').replace(/[&<>]/g, (c: string) => ({ '&':'&amp;','<':'&lt;','>':'&gt;' }[c] || c));
    return `<div class="rc" style="page-break-before:always">
      <h2 style="text-align:center;margin:0 0 4px;font-size:17px">Fee Structure</h2>
      <p style="text-align:center;margin:0 0 12px;font-size:12px;color:#555">
        ${esc(gradeLevel ? String(gradeLevel).replace(/_/g, ' ') : 'All classes')}${academicYear ? ` · ${esc(academicYear)}` : ''}
      </p>
      ${table}
    </div>`;
  }

  private reportCardStyles(): string {
    return `<style>
      body{font-family:Arial,Helvetica,sans-serif;color:#1a2e5a;padding:0;margin:0}
      .rc{max-width:760px;margin:0 auto;padding:28px 24px;box-sizing:border-box;
          min-height:100vh;display:flex;flex-direction:column;page-break-after:always;break-after:page}
      .rc:last-child{page-break-after:auto;break-after:auto}
      .rc-head{text-align:center;border-bottom:3px solid #d4af37;padding-bottom:8px;margin-bottom:12px}
      .rc-head h1{font-size:20px;margin:0}.rc-head p{margin:2px 0;font-size:12px;color:#555}
      .rc-head img{height:60px;width:auto;margin:0 auto 6px;display:block}
      .rc-meta{display:flex;justify-content:space-between;font-size:12px;margin:10px 0}
      table{width:100%;border-collapse:collapse;font-size:12px}
      th,td{border:1px solid #cfd6e4;padding:6px 8px}th{background:#1a2e5a;color:#fff;text-align:left}
      td.c,th.c{text-align:center}
      tr:nth-child(even) td{background:#f5f7fb}
      .rc-total{margin-top:10px;font-size:13px;font-weight:bold}
      .rc-comment{margin-top:12px;border-left:3px solid #d4af37;padding:6px 10px;background:#fafafa}
      .rc-comment-label{font-size:10px;font-weight:700;text-transform:uppercase;color:#1a2e5a;letter-spacing:.04em}
      .rc-comment-text{font-size:12px;color:#333;margin-top:2px;line-height:1.45}
      .rc-dates{margin-top:12px;display:flex;gap:24px;font-size:12px;border-top:1px dashed #ccc;padding-top:8px}
      .rc-fee{margin-top:10px;display:flex;gap:20px;align-items:center;font-size:12px;padding:8px 12px;border-radius:8px;flex-wrap:wrap}
      .rc-fee-due{background:#fdf3f2;border:1px solid #f3c9c4}
      .rc-fee-clear{background:#f1faf3;border:1px solid #c7e9d2}
      .rc-fee-bal{margin-left:auto}
      .rc-fee-due .rc-fee-bal{color:#b3261e}
      .rc-fee-clear .rc-fee-bal{color:#1a7f3c}
      .rc-foot{margin-top:18px;font-size:12px;display:flex;justify-content:space-between}
      .rc-powered{margin-top:auto;padding-top:16px;text-align:center;font-size:10px;color:#999;font-style:italic}
      @media print{
        .no-print{display:none}
        .rc{min-height:auto;height:100vh}
      }
      @page{size:A4;margin:12mm}
    </style>`;
  }

  // Builds one learner's report-card HTML. `standalone` wraps it as a full printable
  // document; otherwise returns just the card block (for bulk).
  private async buildReportCardHtml(tenantId: string, learnerId: string, term: string, academicYear: string, standalone: boolean): Promise<string> {
    const lr = (await this.ds.query(
      `SELECT l.first_name AS "firstName", l.last_name AS "lastName", l.admission_number AS "adm",
              COALESCE(NULLIF(l.grade_level, ''), s.grade_level) AS "gradeLevel",
              s.name AS "streamName",
              (SELECT name FROM schools WHERE tenant_id = l.tenant_id LIMIT 1) AS "schoolName",
              (SELECT settings->>'badgeBase64' FROM schools WHERE tenant_id = l.tenant_id LIMIT 1) AS "logo",
              (SELECT settings->>'phone'   FROM schools WHERE tenant_id = l.tenant_id LIMIT 1) AS "schoolPhone",
              (SELECT settings->>'email'   FROM schools WHERE tenant_id = l.tenant_id LIMIT 1) AS "schoolEmail",
              (SELECT settings->>'address' FROM schools WHERE tenant_id = l.tenant_id LIMIT 1) AS "schoolAddress",
              (SELECT settings->>'motto'   FROM schools WHERE tenant_id = l.tenant_id LIMIT 1) AS "schoolMotto"
         FROM learners l LEFT JOIN streams s ON s.id::text = l.stream_id::text
        WHERE l.id::text = $1 AND l.tenant_id::text = $2 LIMIT 1`,
      [learnerId, tenantId],
    ).catch(() => []))[0];
    if (!lr) throw new Error('Learner not found');

    await this.ensureReportCardSettingsTable();
    const settingsRows = await this.ds.query(
      `SELECT show_performance_levels AS "showPerformanceLevels", show_points_total AS "showPointsTotal"
         FROM tenant_report_card_settings WHERE tenant_id::text = $1`,
      [tenantId],
    ).catch(() => []);
    const rcSettings = settingsRows[0] || { showPerformanceLevels: true, showPointsTotal: true };
    const remarkRows = await this.ds.query(
      `SELECT teacher_remark AS "teacherRemark", hoi_remark AS "hoiRemark"
         FROM report_card_remarks WHERE tenant_id::text = $1 AND learner_id::text = $2 AND term = $3 AND academic_year = $4`,
      [tenantId, learnerId, term || '', academicYear || ''],
    ).catch(() => []);
    const remarkOverride = remarkRows[0] || null;

    const senior = ['grade_7','grade_8','grade_9','grade_10','grade_11','grade_12'].includes(lr.gradeLevel || '');
    const lvl = (p: number) => senior
      ? (p>=90?'EE1':p>=75?'EE2':p>=58?'ME1':p>=41?'ME2':p>=31?'AE1':p>=21?'AE2':p>=11?'BE1':'BE2')
      : (p>=76?'EE':p>=51?'ME':p>=26?'AE':'BE');
    const pts = (p: number) => senior
      ? (p>=90?8:p>=75?7:p>=58?6:p>=41?5:p>=31?4:p>=21?3:p>=11?2:1)
      : (p>=76?4:p>=51?3:p>=26?2:1);

    // Assessments in this term (each becomes a column, e.g. Mid Term | End Term).
    const assessments = await this.ds.query(
      `SELECT DISTINCT e.id, e.name, e.created_at
         FROM exams e
        WHERE e.tenant_id::text = $1 AND ($2::text IS NULL OR e.term = $2)
          AND e.deleted_at IS NULL
        ORDER BY e.created_at ASC`,
      [tenantId, term || null],
    ).catch(() => []);

    // Per learning area, the percent for each assessment + overall average.
    const rows = await this.ds.query(
      `SELECT subject, exam_id AS "examId", raw_score AS "rawScore", max_score AS "maxScore", percent
         FROM assessment_results
        WHERE tenant_id::text = $1 AND learner_id::text = $2 AND ($3::text IS NULL OR term = $3)
          AND deleted_at IS NULL`,
      [tenantId, learnerId, term || null],
    ).catch(() => []);

    const esc = (s: any) => String(s ?? '').replace(/[&<>]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c] as string));

    // Learning areas offered in this class = the canonical marklist rubric for the
    // grade (same source the mark list uses). Spelling variants ("Creative Activities"
    // vs "Creative Arts") collapse into one row, and Indigenous Language is dropped.
    const rubricAreas = await getGradeLearningAreas(this.ds, lr.gradeLevel || '', tenantId);

    // Paper 1 & 2 combined totals — the AUTHORITATIVE denominator for a multi-paper
    // subject, so combining two paper rows under the same assessment gives the true
    // combined mark instead of the second paper silently overwriting the first below.
    const paperCfgRows = await this.ds.query(
      `SELECT learning_area AS "learningArea", paper_count AS "paperCount",
              paper1_max AS "paper1Max", paper2_max AS "paper2Max", tenant_id AS "tenantId"
         FROM subject_paper_config
        WHERE grade_level = $1 AND (tenant_id IS NULL OR tenant_id::text = $2)`,
      [lr.gradeLevel || '', tenantId],
    ).catch(() => []);
    const subjectCombinedMax: Record<string, number> = {};
    for (const r of paperCfgRows.filter((r: any) => !r.tenantId).concat(paperCfgRows.filter((r: any) => r.tenantId))) {
      const key = String(r.learningArea).toLowerCase();
      if (r.paperCount >= 2 && r.paper1Max && r.paper2Max) subjectCombinedMax[key] = Number(r.paper1Max) + Number(r.paper2Max);
      else delete subjectCombinedMax[key];
    }

    // area -> examId -> combined {rawSum, maxSum, any} — a subject with Paper 1 & Paper 2
    // has two rows for the same exam; sum them into one mark before computing percent.
    const combos: Record<string, Record<string, { rawSum: number; maxSum: number; any: boolean }>> = {};
    for (const r of rows) {
      const area = rubricAreas.length ? resolveLearningArea(r.subject, rubricAreas) : r.subject;
      if (!area) continue;
      const examKey = r.examId || 'x';
      const configuredMax = subjectCombinedMax[String(r.subject || '').toLowerCase()];
      const acc = (combos[area] ||= {});
      const c = (acc[examKey] ||= { rawSum: 0, maxSum: configuredMax || 0, any: false });
      if (r.rawScore != null) {
        c.rawSum += Number(r.rawScore); c.any = true;
        if (!configuredMax && r.maxScore != null) c.maxSum += Number(r.maxScore);
      }
    }

    // area -> { examId -> percent }, plus the set of areas.
    const byArea: Record<string, Record<string, number>> = {};
    for (const area of Object.keys(combos)) {
      for (const examKey of Object.keys(combos[area])) {
        const c = combos[area][examKey];
        if (c.any && c.maxSum > 0) (byArea[area] = byArea[area] || {})[examKey] = Math.round((c.rawSum / c.maxSum) * 100);
      }
    }
    const areaNames = Object.keys(byArea).sort();
    // Only show assessment columns that actually have marks.
    const usedExams = assessments.filter((a: any) => rows.some((r: any) => r.examId === a.id));
    const cols = usedExams.length ? usedExams : [{ id: 'x', name: 'Score' }];

    const showLevels = rcSettings.showPerformanceLevels !== false;
    let totalPoints = 0; const maxPoints = areaNames.length * (senior ? 8 : 4);
    const body = areaNames.map((area: string) => {
      const cells = cols.map((c: any) => {
        const p = byArea[area][c.id];
        return p != null ? `<td class="c">${p}%${showLevels ? ` <b>${lvl(p)}</b>` : ''}</td>` : `<td class="c">-</td>`;
      }).join('');
      // Average across this area's assessments for the term column + points.
      const vals = Object.values(byArea[area]);
      const avg = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
      totalPoints += pts(avg);
      return `<tr><td>${esc(area)}</td>${cells}<td class="c"><b>${avg}%${showLevels ? ` ${lvl(avg)}` : ''}</b></td></tr>`;
    }).join('');
    const headCols = cols.map((c: any) => `<th class="c">${esc(c.name)}</th>`).join('');

    const termLabel = (term || '').replace('term_', 'Term ');

    // ── Auto class-teacher comment (CBC competency language, keyed to overall level) ──
    const areaLevels = areaNames.map((area: string) => {
      const vals = Object.values(byArea[area]);
      const avg = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
      return { area, level: lvl(avg) };
    });
    const overallAvg = areaNames.length
      ? Math.round(areaNames.reduce((s, area) => {
          const vals = Object.values(byArea[area]); return s + (vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0);
        }, 0) / areaNames.length)
      : 0;
    const overallFam = lvl(overallAvg).replace(/[0-9]/g, '').slice(0, 2) || 'BE';
    const strong = areaLevels.filter(a => a.level.startsWith('EE')).map(a => a.area);
    const meeting = areaLevels.filter(a => a.level.startsWith('ME')).map(a => a.area);
    const support = areaLevels.filter(a => a.level.startsWith('AE') || a.level.startsWith('BE')).map(a => a.area);
    const fn = lr.firstName || 'The learner';
    const listN = (arr: string[]) => arr.slice(0, 3).join(', ');
    const openers: Record<string, string> = {
      EE: `${fn} has exceeded expectations this term, demonstrating strong mastery of competencies across most learning areas.`,
      ME: `${fn} has met expectations this term, showing solid and consistent acquisition of the expected competencies.`,
      AE: `${fn} is approaching expectations and is steadily developing the targeted competencies.`,
      BE: `${fn} is working towards the expected competencies and will benefit from guided, scaffolded support.`,
    };
    const nextSteps: Record<string, string> = {
      EE: ` To grow further, ${fn} should take on extended, open-ended tasks and peer-mentoring opportunities.`,
      ME: ` With continued practice and active participation, ${fn} can move towards exceeding expectations.`,
      AE: support.length ? ` Focused practice in ${listN(support)}, with teacher and parental support, will strengthen these competencies.` : ` Focused practice will strengthen these competencies.`,
      BE: support.length ? ` A structured remediation plan in ${listN(support)}, supported at home and school, is recommended.` : ` A structured remediation plan, supported at home and school, is recommended.`,
    };
    let autoTeacherComment = openers[overallFam] || openers.BE;
    if (strong.length) autoTeacherComment += ` Particular strength is evident in ${listN(strong)}.`;
    else if (meeting.length) autoTeacherComment += ` Competency is well demonstrated in ${listN(meeting)}.`;
    autoTeacherComment += nextSteps[overallFam] || '';
    const hoiRemark: Record<string, string> = {
      EE: `An excellent competency profile. ${fn} is encouraged to sustain this exemplary effort.`,
      ME: `A commendable competency profile. ${fn} should keep building on these strengths each term.`,
      AE: `${fn} is making steady progress. Consistent effort and support will move performance to the next level.`,
      BE: `${fn} needs close support from both school and home to build the foundational competencies.`,
    };
    const autoHoiComment = hoiRemark[overallFam] || hoiRemark.BE;
    // A manually-typed remark (Report Card → Remarks) takes over from the
    // auto-generated CBC-language text whenever one's been saved for this
    // learner/term/year.
    const teacherComment = remarkOverride?.teacherRemark?.trim() || autoTeacherComment;
    const hoiComment = remarkOverride?.hoiRemark?.trim() || autoHoiComment;

    // ── Term opening/closing dates from school settings (schools.settings.termDates) ──
    const tdRows = await this.ds.query(
      `SELECT settings->'termDates' AS td FROM schools WHERE tenant_id::text = $1 LIMIT 1`, [tenantId],
    ).catch(() => []);
    const td = (tdRows[0]?.td) || {};
    const closeDate = td[`${term}_close`] || td.close || '';
    const reopenDate = td[`${term}_reopen`] || td.reopen || '';
    const datesLine = (closeDate || reopenDate) ? `
        <div class="rc-dates">
          ${closeDate ? `<span><b>Term closes:</b> ${esc(closeDate)}</span>` : ''}
          ${reopenDate ? `<span><b>Next term opens:</b> ${esc(reopenDate)}</span>` : ''}
        </div>` : '';

    // ── Fee balance (billed for this grade − total paid), same basis as the finance view ──
    let feeLine = '';
    try {
      const paidRows = await this.ds.query(
        `SELECT COALESCE(SUM(amount),0) AS paid FROM payments WHERE tenant_id = $1 AND learner_id = $2`,
        [tenantId, learnerId],
      ).catch(() => [{ paid: 0 }]);
      const billedRows = await this.ds.query(
        `SELECT COALESCE(SUM(amount),0) AS billed FROM fee_items
          WHERE tenant_id = $1 AND (grade_level IS NULL OR grade_level = $2)`,
        [tenantId, lr.gradeLevel],
      ).catch(() => [{ billed: 0 }]);
      const paid = Number(paidRows[0]?.paid || 0);
      const billed = Number(billedRows[0]?.billed || 0);
      const balance = billed - paid;
      const fmt = (n: number) => 'KES ' + Math.round(n).toLocaleString('en-KE');
      // Only show the fee section if the school actually bills fees (billed > 0) or payments exist.
      if (billed > 0 || paid > 0) {
        const cls = balance > 0 ? 'rc-fee-due' : 'rc-fee-clear';
        const statusTxt = balance > 0 ? `Balance: ${fmt(balance)}` : (balance < 0 ? `Overpaid: ${fmt(-balance)}` : 'Cleared');
        feeLine = `
        <div class="rc-fee ${cls}">
          <span><b>Fees billed:</b> ${fmt(billed)}</span>
          <span><b>Paid:</b> ${fmt(paid)}</span>
          <span class="rc-fee-bal"><b>${statusTxt}</b></span>
        </div>`;
      }
    } catch { /* fees optional — omit cleanly if unavailable */ }
    const logoTag = lr.logo ? `<img src="${lr.logo}" style="height:60px;width:auto;margin:0 auto 6px;display:block"/>` : '';
    const contactBits = [lr.schoolAddress, lr.schoolPhone, lr.schoolEmail].filter(Boolean).map((x: string) => esc(x)).join(' · ');
    const contactLine = contactBits ? `<p style="font-size:11px;color:#555;margin:2px 0">${contactBits}</p>` : '';
    const mottoLine = lr.schoolMotto ? `<p style="font-size:11px;font-style:italic;color:#777;margin:2px 0">“${esc(lr.schoolMotto)}”</p>` : '';
    const card = `
      <div class="rc">
        <div class="rc-head">
          ${logoTag}
          <h1>${esc(lr.schoolName || 'ZARODA School')}</h1>
          ${contactLine}
          ${mottoLine}
          <p>Learner Report Card · ${esc(termLabel)} · ${esc(academicYear)}</p>
        </div>
        <div class="rc-meta">
          <span><b>Name:</b> ${esc(`${lr.firstName||''} ${lr.lastName||''}`.trim())}</span>
          <span><b>Adm:</b> ${esc(lr.adm || '')}</span>
          <span><b>Class:</b> ${esc(lr.streamName || lr.gradeLevel || '')}</span>
        </div>
        <table>
          <thead><tr><th>Learning Area</th>${headCols}<th class="c">Term Average</th></tr></thead>
          <tbody>${body || `<tr><td colspan="${cols.length + 2}" class="c">No marks recorded this term.</td></tr>`}</tbody>
        </table>
        ${areaNames.length ? `<p class="rc-total">${
          rcSettings.showPointsTotal !== false
            ? `Performance-level total: ${totalPoints} / ${maxPoints} (${areaNames.length} learning areas)`
            : `Term Average: ${overallAvg}% (${areaNames.length} learning areas)`
        }</p>` : ''}
        ${areaNames.length ? `
        <div class="rc-comment">
          <div class="rc-comment-label">Class Teacher's Remark</div>
          <div class="rc-comment-text">${esc(teacherComment)}</div>
        </div>
        <div class="rc-comment">
          <div class="rc-comment-label">Head of Institution's Remark</div>
          <div class="rc-comment-text">${esc(hoiComment)}</div>
        </div>` : ''}
        ${datesLine}
        ${feeLine}
        <div class="rc-foot">
          <span>Class Teacher: __________________</span>
          <span>Checked by D.H.O.I. _______________</span>
        </div>
        <div class="rc-powered">Powered by ZARODA SOLUTIONS<br>Reliable. Innovative. Forward.</div>
      </div>`;

    if (!standalone) return card;
    return `<!doctype html><html><head><meta charset="utf-8"/><title>Report Card — ${esc(`${lr.firstName} ${lr.lastName}`)}</title>
      ${this.reportCardStyles()}</head><body>${card}
      <div class="no-print" style="text-align:center;margin:18px 0"><button onclick="window.print()" style="background:#1a2e5a;color:#fff;border:none;padding:10px 22px;border-radius:8px;cursor:pointer">Print / Save as PDF</button></div>
      <script>window.addEventListener('load',function(){setTimeout(function(){window.print();},400);});</script>
      </body></html>`;
  }

  @Get('invoice/:invoiceId')
  getInvoice(@Param('invoiceId') id: string) {
    return { message: 'Invoice PDF — implement PdfService.generateInvoice()' };
  }

  @Get('receipt/:receiptNumber')
  getReceipt(@Param('receiptNumber') ref: string) {
    return { message: 'Receipt PDF — implement PdfService.generateReceipt()' };
  }

  @Get('bib-sheet/:championshipId')
  getBibSheet(@Param('championshipId') id: string) {
    return { message: 'Bib sheet PDF — implement PdfService.generateBibSheet()' };
  }

  @Get('scheme/:schemeId')
  getScheme(@Param('schemeId') id: string) {
    return { message: 'Scheme PDF — implement PdfService.generateSchemeOfWork()' };
  }

  @Get('payslip/:staffId')
  getPayslip(@Param('staffId') id: string) {
    return { message: 'Payslip PDF — implement PdfService.generatePayslip()' };
  }
}

@Module({ controllers: [PdfController] })
export class PdfModule {}


// ═══════════════════════════════════════════════════════════
// SUPER ADMIN MODULE (platform-wide management + retooling broadcast)
// ═══════════════════════════════════════════════════════════
@Controller('admin')
@UseGuards(JwtAuthGuard)
class AdminController {
  constructor(private readonly ds: DataSource) {}

  // Only the platform owner (super_admin) may cross tenant boundaries. Every method
  // guards on this; a normal school user gets an empty/forbidden response.
  private isOwner(req: any): boolean {
    return req?.user?.role === 'super_admin';
  }

  // Platform-wide list of every school (tenant). Read-only.
  @Get('tenants')
  async getTenants(@Request() req: any, @Query() q: any) {
    if (!this.isOwner(req)) return { error: 'forbidden', data: [] };
    const search = q.search ? `%${q.search}%` : null;
    // 'primary_js' | 'senior' | null (no filter). Only tenants whose school_levels
    // actually contains the requested band are matched — unset/legacy ('{}') tenants
    // are excluded from the Primary/JS and Senior tabs since we can't tell which band
    // they run, and showing them under every tab was misleading.
    const level = ['primary_js', 'senior'].includes(q.level) ? q.level : null;
    // 'public' | 'private' | null (no filter) — lets the owner view schools of just one
    // ownership type, or all.
    const ownership = ['public', 'private'].includes(q.ownership) ? q.ownership : null;
    // 'school' | 'individual' | null (no filter) — separates real onboarded schools
    // from one-person tenants auto-provisioned for teachers using Professional
    // Records without a school account (see migration 043).
    const accountType = ['school', 'individual'].includes(q.accountType) ? q.accountType : null;
    const rows = await this.ds.query(
      `SELECT t.id, t.name, t.status, t.subscription_tier AS "subscriptionTier", t.plan_tier AS "planTier",
              t.county, t.sub_county AS "subCounty", t.zone, t.phone, t.email,
              t.knec_code AS "knecCode", t.trial_ends_at AS "trialEndsAt", t.created_at AS "createdAt",
              t.school_levels AS "schoolLevels", t.ownership, t.account_type AS "accountType",
              CASE
                WHEN t.account_type = 'individual' THEN 'Individual'
                WHEN t.name ILIKE 'KOLWAL SENIOR%' THEN 'Public Senior School'
                WHEN t.ownership = 'private' THEN 'PRI/JS'
                ELSE 'Public'
              END AS "category",
              (SELECT COUNT(*) FROM users    u WHERE u.tenant_id = t.id) AS "userCount",
              (SELECT COUNT(*) FROM learners l WHERE l.tenant_id = t.id AND l.is_active = true) AS "learnerCount",
              (SELECT COUNT(*) FROM streams  s WHERE s.tenant_id = t.id) AS "streamCount",
              -- Individual (teacher-only) tenants have no learners/other users to count —
              -- documents generated is the meaningful activity metric for them instead.
              (
                COALESCE((SELECT COUNT(*) FROM schemes_of_work WHERE teacher_id IN (SELECT id FROM users WHERE tenant_id = t.id)), 0) +
                COALESCE((SELECT COUNT(*) FROM lesson_plans    WHERE teacher_id IN (SELECT id FROM users WHERE tenant_id = t.id)), 0) +
                COALESCE((SELECT COUNT(*) FROM lesson_notes    WHERE teacher_id IN (SELECT id FROM users WHERE tenant_id = t.id)), 0)
              )::int AS "documentsGenerated",
              admin.admin_name  AS "adminName",
              admin.admin_email AS "adminEmail",
              admin.admin_phone AS "adminPhone"
         FROM tenants t
         LEFT JOIN LATERAL (
           SELECT (u.first_name || ' ' || COALESCE(u.last_name,'')) AS admin_name,
                  u.email AS admin_email, u.phone AS admin_phone
             FROM users u
            WHERE u.tenant_id = t.id AND u.role IN ('hoi','tenant_owner','school_admin','class_teacher')
            ORDER BY CASE u.role WHEN 'hoi' THEN 0 WHEN 'tenant_owner' THEN 1 WHEN 'school_admin' THEN 2 ELSE 3 END
            LIMIT 1
         ) admin ON true
        WHERE ($1::text IS NULL OR t.name ILIKE $1)
          AND ($2::text IS NULL OR $2 = ANY(t.school_levels))
          AND ($3::text IS NULL OR t.ownership = $3)
          AND ($4::text IS NULL OR t.account_type = $4)
        ORDER BY t.created_at DESC`,
      [search, level, ownership, accountType],
    ).catch(() => []);
    return { data: rows };
  }

  // One school's detail (read-only) — owner drilling into a specific tenant.
  @Get('tenants/:id')
  async getTenant(@Request() req: any, @Param('id') id: string) {
    if (!this.isOwner(req)) return { error: 'forbidden' };
    const rows = await this.ds.query(
      `SELECT t.*,
              CASE
                WHEN t.name ILIKE 'KOLWAL SENIOR%' THEN 'Public Senior School'
                WHEN t.ownership = 'private' THEN 'PRI/JS'
                ELSE 'Public'
              END AS "category",
              (SELECT COUNT(*) FROM users    u WHERE u.tenant_id = t.id) AS "userCount",
              (SELECT COUNT(*) FROM learners l WHERE l.tenant_id = t.id AND l.is_active = true) AS "learnerCount",
              (SELECT COUNT(*) FROM streams  s WHERE s.tenant_id = t.id) AS "streamCount",
              (
                COALESCE((SELECT COUNT(*) FROM schemes_of_work WHERE teacher_id IN (SELECT id FROM users WHERE tenant_id = t.id)), 0) +
                COALESCE((SELECT COUNT(*) FROM lesson_plans    WHERE teacher_id IN (SELECT id FROM users WHERE tenant_id = t.id)), 0) +
                COALESCE((SELECT COUNT(*) FROM lesson_notes    WHERE teacher_id IN (SELECT id FROM users WHERE tenant_id = t.id)), 0)
              )::int AS "documentsGenerated"
         FROM tenants t WHERE t.id = $1 LIMIT 1`,
      [id],
    ).catch(() => []);
    if (!rows.length) return { error: 'not found' };
    // The school's users (no password hashes)
    const users = await this.ds.query(
      `SELECT id, first_name AS "firstName", last_name AS "lastName", email, role, is_active AS "isActive"
         FROM users WHERE tenant_id = $1 ORDER BY role, first_name`,
      [id],
    ).catch(() => []);
    return { tenant: rows[0], users };
  }

  // Platform-wide stats across ALL tenants. Read-only.
  @Get('stats')
  async getStats(@Request() req: any) {
    if (!this.isOwner(req)) return { totalTenants: 0, activeTenants: 0, trialTenants: 0, suspendedTenants: 0, totalLearners: 0, totalUsers: 0, totalStreams: 0, schoolTenants: 0, individualTenants: 0 };
    // totalTenants/activeTenants/trialTenants/suspendedTenants back the "Schools"
    // card — scoped to account_type = 'school' so individual teacher accounts
    // (auto-provisioned one-person tenants for Professional Records, see migration
    // 043) don't inflate the school count. individualTenants is reported separately.
    const r = await this.ds.query(
      `SELECT
         (SELECT COUNT(*) FROM tenants WHERE account_type = 'school')                       AS "totalTenants",
         (SELECT COUNT(*) FROM tenants WHERE account_type = 'school' AND status = 'active')  AS "activeTenants",
         (SELECT COUNT(*) FROM tenants WHERE account_type = 'school' AND status = 'trial')   AS "trialTenants",
         (SELECT COUNT(*) FROM tenants WHERE account_type = 'school' AND status = 'suspended') AS "suspendedTenants",
         (SELECT COUNT(*) FROM learners WHERE is_active = true)           AS "totalLearners",
         (SELECT COUNT(*) FROM users)                                     AS "totalUsers",
         (SELECT COUNT(*) FROM streams)                                   AS "totalStreams",
         (SELECT COUNT(*) FROM tenants WHERE account_type = 'school')     AS "schoolTenants",
         (SELECT COUNT(*) FROM tenants WHERE account_type = 'individual') AS "individualTenants"`,
    ).catch(() => [{}]);
    return r[0] || {};
  }

  // Professional Records: real AI spend vs wallet revenue collected, platform-wide.
  // Only generation_tokens (output tokens) are recorded per record — input tokens
  // aren't logged anywhere, so the cost figure here is a floor, not the full bill;
  // labelled as such rather than guessed at. FX rate is a rough constant, not live.
  @Get('professional-records-costs')
  async getProfessionalRecordsCosts(@Request() req: any) {
    if (!this.isOwner(req)) return { error: 'forbidden' };
    const KES_PER_USD = 130;
    const SONNET_OUTPUT_PER_MTOK = 10; // USD, Claude Sonnet 5
    const HAIKU_OUTPUT_PER_MTOK = 5;   // USD, Claude Haiku 4.5

    const r = await this.ds.query(
      `SELECT
         (SELECT COUNT(*) FROM schemes_of_work WHERE ai_generated = true)                    AS "schemeCount",
         (SELECT COALESCE(SUM(generation_tokens),0) FROM schemes_of_work WHERE ai_generated = true) AS "schemeOutputTokens",
         (SELECT COUNT(*) FROM lesson_plans WHERE ai_generated = true)                       AS "planCount",
         (SELECT COALESCE(SUM(generation_tokens),0) FROM lesson_plans WHERE ai_generated = true)    AS "planOutputTokens",
         (SELECT COUNT(*) FROM lesson_notes WHERE ai_generated = true)                       AS "notesCount",
         (SELECT COALESCE(SUM(generation_tokens),0) FROM lesson_notes WHERE ai_generated = true)    AS "notesOutputTokens",
         (SELECT COALESCE(SUM(amount),0) FROM pr_wallet_transactions WHERE type = 'debit')          AS "walletRevenueKes",
         (SELECT COALESCE(SUM(amount),0) FROM pr_wallet_transactions WHERE type = 'topup' AND status = 'paid') AS "walletTopupsKes"`,
    ).catch(() => [{}]);
    const row = r[0] || {};

    const schemeOutputTokens = Number(row.schemeOutputTokens) || 0;
    const haikuOutputTokens = (Number(row.planOutputTokens) || 0) + (Number(row.notesOutputTokens) || 0);
    const schemeCostUsd = (schemeOutputTokens / 1_000_000) * SONNET_OUTPUT_PER_MTOK;
    const haikuCostUsd = (haikuOutputTokens / 1_000_000) * HAIKU_OUTPUT_PER_MTOK;
    const outputCostKes = (schemeCostUsd + haikuCostUsd) * KES_PER_USD;
    const walletRevenueKes = Number(row.walletRevenueKes) || 0;

    return {
      schemeCount: Number(row.schemeCount) || 0,
      planCount: Number(row.planCount) || 0,
      notesCount: Number(row.notesCount) || 0,
      schemeOutputTokens,
      haikuOutputTokens,
      estimatedOutputCostKes: Math.round(outputCostKes * 100) / 100,
      walletRevenueKes,
      walletTopupsKes: Number(row.walletTopupsKes) || 0,
      marginKes: Math.round((walletRevenueKes - outputCostKes) * 100) / 100,
      note: 'estimatedOutputCostKes covers OUTPUT tokens only (input tokens are not logged per record) at a fixed FX rate — treat as a floor on real API spend, not the full bill.',
    };
  }

  // SMS wallet cost-vs-revenue, mirroring professional-records-costs above.
  @Get('sms-costs')
  async getSmsCosts(@Request() req: any) {
    if (!this.isOwner(req)) return { error: 'forbidden' };
    const r = await this.ds.query(
      `SELECT
         (SELECT COALESCE(SUM(sms_count),0) FROM sms_wallet_transactions WHERE type = 'debit')                    AS "smsSentCount",
         (SELECT COALESCE(SUM(amount),0)    FROM sms_wallet_transactions WHERE type = 'debit')                    AS "walletRevenueKes",
         (SELECT COALESCE(SUM(amount),0)    FROM sms_wallet_transactions WHERE type = 'topup' AND status = 'paid') AS "walletTopupsKes"`,
    ).catch(() => [{}]);
    const row = r[0] || {};

    const smsSentCount = Number(row.smsSentCount) || 0;
    const atCostKes = Math.round(smsSentCount * SMS_COST_KES * 100) / 100;
    const walletRevenueKes = Number(row.walletRevenueKes) || 0;

    return {
      smsSentCount,
      pricePerSmsKes: SMS_PRICE_KES,
      atCostPerSmsKes: SMS_COST_KES,
      atCostKes,
      walletRevenueKes,
      walletTopupsKes: Number(row.walletTopupsKes) || 0,
      marginKes: Math.round((walletRevenueKes - atCostKes) * 100) / 100,
    };
  }

  // Manually backfill a referral bonus (owner-only). Needed because the automatic
  // path (users.referred_by set at signup, credited on the referee's first debit)
  // can miss a real referral if the referee's signup happened while an old cached
  // build of the signup page — from before the ?ref= capture code shipped — was
  // still being served, so their account never got referred_by set in the first
  // place. Links the referral (if not already linked) and credits the flat bonus,
  // guarded by the same one-bonus-per-referee unique index the automatic path uses.
  @Post('professional-records-referral-credit')
  async creditReferralBonus(@Request() req: any, @Body() body: { referrerEmail: string; refereeEmail: string }) {
    if (!this.isOwner(req)) return { error: 'forbidden' };
    const BONUS_KES = 30;

    const referrerRows = await this.ds.query(
      `SELECT id, tenant_id FROM users WHERE email = $1`, [String(body.referrerEmail || '').toLowerCase().trim()],
    ).catch(() => []);
    const refereeRows = await this.ds.query(
      `SELECT id FROM users WHERE email = $1`, [String(body.refereeEmail || '').toLowerCase().trim()],
    ).catch(() => []);
    if (!referrerRows.length) return { error: 'referrer not found' };
    if (!refereeRows.length) return { error: 'referee not found' };
    const referrer = referrerRows[0];
    const referee = refereeRows[0];
    if (referrer.id === referee.id) return { error: 'cannot refer yourself' };

    await this.ds.query(
      `UPDATE users SET referred_by = $1 WHERE id = $2 AND referred_by IS NULL`, [referrer.id, referee.id],
    ).catch(() => null);

    await this.ds.query(
      `INSERT INTO pr_wallets (tenant_id, teacher_id, balance) VALUES ($1, $2, 0)
       ON CONFLICT (tenant_id, teacher_id) DO NOTHING`,
      [referrer.tenant_id, referrer.id],
    ).catch(() => null);

    try {
      await this.ds.query(
        `INSERT INTO pr_wallet_transactions
           (tenant_id, teacher_id, type, amount, description, reference_type, reference_id, status)
         VALUES ($1, $2, 'topup', $3, 'Referral bonus — your referral generated their first item', 'referral', $4, 'paid')`,
        [referrer.tenant_id, referrer.id, BONUS_KES, referee.id],
      );
    } catch (err: any) {
      if (err?.code === '23505') return { error: 'already credited for this referee' };
      throw err;
    }
    await this.ds.query(
      `UPDATE pr_wallets SET balance = balance + $1 WHERE tenant_id = $2 AND teacher_id = $3`,
      [BONUS_KES, referrer.tenant_id, referrer.id],
    );

    return { credited: true, amountKes: BONUS_KES };
  }

  // Shared WHERE clause for an owner broadcast's audience. The four options
  // partition every active user exactly once (handy for batching sends under a
  // daily provider cap — e.g. Resend's 100/day free tier — by sending to each
  // group on its own):
  //   'admins'     — HOI/admin/owner roles across every school
  //   'school'     — non-admin users (teachers/parents/learners/bursars) at
  //                  school-tenant accounts only
  //   'individual' — individual, no-school teacher accounts only — each is a
  //                  one-person tenant, so this is the only way to reach just
  //                  them without also messaging every school's staff/parents
  //   'all'        — every active user platform-wide (admins + school + individual)
  private broadcastWhere(audience: string): { where: string; params: any[] } {
    const adminRoles = ['tenant_owner', 'school_admin', 'hoi', 'dhois'];
    if (audience === 'individual') {
      return {
        where: `COALESCE(u.is_active, true) = true AND u.tenant_id IN (SELECT id FROM tenants WHERE account_type = 'individual')`,
        params: [],
      };
    }
    if (audience === 'admins') {
      return { where: `COALESCE(u.is_active, true) = true AND u.role = ANY($1)`, params: [adminRoles] };
    }
    if (audience === 'school') {
      return {
        where: `COALESCE(u.is_active, true) = true AND u.role <> ALL($1) AND u.role <> 'super_admin'
                 AND u.tenant_id IN (SELECT id FROM tenants WHERE account_type = 'school' OR account_type IS NULL)`,
        params: [adminRoles],
      };
    }
    return { where: `COALESCE(u.is_active, true) = true AND u.role <> 'super_admin'`, params: [] };
  }

  // Gather broadcast recipients across ALL schools for an owner message. audience:
  // 'admins', 'school' (non-admin school users), 'individual' (individual
  // accounts only), or 'all' (every active user). Returns names with phones +
  // emails so the owner can message via WhatsApp / email / SMS. This works with
  // no external credentials (WhatsApp links, mailto); SMS sending where configured.
  @Get('broadcast/recipients')
  async broadcastRecipients(@Request() req: any, @Query() q: any) {
    if (!this.isOwner(req)) return { error: 'forbidden', recipients: [] };
    const audience = ['all', 'individual', 'school'].includes(q.audience) ? q.audience : 'admins';
    const { where, params } = this.broadcastWhere(audience);
    const rows = await this.ds.query(
      `SELECT u.first_name AS "firstName", u.last_name AS "lastName", u.email, u.phone, u.role,
              (SELECT name FROM schools s WHERE s.tenant_id = u.tenant_id LIMIT 1) AS "schoolName"
         FROM users u WHERE ${where}
        ORDER BY "schoolName", u.first_name`,
      params,
    ).catch(() => []);
    const phones = Array.from(new Set(rows.map((r: any) => r.phone).filter(Boolean).map((p: string) => normalisePhone(p)).filter(Boolean)));
    const blacklistedRows = phones.length
      ? await this.ds.query(`SELECT COUNT(*)::int AS count FROM sms_blacklist WHERE phone_number = ANY($1)`, [phones]).catch(() => [{ count: 0 }])
      : [{ count: 0 }];
    return {
      audience,
      count: rows.length,
      withPhone: rows.filter((r: any) => r.phone).length,
      withEmail: rows.filter((r: any) => r.email).length,
      blacklisted: blacklistedRows[0]?.count || 0,
      recipients: rows,
    };
  }

  // Actually send the owner's broadcast — SMS via Africa's Talking (bulk, chunked)
  // and email via Gmail SMTP (looped, one failure doesn't block the rest). WhatsApp
  // stays link-based client-side (no server-side WhatsApp sender exists).
  // Diagnostic: send one SMS to one specific phone number, outside the audience/
  // bulk flow — exactly what Africa's Talking support asks for when troubleshooting
  // a Sender ID/blacklist issue on a specific number ("send to just your number").
  @Post('test-sms')
  async sendTestSms(@Request() req: any, @Body() dto: { phone: string; message?: string }) {
    if (!this.isOwner(req)) return { error: 'forbidden' };
    if (!dto?.phone) return { error: 'Enter a phone number.' };
    const message = dto.message?.trim() || 'ZARODA test SMS — if you received this, delivery is working.';
    const r = await sendSms([dto.phone], message);
    await recordBlacklistedNumbers(this.ds, r.blacklistedNumbers);
    return r;
  }

  // Diagnostic: send one email to one address, outside any real flow (password
  // reset, onboarding reminders, broadcasts) — so the owner can confirm Resend is
  // actually configured/working (RESEND_API_KEY set, sender domain verified) and
  // see the exact failure reason if not, without needing Render log access. Mirrors
  // sendTestSms above and calls the exact same sendEmail() every real flow uses.
  @Post('test-email')
  async sendTestEmail(@Request() req: any, @Body() dto: { email: string; message?: string }) {
    if (!this.isOwner(req)) return { error: 'forbidden' };
    if (!dto?.email) return { error: 'Enter an email address.' };
    const message = dto.message?.trim() || 'ZARODA test email — if you received this, delivery is working.';
    const html = `<p>${message}</p>`;
    const r = await sendEmail(dto.email, 'ZARODA test email', html, message);
    return r;
  }

  @Post('broadcast')
  async sendBroadcast(@Request() req: any, @Body() dto: any) {
    if (!this.isOwner(req)) return { error: 'forbidden' };
    const audience = ['all', 'individual', 'school'].includes(dto?.audience) ? dto.audience : 'admins';
    const title = String(dto?.title || '').trim();
    const message = String(dto?.message || '').trim();
    if (!title || !message) return { error: 'Title and message are required.' };
    const channels: string[] = Array.isArray(dto?.channels) && dto.channels.length ? dto.channels : ['sms', 'email'];

    const { where, params } = this.broadcastWhere(audience);
    const recipients = await this.ds.query(
      `SELECT u.first_name AS "firstName", u.last_name AS "lastName", u.email, u.phone,
              u.tenant_id AS "tenantId", u.school_id AS "schoolId"
         FROM users u WHERE ${where}`,
      params,
    ).catch(() => []);

    const result: any = { audience, recipients: recipients.length };

    // In-app copy: SMS/email alone left recipients with no record inside the app
    // itself — an individual teacher (or any user) had no way to see an owner
    // broadcast unless they happened to read the SMS/email. One announcement row
    // per distinct tenant among the recipients makes it show up in their
    // notification bell (GET /communication/notifications) exactly like a normal
    // school announcement would.
    const tenantSchool = new Map<string, string>();
    for (const r of recipients) if (r.tenantId && r.schoolId && !tenantSchool.has(r.tenantId)) tenantSchool.set(r.tenantId, r.schoolId);
    for (const [tenantId, schoolId] of tenantSchool) {
      await this.ds.query(
        `INSERT INTO announcements (tenant_id, school_id, title, body, category, audience, is_published, published_at, created_by)
         VALUES ($1, $2, $3, $4, 'general', 'all', true, NOW(), $5)`,
        [tenantId, schoolId, title, message, req.user.id],
      ).catch(() => null);
    }

    if (channels.includes('sms')) {
      const allNumbers = recipients.map((r: any) => r.phone).filter(Boolean);
      const { toSend: numbers, skipped } = await filterOptedOutNumbers(this.ds, allNumbers.map((p: string) => normalisePhone(p) || p));
      const smsBody = `${title}\n\n${message}`;
      let sent = 0, failed = skipped.length, detail: string | undefined = skipped.length
        ? `${skipped.length} number${skipped.length === 1 ? '' : 's'} skipped — telco-blocked (dial *456*9# to opt back in), not yet confirmed reactivated.`
        : undefined;
      const failedNumbers: string[] = [...skipped];
      const CHUNK = 100; // Africa's Talking recommended batch size per call
      for (let i = 0; i < numbers.length; i += CHUNK) {
        const r = await sendSms(numbers.slice(i, i + CHUNK), smsBody);
        sent += r.sent; failed += r.failed; detail = detail || r.detail;
        failedNumbers.push(...r.failedNumbers);
        await recordBlacklistedNumbers(this.ds, r.blacklistedNumbers);
      }
      result.sms = { attempted: numbers.length, sent, failed, detail, failedNumbers };
      await this.recordBroadcast(req.user.id, audience, title, message, 'sms', numbers.length, sent, failed, failedNumbers, detail);
    }

    if (channels.includes('email')) {
      const withEmail = recipients.filter((r: any) => r.email);
      const html = `<p>${message.replace(/\n/g, '<br/>')}</p>`;
      // Resend's plan here allows 10 requests/second — firing all recipients at once
      // (Promise.allSettled over the full list) blew past that. Send in small batches
      // with a pause between them instead.
      const BATCH = 8;
      const outcomes: any[] = [];
      for (let i = 0; i < withEmail.length; i += BATCH) {
        const batch = withEmail.slice(i, i + BATCH);
        const batchResults = await Promise.allSettled(
          batch.map((r: any) => sendEmail(r.email, title, html, message)),
        );
        outcomes.push(...batchResults);
        if (i + BATCH < withEmail.length) await new Promise(res => setTimeout(res, 1100));
      }
      const sent = outcomes.filter(o => o.status === 'fulfilled' && (o.value as any).ok).length;
      const firstFailure = outcomes.find(o => o.status === 'fulfilled' && !(o.value as any).ok) as any;
      result.email = {
        attempted: withEmail.length, sent, failed: withEmail.length - sent,
        detail: firstFailure?.value?.detail,
      };
      await this.recordBroadcast(req.user.id, audience, title, message, 'email', withEmail.length, sent, withEmail.length - sent, [], result.email.detail);
    }

    return result;
  }

  private async recordBroadcast(
    sentBy: string, audience: string, title: string, message: string, channel: 'sms' | 'email',
    recipientCount: number, sent: number, failed: number, failedNumbers: string[], detail?: string,
  ) {
    await this.ds.query(
      `INSERT INTO owner_broadcasts (audience, title, message, channel, recipient_count, sent, failed, failed_numbers, detail, sent_by, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())`,
      [audience, title, message, channel, recipientCount, sent, failed, failedNumbers, detail || null, sentBy],
    ).catch(() => null);
  }

  // Read-only history of everything sent from the owner Communication page.
  @Get('broadcast-history')
  async getBroadcastHistory(@Request() req: any) {
    if (!this.isOwner(req)) return { error: 'forbidden', data: [] };
    return this.ds.query(
      `SELECT id, audience, title, message, channel, recipient_count AS "recipientCount",
              sent, failed, failed_numbers AS "failedNumbers", detail, created_at AS "createdAt"
         FROM owner_broadcasts ORDER BY created_at DESC LIMIT 50`,
    ).catch(() => []);
  }

  // Real delivery truth from Africa's Talking's async Delivery Report callback —
  // distinct from "sent" above, which only means the telco accepted the message.
  @Get('sms-delivery-reports')
  async getSmsDeliveryReports(@Request() req: any) {
    if (!this.isOwner(req)) return { error: 'forbidden', data: [] };
    return this.ds.query(
      `SELECT id, message_id AS "messageId", phone_number AS "phoneNumber", status,
              network_code AS "networkCode", failure_reason AS "failureReason",
              retry_count AS "retryCount", received_at AS "receivedAt"
         FROM sms_delivery_reports ORDER BY received_at DESC LIMIT 100`,
    ).catch(() => []);
  }

  @Delete('broadcast-history/:id')
  async deleteBroadcast(@Request() req: any, @Param('id') id: string) {
    if (!this.isOwner(req)) return { error: 'forbidden' };
    await this.ds.query(`DELETE FROM owner_broadcasts WHERE id::text = $1`, [id]).catch(() => null);
    return { deleted: true };
  }

  // Resends SMS only to the numbers that failed last time.
  @Post('broadcast-history/:id/retry-sms')
  async retryBroadcastSms(@Request() req: any, @Param('id') id: string) {
    if (!this.isOwner(req)) return { error: 'forbidden' };
    const rows = await this.ds.query(`SELECT message, failed_numbers AS "failedNumbers" FROM owner_broadcasts WHERE id::text = $1 AND channel = 'sms'`, [id]);
    if (!rows.length) return { error: 'Broadcast not found.' };
    const failedNumbers: string[] = rows[0].failedNumbers || [];
    if (!failedNumbers.length) return { error: 'Nothing to retry.' };
    const r = await sendSms(failedNumbers, rows[0].message);
    await recordBlacklistedNumbers(this.ds, r.blacklistedNumbers);
    await this.ds.query(
      `UPDATE owner_broadcasts SET sent = sent + $2, failed = failed - $2, failed_numbers = $3, detail = $4 WHERE id::text = $1`,
      [id, r.sent, r.failedNumbers, r.detail],
    );
    return { message: `Retried ${failedNumbers.length} — ${r.sent} sent, ${r.failedNumbers.length} still failed.` };
  }

  // A school counts as "not fully set up" if it still has zero classes, zero real
  // teaching staff (excludes the HOI admin created at signup — see classroomTeacherCount
  // in academic.module.ts getDashboard) or zero learners. Individual (teacher-only)
  // tenants have no school to set up and are excluded.
  private async getIncompleteSetupTenants() {
    return this.ds.query(
      `SELECT t.id, t.name, t.created_at AS "createdAt",
              admin.admin_name  AS "adminName",
              admin.admin_email AS "adminEmail",
              admin.admin_phone AS "adminPhone",
              (SELECT COUNT(*) FROM streams  s WHERE s.tenant_id = t.id)                                            AS "streamCount",
              (SELECT COUNT(*) FROM users    u WHERE u.tenant_id = t.id AND u.role IN ('class_teacher','subject_teacher','overall_class_teacher')) AS "teacherCount",
              (SELECT COUNT(*) FROM learners l WHERE l.tenant_id = t.id AND l.is_active = true)                     AS "learnerCount"
         FROM tenants t
         LEFT JOIN LATERAL (
           SELECT (u.first_name || ' ' || COALESCE(u.last_name,'')) AS admin_name,
                  u.email AS admin_email, u.phone AS admin_phone
             FROM users u
            WHERE u.tenant_id = t.id AND u.role IN ('hoi','tenant_owner','school_admin')
            ORDER BY CASE u.role WHEN 'hoi' THEN 0 WHEN 'tenant_owner' THEN 1 ELSE 2 END
            LIMIT 1
         ) admin ON true
        WHERE t.account_type = 'school'
          AND (
            (SELECT COUNT(*) FROM streams  s WHERE s.tenant_id = t.id) = 0
            OR (SELECT COUNT(*) FROM users    u WHERE u.tenant_id = t.id AND u.role IN ('class_teacher','subject_teacher','overall_class_teacher')) = 0
            OR (SELECT COUNT(*) FROM learners l WHERE l.tenant_id = t.id AND l.is_active = true) = 0
          )
        ORDER BY t.created_at DESC`,
    ).catch(() => []);
  }

  // List schools that haven't finished setup (no classes, no teachers, or no learners
  // yet), so the owner can see who to follow up with before sending reminders.
  @Get('setup-incomplete')
  async listIncompleteSetup(@Request() req: any) {
    if (!this.isOwner(req)) return { error: 'forbidden', tenants: [] };
    const tenants = await this.getIncompleteSetupTenants();
    return { count: tenants.length, tenants };
  }

  // Send an email + SMS reminder ONLY to the admins of schools with incomplete setup —
  // never a full broadcast. Each admin needs an email/phone on file to receive that
  // channel; missing ones are just skipped for that channel and counted.
  @Post('setup-reminders')
  async sendSetupReminders(@Request() req: any, @Body() dto: any) {
    if (!this.isOwner(req)) return { error: 'forbidden' };
    const channels: string[] = Array.isArray(dto?.channels) && dto.channels.length ? dto.channels : ['sms', 'email'];
    const tenants = await this.getIncompleteSetupTenants();
    if (!tenants.length) return { recipients: 0, message: 'No schools with incomplete setup found.' };

    const result: any = { recipients: tenants.length };
    const defaultMessage = (name: string) =>
      `Hi, this is a reminder from ZARODA to finish setting up ${name} — add your classes, teachers and students so your school is ready to use. Log in at https://app.zarodasolutions.app to continue.`;
    // Full HTML version of the same reminder — mirrors scripts/send-onboarding-
    // reminders.js (the daily automated version of this same reminder) so both
    // read identically regardless of which one sent it.
    const defaultEmailHtml = (adminName: string, schoolName: string) => {
      const firstName = (adminName || '').trim().split(/\s+/)[0] || 'there';
      return `
        <div style="font-family: Arial, Helvetica, sans-serif; max-width: 560px; margin: 0 auto; color: #1a1a1a;">
          <p>Dear ${firstName},</p>
          <p>You have already taken the first step by onboarding <strong>${schoolName}</strong> to ZARODA SMS. Now, let&rsquo;s complete your setup!</p>
          <p>Your account is ready, but some important setup steps are still incomplete. Completing them will allow you to fully benefit from ZARODA SMS.</p>
          <p>With a fully set-up account, you can:</p>
          <ul style="padding-left: 20px; line-height: 1.8;">
            <li>✅ Record and manage learner assessments</li>
            <li>✅ Generate Schemes of Work, Lesson Plans and Lesson Notes</li>
            <li>✅ Access learning videos through the Assessment Book</li>
            <li>✅ Access Retooling resources for continuous professional development</li>
            <li>✅ Use powerful analytics to understand learner performance and make informed decisions</li>
            <li>✅ Send SMS directly to parents</li>
          </ul>
          <p style="margin-top: 24px;">
            <a href="https://app.zarodasolutions.app" style="background: #1a2e5a; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">
              Complete Your Setup Today
            </a>
          </p>
          <p>Log in and complete the remaining setup steps so you can start using the full power of ZARODA SMS.</p>
          <p><a href="https://app.zarodasolutions.app" style="color: #1a2e5a;">zarodasolutions.app</a></p>
          <p>Don&rsquo;t stop at onboarding&mdash;complete your setup and move from registration to real impact!</p>
          <p>Thank you for choosing <strong>ZARODA Solutions</strong>.</p>
          <p style="margin-top: 24px; color: #1a2e5a; font-weight: bold; letter-spacing: 0.5px;">
            ZARODA SOLUTIONS<br/>
            <span style="font-size: 12px; color: #666;">INNOVATIVE. RELIABLE. FORWARD.</span>
          </p>
        </div>`;
    };
    const customMessage = String(dto?.message || '').trim();

    if (channels.includes('sms')) {
      const numbers = tenants.map((t: any) => t.adminPhone).filter(Boolean);
      let sent = 0, failed = 0, detail: string | undefined;
      const CHUNK = 100;
      // Custom messages go out as one shared blast; the default falls back to a
      // per-school message naming the actual school, so chunking by school keeps that.
      if (customMessage) {
        for (let i = 0; i < numbers.length; i += CHUNK) {
          const r = await sendSms(numbers.slice(i, i + CHUNK), customMessage);
          sent += r.sent; failed += r.failed; detail = detail || r.detail;
          await recordBlacklistedNumbers(this.ds, r.blacklistedNumbers);
        }
      } else {
        for (const t of tenants) {
          if (!t.adminPhone) continue;
          const r = await sendSms([t.adminPhone], defaultMessage(t.name));
          sent += r.sent; failed += r.failed; detail = detail || r.detail;
          await recordBlacklistedNumbers(this.ds, r.blacklistedNumbers);
        }
      }
      result.sms = { attempted: numbers.length, sent, failed, detail };
      await this.recordBroadcast(req.user.id, 'incomplete', 'Setup reminder', customMessage || '(default per-school reminder)', 'sms', numbers.length, sent, failed, [], detail);
    }

    if (channels.includes('email')) {
      const withEmail = tenants.filter((t: any) => t.adminEmail);
      const BATCH = 8;
      const outcomes: any[] = [];
      for (let i = 0; i < withEmail.length; i += BATCH) {
        const batch = withEmail.slice(i, i + BATCH);
        const batchResults = await Promise.allSettled(
          batch.map((t: any) => {
            const html = customMessage ? `<p>${customMessage.replace(/\n/g, '<br/>')}</p>` : defaultEmailHtml(t.adminName, t.name);
            const text = customMessage || defaultMessage(t.name);
            return sendEmail(t.adminEmail, `Finish setting up ${t.name} on ZARODA`, html, text);
          }),
        );
        outcomes.push(...batchResults);
        if (i + BATCH < withEmail.length) await new Promise(res => setTimeout(res, 1100));
      }
      const sent = outcomes.filter(o => o.status === 'fulfilled' && (o.value as any).ok).length;
      const firstFailure = outcomes.find(o => o.status === 'fulfilled' && !(o.value as any).ok) as any;
      result.email = {
        attempted: withEmail.length, sent, failed: withEmail.length - sent,
        detail: firstFailure?.value?.detail,
      };
      await this.recordBroadcast(req.user.id, 'incomplete', 'Setup reminder', customMessage || '(default per-school reminder)', 'email', withEmail.length, sent, withEmail.length - sent, [], result.email.detail);
    }

    return result;
  }

  // Platform-wide view of subscription payments (all schools), for the owner to see
  // who has paid and follow up receipts. Table is created lazily by the billing
  // module on first use — if no school has paid yet, this just returns [].
  @Get('subscription-payments')
  async listSubscriptionPayments(@Request() req: any) {
    if (!this.isOwner(req)) return { error: 'forbidden', payments: [] };
    const rows = await this.ds.query(
      `SELECT p.id, p.amount, p.status, p.receipt_number AS "receiptNumber", p.mpesa_receipt AS "mpesaReceipt",
              p.streams_primary_js AS "streamsPrimaryJs", p.streams_senior AS "streamsSenior",
              p.description, p.created_at AS "createdAt", p.paid_at AS "paidAt",
              t.name AS "schoolName", t.subscription_paid_until AS "paidUntil"
         FROM subscription_payments p JOIN tenants t ON t.id = p.tenant_id
        ORDER BY p.created_at DESC`,
    ).catch(() => []);
    return { payments: rows };
  }

  // ── STREAM GRADE-LEVEL REPAIR (owner) ───────────────────────────────────────
  // Lists every stream with its grade level, across schools, so a mislabeled class
  // (e.g. a Grade 5 stream saved as grade_7, which makes the rubric show the wrong
  // learning areas) can be spotted and corrected. Read-only.
  @Get('streams')
  async listStreams(@Request() req: any) {
    if (!this.isOwner(req)) return { error: 'forbidden', streams: [] };
    const rows = await this.ds.query(
      `SELECT st.id, st.name, st.grade_level AS "gradeLevel",
              (SELECT name FROM schools s WHERE s.tenant_id = st.tenant_id LIMIT 1) AS "schoolName"
         FROM streams st ORDER BY "schoolName", st.grade_level, st.name`,
    ).catch(() => []);
    return { streams: rows };
  }

  // Correct a stream's grade level. This ONLY updates the class's grade label so the
  // rubric pulls the right learning areas — it does NOT touch learners or marks, which
  // are tied to the learner and subject, not the stream's grade tag.
  @Patch('streams/:id/grade-level')
  async fixStreamGrade(@Request() req: any, @Param('id') id: string, @Body() dto: { gradeLevel: string }) {
    if (!this.isOwner(req)) return { error: 'forbidden' };
    const valid = ['playgroup','pp1','pp2','grade_1','grade_2','grade_3','grade_4','grade_5','grade_6',
      'grade_7','grade_8','grade_9','grade_10','grade_11','grade_12'];
    if (!valid.includes(dto?.gradeLevel)) return { error: 'invalid grade level' };
    await this.ds.query(`UPDATE streams SET grade_level = $1 WHERE id::text = $2`, [dto.gradeLevel, id])
      .catch((e: any) => { throw new Error(e.message); });
    // Keep any learners' grade_level in sync with their class (also label-only, no marks affected).
    await this.ds.query(`UPDATE learners SET grade_level = $1 WHERE stream_id::text = $2`, [dto.gradeLevel, id]).catch(() => null);
    return { message: 'Grade level corrected', id, gradeLevel: dto.gradeLevel };
  }

  // ── PHASE 2: CONTROL ACTIONS (super_admin only, cross-tenant on purpose) ──────
  // Suspend or reactivate a school. Suspended schools' users are blocked at login
  // (enforced in auth). status: 'suspended' | 'active'.
  @Patch('tenants/:id/status')
  async setTenantStatus(@Request() req: any, @Param('id') id: string, @Body() dto: { status: string }) {
    if (!this.isOwner(req)) return { error: 'forbidden' };
    const status = dto?.status;
    if (!['active', 'suspended', 'trial', 'cancelled'].includes(status)) {
      return { error: 'Invalid status. Use active, suspended, trial or cancelled.' };
    }
    await this.ds.query(`UPDATE tenants SET status = $1, updated_at = NOW() WHERE id = $2`, [status, id])
      .catch((e: any) => { throw e; });
    return { id, status };
  }

  // PERMANENTLY delete a school and all its data. Destructive — requires the school's
  // exact name as confirmation in the body to avoid accidents.
  @Delete('tenants/:id')
  async deleteTenant(@Request() req: any, @Param('id') id: string, @Query() q: any) {
    if (!this.isOwner(req)) return { error: 'forbidden' };
    const t = (await this.ds.query(`SELECT name FROM tenants WHERE id = $1 LIMIT 1`, [id]).catch(() => []))[0];
    if (!t) return { error: 'School not found.' };
    // Compare on meaning rather than bytes. This is an accident guard — the caller
    // is already super_admin — and an individual account's name is assembled as
    // `firstName + " " + lastName`, so a trailing space in either field leaves a
    // double space nobody can reproduce by typing, making the tenant undeletable.
    const norm = (v: string) => (v || '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (norm(q.confirm) !== norm(t.name)) {
      return { error: 'confirm-mismatch', message: `Type the exact school name to confirm: ${t.name}` };
    }
    // Remove dependent rows across tenant-scoped tables, then the tenant itself.
    const tables = [
      'assessment_results', 'assessment_scores', 'teacher_stream_subjects', 'learners',
      'streams', 'exams', 'fee_items', 'invoices', 'users', 'schools',
    ];
    for (const tbl of tables) {
      await this.ds.query(`DELETE FROM ${tbl} WHERE tenant_id::text = $1`, [id]).catch(() => null);
    }
    await this.ds.query(`DELETE FROM tenants WHERE id = $1`, [id]).catch((e: any) => { throw e; });
    return { deleted: true, id, name: t.name };
  }

  // Change a school's subscription tier (free | primary | senior, or custom).
  @Patch('tenants/:id/subscription')
  async setTenantSubscription(@Request() req: any, @Param('id') id: string, @Body() dto: { tier: string; trialEndsAt?: string }) {
    if (!this.isOwner(req)) return { error: 'forbidden' };
    if (!dto?.tier) return { error: 'Tier is required.' };
    const sets = ['subscription_tier = $2', 'updated_at = NOW()'];
    const vals: any[] = [id, dto.tier];
    if (dto.trialEndsAt) { sets.push(`trial_ends_at = $${vals.length + 1}`); vals.push(dto.trialEndsAt); }
    await this.ds.query(`UPDATE tenants SET ${sets.join(', ')} WHERE id = $1`, vals)
      .catch((e: any) => { throw e; });
    return { id, tier: dto.tier };
  }

  // Essential (fee recording only) vs Pro (adds detailed reports, payroll, HR,
  // transport) — separate from the grade-band/trial `subscription_tier` above.
  @Patch('tenants/:id/plan')
  async setTenantPlan(@Request() req: any, @Param('id') id: string, @Body() dto: { planTier: string }) {
    if (!this.isOwner(req)) return { error: 'forbidden' };
    if (!['essential', 'pro'].includes(dto?.planTier)) return { error: 'planTier must be "essential" or "pro".' };
    await this.ds.query(`UPDATE tenants SET plan_tier = $2, updated_at = NOW() WHERE id = $1`, [id, dto.planTier])
      .catch((e: any) => { throw e; });
    return { id, planTier: dto.planTier };
  }

  // Edit a school's core details.
  @Patch('tenants/:id')
  async updateTenant(@Request() req: any, @Param('id') id: string, @Body() dto: any) {
    if (!this.isOwner(req)) return { error: 'forbidden' };
    const map: Record<string, string> = {
      name: 'name', phone: 'phone', email: 'email',
      county: 'county', subCounty: 'sub_county', knecCode: 'knec_code',
    };
    const sets: string[] = []; const vals: any[] = [id]; let i = 2;
    for (const [k, col] of Object.entries(map)) {
      if (dto[k] !== undefined) { sets.push(`${col} = $${i++}`); vals.push(dto[k]); }
    }
    // Ownership (public/private) gates whether the school can onboard a non-teaching
    // School Owner account. Validated here since it feeds a CHECK constraint.
    if (dto.ownership !== undefined) {
      if (!['public', 'private'].includes(dto.ownership)) return { error: 'ownership must be "public" or "private".' };
      sets.push(`ownership = $${i++}`); vals.push(dto.ownership);
    }
    if (!sets.length) return { error: 'Nothing to update.' };
    sets.push('updated_at = NOW()');
    await this.ds.query(`UPDATE tenants SET ${sets.join(', ')} WHERE id = $1`, vals)
      .catch((e: any) => { throw e; });
    return { id, updated: true };
  }

  // Recovery tool: promote an existing staff member to HOI for their own tenant. Needed
  // when a school ends up with no administrator at all (e.g. its HOI account was removed) —
  // there was previously no way to fix this short of a direct database edit. Demotes any
  // other 'hoi' row in the same tenant to class_teacher, mirroring transferHoi()'s
  // single-HOI invariant.
  @Post('users/:id/promote-hoi')
  async promoteToHoi(@Request() req: any, @Param('id') id: string) {
    if (!this.isOwner(req)) return { error: 'forbidden' };
    const target = await this.ds.query(
      `SELECT tenant_id AS "tenantId", email FROM users WHERE id = $1 LIMIT 1`, [id],
    ).catch(() => []);
    if (!target.length) return { error: 'User not found.' };
    const tenantId = target[0].tenantId;
    await this.ds.query(
      `UPDATE users SET role = 'class_teacher' WHERE tenant_id = $1 AND role = 'hoi'`, [tenantId],
    ).catch(() => null);
    await this.ds.query(`UPDATE users SET role = 'hoi' WHERE id = $1`, [id]).catch((e: any) => { throw e; });
    return { promoted: true, email: target[0].email };
  }

  // Reset a school user's password (e.g. an HOI who is locked out). Returns the new
  // temporary password once; the user is asked to change it on next login.
  @Post('users/:id/reset-password')
  async resetUserPassword(@Request() req: any, @Param('id') id: string) {
    if (!this.isOwner(req)) return { error: 'forbidden' };
    const bcryptLib = require('bcryptjs');
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    const block = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    const temp = `${block()}-${block()}`;
    const hash = await bcryptLib.hash(temp, 12);
    const rows = await this.ds.query(
      `UPDATE users SET password_hash = $2, must_change_password = true, is_active = true
        WHERE id = $1 RETURNING email`, [id, hash],
    ).catch(() => []);
    if (!rows.length) return { error: 'User not found.' };
    return { email: rows[0].email, tempPassword: temp };
  }

  // Recovery tool: correct a school user's login email. Until now nothing anywhere could
  // change an email once set except the school's own HOI — so a school whose HOI account
  // carried a typo'd address was deadlocked: the one person who could fix it was the one
  // person who couldn't log in. Resetting the password never helped, because the failure
  // was the username, not the password.
  @Patch('users/:id/email')
  async updateUserEmail(@Request() req: any, @Param('id') id: string, @Body() dto: any) {
    if (!this.isOwner(req)) return { error: 'forbidden' };
    const email = String(dto?.email || '').toLowerCase().trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) return { error: 'Enter a valid email address.' };
    const clash = await this.ds.query(
      `SELECT id FROM users WHERE lower(btrim(email)) = $1 AND id::text <> $2 LIMIT 1`, [email, id],
    ).catch(() => []);
    if (clash.length) return { error: 'Another user already uses this email address.' };
    const rows = await this.ds.query(
      `UPDATE users SET email = $2, updated_at = NOW() WHERE id::text = $1 RETURNING email`, [id, email],
    ).catch((e: any) => { throw e; });
    if (!rows.length) return { error: 'User not found.' };
    return { email: rows[0].email, updated: true };
  }
}

@Module({ controllers: [AdminController] })
export class AdminModule {}

// ── RETOOLING: platform-wide professional-development articles ───────────────
// Owner (super_admin) posts/edits; everyone authenticated can read published ones.
@Controller('retooling')
@UseGuards(JwtAuthGuard)
class RetoolingController {
  constructor(private readonly ds: DataSource) {}

  private isOwner(req: any): boolean { return req.user?.role === 'super_admin'; }

  // List articles. Owner sees all (incl. drafts); everyone else sees published only.
  @Get('articles')
  async list(@Request() req: any) {
    const owner = this.isOwner(req);
    const rows = await this.ds.query(
      `SELECT id, title, summary, category, cover_image AS "coverImage", video_url AS "videoUrl",
              is_published AS "isPublished", author_name AS "authorName", created_at AS "createdAt"
         FROM retooling_articles
        ${owner ? '' : 'WHERE is_published = true'}
        ORDER BY created_at DESC`,
    ).catch(() => []);
    return rows;
  }

  // Full single article (body included).
  @Get('articles/:id')
  async get(@Request() req: any, @Param('id') id: string) {
    const owner = this.isOwner(req);
    const rows = await this.ds.query(
      `SELECT id, title, summary, body, category, cover_image AS "coverImage", video_url AS "videoUrl",
              is_published AS "isPublished", author_name AS "authorName", created_at AS "createdAt"
         FROM retooling_articles WHERE id::text = $1 ${owner ? '' : 'AND is_published = true'} LIMIT 1`,
      [id],
    ).catch(() => []);
    if (!rows.length) return { error: 'not found' };
    return rows[0];
  }

  @Post('articles')
  async create(@Request() req: any, @Body() dto: any) {
    if (!this.isOwner(req)) return { error: 'forbidden' };
    if (!dto?.title || !dto?.body) return { error: 'Title and body are required.' };
    const rows = await this.ds.query(
      `INSERT INTO retooling_articles
         (title, summary, body, category, cover_image, video_url, is_published, author_name, created_by, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW()) RETURNING id`,
      [dto.title, dto.summary || null, dto.body, dto.category || null, dto.coverImage || null,
       dto.videoUrl || null, dto.isPublished !== false, dto.authorName || 'ZARODA', req.user.id],
    ).catch((e: any) => { throw e; });
    return { id: rows[0]?.id, message: 'Article posted' };
  }

  @Patch('articles/:id')
  async update(@Request() req: any, @Param('id') id: string, @Body() dto: any) {
    if (!this.isOwner(req)) return { error: 'forbidden' };
    const map: Record<string, string> = {
      title: 'title', summary: 'summary', body: 'body', category: 'category',
      coverImage: 'cover_image', videoUrl: 'video_url', isPublished: 'is_published', authorName: 'author_name',
    };
    const sets: string[] = []; const vals: any[] = [id]; let i = 2;
    for (const [k, col] of Object.entries(map)) {
      if (dto[k] !== undefined) { sets.push(`${col} = $${i++}`); vals.push(dto[k]); }
    }
    if (!sets.length) return { error: 'Nothing to update.' };
    sets.push('updated_at = NOW()');
    await this.ds.query(`UPDATE retooling_articles SET ${sets.join(', ')} WHERE id::text = $1`, vals)
      .catch((e: any) => { throw e; });
    return { id, updated: true };
  }

  @Delete('articles/:id')
  async remove(@Request() req: any, @Param('id') id: string) {
    if (!this.isOwner(req)) return { error: 'forbidden' };
    await this.ds.query(`DELETE FROM retooling_articles WHERE id::text = $1`, [id]).catch(() => null);
    return { deleted: true };
  }
}

// Public, unauthenticated — lets anyone (not just signed-in teachers) browse
// published retooling articles from the landing page. No auth guard on purpose;
// mirrors RetoolingController's read-only queries but always filters to published.
@Controller('public/retooling')
class PublicRetoolingController {
  constructor(private readonly ds: DataSource) {}

  @Get('articles')
  async list() {
    return this.ds.query(
      `SELECT id, title, summary, category, cover_image AS "coverImage", video_url AS "videoUrl",
              author_name AS "authorName", created_at AS "createdAt"
         FROM retooling_articles
        WHERE is_published = true
        ORDER BY created_at DESC`,
    ).catch(() => []);
  }

  @Get('articles/:id')
  async get(@Param('id') id: string) {
    const rows = await this.ds.query(
      `SELECT id, title, summary, body, category, cover_image AS "coverImage", video_url AS "videoUrl",
              author_name AS "authorName", created_at AS "createdAt"
         FROM retooling_articles WHERE id::text = $1 AND is_published = true LIMIT 1`,
      [id],
    ).catch(() => []);
    if (!rows.length) return { error: 'not found' };
    return rows[0];
  }
}

@Module({ controllers: [RetoolingController, PublicRetoolingController] })
export class RetoolingModule {}

// ── TESTIMONIALS: real users' written experience with Zaroda ─────────────────
// Any authenticated user can submit one. Only the platform owner (super_admin)
// can list them across every tenant — this exists to gather genuine evidence
// of impact (award submissions, case studies), never to fabricate quotes.
@Controller('testimonials')
@UseGuards(JwtAuthGuard)
class TestimonialController {
  constructor(private readonly ds: DataSource) {}

  private isOwner(req: any): boolean { return req.user?.role === 'super_admin'; }

  @Post()
  async submit(@Request() req: any, @Body() dto: any) {
    if (!dto?.message || !dto.message.trim()) return { error: 'Please write a few words about your experience.' };
    const user = await this.ds.query(
      `SELECT first_name AS "firstName", last_name AS "lastName", role, email,
              (SELECT name FROM tenants WHERE id = u.tenant_id) AS "tenantName"
         FROM users u WHERE id = $1`,
      [req.user.id],
    ).catch(() => []);
    const u = user[0] || {};
    const rating = Number(dto.rating);

    // A learner has no login of their own — a parent can voice a testimonial on
    // behalf of a specific child, distinct from the parent's own. Only allowed for
    // the parent's own children (guardian_email match), never an arbitrary learner.
    let authorName = `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'A Zaroda user';
    let authorRole = u.role || req.user.role;
    const onBehalfOfLearnerId = dto.onBehalfOfLearnerId ? String(dto.onBehalfOfLearnerId) : null;
    if (onBehalfOfLearnerId) {
      if (u.role !== 'parent') return { error: 'Only a parent account can submit a testimonial on behalf of a learner.' };
      const learner = (await this.ds.query(
        `SELECT first_name AS "firstName", last_name AS "lastName" FROM learners
          WHERE id::text = $1 AND tenant_id::text = $2 AND LOWER(guardian_email) = $3`,
        [onBehalfOfLearnerId, req.user.tenantId, String(u.email || '').toLowerCase().trim()],
      ).catch(() => []))[0];
      if (!learner) return { error: 'Learner not found on your account.' };
      authorName = `${learner.firstName || ''} ${learner.lastName || ''}`.trim() || 'A Zaroda learner';
      authorRole = 'learner';
    }

    const rows = await this.ds.query(
      `INSERT INTO testimonials (tenant_id, user_id, author_name, author_role, school_name, message, rating, allow_public_use, on_behalf_of_learner_id, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW()) RETURNING id`,
      [
        req.user.tenantId, req.user.id,
        authorName, authorRole, u.tenantName || null,
        dto.message.trim(), Number.isFinite(rating) && rating >= 1 && rating <= 5 ? rating : null,
        dto.allowPublicUse !== false, onBehalfOfLearnerId,
      ],
    ).catch((e: any) => { throw e; });
    return { id: rows[0]?.id, message: 'Thank you — your testimonial has been recorded.' };
  }

  // Whether the current user has already submitted one (the prompt shouldn't nag
  // twice) — scoped separately per child when ?learnerId= is given, since a parent's
  // own testimonial and one voiced for a specific child are tracked independently.
  @Get('mine')
  async mine(@Request() req: any, @Query('learnerId') learnerId?: string) {
    const rows = await this.ds.query(
      `SELECT id, message, rating FROM testimonials WHERE user_id = $1 AND on_behalf_of_learner_id IS NOT DISTINCT FROM $2 LIMIT 1`,
      [req.user.id, learnerId || null],
    ).catch(() => []);
    return { submitted: rows.length > 0, testimonial: rows[0] || null };
  }

  // Platform-wide list, owner only — for compiling award/case-study evidence.
  // Archived testimonials are hidden unless explicitly requested (status=archived
  // or status=all) — that's the point of archiving one.
  @Get()
  async list(@Request() req: any, @Query() q: any) {
    if (!this.isOwner(req)) return { error: 'forbidden', data: [] };
    const status = ['submitted', 'featured', 'archived'].includes(q.status) ? q.status : null;
    const where = status ? 'WHERE t.status = $1' : (q.status === 'all' ? '' : `WHERE t.status <> 'archived'`);
    const rows = await this.ds.query(
      // documentsGenerated ties the claim to something checkable — a testimonial
      // whose wording implies heavy use but whose author has generated 0 real
      // documents is a mismatch worth catching before it's featured, not after
      // someone else cross-references it.
      `SELECT t.id, t.author_name AS "authorName", t.author_role AS "authorRole", t.school_name AS "schoolName",
              t.message, t.rating, t.allow_public_use AS "allowPublicUse", t.status, t.created_at AS "createdAt",
              (
                COALESCE((SELECT COUNT(*) FROM schemes_of_work WHERE teacher_id = t.user_id), 0) +
                COALESCE((SELECT COUNT(*) FROM lesson_plans WHERE teacher_id = t.user_id), 0) +
                COALESCE((SELECT COUNT(*) FROM lesson_notes WHERE teacher_id = t.user_id), 0)
              )::int AS "documentsGenerated"
         FROM testimonials t
        ${where}
        ORDER BY t.created_at DESC`,
      status ? [status] : [],
    ).catch(() => []);
    return rows;
  }

  @Patch(':id')
  async updateStatus(@Request() req: any, @Param('id') id: string, @Body() dto: any) {
    if (!this.isOwner(req)) return { error: 'forbidden' };
    if (!['submitted', 'featured', 'archived'].includes(dto.status)) return { error: 'Invalid status.' };
    await this.ds.query(`UPDATE testimonials SET status = $2 WHERE id::text = $1`, [id, dto.status]).catch(() => null);
    return { id, updated: true };
  }

  // Permanently remove — the owner can delete any; a regular user can delete
  // only their own (retracting a testimonial they wrote).
  @Delete(':id')
  async remove(@Request() req: any, @Param('id') id: string) {
    const owner = this.isOwner(req);
    const result = await this.ds.query(
      `DELETE FROM testimonials WHERE id::text = $1 ${owner ? '' : 'AND user_id = $2'}`,
      owner ? [id] : [id, req.user.id],
    ).catch(() => null);
    return { deleted: true };
  }
}

// Public, unauthenticated — the landing page pulls only testimonials the
// author explicitly agreed to have used publicly, and only ones the owner
// has featured. No auth guard on purpose.
@Controller('public/testimonials')
class PublicTestimonialController {
  constructor(private readonly ds: DataSource) {}

  @Get()
  async list() {
    return this.ds.query(
      `SELECT t.author_name AS "authorName", t.author_role AS "authorRole", t.school_name AS "schoolName",
              t.message, t.rating, t.created_at AS "createdAt",
              (
                COALESCE((SELECT COUNT(*) FROM schemes_of_work WHERE teacher_id = t.user_id), 0) +
                COALESCE((SELECT COUNT(*) FROM lesson_plans WHERE teacher_id = t.user_id), 0) +
                COALESCE((SELECT COUNT(*) FROM lesson_notes WHERE teacher_id = t.user_id), 0)
              )::int AS "documentsGenerated"
         FROM testimonials t
        WHERE t.status = 'featured' AND t.allow_public_use = true
        ORDER BY t.created_at DESC
        LIMIT 12`,
    ).catch(() => []);
  }
}

@Module({ controllers: [TestimonialController, PublicTestimonialController] })
export class TestimonialModule {}
