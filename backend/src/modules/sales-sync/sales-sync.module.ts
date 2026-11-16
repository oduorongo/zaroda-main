// ============================================================
// ZARODA SALES TEAMS + ZARODA'S BOOKS — report schools and their payments to the POS
// Every 30 minutes the ZARODA POS API is sent:
//  - schools that signed up with a team member's link or marketer phone/email
//    (tenants.sales_agent_ref) and their successful subscription payments, so the member is paid commission;
//  - every school's successful subscription payment (receipts), so it is posted to ZARODA's own books.
// The POS side ignores anything it has already stored, so sending everything each time is safe.
// Needs SALES_SYNC_KEY (same value as SCHOOL_SALES_SYNC_KEY on the POS API); POS_API_URL
// defaults to https://api.zarodashop.com. Without the key nothing is sent.
// ============================================================
import { Injectable, Module } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';

// The POS takes JSON bodies up to 100 KB, so each request carries at most this many rows.
const SCHOOL_CHUNK = 250;
const PAYMENT_CHUNK = 500;
const RECEIPT_CHUNK = 300;

const chunks = <T>(rows: T[], size: number) => Array.from({ length: Math.ceil(rows.length / size) }, (_, i) => rows.slice(i * size, (i + 1) * size));
const iso = (d: any) => new Date(d).toISOString();

@Injectable()
export class SalesSyncService {
  private running = false;

  constructor(private readonly ds: DataSource) {}

  @Cron('*/30 * * * *')
  async run() {
    const key = (process.env.SALES_SYNC_KEY || '').trim().replace(/^["']+|["']+$/g, '').trim();
    if (key.length < 24 || this.running) return;
    this.running = true;
    try {
      const url = `${(process.env.POS_API_URL || 'https://api.zarodashop.com').replace(/\/+$/, '')}/sales-sync/school`;
      const send = async (body: object) => {
        const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-sales-sync-key': key }, body: JSON.stringify(body) });
        if (!res.ok) throw new Error(`POS answered ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`);
        return res.json();
      };

      const schools = await this.ds.query(
        `SELECT id::text AS id, name, created_at AS "signedUpAt", COALESCE(status, 'trial') <> 'suspended' AS active, sales_agent_ref AS "agentRef"
           FROM tenants
          WHERE sales_agent_ref IS NOT NULL AND COALESCE(account_type, 'school') <> 'individual'`,
      );
      if (schools.length) {
        const payments = await this.ds.query(
          `SELECT p.id::text AS id, p.tenant_id::text AS "schoolId", p.amount::float AS "amountKes", p.paid_at AS "paidAt"
             FROM subscription_payments p JOIN tenants t ON t.id = p.tenant_id
            WHERE t.sales_agent_ref IS NOT NULL AND p.status = 'success' AND p.paid_at IS NOT NULL
              AND COALESCE(p.is_test, false) = false AND p.amount > 0`,
        ).catch(() => []);
        const unmatched: string[] = [];
        for (const part of chunks(schools, SCHOOL_CHUNK)) {
          const result = await send({ schools: part.map((s: any) => ({ ...s, name: String(s.name || 'School').slice(0, 200), agentRef: String(s.agentRef).slice(0, 120), signedUpAt: iso(s.signedUpAt) })) });
          unmatched.push(...(result?.unmatched ?? []));
        }
        for (const part of chunks(payments, PAYMENT_CHUNK)) {
          await send({ payments: part.map((p: any) => ({ ...p, paidAt: iso(p.paidAt) })) });
        }
        if (unmatched.length) console.warn(`[sales-sync] ${unmatched.length} school(s) name a marketer the POS does not know: ${unmatched.slice(0, 10).join(', ')}`);
      }

      const receipts = await this.ds.query(
        `SELECT p.id::text AS id, p.tenant_id::text AS "schoolId", t.name AS "schoolName", p.amount::float AS "amountKes",
                p.paid_at AS "paidAt", p.mpesa_receipt AS reference
           FROM subscription_payments p JOIN tenants t ON t.id = p.tenant_id
          WHERE p.status = 'success' AND p.paid_at IS NOT NULL AND COALESCE(p.is_test, false) = false AND p.amount > 0`,
      ).catch(() => []);
      for (const part of chunks(receipts, RECEIPT_CHUNK)) {
        await send({
          receipts: part.map((r: any) => ({
            id: r.id,
            schoolId: r.schoolId,
            schoolName: String(r.schoolName || 'School').slice(0, 200),
            amountKes: r.amountKes,
            paidAt: iso(r.paidAt),
            ...(r.reference ? { reference: String(r.reference).slice(0, 64) } : {}),
          })),
        });
      }
    } catch (err) {
      console.warn('[sales-sync] could not report to the POS:', (err as Error).message);
    } finally {
      this.running = false;
    }
  }
}

@Module({ providers: [SalesSyncService] })
export class SalesSyncModule {}
