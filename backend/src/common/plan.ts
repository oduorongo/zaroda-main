import { DataSource } from 'typeorm';
import { ForbiddenException, HttpException } from '@nestjs/common';
import { loadCoverage } from './subscription';

// Essential vs Pro subscription plan (see migration 064_plan_tier.sql). Essential
// covers fee recording plus the core modules, including detailed analytics; Pro
// additionally unlocks payroll, HR, and student transport. Call this at the top
// of any endpoint that belongs to a Pro-only feature, passing a short human
// name for the error message and the request's HTTP method.
//
// A Pro school whose Pro fee has lapsed past its grace period goes read-only in
// these features, the same way a lapsed stream does: GETs still work, so payroll
// history, HR records and transport routes stay viewable and printable, but
// anything that writes (POST/PUT/PATCH/DELETE) is refused until the Pro fee is
// paid. Transport fees already on learners' fee structures are billed by the
// finance module, which never calls this, so fee collection is unaffected.
export async function requireProPlan(ds: DataSource, tenantId: string, feature: string, method?: string): Promise<void> {
  const rows = await ds.query(
    `SELECT plan_tier AS "planTier" FROM tenants WHERE id::text = $1`,
    [tenantId],
  ).catch(() => []);
  const planTier = rows[0]?.planTier || 'essential';
  if (planTier !== 'pro') {
    throw new ForbiddenException(`${feature} is a Pro plan feature. Upgrade your subscription to unlock it.`);
  }
  if (!method || ['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())) return;
  const cov = await loadCoverage(ds, tenantId);
  if (cov.exempt || !cov.pro || cov.pro.writable) return;
  throw new HttpException({
    statusCode: 402,
    error: 'Payment Required',
    message: `${feature} is read-only because the Pro plan subscription has lapsed. Existing records can still be viewed and printed. ` +
      `A school admin can renew the Pro plan under Subscription to reopen it.`,
  }, 402);
}
