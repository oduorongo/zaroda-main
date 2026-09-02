// ============================================================
// SCHOOL SUBSCRIPTION BILLING (Tuma / M-Pesa STK push)
// A school pays its ZARODA subscription per stream per year — KES 2,400 per
// primary/junior-school stream, KES 3,360 per senior-school stream (grade_10-12).
// Payment is collected via Tuma (see ../../common/tuma.ts) as an M-Pesa STK push;
// Tuma's webhook confirms payment, which extends the tenant's paid-through date
// and issues a receipt. See ../../common/tuma.ts for the (undocumented) API notes.
// ============================================================

import {
  Module, Controller, Get, Post, Param, Body,
  Request, Res, UseGuards, ForbiddenException, BadRequestException, NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { initiateStkPush, checkPaymentStatus, parseTumaCallback, normalisePhoneForTuma } from '../../common/tuma';
import { sendEmail } from '../../common/messaging';

const ADMIN_ROLES = ['hoi', 'dhois', 'school_admin', 'tenant_owner'];
const SENIOR_GRADES = ['grade_10', 'grade_11', 'grade_12'];
const PRICE_PRIMARY_JS = 2400;
const PRICE_SENIOR = 3360;

function callbackUrl(): string {
  const base = (process.env.RENDER_EXTERNAL_URL || process.env.BACKEND_URL || 'http://localhost:3000').replace(/\/+$/, '');
  return `${base}/api/v1/billing/subscription/callback`;
}

async function ensureBillingTables(ds: DataSource) {
  await ds.query(
    `CREATE TABLE IF NOT EXISTS subscription_payments (
       id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       tenant_id uuid NOT NULL,
       created_at timestamptz DEFAULT NOW()
     )`,
  ).catch(() => null);
  const cols: [string, string][] = [
    ['amount', 'numeric'],
    ['phone', 'text'],
    ['status', "text DEFAULT 'pending'"],
    ['merchant_request_id', 'text'],
    ['mpesa_receipt', 'text'],
    ['description', 'text'],
    ['receipt_number', 'text'],
    ['streams_primary_js', 'integer DEFAULT 0'],
    ['streams_senior', 'integer DEFAULT 0'],
    ['period_start', 'date'],
    ['period_end', 'date'],
    ['raw_response', 'jsonb'],
    ['callback_raw', 'jsonb'],
    ['initiated_by', 'uuid'],
    ['paid_at', 'timestamptz'],
    ['updated_at', 'timestamptz DEFAULT NOW()'],
  ];
  for (const [name, type] of cols) {
    await ds.query(`ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS ${name} ${type}`).catch(() => null);
  }
  await ds.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_paid_until date`).catch(() => null);
}

@Controller('billing/subscription')
@UseGuards(JwtAuthGuard)
export class SubscriptionController {
  constructor(private readonly ds: DataSource) {}

  private assertAdmin(req: any) {
    if (!ADMIN_ROLES.includes(req.user.role)) throw new ForbiddenException('Only school admins can manage subscription billing.');
  }

  // Streams broken down by pricing band, and the amount due for a full year's
  // renewal of every current stream. Callers recompute this server-side on /pay too
  // — the frontend total shown here is informational, never trusted for the charge.
  private async computeDue(tenantId: string) {
    const rows = await this.ds.query(
      `SELECT grade_level AS "gradeLevel" FROM streams WHERE tenant_id::text = $1`,
      [tenantId],
    ).catch(() => []);
    let primaryJs = 0, senior = 0;
    for (const r of rows) {
      if (SENIOR_GRADES.includes(r.gradeLevel)) senior++; else primaryJs++;
    }
    const amount = primaryJs * PRICE_PRIMARY_JS + senior * PRICE_SENIOR;
    return { primaryJs, senior, amount };
  }

  @Get('summary')
  async summary(@Request() req: any) {
    this.assertAdmin(req);
    await ensureBillingTables(this.ds);
    const due = await this.computeDue(req.user.tenantId);
    const t = await this.ds.query(
      `SELECT subscription_paid_until AS "paidUntil", name FROM tenants WHERE id::text = $1 LIMIT 1`,
      [req.user.tenantId],
    ).catch(() => []);
    const paidUntil = t[0]?.paidUntil || null;
    const covered = !!paidUntil && new Date(paidUntil) >= new Date(new Date().toDateString());
    return {
      schoolName: t[0]?.name,
      streamsPrimaryJs: due.primaryJs, streamsSenior: due.senior,
      pricePrimaryJs: PRICE_PRIMARY_JS, priceSenior: PRICE_SENIOR,
      amountDue: due.amount,
      paidUntil, covered,
    };
  }

  // Kick off an M-Pesa STK push for a full year's renewal of every current stream.
  @Post('pay')
  async pay(@Request() req: any, @Body() dto: { phone: string }) {
    this.assertAdmin(req);
    await ensureBillingTables(this.ds);
    const tenantId = req.user.tenantId;
    const phone = normalisePhoneForTuma(dto?.phone);
    if (!phone) throw new BadRequestException('Enter a valid M-Pesa phone number.');

    const due = await this.computeDue(tenantId);
    if (due.amount <= 0) throw new BadRequestException('No streams to bill — add at least one class first.');

    const school = await this.ds.query(`SELECT name FROM tenants WHERE id::text = $1 LIMIT 1`, [tenantId]).catch(() => []);
    const schoolName = school[0]?.name || 'your school';

    const result = await initiateStkPush({
      amount: due.amount,
      phone,
      description: `ZARODA subscription — ${schoolName} (${due.primaryJs + due.senior} streams)`,
      callbackUrl: callbackUrl(),
    });
    if (!result.ok) throw new BadRequestException(result.detail || 'Could not start the M-Pesa payment. Try again.');

    const inserted = await this.ds.query(
      `INSERT INTO subscription_payments
         (tenant_id, amount, phone, status, merchant_request_id, description,
          streams_primary_js, streams_senior, raw_response, initiated_by)
       VALUES ($1,$2,$3,'pending',$4,$5,$6,$7,$8,$9)
       RETURNING id`,
      [tenantId, due.amount, phone, result.merchantRequestId || null,
       `ZARODA subscription — ${due.primaryJs + due.senior} streams`,
       due.primaryJs, due.senior, JSON.stringify(result.raw || {}), req.user.id],
    ).catch(() => []);

    return {
      message: 'STK push sent. Ask the person at that phone to enter their M-Pesa PIN.',
      paymentId: inserted[0]?.id, merchantRequestId: result.merchantRequestId, amount: due.amount,
    };
  }

  // Fallback for when Tuma's webhook never arrives — actively re-checks with Tuma
  // and applies the same "mark paid" logic the callback uses.
  @Get('status/:paymentId')
  async pollStatus(@Request() req: any, @Param('paymentId') paymentId: string) {
    this.assertAdmin(req);
    await ensureBillingTables(this.ds);
    const rows = await this.ds.query(
      `SELECT * FROM subscription_payments WHERE id::text = $1 AND tenant_id::text = $2 LIMIT 1`,
      [paymentId, req.user.tenantId],
    ).catch(() => []);
    if (!rows.length) throw new NotFoundException('Payment not found.');
    const payment = rows[0];
    if (payment.status === 'success' || !payment.merchant_request_id) return { status: payment.status };

    const result = await checkPaymentStatus(payment.merchant_request_id);
    if (result.ok && result.status && /success|completed/i.test(result.status)) {
      await markPaidStatic(this.ds, payment.id, payment.tenant_id, result.mpesaReceipt, result.raw);
      return { status: 'success' };
    }
    return { status: payment.status, detail: result.detail };
  }

  @Get('receipts')
  async receipts(@Request() req: any) {
    this.assertAdmin(req);
    await ensureBillingTables(this.ds);
    return this.ds.query(
      `SELECT id, amount, status, receipt_number AS "receiptNumber", mpesa_receipt AS "mpesaReceipt",
              streams_primary_js AS "streamsPrimaryJs", streams_senior AS "streamsSenior",
              description, created_at AS "createdAt", paid_at AS "paidAt"
         FROM subscription_payments WHERE tenant_id::text = $1 ORDER BY created_at DESC`,
      [req.user.tenantId],
    ).catch(() => []);
  }

  @Get('receipt/:id/html')
  async receiptHtml(@Request() req: any, @Param('id') id: string, @Res() res: any) {
    this.assertAdmin(req);
    await ensureBillingTables(this.ds);
    const rows = await this.ds.query(
      `SELECT p.*, t.name AS "schoolName"
         FROM subscription_payments p JOIN tenants t ON t.id = p.tenant_id
        WHERE p.id::text = $1 AND p.tenant_id::text = $2 AND p.status = 'success' LIMIT 1`,
      [id, req.user.tenantId],
    ).catch(() => []);
    if (!rows.length) { res.status(404).send('<p>Receipt not found</p>'); return; }
    res.set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.send(renderReceiptHtml(rows[0]));
  }
}

// Tuma calls this server-to-server with no user session — it must stay unauthenticated.
// Kept as a separate controller (rather than @Public() on the guarded one above) so the
// class-level JwtAuthGuard on SubscriptionController can never accidentally cover it.
@Controller('billing/subscription')
export class SubscriptionWebhookController {
  constructor(private readonly ds: DataSource) {}

  @Post('callback')
  async callback(@Body() body: any) {
    await ensureBillingTables(this.ds);
    const parsed = parseTumaCallback(body);
    if (!parsed.merchantRequestId) {
      console.warn('Tuma callback with no merchant_request_id:', JSON.stringify(body).slice(0, 500));
      return { received: true };
    }
    const rows = await this.ds.query(
      `SELECT id, tenant_id FROM subscription_payments WHERE merchant_request_id = $1 LIMIT 1`,
      [parsed.merchantRequestId],
    ).catch(() => []);
    if (!rows.length) {
      console.warn('Tuma callback for unknown merchant_request_id:', parsed.merchantRequestId);
      return { received: true };
    }
    if (parsed.success) {
      await markPaidStatic(this.ds, rows[0].id, rows[0].tenant_id, parsed.mpesaReceipt, body);
    } else {
      await this.ds.query(
        `UPDATE subscription_payments SET status = 'failed', callback_raw = $2, updated_at = NOW() WHERE id = $1`,
        [rows[0].id, JSON.stringify(body || {})],
      ).catch(() => null);
    }
    return { received: true };
  }
}

// Shared "mark paid" logic used by both the webhook and the status-poll fallback:
// extends the tenant's paid-through date by one year, issues a receipt number, and
// emails it. Standalone function (not a class method) so both controllers can use it
// without one depending on the other.
async function markPaidStatic(ds: DataSource, paymentId: string, tenantId: string, mpesaReceipt: string | undefined, rawCallback: any) {
  const receiptNumber = `SUB-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}`;
  await ds.query(
    `UPDATE subscription_payments
        SET status = 'success', mpesa_receipt = $2, receipt_number = $3, callback_raw = $4,
            paid_at = NOW(), updated_at = NOW()
      WHERE id = $1`,
    [paymentId, mpesaReceipt || null, receiptNumber, JSON.stringify(rawCallback || {})],
  ).catch(() => null);

  // Extend from whichever is later: today, or the existing paid-through date (so
  // renewing early adds a year on top of remaining time rather than losing it).
  await ds.query(
    `UPDATE tenants
        SET subscription_paid_until = GREATEST(COALESCE(subscription_paid_until, CURRENT_DATE), CURRENT_DATE) + INTERVAL '1 year',
            status = CASE WHEN status IN ('trial','suspended') THEN 'active' ELSE status END
      WHERE id = $1`,
    [tenantId],
  ).catch(() => null);

  const admin = await ds.query(
    `SELECT email, first_name AS "firstName" FROM users
      WHERE tenant_id = $1 AND role IN ('hoi','tenant_owner','school_admin')
      ORDER BY CASE role WHEN 'hoi' THEN 0 WHEN 'tenant_owner' THEN 1 ELSE 2 END LIMIT 1`,
    [tenantId],
  ).catch(() => []);
  if (admin[0]?.email) {
    sendEmail(
      admin[0].email,
      `Payment received — receipt ${receiptNumber}`,
      `<p>Hi ${admin[0].firstName || ''},</p><p>Your ZARODA subscription payment has been received. Receipt number: <b>${receiptNumber}</b>.</p><p>Log in to your dashboard to view or print the receipt.</p>`,
    );
  }
}

function renderReceiptHtml(p: any): string {
  const esc = (s: any) => String(s ?? '').replace(/[&<>]/g, (c: string) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] || c));
  const ksh = (n: any) => 'KES ' + Number(n || 0).toLocaleString('en-KE');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Receipt ${esc(p.receipt_number)}</title>
    <style>body{font-family:Arial,sans-serif;color:#1a2e5a;max-width:640px;margin:24px auto;padding:0 16px}
    .h{text-align:center;border-bottom:3px solid #d4af37;padding-bottom:10px}.h h1{margin:0;font-size:20px}
    .meta{font-size:12px;color:#555;margin-top:2px}.box{border:1px solid #ddd;border-radius:8px;padding:16px;margin-top:16px}
    table{width:100%;border-collapse:collapse;margin-top:10px}td{padding:6px 4px;font-size:14px}.r{text-align:right}
    .total{font-size:18px;font-weight:bold;border-top:2px solid #1a2e5a;margin-top:8px}.foot{margin-top:24px;font-size:11px;color:#777;text-align:center}
    @media print{button{display:none}}</style></head><body>
    <div class="h"><h1>${esc(p.schoolName)}</h1><div class="meta">ZARODA SUBSCRIPTION RECEIPT</div></div>
    <div class="box">
      <table>
        <tr><td>Receipt No.</td><td class="r"><b>${esc(p.receipt_number)}</b></td></tr>
        <tr><td>Date</td><td class="r">${esc(p.paid_at && String(p.paid_at).slice(0, 10))}</td></tr>
        <tr><td>Streams covered</td><td class="r">${esc(p.streams_primary_js)} primary/JS · ${esc(p.streams_senior)} senior</td></tr>
        <tr><td>Method</td><td class="r">M-PESA${p.mpesa_receipt ? ' · Ref ' + esc(p.mpesa_receipt) : ''}</td></tr>
        <tr class="total"><td>Amount Paid</td><td class="r">${ksh(p.amount)}</td></tr>
      </table>
    </div>
    <div class="foot">Generated by ZARODA SOLUTIONS<br>This is a computer-generated receipt.</div>
    <div style="text-align:center;margin-top:16px"><button onclick="window.print()" style="background:#1a2e5a;color:#fff;border:none;padding:10px 22px;border-radius:8px;cursor:pointer">Print / Save as PDF</button></div>
    </body></html>`;
}

@Module({
  controllers: [SubscriptionController, SubscriptionWebhookController],
})
export class BillingModule {}
