// ============================================================
// ZARODA SALES TEAMS — report schools a team member brought in
// Every 30 minutes, schools that signed up with a member's link or marketer phone/email
// (tenants.sales_agent_ref) and their successful subscription payments are sent to the
// ZARODA POS API, which pays the member commission. The POS side ignores anything it has
// already stored, so sending everything each time is safe.
// Needs SALES_SYNC_KEY (same value as SCHOOL_SALES_SYNC_KEY on the POS API); POS_API_URL
// defaults to https://api.zarodashop.com. Without the key nothing is sent.
// ============================================================
import { Injectable, Module } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';

const SCHOOL_CHUNK = 500;
const PAYMENT_CHUNK = 2000;

const chunks = <T>(rows: T[], size: number) => Array.from({ length: Math.ceil(rows.length / size) }, (_, i) => rows.slice(i * size, (i + 1) * size));

@Injectable()
export class SalesSyncService {
  private running = false;

  constructor(private readonly ds: DataSource) {}

  @Cron('*/30 * * * *')
  async run() {
    const key = process.env.SALES_SYNC_KEY || '';
    if (key.length < 24 || this.running) return;
    this.running = true;
    try {
      const schools = await this.ds.query(
        `SELECT id::text AS id, name, created_at AS "signedUpAt", COALESCE(status, 'trial') <> 'suspended' AS active, sales_agent_ref AS "agentRef"
           FROM tenants
          WHERE sales_agent_ref IS NOT NULL AND COALESCE(account_type, 'school') <> 'individual'`,
      );
      if (!schools.length) return;
      const payments = await this.ds.query(
        `SELECT p.id::text AS id, p.tenant_id::text AS "schoolId", p.amount::float AS "amountKes", p.paid_at AS "paidAt"
           FROM subscription_payments p JOIN tenants t ON t.id = p.tenant_id
          WHERE t.sales_agent_ref IS NOT NULL AND p.status = 'success' AND p.paid_at IS NOT NULL
            AND COALESCE(p.is_test, false) = false AND p.amount > 0`,
      ).catch(() => []);

      const url = `${(process.env.POS_API_URL || 'https://api.zarodashop.com').replace(/\/+$/, '')}/sales-sync/school`;
      const send = async (body: object) => {
        const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-sales-sync-key': key }, body: JSON.stringify(body) });
        if (!res.ok) throw new Error(`POS answered ${res.status}`);
        return res.json();
      };
      const unmatched: string[] = [];
      for (const part of chunks(schools, SCHOOL_CHUNK)) {
        const result = await send({ schools: part.map((s: any) => ({ ...s, name: String(s.name || 'School').slice(0, 200), agentRef: String(s.agentRef).slice(0, 120), signedUpAt: new Date(s.signedUpAt).toISOString() })) });
        unmatched.push(...(result?.unmatched ?? []));
      }
      for (const part of chunks(payments, PAYMENT_CHUNK)) {
        await send({ payments: part.map((p: any) => ({ ...p, paidAt: new Date(p.paidAt).toISOString() })) });
      }
      if (unmatched.length) console.warn(`[sales-sync] ${unmatched.length} school(s) name a marketer the POS does not know: ${unmatched.slice(0, 10).join(', ')}`);
    } catch (err) {
      console.warn('[sales-sync] could not report to the POS:', (err as Error).message);
    } finally {
      this.running = false;
    }
  }
}

@Module({ providers: [SalesSyncService] })
export class SalesSyncModule {}
