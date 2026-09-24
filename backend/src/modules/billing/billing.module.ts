// ============================================================
// SCHOOL SUBSCRIPTION BILLING (Tuma / M-Pesa STK push)
// A school pays its ZARODA subscription per stream per year — KES 2,400 per
// primary/junior-school stream, KES 3,360 per senior-school stream (grade_10-12).
// Payment is collected via Tuma (see ../../common/tuma.ts) as an M-Pesa STK push;
// Tuma's webhook confirms payment, which extends the paid-through date of each
// stream the payment covered and issues a receipt. See ../../common/tuma.ts for
// the (undocumented) API notes.
//
// Coverage is per stream, not per school: each stream carries its own paid-through
// date, so a stream paid for in January and another paid for in May lapse a year
// apart. The rules — who is billable, free periods, the 14-day grace, read-only —
// live in ../../common/subscription.ts. This module takes the money, issues
// receipts, and invoices a school when a stream's cover ends.
// ============================================================

import {
  Module, Controller, Get, Post, Param, Body, Injectable,
  Request, Res, UseGuards, ForbiddenException, BadRequestException, NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { initiateStkPush, checkPaymentStatus, parseTumaCallback, normalisePhoneForTuma } from '../../common/tuma';
import { sendEmail } from '../../common/messaging';
import {
  PRICE_PRIMARY_JS, PRICE_SENIOR, PRICE_PRO_PLAN, GRACE_DAYS, DUE_SOON_DAYS,
  LAUNCH_FREE_UNTIL, FREE_UNTIL_SQL,
  ensureBillingTables, loadCoverage, needsPaying, syncTenantPaidUntil, Coverage,
} from '../../common/subscription';

const ADMIN_ROLES = ['hoi', 'dhois', 'school_admin', 'tenant_owner'];

// Tuma go-live review: they asked to see the full payment flow with a KES 1 test
// item while ZARODA's account is still in sandbox (which refuses KES 100 and up).
// A school listed here is charged KES 1 as "[Tuma Integration Test]" instead of
// its real total. The payment gets a receipt but covers nothing — no stream
// coverage, no change to the school's status. Remove once Tuma has gone live.
const TUMA_TEST_TENANT_IDS = ['2216b5be-d6a8-4389-b701-2c5eb415d1b9']; // Sinskutu Comprehensive
const TUMA_TEST_ITEM = '[Tuma Integration Test]';
const isTumaTestTenant = (tenantId: string) => TUMA_TEST_TENANT_IDS.includes(String(tenantId));

// Built the same way as the Professional Records wallet's callback, which Tuma is
// known to reach: APP_URL is the frontend, which forwards /api/v1 to this backend.
function callbackUrl(): string {
  const base = (process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || process.env.BACKEND_URL || 'http://localhost:3000').replace(/\/+$/, '');
  return `${base}/api/v1/billing/subscription/callback`;
}

function appUrl(): string {
  return (process.env.APP_URL || 'https://app.zarodasolutions.app').replace(/\/+$/, '');
}

const esc = (s: any) => String(s ?? '').replace(/[&<>"]/g, (c: string) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] || c));
const ksh = (n: any) => 'KES ' + Number(n || 0).toLocaleString('en-KE');
const longDate = (d?: string | null) => d
  ? new Date(`${String(d).slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  : '';

// What a payment covers when the admin has not picked: every billable stream in
// grace, read-only, or ending within DUE_SOON_DAYS, plus the Pro fee on the same test.
function defaultSelection(cov: Coverage) {
  return {
    streamIds: cov.streams.filter(s => s.billable && needsPaying(s.status)).map(s => s.id),
    includePro: !!cov.pro && needsPaying(cov.pro.status),
  };
}

async function schoolAdmin(ds: DataSource, tenantId: string): Promise<{ email: string; firstName: string } | null> {
  const rows = await ds.query(
    `SELECT email, first_name AS "firstName" FROM users
      WHERE tenant_id::text = $1 AND role IN ('hoi','tenant_owner','school_admin') AND email IS NOT NULL
      ORDER BY CASE role WHEN 'hoi' THEN 0 WHEN 'tenant_owner' THEN 1 ELSE 2 END LIMIT 1`,
    [String(tenantId)],
  ).catch(() => []);
  return rows[0] || null;
}

@Controller('billing/subscription')
@UseGuards(JwtAuthGuard)
export class SubscriptionController {
  constructor(private readonly ds: DataSource) {}

  private assertAdmin(req: any) {
    if (!ADMIN_ROLES.includes(req.user.role)) throw new ForbiddenException('Only school admins can manage subscription billing.');
  }

  // Every stream with its own cover, grace and status, the Pro fee's, the school's
  // free period, and the amount for the default selection. /pay recomputes prices
  // server-side — totals shown from this are never trusted.
  @Get('summary')
  async summary(@Request() req: any) {
    this.assertAdmin(req);
    const cov = await loadCoverage(this.ds, req.user.tenantId);
    const sel = defaultSelection(cov);
    const selected = new Set(sel.streamIds);
    const amountDue = cov.streams.filter(s => selected.has(s.id)).reduce((n, s) => n + s.price, 0)
      + (sel.includePro ? PRICE_PRO_PLAN : 0);
    const billable = cov.streams.filter(s => s.billable);
    return {
      schoolName: cov.schoolName,
      today: cov.today,
      freeUntil: cov.freeUntil,
      freeGraceEndsOn: cov.freeGraceEndsOn,
      onFreePeriod: !!cov.freeUntil && cov.today <= cov.freeUntil,
      launchCohort: cov.freeUntil === LAUNCH_FREE_UNTIL,
      graceDays: GRACE_DAYS,
      streams: cov.streams,
      pro: cov.pro,
      isPro: cov.isPro,
      pricePrimaryJs: PRICE_PRIMARY_JS, priceSenior: PRICE_SENIOR, pricePro: PRICE_PRO_PLAN,
      dueSoonDays: DUE_SOON_DAYS,
      defaultSelection: sel,
      amountDue,
      // Tuma go-live test school: /pay charges KES 1 and covers nothing.
      tumaTest: isTumaTestTenant(req.user.tenantId),
      counts: {
        grace: billable.filter(s => s.status === 'grace').length,
        lapsed: billable.filter(s => s.status === 'lapsed').length,
      },
    };
  }

  // Kick off an M-Pesa STK push for a year of the chosen streams (and optionally the
  // Pro fee). Omitting streamIds/includePro pays for the default selection.
  @Post('pay')
  async pay(@Request() req: any, @Body() dto: { phone: string; streamIds?: string[]; includePro?: boolean }) {
    this.assertAdmin(req);
    const tenantId = req.user.tenantId;
    const phone = normalisePhoneForTuma(dto?.phone);
    if (!phone) throw new BadRequestException('Enter a valid M-Pesa phone number.');

    const cov = await loadCoverage(this.ds, tenantId);
    const sel = defaultSelection(cov);
    const wanted = new Set(Array.isArray(dto?.streamIds) ? dto.streamIds.map(String) : sel.streamIds);
    // Only streams that have learners can be paid for — an empty stream is free
    // until it is used, so there is nothing to charge.
    const streams = cov.streams.filter(s => s.billable && wanted.has(s.id));
    const includePro = !!cov.pro && (typeof dto?.includePro === 'boolean' ? dto.includePro : sel.includePro);
    if (!streams.length && !includePro) {
      throw new BadRequestException('Select at least one stream with learners to pay for.');
    }

    const primaryJs = streams.filter(s => !s.senior).length;
    const senior = streams.filter(s => s.senior).length;
    const isTest = isTumaTestTenant(tenantId);
    const amount = isTest ? 1 : streams.reduce((n, s) => n + s.price, 0) + (includePro ? PRICE_PRO_PLAN : 0);
    const schoolName = cov.schoolName || 'your school';
    const what = [streams.length ? `${streams.length} stream${streams.length === 1 ? '' : 's'}` : '', includePro ? 'Pro plan' : '']
      .filter(Boolean).join(' + ');
    const description = isTest ? `${TUMA_TEST_ITEM} — ${schoolName}` : `ZARODA subscription — ${schoolName} (${what})`;

    const result = await initiateStkPush({
      amount,
      phone,
      description,
      callbackUrl: callbackUrl(),
    });
    if (!result.ok) {
      // Keep the attempt and Tuma's full response: without it there is nothing to
      // show Tuma support when a push is refused. It appears as "failed" in the
      // school's payment history.
      console.warn(`[billing] STK push refused for tenant ${tenantId} (KES ${amount}): ${result.detail}`, JSON.stringify(result.raw || {}).slice(0, 500));
      await this.ds.query(
        `INSERT INTO subscription_payments
           (tenant_id, amount, phone, status, description, streams_primary_js, streams_senior, raw_response, initiated_by)
         VALUES ($1,$2,$3,'failed',$4,$5,$6,$7,$8)`,
        [tenantId, amount, phone, `${description} — refused: ${result.detail || 'no detail'}`,
         primaryJs, senior, JSON.stringify({ response: result.raw || null, detail: result.detail || null, callbackUrl: callbackUrl() }), req.user.id],
      ).catch(() => null);
      throw new BadRequestException(result.detail || 'Could not start the M-Pesa payment. Try again.');
    }

    const inserted = await this.ds.query(
      `INSERT INTO subscription_payments
         (tenant_id, amount, phone, status, merchant_request_id, description, is_test,
          streams_primary_js, streams_senior, raw_response, initiated_by)
       VALUES ($1,$2,$3,'pending',$4,$5,$10,$6,$7,$8,$9)
       RETURNING id`,
      [tenantId, amount, phone, result.merchantRequestId || null,
       description,
       primaryJs, senior, JSON.stringify(result.raw || {}), req.user.id, isTest],
    ).catch(() => []);
    const paymentId = inserted[0]?.id;

    // A test payment covers nothing, so it carries no coverage lines.
    if (paymentId && !isTest) {
      const lines: { kind: string; streamId: string | null; name: string | null; grade: string | null; price: number }[] =
        streams.map(s => ({ kind: 'stream', streamId: s.id, name: s.name, grade: s.gradeLevel, price: s.price }));
      if (includePro) lines.push({ kind: 'pro', streamId: null, name: null, grade: null, price: PRICE_PRO_PLAN });
      for (const l of lines) {
        await this.ds.query(
          `INSERT INTO stream_subscriptions (tenant_id, payment_id, kind, stream_id, stream_name, grade_level, price, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'pending')`,
          [tenantId, paymentId, l.kind, l.streamId, l.name, l.grade, l.price],
        ).catch(() => null);
      }
    }

    return {
      message: isTest
        ? `Tuma test: STK push for KES 1 (${TUMA_TEST_ITEM}) sent. Enter the M-Pesa PIN to complete it.`
        : 'STK push sent. Ask the person at that phone to enter their M-Pesa PIN.',
      paymentId, merchantRequestId: result.merchantRequestId, amount,
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
    const lines = await this.ds.query(
      `SELECT kind, stream_name AS "streamName", grade_level AS "gradeLevel", price,
              period_start::text AS "periodStart", period_end::text AS "periodEnd"
         FROM stream_subscriptions WHERE payment_id = $1 AND status = 'active'
        ORDER BY kind DESC, stream_name`,
      [id],
    ).catch(() => []);
    res.set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.send(renderReceiptHtml(rows[0], lines));
  }

  @Get('invoices')
  async invoices(@Request() req: any) {
    this.assertAdmin(req);
    await ensureBillingTables(this.ds);
    return this.ds.query(
      `SELECT id, invoice_number AS "invoiceNumber", amount, status, lines,
              issued_on::text AS "issuedOn", due_on::text AS "dueOn"
         FROM subscription_invoices WHERE tenant_id::text = $1 ORDER BY created_at DESC`,
      [req.user.tenantId],
    ).catch(() => []);
  }

  @Get('invoice/:id/html')
  async invoiceHtml(@Request() req: any, @Param('id') id: string, @Res() res: any) {
    this.assertAdmin(req);
    await ensureBillingTables(this.ds);
    const rows = await this.ds.query(
      `SELECT i.*, i.issued_on::text AS issued, i.due_on::text AS due, t.name AS "schoolName"
         FROM subscription_invoices i JOIN tenants t ON t.id = i.tenant_id
        WHERE i.id::text = $1 AND i.tenant_id::text = $2 LIMIT 1`,
      [id, req.user.tenantId],
    ).catch(() => []);
    if (!rows.length) { res.status(404).send('<p>Invoice not found</p>'); return; }
    res.set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.send(renderInvoiceHtml(rows[0], true));
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
        `UPDATE subscription_payments SET status = 'failed', callback_raw = $2, updated_at = NOW()
          WHERE id = $1 AND status IS DISTINCT FROM 'success'`,
        [rows[0].id, JSON.stringify(body || {})],
      ).catch(() => null);
      await this.ds.query(
        `UPDATE stream_subscriptions SET status = 'failed' WHERE payment_id = $1 AND status = 'pending'`,
        [rows[0].id],
      ).catch(() => null);
    }
    return { received: true };
  }
}

// Shared "mark paid" logic used by both the webhook and the status-poll fallback:
// starts a year of coverage on each stream (and the Pro fee) the payment was for,
// issues a receipt number, emails it, and settles any invoice it clears.
// Standalone function (not a class method) so both controllers can use it without
// one depending on the other.
async function markPaidStatic(ds: DataSource, paymentId: string, tenantId: string, mpesaReceipt: string | undefined, rawCallback: any) {
  await ensureBillingTables(ds);
  const receiptNumber = `SUB-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}`;
  // The webhook and the status poll can both land for one payment. Only the call that
  // actually flips it to success goes on — otherwise the school gets two years for one.
  const flipped = await ds.query(
    `UPDATE subscription_payments
        SET status = 'success', mpesa_receipt = $2, receipt_number = $3, callback_raw = $4,
            paid_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND status IS DISTINCT FROM 'success'
      RETURNING id, is_test AS "isTest"`,
    [paymentId, mpesaReceipt || null, receiptNumber, JSON.stringify(rawCallback || {})],
  ).catch(() => []);
  if (!flipped.length) return;

  // A Tuma integration test payment (KES 1) proves the flow end to end and gets a
  // receipt, but must not extend anything or flip the school to active.
  if (!flipped[0].isTest) await applyPaymentCover(ds, paymentId, tenantId);

  const admin = await schoolAdmin(ds, tenantId);
  if (admin?.email) {
    sendEmail(
      admin.email,
      `Payment received — receipt ${receiptNumber}`,
      `<p>Hi ${esc(admin.firstName || '')},</p><p>Your ZARODA subscription payment has been received. Receipt number: <b>${receiptNumber}</b>.</p><p>Log in to your dashboard to view or print the receipt.</p>`,
    );
  }
}

// Everything a real (non-test) payment does to the school once paid: a year of
// cover per line, the school-wide date, active status, and settling invoices.
async function applyPaymentCover(ds: DataSource, paymentId: string, tenantId: string) {
  const activated = await activatePaymentLines(ds, paymentId);
  if (activated) {
    await syncTenantPaidUntil(ds, tenantId);
  } else {
    // A payment started before per-stream coverage existed has no lines; honour it
    // the way it was sold — a year on the school-wide date, which the legacy
    // backfill then carries onto each stream.
    await ds.query(
      `UPDATE tenants
          SET subscription_paid_until = GREATEST(COALESCE(subscription_paid_until, CURRENT_DATE), CURRENT_DATE) + INTERVAL '1 year'
        WHERE id = $1`,
      [tenantId],
    ).catch(() => null);
  }
  await ds.query(
    `UPDATE tenants SET status = CASE WHEN status IN ('trial','suspended') THEN 'active' ELSE status END WHERE id = $1`,
    [tenantId],
  ).catch(() => null);
  await reconcileInvoices(ds, String(tenantId), { issue: false });
}

// Turns a paid payment's pending lines into a year of cover each; returns how many.
// Where each line's year starts: `base` is the end of what already covers it — its
// latest paid year or the school's free period, whichever is later.
//  · base still ahead (renewing early, or paying during the free period): start
//    there, so no paid or free time is lost.
//  · base within the last GRACE_DAYS (paying during grace): start at base, so the
//    year runs from when cover ended — grace is time to pay, not extra time.
//  · otherwise (read-only, or never covered): start today.
export async function activatePaymentLines(ds: DataSource, paymentId: string): Promise<number> {
  const rows = await ds.query(
    `WITH calc AS (
       SELECT ss.id, GREATEST(
                (SELECT MAX(o.period_end) FROM stream_subscriptions o
                  WHERE o.tenant_id = ss.tenant_id AND o.kind = ss.kind
                    AND o.stream_id IS NOT DISTINCT FROM ss.stream_id AND o.status = 'active'),
                ${FREE_UNTIL_SQL('t')}
              ) AS base
         FROM stream_subscriptions ss JOIN tenants t ON t.id = ss.tenant_id
        WHERE ss.payment_id = $1 AND ss.status = 'pending'
     ), starts AS (
       SELECT id, CASE WHEN base >= CURRENT_DATE - ${GRACE_DAYS} THEN base ELSE CURRENT_DATE END AS start FROM calc
     )
     UPDATE stream_subscriptions ss
        SET status = 'active', period_start = starts.start, period_end = (starts.start + INTERVAL '1 year')::date
       FROM starts WHERE ss.id = starts.id
     RETURNING ss.id`,
    [paymentId],
  ).catch(() => []);
  return rows.length;
}

// Brings a school's invoices in line with its coverage:
//  1. settles every open invoice none of whose lines is still in grace or read-only
//     (paid, or the stream emptied or was removed);
//  2. with issue: true, invoices every stream (and the Pro fee) that has entered
//     grace or gone read-only and is not already on an open invoice, and emails it.
// Safe to run repeatedly — the daily job does, and so does every payment.
export async function reconcileInvoices(ds: DataSource, tenantId: string, opts: { issue: boolean }) {
  await ensureBillingTables(ds);
  const cov = await loadCoverage(ds, tenantId);
  if (cov.exempt) return;
  const unpaid = (kind: string, streamId?: string | null) => {
    const status = kind === 'pro' ? cov.pro?.status : cov.streams.find(s => s.id === String(streamId))?.status;
    return status === 'grace' || status === 'lapsed';
  };

  const open = await ds.query(
    `SELECT id, lines FROM subscription_invoices WHERE tenant_id::text = $1 AND status = 'open'`, [tenantId],
  ).catch(() => []);
  const onOpenInvoice = new Set<string>();
  for (const inv of open) {
    const lines: any[] = Array.isArray(inv.lines) ? inv.lines : [];
    if (lines.some(l => unpaid(l.kind, l.streamId))) {
      for (const l of lines) onOpenInvoice.add(l.kind === 'pro' ? 'pro' : String(l.streamId));
    } else {
      await ds.query(
        `UPDATE subscription_invoices SET status = 'settled', settled_at = NOW() WHERE id = $1 AND status = 'open'`, [inv.id],
      ).catch(() => null);
    }
  }
  if (!opts.issue) return;

  const lines: any[] = cov.streams
    .filter(s => s.billable && (s.status === 'grace' || s.status === 'lapsed') && !onOpenInvoice.has(s.id))
    .map(s => ({ kind: 'stream', streamId: s.id, name: s.name, gradeLevel: s.gradeLevel, price: s.price, coverEnd: s.coverEnd, graceEndsOn: s.graceEndsOn }));
  if (cov.pro && (cov.pro.status === 'grace' || cov.pro.status === 'lapsed') && !onOpenInvoice.has('pro')) {
    lines.push({ kind: 'pro', streamId: null, name: 'Pro plan', gradeLevel: null, price: cov.pro.price, coverEnd: cov.pro.coverEnd, graceEndsOn: cov.pro.graceEndsOn });
  }
  if (!lines.length) return;

  const amount = lines.reduce((n, l) => n + Number(l.price || 0), 0);
  // Due on the earliest last day of grace among the lines; a line already read-only
  // makes the invoice due on issue.
  const dueOn = lines.map(l => l.graceEndsOn).filter(Boolean).sort()[0] || cov.today;
  const invoiceNumber = `INV-${cov.today.slice(0, 4)}-${Date.now().toString(36).toUpperCase()}`;
  const inserted = await ds.query(
    `INSERT INTO subscription_invoices (tenant_id, invoice_number, amount, lines, issued_on, due_on, status)
     VALUES ($1,$2,$3,$4,$5,$6,'open')
     RETURNING *, issued_on::text AS issued, due_on::text AS due`,
    [tenantId, invoiceNumber, amount, JSON.stringify(lines), cov.today, dueOn < cov.today ? cov.today : dueOn],
  ).catch(() => []);
  const invoice = inserted[0];
  if (!invoice) return;

  const admin = await schoolAdmin(ds, tenantId);
  if (!admin?.email) return;
  const sent = await sendEmail(
    admin.email,
    `ZARODA invoice ${invoiceNumber} — ${ksh(amount)} due by ${longDate(invoice.due)}`,
    `<p>Hi ${esc(admin.firstName || '')},</p>
     <p>The ZARODA subscription for the streams below has ended. They stay fully open until
        <b>${longDate(invoice.due)}</b>; after that, unpaid streams become read-only until renewed.
        Fee collection keeps working either way.</p>
     ${renderInvoiceHtml({ ...invoice, schoolName: cov.schoolName }, false)}
     <p><a href="${appUrl()}/dashboard/subscription">Pay with M-Pesa from your Subscription page</a></p>
     <p>— The ZARODA team</p>`,
  ).catch(() => null);
  if (sent?.ok) {
    await ds.query(`UPDATE subscription_invoices SET emailed_at = NOW() WHERE id = $1`, [invoice.id]).catch(() => null);
  }
}

// Daily invoicing run. Schools on the launch free period all reach grace on the
// same morning, so this is the job that sends them their first invoice.
@Injectable()
export class SubscriptionInvoiceService {
  constructor(private readonly ds: DataSource) {}

  @Cron('30 6 * * *', { timeZone: 'Africa/Nairobi' })
  async dailyInvoices() {
    await ensureBillingTables(this.ds);
    const tenants = await this.ds.query(
      `SELECT id::text AS id FROM tenants
        WHERE COALESCE(account_type, 'school') <> 'individual'
          AND COALESCE(status, 'trial') NOT IN ('suspended', 'cancelled')`,
    ).catch(() => []);
    let failed = 0;
    for (const t of tenants) {
      try { await reconcileInvoices(this.ds, t.id, { issue: true }); } catch { failed++; }
    }
    if (failed) console.warn(`[billing] invoice run: ${failed} of ${tenants.length} schools failed`);
  }
}

// `lines` are the payment's stream_subscriptions rows. Receipts from before
// per-stream coverage have none and fall back to the stream counts alone.
function renderReceiptHtml(p: any, lines: any[] = []): string {
  const lineRows = lines.map(l => `<tr><td>${l.kind === 'pro' ? 'Pro plan' : esc(l.streamName)}
      <div class="meta">${esc(l.periodStart)} to ${esc(l.periodEnd)}</div></td><td class="r">${ksh(l.price)}</td></tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Receipt ${esc(p.receipt_number)}</title>
    <style>${DOC_CSS}</style></head><body>
    <div class="h"><h1>${esc(p.schoolName)}</h1><div class="meta">ZARODA SUBSCRIPTION RECEIPT</div></div>
    <div class="box">
      <table>
        <tr><td>Receipt No.</td><td class="r"><b>${esc(p.receipt_number)}</b></td></tr>
        <tr><td>Date</td><td class="r">${esc(p.paid_at && String(p.paid_at).slice(0, 10))}</td></tr>
        ${p.is_test
          ? `<tr><td>Item</td><td class="r">${esc(TUMA_TEST_ITEM)} — covers no streams</td></tr>`
          : `<tr><td>Streams covered</td><td class="r">${esc(p.streams_primary_js)} primary/JS · ${esc(p.streams_senior)} senior</td></tr>`}
        <tr><td>Method</td><td class="r">M-PESA${p.mpesa_receipt ? ' · Ref ' + esc(p.mpesa_receipt) : ''}</td></tr>
      </table>
      ${lineRows ? `<table style="border-top:1px solid #ddd">${lineRows}</table>` : ''}
      <table>
        <tr class="total"><td>Amount Paid</td><td class="r">${ksh(p.amount)}</td></tr>
      </table>
    </div>
    <div class="foot">Generated by ZARODA SOLUTIONS<br>This is a computer-generated receipt.</div>
    ${PRINT_BUTTON}
    </body></html>`;
}

// Full page for the in-app view (standalone: true), or just the body for an email.
function renderInvoiceHtml(inv: any, standalone: boolean): string {
  const lines: any[] = Array.isArray(inv.lines) ? inv.lines : [];
  const lineRows = lines.map(l => `<tr><td>${l.kind === 'pro' ? 'Pro plan (payroll, HR, transport)' : esc(l.name)}
      <div class="meta">1 year · cover ended ${esc(longDate(l.coverEnd))}</div></td><td class="r">${ksh(l.price)}</td></tr>`).join('');
  const dueNote = inv.status === 'settled'
    ? 'Settled — thank you.'
    : `Please pay by ${esc(longDate(inv.due))}. Unpaid streams become read-only after that date; existing records stay viewable and fee collection is not affected.`;
  const body = `
    <div class="h"><h1>${esc(inv.schoolName)}</h1><div class="meta">ZARODA SUBSCRIPTION INVOICE</div></div>
    <div class="box">
      <table>
        <tr><td>Invoice No.</td><td class="r"><b>${esc(inv.invoice_number)}</b></td></tr>
        <tr><td>Issued</td><td class="r">${esc(longDate(inv.issued))}</td></tr>
        <tr><td>Due</td><td class="r">${esc(longDate(inv.due))}</td></tr>
      </table>
      <table style="border-top:1px solid #ddd">${lineRows}</table>
      <table><tr class="total"><td>Amount Due</td><td class="r">${ksh(inv.amount)}</td></tr></table>
      <p class="meta">${dueNote}</p>
      <p class="meta">Pay with M-Pesa from the Subscription page in ZARODA. Streams you have since paid for, or that no longer have learners, are not charged.</p>
    </div>
    <div class="foot">Generated by ZARODA SOLUTIONS<br>This is a computer-generated invoice.</div>`;
  if (!standalone) return `<div style="font-family:Arial,sans-serif;color:#1a2e5a;max-width:640px"><style>${DOC_CSS}</style>${body}</div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Invoice ${esc(inv.invoice_number)}</title>
    <style>${DOC_CSS}</style></head><body>${body}${PRINT_BUTTON}</body></html>`;
}

const DOC_CSS = `body{font-family:Arial,sans-serif;color:#1a2e5a;max-width:640px;margin:24px auto;padding:0 16px}
    .h{text-align:center;border-bottom:3px solid #d4af37;padding-bottom:10px}.h h1{margin:0;font-size:20px}
    .meta{font-size:12px;color:#555;margin-top:2px}.box{border:1px solid #ddd;border-radius:8px;padding:16px;margin-top:16px}
    table{width:100%;border-collapse:collapse;margin-top:10px}td{padding:6px 4px;font-size:14px}.r{text-align:right}
    .total{font-size:18px;font-weight:bold;border-top:2px solid #1a2e5a;margin-top:8px}.foot{margin-top:24px;font-size:11px;color:#777;text-align:center}
    @media print{button{display:none}}`;
const PRINT_BUTTON = `<div style="text-align:center;margin-top:16px"><button onclick="window.print()" style="background:#1a2e5a;color:#fff;border:none;padding:10px 22px;border-radius:8px;cursor:pointer">Print / Save as PDF</button></div>`;

@Module({
  controllers: [SubscriptionController, SubscriptionWebhookController],
  providers: [SubscriptionInvoiceService],
})
export class BillingModule {}
