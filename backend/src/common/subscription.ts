import { DataSource } from 'typeorm';
import { HttpException } from '@nestjs/common';

// ============================================================
// SCHOOL SUBSCRIPTION COVERAGE — who is paid up, who is in grace, who is read-only.
//
// A school pays per stream per year (see ../modules/billing/billing.module.ts).
// Each stream has its own paid-through date (stream_subscriptions), so streams paid
// at different times lapse on different dates. Only streams with at least one active
// learner are billable; empty streams are never charged and never locked.
//
// Free period: every school that joined in 2026 (or earlier) is free until
// 15 January 2027. A school joining from 2027 gets the rest of the term it joins
// in (or, joining in a holiday, the coming term) free, up to the day before the
// following term opens.
//
// Grace: when a stream's free or paid period ends, it stays fully usable for
// GRACE_DAYS more days and the school is invoiced. After that the stream is
// read-only: nothing already recorded is hidden, but new marks, attendance,
// timetable changes and report-card remarks for it are refused until it is paid.
// Fee collection is never affected — it is the school's money, and stopping it
// would leave its books wrong.
// ============================================================

export const SENIOR_GRADES = ['grade_10', 'grade_11', 'grade_12'];
export const PRICE_PRIMARY_JS = 2400;
export const PRICE_SENIOR = 3360;
// Pro plan (payroll, HR, transport) — one flat fee per school per year, not per
// stream. See migration 064_plan_tier.sql / requireProPlan().
export const PRICE_PRO_PLAN = 4500;
export const GRACE_DAYS = 14;
export const DUE_SOON_DAYS = 30;

// Everyone who joined before this date is on the launch free period.
export const LAUNCH_COHORT_BEFORE = '2027-01-01';
export const LAUNCH_FREE_UNTIL = '2027-01-15';

// Kenyan school terms as [opening, closing]. Used only to work out a new school's
// free term. ESTIMATED from the usual Ministry of Education pattern — replace each
// year with the dates in the MoE term-dates circular. Past the end of this list a
// new school gets FALLBACK_FREE_DAYS instead.
export const TERM_DATES: [string, string][] = [
  ['2027-01-04', '2027-04-01'],
  ['2027-04-26', '2027-07-30'],
  ['2027-08-30', '2027-10-29'],
  ['2028-01-03', '2028-03-31'],
  ['2028-04-24', '2028-07-28'],
  ['2028-08-28', '2028-10-27'],
];
const FALLBACK_FREE_DAYS = 90;

const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * 86400000).toISOString().slice(0, 10);
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
const latest = (...ds: (string | null | undefined)[]) => (ds.filter(Boolean) as string[]).sort().pop() || null;
export const nairobiToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });

// Last free day for a school signing up on `signupDay` (YYYY-MM-DD, Nairobi).
export function freePeriodEndForSignup(signupDay: string = nairobiToday()): string {
  if (signupDay < LAUNCH_COHORT_BEFORE) return LAUNCH_FREE_UNTIL;
  // The free term is the one in progress, or the next one if signing up in a holiday.
  const i = TERM_DATES.findIndex(([, close]) => close >= signupDay);
  const following = i >= 0 ? TERM_DATES[i + 1] : undefined;
  return following ? addDays(following[0], -1) : addDays(signupDay, FALLBACK_FREE_DAYS);
}

// "15 January 2027" — for emails and messages.
export const longDay = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

// For tenants.trial_ends_at (a timestamp): midday Nairobi, so the stored date
// reads the same whatever timezone the server or database runs in.
export const freePeriodEndTimestamp = (day: string) => new Date(`${day}T12:00:00+03:00`);

export function priceFor(gradeLevel: string): number {
  return SENIOR_GRADES.includes(gradeLevel) ? PRICE_SENIOR : PRICE_PRIMARY_JS;
}

// pp1, pp2, grade_1 … grade_12 in school order (a plain text sort puts grade_10 before grade_2).
function gradeRank(gradeLevel: string): number {
  const m = /^pp(\d+)$/.exec(gradeLevel || '');
  if (m) return Number(m[1]) - 3;
  const g = /(\d+)/.exec(gradeLevel || '');
  return g ? Number(g[1]) : 99;
}

let ensured: Promise<void> | null = null;
// Billing tables are created lazily on first use (no migration needed to deploy).
// Memoised per process: the lapse check calls this on every guarded write.
export function ensureBillingTables(ds: DataSource): Promise<void> {
  if (!ensured) ensured = createBillingTables(ds).catch(() => { ensured = null; });
  return ensured;
}

async function createBillingTables(ds: DataSource) {
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

  // One row per stream (or the Pro fee, stream_id NULL) per paid year. Rows are
  // written 'pending' when the STK push starts, so the payment covers exactly the
  // streams the admin chose then — not whatever exists when the webhook lands — and
  // get their period only once paid, so two payments for the same stream stack
  // instead of overlapping. No foreign key to streams: streams are hard-deleted, and
  // what a school paid for must outlive the class. Name/grade are snapshotted for
  // the receipt for the same reason.
  await ds.query(
    `CREATE TABLE IF NOT EXISTS stream_subscriptions (
       id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       tenant_id uuid NOT NULL,
       payment_id uuid,
       kind text NOT NULL DEFAULT 'stream',
       stream_id uuid,
       stream_name text,
       grade_level text,
       price numeric NOT NULL DEFAULT 0,
       period_start date,
       period_end date,
       status text NOT NULL DEFAULT 'pending',
       created_at timestamptz DEFAULT NOW()
     )`,
  ).catch(() => null);
  await ds.query(
    `CREATE INDEX IF NOT EXISTS idx_stream_subscriptions_coverage
       ON stream_subscriptions(tenant_id, kind, stream_id) WHERE status = 'active'`,
  ).catch(() => null);
  await ds.query(
    `CREATE INDEX IF NOT EXISTS idx_stream_subscriptions_payment ON stream_subscriptions(payment_id)`,
  ).catch(() => null);

  // Issued when a stream's free or paid period ends. `lines` snapshots what was
  // billed ({kind, streamId, name, gradeLevel, price}); the invoice is settled once
  // none of those lines is in grace or read-only any more.
  await ds.query(
    `CREATE TABLE IF NOT EXISTS subscription_invoices (
       id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       tenant_id uuid NOT NULL,
       invoice_number text NOT NULL,
       amount numeric NOT NULL DEFAULT 0,
       lines jsonb NOT NULL DEFAULT '[]',
       issued_on date NOT NULL DEFAULT CURRENT_DATE,
       due_on date,
       status text NOT NULL DEFAULT 'open',
       emailed_at timestamptz,
       settled_at timestamptz,
       created_at timestamptz DEFAULT NOW()
     )`,
  ).catch(() => null);
  await ds.query(
    `CREATE INDEX IF NOT EXISTS idx_subscription_invoices_tenant ON subscription_invoices(tenant_id, status)`,
  ).catch(() => null);
}

// Before coverage was per stream, a payment extended one school-wide date for
// "every current stream". A school that paid under that scheme gets that date
// carried onto each of its streams (and the Pro fee, if on Pro) the first time it
// is looked at, so nobody loses time they have paid for. Runs only while the school
// has no coverage rows at all, so it can never overwrite anything written since.
// Price is 0 because the money is already on the original payment's receipt.
export async function backfillLegacyCoverage(ds: DataSource, tenantId: string) {
  await ds.query(
    `INSERT INTO stream_subscriptions
       (tenant_id, kind, stream_id, stream_name, grade_level, price, period_start, period_end, status)
     SELECT t.id, 'stream', s.id, s.name, s.grade_level, 0,
            (t.subscription_paid_until - INTERVAL '1 year')::date, t.subscription_paid_until, 'active'
       FROM tenants t JOIN streams s ON s.tenant_id::text = t.id::text
      WHERE t.id::text = $1 AND t.subscription_paid_until IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM stream_subscriptions x WHERE x.tenant_id = t.id)
     UNION ALL
     SELECT t.id, 'pro', NULL, NULL, NULL, 0,
            (t.subscription_paid_until - INTERVAL '1 year')::date, t.subscription_paid_until, 'active'
       FROM tenants t
      WHERE t.id::text = $1 AND t.subscription_paid_until IS NOT NULL AND t.plan_tier = 'pro'
        AND NOT EXISTS (SELECT 1 FROM stream_subscriptions x WHERE x.tenant_id = t.id)`,
    [tenantId],
  ).catch(() => null);
}

// Last free day for a tenant, in SQL. The launch cohort is floored at
// LAUNCH_FREE_UNTIL whatever trial date signup gave them, so the rule holds even
// for schools whose 14-day trial ran out long ago; a later date the owner set by
// hand is kept.
export const FREE_UNTIL_SQL = (t: string) =>
  `CASE WHEN ${t}.created_at < DATE '${LAUNCH_COHORT_BEFORE}'
        THEN GREATEST(COALESCE(${t}.trial_ends_at::date, DATE '${LAUNCH_FREE_UNTIL}'), DATE '${LAUNCH_FREE_UNTIL}')
        ELSE COALESCE(${t}.trial_ends_at::date, ${t}.created_at::date + 14) END`;

// paid / due_soon: covered by a payment (due_soon: ends within DUE_SOON_DAYS) ·
// free / free_ending: covered by the free period · grace: ended, still usable
// until graceEndsOn · lapsed: read-only · not_billable: no learners, never charged.
export type CoverageStatus = 'paid' | 'due_soon' | 'free' | 'free_ending' | 'grace' | 'lapsed' | 'not_billable';

function assess(o: { billable: boolean; paidUntil: string | null; freeUntil: string | null; firstLearnerOn?: string | null; today: string }) {
  const coverEnd = latest(o.paidUntil, o.freeUntil);
  const coveredBy: 'paid' | 'free' | null = !coverEnd ? null : o.paidUntil === coverEnd ? 'paid' : 'free';
  const daysLeft = coverEnd ? daysBetween(o.today, coverEnd) : null;
  // A stream that only got learners after its cover ended (a class opened mid-year)
  // gets its grace from its first learner, so opening a class never locks it at once.
  const graceFrom = latest(coverEnd, o.firstLearnerOn);
  const graceEndsOn = graceFrom ? addDays(graceFrom, GRACE_DAYS) : null;
  let status: CoverageStatus;
  if (!o.billable) status = 'not_billable';
  else if (daysLeft !== null && daysLeft >= 0) {
    status = coveredBy === 'paid'
      ? (daysLeft <= DUE_SOON_DAYS ? 'due_soon' : 'paid')
      : (daysLeft <= DUE_SOON_DAYS ? 'free_ending' : 'free');
  } else if (graceEndsOn && o.today <= graceEndsOn) status = 'grace';
  else status = 'lapsed';
  return { coverEnd, coveredBy, daysLeft, graceEndsOn, status, writable: status !== 'lapsed' };
}

// Every stream with its learner count, price band, paid-through date and coverage
// status, plus the Pro fee's. Dates are 'YYYY-MM-DD' text; "today" is the
// database's CURRENT_DATE, the same clock payments are activated against.
export async function loadCoverage(ds: DataSource, tenantId: string) {
  await ensureBillingTables(ds);
  await backfillLegacyCoverage(ds, tenantId);
  const t = await ds.query(
    `SELECT t.name, t.plan_tier AS "planTier", t.status, t.account_type AS "accountType",
            (${FREE_UNTIL_SQL('t')})::text AS "freeUntil",
            CURRENT_DATE::text AS today,
            (SELECT MAX(ss.period_end) FROM stream_subscriptions ss
              WHERE ss.tenant_id = t.id AND ss.kind = 'pro' AND ss.status = 'active')::text AS "proPaidUntil"
       FROM tenants t WHERE t.id::text = $1 LIMIT 1`,
    [tenantId],
  ).catch(() => []);
  const tenant = t[0] || {};
  const today: string = tenant.today || nairobiToday();
  const freeUntil: string | null = tenant.freeUntil || null;

  const rows = await ds.query(
    `SELECT s.id, s.name, s.grade_level AS "gradeLevel",
            lr.learners, lr.first_learner_on::text AS "firstLearnerOn",
            cov.paid_until::text AS "paidUntil"
       FROM streams s
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS learners, MIN(l.created_at)::date AS first_learner_on FROM learners l
          WHERE l.stream_id::text = s.id::text AND l.is_active = true
       ) lr ON true
       LEFT JOIN LATERAL (
         SELECT MAX(ss.period_end) AS paid_until FROM stream_subscriptions ss
          WHERE ss.tenant_id::text = s.tenant_id::text AND ss.kind = 'stream'
            AND ss.stream_id::text = s.id::text AND ss.status = 'active'
       ) cov ON true
      WHERE s.tenant_id::text = $1`,
    [tenantId],
  ).catch(() => []);
  const streams = rows.map((r: any) => {
    const billable = Number(r.learners) > 0;
    const a = assess({ billable, paidUntil: r.paidUntil || null, freeUntil, firstLearnerOn: r.firstLearnerOn || null, today });
    return {
      id: String(r.id), name: r.name as string, gradeLevel: r.gradeLevel as string,
      learners: Number(r.learners) || 0,
      senior: SENIOR_GRADES.includes(r.gradeLevel),
      price: priceFor(r.gradeLevel),
      billable,
      paidUntil: (r.paidUntil || null) as string | null,
      ...a,
    };
  }).sort((a: any, b: any) => gradeRank(a.gradeLevel) - gradeRank(b.gradeLevel) || String(a.name).localeCompare(String(b.name)));

  const isPro = tenant.planTier === 'pro';
  const proPaidUntil: string | null = tenant.proPaidUntil || null;
  return {
    schoolName: tenant.name as string | undefined,
    // Individual (Professional Records only) accounts are not school subscriptions.
    exempt: tenant.accountType === 'individual',
    today,
    freeUntil,
    freeGraceEndsOn: freeUntil ? addDays(freeUntil, GRACE_DAYS) : null,
    streams,
    isPro,
    pro: isPro ? {
      price: PRICE_PRO_PLAN,
      paidUntil: proPaidUntil,
      ...assess({ billable: true, paidUntil: proPaidUntil, freeUntil, today }),
    } : null,
  };
}
export type Coverage = Awaited<ReturnType<typeof loadCoverage>>;

// What needs paying: invoiced/defaulted-to on the subscription page.
export const needsPaying = (status: string) => ['grace', 'lapsed', 'due_soon', 'free_ending'].includes(status);

// The school-wide paid-through date the owner's billing view shows: the soonest
// date on which one of the school's paid, billable streams lapses. Kept on the
// tenant so platform-wide queries need not aggregate stream_subscriptions.
export async function syncTenantPaidUntil(ds: DataSource, tenantId: string) {
  await ds.query(
    `UPDATE tenants t SET subscription_paid_until = (
       SELECT MIN(cov.paid_until) FROM streams s
         JOIN LATERAL (
           SELECT MAX(ss.period_end) AS paid_until FROM stream_subscriptions ss
            WHERE ss.tenant_id::text = s.tenant_id::text AND ss.kind = 'stream'
              AND ss.stream_id::text = s.id::text AND ss.status = 'active'
         ) cov ON cov.paid_until IS NOT NULL
        WHERE s.tenant_id::text = t.id::text
          AND EXISTS (SELECT 1 FROM learners l WHERE l.stream_id::text = s.id::text AND l.is_active = true)
     )
     WHERE t.id::text = $1
       AND EXISTS (SELECT 1 FROM stream_subscriptions x WHERE x.tenant_id = t.id AND x.status = 'active')`,
    [tenantId],
  ).catch(() => null);
}

// Refuse a write that touches a read-only (lapsed) stream. Pass the stream ids the
// request names and/or the learners it writes for — learners are resolved to their
// current stream. Anything without a stream, and empty streams, pass. Responds
// 402 Payment Required with a message the frontend can toast as-is.
export async function assertStreamsWritable(
  ds: DataSource, tenantId: string,
  target: { streamIds?: (string | null | undefined)[]; learnerIds?: (string | null | undefined)[] },
): Promise<void> {
  const ids = new Set((target.streamIds || []).filter(Boolean).map(String));
  const learnerIds = Array.from(new Set((target.learnerIds || []).filter(Boolean).map(String)));
  if (learnerIds.length) {
    const rows = await ds.query(
      `SELECT DISTINCT stream_id::text AS id FROM learners
        WHERE tenant_id::text = $1 AND id::text = ANY($2::text[]) AND stream_id IS NOT NULL`,
      [tenantId, learnerIds],
    ).catch(() => []);
    for (const r of rows) ids.add(r.id);
  }
  if (!ids.size) return;
  const cov = await loadCoverage(ds, tenantId);
  if (cov.exempt) return;
  const blocked = cov.streams.filter(s => ids.has(s.id) && !s.writable);
  if (!blocked.length) return;
  const names = blocked.map(s => s.name).join(', ');
  throw new HttpException({
    statusCode: 402,
    error: 'Payment Required',
    message: `${names} ${blocked.length === 1 ? 'is' : 'are'} read-only because the subscription for ${blocked.length === 1 ? 'this stream' : 'these streams'} has lapsed. ` +
      `Existing records can still be viewed and printed. A school admin can renew under Subscription to reopen ${blocked.length === 1 ? 'it' : 'them'}.`,
  }, 402);
}
