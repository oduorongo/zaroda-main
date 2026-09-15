import { DataSource } from 'typeorm';
import { ForbiddenException } from '@nestjs/common';

// Essential vs Pro subscription plan (see migration 064_plan_tier.sql). Essential
// covers fee recording plus the core modules, including detailed analytics; Pro
// additionally unlocks payroll, HR, and student transport. Call this at the top
// of any endpoint that belongs to a Pro-only feature, passing a short human
// name for the error message.
export async function requireProPlan(ds: DataSource, tenantId: string, feature: string): Promise<void> {
  const rows = await ds.query(
    `SELECT plan_tier AS "planTier" FROM tenants WHERE id::text = $1`,
    [tenantId],
  ).catch(() => []);
  const planTier = rows[0]?.planTier || 'essential';
  if (planTier !== 'pro') {
    throw new ForbiddenException(`${feature} is a Pro plan feature. Upgrade your subscription to unlock it.`);
  }
}
