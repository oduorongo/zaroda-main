// ============================================================
// ZARODA SMS — Stub Modules
// These return proper empty API responses so the frontend
// renders gracefully while the full business logic is wired.
// Replace each stub with the full service as you build out.
// ============================================================

import { Module, Controller, Get, Post, Patch, Delete, Param, Query, Body, Request, Res, UseGuards, BadRequestException } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, DataSource } from 'typeorm';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

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

@Controller('finance')
@UseGuards(JwtAuthGuard)
class FinanceController {
  constructor(private readonly ds: DataSource) {}

  // ── FEE STRUCTURES (set by HOI / bursar / admin) ──────────
  @Get('fee-structures')
  async getFeeStructures(@Request() req: any) {
    await this.ensureFeeItemsTable();
    return this.ds.query(
      `SELECT id, name, grade_level AS "gradeLevel", term, academic_year AS "academicYear",
              category, amount, is_mandatory AS "isMandatory", created_at AS "createdAt"
         FROM fee_items WHERE tenant_id = $1 ORDER BY created_at DESC`,
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
             (tenant_id, school_id, name, grade_level, term, academic_year, category, amount, is_mandatory, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
           RETURNING id, name, grade_level AS "gradeLevel", term, academic_year AS "academicYear",
                     category, amount, is_mandatory AS "isMandatory"`,
          [
            req.user.tenantId, req.user.schoolId || null,
            String(dto.name).trim(), grade_level, dto.term || null,
            dto.academicYear || null, dto.category || 'tuition',
            Number(dto.amount) || 0, dto.isMandatory !== false,
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

  @Get('invoices')
  getInvoices(@Request() req: any, @Query() q: any) {
    // TODO: implement invoice query with learner join
    return [];
  }

  @Get('invoices/:id')
  getInvoice(@Param('id') id: string) { return null; }

  @Post('invoices')
  createInvoice(@Request() req: any, @Body() dto: any) { return { id: 'stub', ...dto }; }

  @Get('receipts')
  getReceipts(@Request() req: any) { return []; }

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
    vals.push(id, req.user.tenantId);
    try {
      const rows = await this.ds.query(
        `UPDATE payments SET ${fields.join(', ')} WHERE id::text = $${i++} AND tenant_id = $${i}
         RETURNING id, amount, method, receipt_number AS "receiptNumber", paid_on AS "paidOn"`,
        vals,
      );
      if (!rows.length) throw new BadRequestException('Payment not found.');
      return rows[0];
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
    if (!['hoi', 'dhois', 'tenant_owner', 'school_admin', 'bursar'].includes(role)) {
      throw new BadRequestException('Only the bursar or an administrator can record payments.');
    }
    if (!dto?.learnerId) throw new BadRequestException('Please select a learner.');
    const amount = Number(dto.amount);
    if (!amount || amount <= 0) throw new BadRequestException('Enter a valid amount.');
    await this.ensurePaymentsTable();

    // Receipt number: ZRD-<short tenant>-<YYMMDD>-<random>
    const receiptNumber = `ZRD-${String(req.user.tenantId).slice(0, 4).toUpperCase()}-${new Date().toISOString().slice(2,10).replace(/-/g,'')}-${Math.floor(1000 + Math.random()*9000)}`;
    const recorder = req.user.id || null;   // store the user's UUID (recorded_by may be a uuid column)
    const recorderName = req.user.email || '';
    try {
      const rows = await this.ds.query(
        `INSERT INTO payments
           (tenant_id, school_id, learner_id, learner_name, admission_number, amount, method,
            reference, note, term, academic_year, receipt_number, recorded_by, recorded_by_name, paid_on, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW())
         RETURNING id, receipt_number AS "receiptNumber", amount, method, paid_on AS "paidOn"`,
        [
          req.user.tenantId, req.user.schoolId || null, dto.learnerId,
          dto.learnerName || null, dto.admissionNumber || null, amount,
          dto.method || 'cash', dto.reference || null, dto.note || null,
          dto.term || null, dto.academicYear || null, receiptNumber, recorder, recorderName,
          dto.paidOn || new Date().toISOString().slice(0, 10),
        ],
      );
      return rows[0];
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
              receipt_number AS "receiptNumber", paid_on AS "paidOn", created_at AS "createdAt"
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

  @Post('mpesa/stk-push')
  stkPush(@Request() req: any, @Body() dto: { invoiceId: string; phone: string }) {
    // TODO: integrate Safaricom Daraja STK Push
    return { message: 'M-Pesa STK Push sent (configure MPESA_* env vars)', phone: dto.phone };
  }

  @Post('mpesa/callback')
  mpesaCallback(@Body() body: any) {
    // Safaricom sends payment confirmation here
    console.log('M-Pesa callback received:', body);
    return { ResultCode: 0, ResultDesc: 'Accepted' };
  }

  @Get('payroll')
  getPayroll(@Request() req: any) { return []; }

  @Get('expenses')
  async getExpenses(@Request() req: any) {
    await this.ensureExpensesTable();
    return this.ds.query(
      `SELECT id, category, description, amount, spent_on AS "spentOn", created_at AS "createdAt"
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
      `INSERT INTO expenses (tenant_id, school_id, category, description, amount, spent_on, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW())
       RETURNING id, category, description, amount, spent_on AS "spentOn"`,
      [req.user.tenantId, req.user.schoolId || null, dto.category || 'General',
       dto.description || null, Number(dto.amount), dto.spentOn || new Date().toISOString().slice(0, 10)],
    ).catch((e: any) => { throw new BadRequestException(e.message); });
    return rows[0];
  }

  @Get('reports/:key')
  async getReport(@Request() req: any, @Param('key') key: string, @Res() res: any) {
    // Lightweight CSV report so the Accounting tab works without a heavy PDF engine.
    const tenantId = req.user.tenantId;
    let title = key, header = 'Item,Amount', lines: string[] = [];
    try {
      if (key === 'income') {
        const rows = await this.ds.query(
          `SELECT name AS item, amount FROM fee_items WHERE tenant_id = $1 ORDER BY created_at DESC`, [tenantId],
        ).catch(() => []);
        title = 'Income (Fee Items)'; lines = rows.map((r: any) => `${String(r.item).replace(/,/g,' ')},${r.amount}`);
      } else if (key === 'expenses') {
        const rows = await this.ds.query(
          `SELECT category, description, amount FROM expenses WHERE tenant_id = $1 ORDER BY created_at DESC`, [tenantId],
        ).catch(() => []);
        title = 'Expenses'; header = 'Category,Description,Amount';
        lines = rows.map((r: any) => `${String(r.category||'').replace(/,/g,' ')},${String(r.description||'').replace(/,/g,' ')},${r.amount}`);
      } else {
        title = 'Report'; lines = [];
      }
      const csv = `${title}\n${header}\n${lines.join('\n')}\n`;
      res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${key}-report.csv"` });
      res.send(csv);
    } catch (e: any) {
      res.status(200).set({ 'Content-Type': 'text/csv' }).send(`${title}\n${header}\n`);
    }
  }

  @Get('dashboard')
  getDashboard(@Request() req: any) {
    return { totalCollected: 0, outstanding: 0, totalLearners: 0, fullyPaid: 0 };
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Invoice])],
  controllers: [FinanceController],
})
export class FinanceModule {}


// ═══════════════════════════════════════════════════════════
// COMMUNICATION MODULE
// ═══════════════════════════════════════════════════════════
@Entity('announcements')
class Announcement {
  @PrimaryGeneratedColumn('uuid') id:        string;
  @Column({ name: 'tenant_id' })  tenantId:  string;
  @Column()                       title:     string;
  @Column({ type: 'text' })       content:   string;
  @Column({ default: 'all' })     audience:  string;
  @Column({ default: 'normal' })  priority:  string;
  @Column({ default: 'push' })    channel:   string;
  @Column({ name: 'created_by', nullable: true }) createdBy: string;
  @Column({ name: 'sent_at', nullable: true }) sentAt: Date;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}

@Controller('communication')
@UseGuards(JwtAuthGuard)
class CommunicationController {
  @Get('announcements')
  getAnnouncements(@Request() req: any) { return []; }

  @Post('announcements')
  createAnnouncement(@Request() req: any, @Body() dto: any) {
    // TODO: integrate AT SMS, FCM push, email
    return { id: 'stub', ...dto, sentAt: new Date(), message: 'Announcement queued for delivery' };
  }

  @Get('messages')
  getMessages(@Request() req: any) { return []; }

  @Post('messages')
  sendMessage(@Request() req: any, @Body() dto: any) { return { id: 'stub', ...dto }; }

  @Post('fee-reminders')
  sendFeeReminders(@Request() req: any, @Body() dto: any) {
    // TODO: query outstanding invoices and send personalised SMS/WhatsApp
    return { message: 'Fee reminders sent (configure AT_API_KEY env var)', count: 0 };
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Announcement])],
  controllers: [CommunicationController],
})
export class CommunicationModule {}


// ═══════════════════════════════════════════════════════════
// PROFESSIONAL RECORDS MODULE
// ═══════════════════════════════════════════════════════════
@Entity('schemes_of_work')
class SchemeOfWork {
  @PrimaryGeneratedColumn('uuid') id:            string;
  @Column({ name: 'tenant_id' })  tenantId:      string;
  @Column({ name: 'teacher_id' }) teacherId:     string;
  @Column()                       subject:       string;
  @Column()                       grade:         string;
  @Column()                       term:          string;
  @Column({ name: 'academic_year' }) academicYear: string;
  @Column({ default: 'draft' })   status:        string;
  @Column({ name: 'is_ai_generated', default: false }) isAiGenerated: boolean;
  @Column({ name: 'hoi_comment', nullable: true }) hoiComment: string;
  @Column({ nullable: true })     title:         string;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}

@Controller('professional-records')
@UseGuards(JwtAuthGuard)
class ProRecordsController {
  constructor(private readonly ds: DataSource) {}

  private async ensureTable() {
    await this.ds.query(
      `CREATE TABLE IF NOT EXISTS schemes_of_work (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         tenant_id uuid, created_at timestamptz DEFAULT NOW()
       )`,
    ).catch(() => null);
    const cols: [string, string][] = [
      ['teacher_id', 'uuid'], ['teacher_name', 'text'], ['record_type', 'text'],
      ['subject', 'text'], ['grade', 'text'], ['term', 'text'], ['academic_year', 'text'],
      ['title', 'text'], ['content', 'text'], ['status', "text DEFAULT 'draft'"],
      ['is_ai_generated', 'boolean DEFAULT false'], ['hoi_comment', 'text'],
      ['updated_at', 'timestamptz DEFAULT NOW()'], ['created_at', 'timestamptz DEFAULT NOW()'],
    ];
    for (const [n, t] of cols) {
      await this.ds.query(`ALTER TABLE schemes_of_work ADD COLUMN IF NOT EXISTS ${n} ${t}`).catch(() => null);
    }
    const notNull = await this.ds.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'schemes_of_work' AND is_nullable = 'NO' AND column_default IS NULL`,
    ).catch(() => []);
    for (const row of (notNull as any[])) {
      if (['id', 'tenant_id'].includes(row.column_name)) continue;
      await this.ds.query(`ALTER TABLE schemes_of_work ALTER COLUMN ${row.column_name} DROP NOT NULL`).catch(() => null);
    }
  }

  private isHoi(role: string) { return ['hoi', 'dhois', 'tenant_owner', 'school_admin'].includes(role); }

  // List records. Teachers see their own; HOI/admin see all (esp. submitted ones to review).
  @Get('schemes')
  async getSchemes(@Request() req: any, @Query() q: any) {
    await this.ensureTable();
    const tenantId = req.user.tenantId;
    const type = q.type || null;
    const params: any[] = [tenantId];
    let where = `tenant_id = $1`;
    if (this.isHoi(req.user.role)) {
      // sees all
    } else {
      params.push(req.user.id); where += ` AND teacher_id = $${params.length}`;
    }
    if (type) { params.push(type); where += ` AND record_type = $${params.length}`; }
    return this.ds.query(
      `SELECT id, teacher_id AS "teacherId", teacher_name AS "teacherName", record_type AS "recordType",
              subject, grade, term, academic_year AS "academicYear", title, content, status,
              is_ai_generated AS "isAiGenerated", hoi_comment AS "hoiComment",
              created_at AS "createdAt", updated_at AS "updatedAt"
         FROM schemes_of_work WHERE ${where} ORDER BY created_at DESC`,
      params,
    ).catch(() => []);
  }

  // Create a record. If ANTHROPIC_API_KEY is set, AI-generate the content; otherwise create a
  // draft the teacher can fill in/edit manually (the module works either way).
  @Post('schemes/generate')
  async generateScheme(@Request() req: any, @Body() dto: any) {
    await this.ensureTable();
    const recordType = dto.recordType || 'scheme_of_work';
    const title = dto.title || `${(recordType || '').replace(/_/g, ' ')} — ${dto.subject} ${dto.grade}`;
    let content = dto.content || '';
    let aiGenerated = false;

    if (!content && process.env.ANTHROPIC_API_KEY) {
      try {
        content = await this.aiGenerate(recordType, dto);
        aiGenerated = true;
      } catch { content = ''; }
    }

    const rows = await this.ds.query(
      `INSERT INTO schemes_of_work
         (tenant_id, teacher_id, teacher_name, record_type, subject, grade, term, academic_year,
          title, content, status, is_ai_generated, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'draft',$11,NOW(),NOW())
       RETURNING id, record_type AS "recordType", subject, grade, term,
                 academic_year AS "academicYear", title, content, status, is_ai_generated AS "isAiGenerated"`,
      [
        req.user.tenantId, req.user.id, req.user.email || null, recordType,
        dto.subject || null, dto.grade || null, dto.term || null, dto.academicYear || null,
        title, content, aiGenerated,
      ],
    ).catch((e: any) => { throw new BadRequestException(`Could not create record: ${e.message}`); });

    const out = rows[0];
    if (!content && !process.env.ANTHROPIC_API_KEY) {
      out.message = 'Saved as draft. AI generation is off (set ANTHROPIC_API_KEY) — you can write or paste the content using Edit.';
    }
    return out;
  }

  private async aiGenerate(recordType: string, dto: any): Promise<string> {
    // Resolved at runtime via an indirect require so the build never depends on the package
    // being installed/typed. AI only runs when ANTHROPIC_API_KEY is set anyway.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const req: any = eval('require');
    const Anthropic = req('@anthropic-ai/sdk').default || req('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const kinds: Record<string, string> = {
      scheme_of_work: 'a complete CBC Scheme of Work broken into weeks and lessons with strand, sub-strand, specific learning outcomes, key inquiry questions, learning experiences, learning resources, and assessment methods',
      lesson_plan: 'a detailed CBC Lesson Plan with strand/sub-strand, specific learning outcomes, key inquiry question, introduction/development/conclusion steps, core competencies, values, resources and assessment',
      lesson_notes: 'clear CBC Lesson Notes — the actual subject content a teacher delivers for this topic',
      record_of_work: 'a CBC Record of Work Covered template with week, date, work covered and remarks columns',
    };
    const want = kinds[recordType] || kinds.scheme_of_work;
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: `You are a Kenyan CBC/CBE curriculum expert. Produce ${want} for ${dto.subject}, ${dto.grade}, ${String(dto.term||'').replace('term_','Term ')}, ${dto.academicYear}. Follow KICD/KNEC formats strictly. Only include strands and sub-strands that exist in the official KICD design for this grade and subject. Return clean, well-structured content.`,
      }],
    });
    const block: any = msg.content?.[0];
    return block && block.type === 'text' ? block.text : '';
  }

  @Patch('schemes/:id')
  async updateScheme(@Request() req: any, @Param('id') id: string, @Body() dto: any) {
    await this.ensureTable();
    const fields: string[] = []; const vals: any[] = []; let i = 1;
    for (const [k, col] of Object.entries({ title: 'title', content: 'content', subject: 'subject', grade: 'grade', term: 'term', academicYear: 'academic_year' })) {
      if (dto[k] !== undefined) { fields.push(`${col} = $${i++}`); vals.push(dto[k]); }
    }
    if (!fields.length) return { updated: false };
    fields.push(`updated_at = NOW()`);
    vals.push(id, req.user.tenantId);
    // Teachers may only edit their own; HOI may edit any.
    const ownClause = this.isHoi(req.user.role) ? '' : ` AND teacher_id = $${i + 2}`;
    if (ownClause) vals.push(req.user.id);
    const rows = await this.ds.query(
      `UPDATE schemes_of_work SET ${fields.join(', ')} WHERE id::text = $${i++} AND tenant_id = $${i}${ownClause}
       RETURNING id, status`, vals,
    ).catch((e: any) => { throw new BadRequestException(e.message); });
    if (!rows.length) throw new BadRequestException('Record not found or not yours to edit.');
    return rows[0];
  }

  @Patch('schemes/:id/submit')
  async submitScheme(@Request() req: any, @Param('id') id: string) {
    await this.ensureTable();
    const rows = await this.ds.query(
      `UPDATE schemes_of_work SET status = 'submitted', updated_at = NOW()
        WHERE id::text = $1 AND tenant_id = $2 AND teacher_id = $3 RETURNING id, status`,
      [id, req.user.tenantId, req.user.id],
    ).catch(() => []);
    if (!rows.length) throw new BadRequestException('Record not found or not yours.');
    return rows[0];
  }

  @Patch('schemes/:id/approve')
  async approveScheme(@Request() req: any, @Param('id') id: string) {
    await this.ensureTable();
    if (!this.isHoi(req.user.role)) throw new BadRequestException('Only the HOI/DHOI can approve.');
    const rows = await this.ds.query(
      `UPDATE schemes_of_work SET status = 'approved', hoi_comment = NULL, updated_at = NOW()
        WHERE id::text = $1 AND tenant_id = $2 RETURNING id, status`,
      [id, req.user.tenantId],
    ).catch(() => []);
    if (!rows.length) throw new BadRequestException('Record not found.');
    return rows[0];
  }

  @Patch('schemes/:id/reject')
  async rejectScheme(@Request() req: any, @Param('id') id: string, @Body() dto: any) {
    await this.ensureTable();
    if (!this.isHoi(req.user.role)) throw new BadRequestException('Only the HOI/DHOI can reject.');
    const rows = await this.ds.query(
      `UPDATE schemes_of_work SET status = 'rejected', hoi_comment = $3, updated_at = NOW()
        WHERE id::text = $1 AND tenant_id = $2 RETURNING id, status, hoi_comment AS "hoiComment"`,
      [id, req.user.tenantId, dto.comment || 'Please revise.'],
    ).catch(() => []);
    if (!rows.length) throw new BadRequestException('Record not found.');
    return rows[0];
  }

  @Delete('schemes/:id')
  async deleteScheme(@Request() req: any, @Param('id') id: string) {
    await this.ensureTable();
    const ownClause = this.isHoi(req.user.role) ? '' : ` AND teacher_id = '${req.user.id}'`;
    await this.ds.query(`DELETE FROM schemes_of_work WHERE id::text = $1 AND tenant_id = $2${ownClause}`,
      [id, req.user.tenantId]).catch(() => null);
    return { deleted: true };
  }

  // Printable HTML for export (works for any record type).
  @Get('schemes/:id/html')
  async schemeHtml(@Request() req: any, @Param('id') id: string, @Res() res: any) {
    await this.ensureTable();
    const rows = await this.ds.query(
      `SELECT s.*, (SELECT name FROM schools sc WHERE sc.tenant_id = s.tenant_id LIMIT 1) AS "schoolName"
         FROM schemes_of_work s WHERE s.id::text = $1 AND s.tenant_id = $2 LIMIT 1`,
      [id, req.user.tenantId],
    ).catch(() => []);
    if (!rows.length) { res.status(404).send('<p>Record not found</p>'); return; }
    const r = rows[0];
    const esc = (s: any) => String(s ?? '').replace(/[&<>]/g, (c: string) => ({ '&':'&amp;','<':'&lt;','>':'&gt;' }[c] || c));
    const body = esc(r.content || '(No content yet — open the record and add content.)').replace(/\n/g, '<br>');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(r.title)}</title>
      <style>body{font-family:Arial,sans-serif;color:#1a2e5a;max-width:860px;margin:24px auto;padding:0 20px;line-height:1.5}
      .h{text-align:center;border-bottom:3px solid #d4af37;padding-bottom:10px;margin-bottom:16px}.h h1{margin:0;font-size:20px}
      .meta{font-size:12px;color:#555}.sig{margin-top:40px;font-size:13px}.foot{margin-top:24px;font-size:11px;color:#777;text-align:center}
      @media print{button{display:none}}</style></head><body>
      <div class="h"><h1>${esc(r.schoolName || 'ZARODA School')}</h1>
        <div class="meta">${esc((r.record_type||'').replace(/_/g,' ').toUpperCase())} · ${esc(r.subject||'')} · ${esc(r.grade||'')} · ${esc(String(r.term||'').replace('term_','Term '))} ${esc(r.academic_year||'')}</div></div>
      <div>${body}</div>
      <div class="sig">Prepared by: ${esc(r.teacher_name || '________________')}　　　Checked by D.H.O.I: ________________</div>
      <div class="foot">Generated by ZARODA SOLUTIONS</div>
      <div style="text-align:center;margin-top:16px"><button onclick="window.print()" style="background:#1a2e5a;color:#fff;border:none;padding:10px 22px;border-radius:8px;cursor:pointer">Print / Save as PDF</button></div>
      </body></html>`;
    res.set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.send(html);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([SchemeOfWork])],
  controllers: [ProRecordsController],
})
export class ProfessionalRecordsModule {}


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
        ? ((await this.ds.query(`SELECT name FROM exams WHERE id::text = $1 LIMIT 1`, [examId]).catch(() => []))[0]?.name || '')
        : '';
      const rows = await this.ds.query(
        `SELECT l.first_name AS "firstName", l.last_name AS "lastName", l.admission_number AS "adm",
                ar.raw_score AS "raw", ar.max_score AS "max", ar.percent
           FROM assessment_results ar
           LEFT JOIN learners l ON l.id::text = ar.learner_id::text
          WHERE ar.tenant_id::text = $1 AND ar.stream_id::text = $2 AND ar.subject = $3
            AND ($4::text IS NULL OR ar.term = $4)
            AND ($5::text IS NULL OR ar.exam_id::text = $5)`,
        [tenantId, streamId, subject, term || null, examId || null],
      ).catch(() => []);

      const senior = ['grade_7','grade_8','grade_9','grade_10','grade_11','grade_12'].includes(stream.gradeLevel || '');
      const lvl = (p: number) => senior
        ? (p>=90?'EE1':p>=75?'EE2':p>=58?'ME1':p>=41?'ME2':p>=31?'AE1':p>=21?'AE2':p>=11?'BE1':'BE2')
        : (p>=76?'EE':p>=51?'ME':p>=26?'AE':'BE');

      const ranked = rows
        .filter((r: any) => r.percent != null)
        .map((r: any) => ({ ...r, pct: Math.round(Number(r.percent)) }))
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
        <div class="f">Powered by ZARODA SOLUTIONS</div>
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
        ? ((await this.ds.query(`SELECT name FROM exams WHERE id::text = $1 LIMIT 1`, [examId]).catch(() => []))[0]?.name || '')
        : (examType || '');

      const rows = await this.ds.query(
        `SELECT ar.learner_id AS "learnerId", l.first_name AS "firstName", l.last_name AS "lastName",
                l.admission_number AS "adm", ar.subject, ar.percent, ar.raw_score AS "raw"
           FROM assessment_results ar
           LEFT JOIN learners l ON l.id::text = ar.learner_id::text
          WHERE ar.tenant_id::text = $1 AND ar.stream_id::text = $2
            AND ($3::text IS NULL OR ar.term = $3)
            AND ($4::text IS NULL OR ar.exam_id::text = $4)
          ORDER BY l.first_name`,
        [tenantId, streamId, term || null, examId || null],
      ).catch(() => []);

      const senior = ['grade_7','grade_8','grade_9','grade_10','grade_11','grade_12'].includes(stream.gradeLevel || '');
      const lvl = (p: number) => (p>=76?'EE':p>=51?'ME':p>=26?'AE':'BE');
      const pts = (p: number) => senior
        ? (p>=90?8:p>=75?7:p>=58?6:p>=41?5:p>=31?4:p>=21?3:p>=11?2:1)
        : (p>=76?4:p>=51?3:p>=26?2:1);

      // Authoritative column list = the seeded rubric areas for this grade (SAME as the on-screen
      // mark list), NOT just the subjects that happen to have marks. This guarantees identical
      // columns and an identical average denominator (missing marks count as a gap).
      const rubricRows = await this.ds.query(
        `SELECT DISTINCT learning_area AS area FROM assessment_templates
          WHERE grade_level = $1 AND (tenant_id IS NULL OR tenant_id::text = $2) ORDER BY learning_area`,
        [stream.gradeLevel, tenantId],
      ).catch(() => []);
      let subjects: string[] = Array.from(new Set<string>((rubricRows as any[]).map(r => String(r.area)).filter(Boolean)))
        .filter(a => !/indigenous|indeg/i.test(a));
      if (!subjects.length) subjects = Array.from(new Set<string>(rows.map((r: any) => String(r.subject)))).sort();
      const areaByKey = new Map(subjects.map(s => [s.toLowerCase().trim(), s]));
      const areaCount = subjects.length || 1;

      // Pivot: learner → subject → {percent, level}; match marks onto canonical rubric columns.
      const byLearner: Record<string, any> = {};
      for (const r of rows) {
        const L = (byLearner[r.learnerId] = byLearner[r.learnerId] || { name: `${r.firstName||''} ${r.lastName||''}`.trim(), adm: r.adm, marks: {}, points: 0, pctSum: 0, count: 0 });
        if (r.percent != null) {
          const col = areaByKey.get(String(r.subject).toLowerCase().trim());
          if (col) { L.marks[col] = { pct: Math.round(r.percent), level: lvl(r.percent) }; L.points += pts(r.percent); L.pctSum += Number(r.percent); L.count++; }
        }
      }
      const maxPoints = subjects.length * (senior ? 8 : 4);
      // Total performance level = sum of each area's performance points (missing area = 0). This
      // SUM is the ranking basis, so the Points column IS the rank and can't contradict it.
      // Average % is shown for information and only breaks ties. Rank: Points → avg % → name,
      // IDENTICAL to the on-screen mark list.
      const learners = Object.values(byLearner).map((L: any) => {
        L.avgPctExact = L.pctSum / areaCount;                 // precise, for tie-break + display
        L.avgPct = Math.round(L.avgPctExact);                 // rounded, for display
        L.avgLevel = L.count ? lvl(L.avgPct) : '';
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
        <table><thead><tr><th>#</th><th>Learner</th><th>Adm</th>${head}<th>Points</th><th>Level</th></tr></thead>
        <tbody>${body || `<tr><td colspan="${subjects.length+5}">No marks found for this assessment.</td></tr>`}</tbody></table>
        <div class="ml-foot">Powered by ZARODA SOLUTIONS</div>
        <div class="no-print"><button onclick="window.print()" style="background:#1a2e5a;color:#fff;border:none;padding:10px 22px;border-radius:8px;cursor:pointer">Print / Save as PDF</button></div>
        <script>window.addEventListener('load',function(){setTimeout(function(){window.print();},400);});</script>
        </body></html>`;
      res.set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.send(html);
    } catch (e: any) {
      res.status(500).send(`<p style="font-family:sans-serif">Could not build mark list: ${e?.message || 'error'}</p>`);
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
      const html = await this.buildReportCardHtml(req.user.tenantId, learnerId, q.term, q.academicYear || '2025/2026', true);
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
      const pages: string[] = [];
      for (const l of learners) {
        const card = await this.buildReportCardHtml(tenantId, l.id, term, academicYear || '2025/2026', false).catch(() => '');
        if (card) pages.push(card);
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
              l.grade_level AS "gradeLevel",
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
        ORDER BY e.created_at ASC`,
      [tenantId, term || null],
    ).catch(() => []);

    // Per learning area, the percent for each assessment + overall average.
    const rows = await this.ds.query(
      `SELECT subject, exam_id AS "examId", percent
         FROM assessment_results
        WHERE tenant_id::text = $1 AND learner_id::text = $2 AND ($3::text IS NULL OR term = $3)
          AND percent IS NOT NULL`,
      [tenantId, learnerId, term || null],
    ).catch(() => []);

    const esc = (s: any) => String(s ?? '').replace(/[&<>]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c] as string));

    // area -> { examId -> percent }, plus the set of areas.
    const byArea: Record<string, Record<string, number>> = {};
    for (const r of rows) {
      (byArea[r.subject] = byArea[r.subject] || {})[r.examId || 'x'] = Math.round(Number(r.percent));
    }
    const areaNames = Object.keys(byArea).sort();
    // Only show assessment columns that actually have marks.
    const usedExams = assessments.filter((a: any) => rows.some((r: any) => r.examId === a.id));
    const cols = usedExams.length ? usedExams : [{ id: 'x', name: 'Score' }];

    let totalPoints = 0; const maxPoints = areaNames.length * (senior ? 8 : 4);
    const body = areaNames.map((area: string) => {
      const cells = cols.map((c: any) => {
        const p = byArea[area][c.id];
        return p != null ? `<td class="c">${p}% <b>${lvl(p)}</b></td>` : `<td class="c">-</td>`;
      }).join('');
      // Average across this area's assessments for the term column + points.
      const vals = Object.values(byArea[area]);
      const avg = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
      totalPoints += pts(avg);
      return `<tr><td>${esc(area)}</td>${cells}<td class="c"><b>${avg}% ${lvl(avg)}</b></td></tr>`;
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
    let teacherComment = openers[overallFam] || openers.BE;
    if (strong.length) teacherComment += ` Particular strength is evident in ${listN(strong)}.`;
    else if (meeting.length) teacherComment += ` Competency is well demonstrated in ${listN(meeting)}.`;
    teacherComment += nextSteps[overallFam] || '';
    const hoiRemark: Record<string, string> = {
      EE: `An excellent competency profile. ${fn} is encouraged to sustain this exemplary effort.`,
      ME: `A commendable competency profile. ${fn} should keep building on these strengths each term.`,
      AE: `${fn} is making steady progress. Consistent effort and support will move performance to the next level.`,
      BE: `${fn} needs close support from both school and home to build the foundational competencies.`,
    };
    const hoiComment = hoiRemark[overallFam] || hoiRemark.BE;

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
        ${areaNames.length ? `<p class="rc-total">Performance-level total: ${totalPoints} / ${maxPoints} (${areaNames.length} learning areas)</p>` : ''}
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
        <div class="rc-powered">Powered by ZARODA SOLUTIONS</div>
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
    const rows = await this.ds.query(
      `SELECT t.id, t.name, t.status, t.subscription_tier AS "subscriptionTier",
              t.county, t.sub_county AS "subCounty", t.zone, t.phone, t.email,
              t.knec_code AS "knecCode", t.trial_ends_at AS "trialEndsAt", t.created_at AS "createdAt",
              (SELECT COUNT(*) FROM users    u WHERE u.tenant_id = t.id) AS "userCount",
              (SELECT COUNT(*) FROM learners l WHERE l.tenant_id = t.id AND l.is_active = true) AS "learnerCount",
              (SELECT COUNT(*) FROM streams  s WHERE s.tenant_id = t.id) AS "streamCount",
              admin.admin_name  AS "adminName",
              admin.admin_email AS "adminEmail",
              admin.admin_phone AS "adminPhone"
         FROM tenants t
         LEFT JOIN LATERAL (
           SELECT (u.first_name || ' ' || COALESCE(u.last_name,'')) AS admin_name,
                  u.email AS admin_email, u.phone AS admin_phone
             FROM users u
            WHERE u.tenant_id = t.id AND u.role IN ('hoi','tenant_owner','school_admin')
            ORDER BY CASE u.role WHEN 'hoi' THEN 0 WHEN 'tenant_owner' THEN 1 ELSE 2 END
            LIMIT 1
         ) admin ON true
        WHERE ($1::text IS NULL OR t.name ILIKE $1)
        ORDER BY t.created_at DESC`,
      [search],
    ).catch(() => []);
    return { data: rows };
  }

  // One school's detail (read-only) — owner drilling into a specific tenant.
  @Get('tenants/:id')
  async getTenant(@Request() req: any, @Param('id') id: string) {
    if (!this.isOwner(req)) return { error: 'forbidden' };
    const rows = await this.ds.query(
      `SELECT t.*,
              (SELECT COUNT(*) FROM users    u WHERE u.tenant_id = t.id) AS "userCount",
              (SELECT COUNT(*) FROM learners l WHERE l.tenant_id = t.id AND l.is_active = true) AS "learnerCount",
              (SELECT COUNT(*) FROM streams  s WHERE s.tenant_id = t.id) AS "streamCount"
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
    if (!this.isOwner(req)) return { totalTenants: 0, activeTenants: 0, trialTenants: 0, suspendedTenants: 0, totalLearners: 0, totalUsers: 0 };
    const r = await this.ds.query(
      `SELECT
         (SELECT COUNT(*) FROM tenants)                                   AS "totalTenants",
         (SELECT COUNT(*) FROM tenants WHERE status = 'active')           AS "activeTenants",
         (SELECT COUNT(*) FROM tenants WHERE status = 'trial')            AS "trialTenants",
         (SELECT COUNT(*) FROM tenants WHERE status = 'suspended')        AS "suspendedTenants",
         (SELECT COUNT(*) FROM learners WHERE is_active = true)           AS "totalLearners",
         (SELECT COUNT(*) FROM users)                                     AS "totalUsers"`,
    ).catch(() => [{}]);
    return r[0] || {};
  }

  // Gather broadcast recipients across ALL schools for an owner message. audience:
  // 'admins' (HOI/admin/owner roles) or 'all' (every active user). Returns names with
  // phones + emails so the owner can message via WhatsApp / email / SMS. This works
  // with no external credentials (WhatsApp links, mailto); SMS sending where configured.
  @Get('broadcast/recipients')
  async broadcastRecipients(@Request() req: any, @Query() q: any) {
    if (!this.isOwner(req)) return { error: 'forbidden', recipients: [] };
    const audience = q.audience === 'all' ? 'all' : 'admins';
    const adminRoles = ['tenant_owner', 'school_admin', 'hoi', 'dhois'];
    const where = audience === 'all'
      ? `COALESCE(is_active, true) = true AND role <> 'super_admin'`
      : `COALESCE(is_active, true) = true AND role = ANY($1)`;
    const params = audience === 'all' ? [] : [adminRoles];
    const rows = await this.ds.query(
      `SELECT u.first_name AS "firstName", u.last_name AS "lastName", u.email, u.phone, u.role,
              (SELECT name FROM schools s WHERE s.tenant_id = u.tenant_id LIMIT 1) AS "schoolName"
         FROM users u WHERE ${where}
        ORDER BY "schoolName", u.first_name`,
      params,
    ).catch(() => []);
    return {
      audience,
      count: rows.length,
      withPhone: rows.filter((r: any) => r.phone).length,
      withEmail: rows.filter((r: any) => r.email).length,
      recipients: rows,
    };
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
    if ((q.confirm || '') !== t.name) {
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
    if (!sets.length) return { error: 'Nothing to update.' };
    sets.push('updated_at = NOW()');
    await this.ds.query(`UPDATE tenants SET ${sets.join(', ')} WHERE id = $1`, vals)
      .catch((e: any) => { throw e; });
    return { id, updated: true };
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

@Module({ controllers: [RetoolingController] })
export class RetoolingModule {}
