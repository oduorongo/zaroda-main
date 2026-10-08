import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { sendEmail } from './messaging';

// Owner bulk email is queued and drip-sent so it never exceeds the provider's daily cap.
// The cap is a rolling 24 hours of queue sends. It defaults to 90, leaving 10 of Resend's
// free 100/day for password resets, invoices and onboarding emails that bypass the queue.
export const emailQueueDailyLimit = () => Math.max(1, Number(process.env.EMAIL_QUEUE_DAILY_LIMIT) || 90);

export interface QueuedEmail { email: string; subject: string; html: string; text?: string }

// The same subject to the same address within 7 days is treated as a duplicate (e.g. Send clicked twice).
const dupKey = (email: string, subject: string) => `${String(email).trim().toLowerCase()}|${subject}`;
async function recentKeys(ds: DataSource, emails: string[], statuses: string[]): Promise<Set<string>> {
  if (!emails.length) return new Set();
  const rows = await ds.query(
    `SELECT LOWER(email) AS email, subject FROM owner_email_queue
      WHERE LOWER(email) = ANY($1) AND status = ANY($2) AND created_at > NOW() - INTERVAL '7 days'`,
    [emails.map(e => String(e).trim().toLowerCase()), statuses],
  ).catch(() => []);
  return new Set(rows.map((r: any) => dupKey(r.email, r.subject)));
}

/** Adds one row per distinct address, skipping one already queued or sent with this subject. Returns how many were queued. */
export async function enqueueEmails(ds: DataSource, broadcastId: string | null, items: QueuedEmail[]): Promise<number> {
  const seen = await recentKeys(ds, items.map(i => i.email).filter(Boolean), ['pending', 'sending', 'sent']);
  let n = 0;
  for (const it of items) {
    const email = String(it.email || '').trim();
    const key = dupKey(email, it.subject.slice(0, 255));
    if (!email || seen.has(key)) continue;
    seen.add(key);
    await ds.query(
      `INSERT INTO owner_email_queue (broadcast_id, email, subject, html, text_body) VALUES ($1,$2,$3,$4,$5)`,
      [broadcastId, email, it.subject.slice(0, 255), it.html, it.text || null],
    );
    n++;
  }
  return n;
}

export async function sentInLast24h(ds: DataSource): Promise<number> {
  const r = await ds.query(`SELECT COUNT(*)::int AS n FROM owner_email_queue WHERE status = 'sent' AND sent_at > NOW() - INTERVAL '24 hours'`).catch(() => [{ n: 0 }]);
  return r[0]?.n || 0;
}

let running = false;

/** Sends as many pending emails as today's allowance permits. Safe to call any time. */
export async function processEmailQueue(ds: DataSource): Promise<{ sent: number; failed: number; stopped?: string }> {
  if (running) return { sent: 0, failed: 0, stopped: 'already running' };
  running = true;
  let sent = 0, failed = 0, stopped: string | undefined;
  try {
    // Only one run at a time, so any row still 'sending' was left by a crash or restart.
    await ds.query(`UPDATE owner_email_queue SET status = 'pending' WHERE status = 'sending'`).catch(() => null);
    const allowance = emailQueueDailyLimit() - (await sentInLast24h(ds));
    if (allowance <= 0) return { sent, failed, stopped: 'daily limit reached' };
    // TypeORM returns [rows, affectedCount] for UPDATE ... RETURNING.
    const claimed = await ds.query(
      `UPDATE owner_email_queue SET status = 'sending'
        WHERE id IN (SELECT id FROM owner_email_queue WHERE status = 'pending' ORDER BY created_at, id LIMIT $1 FOR UPDATE SKIP LOCKED)
        RETURNING id, broadcast_id::text AS "broadcastId", email, subject, html, text_body AS "text", attempts`,
      [allowance],
    );
    const all: any[] = Array.isArray(claimed?.[0]) ? claimed[0] : claimed;
    // Drop duplicates (same subject already sent to this address, or twice in this run).
    const sentKeys = await recentKeys(ds, all.map(r => r.email), ['sent']);
    const rows: any[] = [], dupIds: string[] = [];
    for (const r of all) {
      const k = dupKey(r.email, r.subject);
      if (sentKeys.has(k)) dupIds.push(r.id); else { sentKeys.add(k); rows.push(r); }
    }
    if (dupIds.length) {
      await ds.query(`UPDATE owner_email_queue SET status = 'cancelled', detail = 'Duplicate: already sent to this address' WHERE id = ANY($1)`, [dupIds]);
    }
    const BATCH = 8;   // Resend allows ~10 requests/second
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const results = await Promise.all(batch.map((r: any) => sendEmail(r.email, r.subject, r.html, r.text || undefined)));
      for (let j = 0; j < batch.length; j++) {
        const r = batch[j], res = results[j];
        if (res.ok) {
          await ds.query(`UPDATE owner_email_queue SET status = 'sent', sent_at = NOW(), detail = NULL WHERE id = $1`, [r.id]);
          sent++;
        } else if (/\b429\b|quota|daily|rate limit/i.test(res.detail || '')) {
          await ds.query(`UPDATE owner_email_queue SET status = 'pending', detail = $2 WHERE id = $1`, [r.id, res.detail || null]);
          stopped = res.detail;
        } else {
          const attempts = r.attempts + 1;
          await ds.query(`UPDATE owner_email_queue SET status = $2, attempts = $3, detail = $4 WHERE id = $1`,
            [r.id, attempts >= 3 ? 'failed' : 'pending', attempts, res.detail || null]);
          if (attempts >= 3) failed++;
        }
      }
      if (stopped) {
        // Provider says we're out of quota: put the rest back untouched and wait for the next run.
        const rest = rows.slice(i + BATCH).map((r: any) => r.id);
        if (rest.length) await ds.query(`UPDATE owner_email_queue SET status = 'pending' WHERE id = ANY($1)`, [rest]);
        break;
      }
      if (i + BATCH < rows.length) await new Promise(res => setTimeout(res, 1100));
    }
    // Keep each broadcast's history row in step with its queue.
    const ids = Array.from(new Set(rows.map((r: any) => r.broadcastId).filter(Boolean)));
    if (ids.length) {
      await ds.query(
        `UPDATE owner_broadcasts b SET
           sent   = (SELECT COUNT(*) FROM owner_email_queue q WHERE q.broadcast_id = b.id AND q.status = 'sent'),
           failed = (SELECT COUNT(*) FROM owner_email_queue q WHERE q.broadcast_id = b.id AND q.status = 'failed')
         WHERE b.id::text = ANY($1)`, [ids]).catch(() => null);
    }
  } finally {
    running = false;
  }
  return { sent, failed, stopped };
}

@Injectable()
export class EmailQueueService {
  private readonly log = new Logger('EmailQueue');
  constructor(private readonly ds: DataSource) {}

  @Cron('*/30 * * * *')
  async run() {
    const r = await processEmailQueue(this.ds).catch((e: any) => ({ sent: 0, failed: 0, stopped: e.message }));
    if (r.sent || r.failed) this.log.log(`sent ${r.sent}, failed ${r.failed}${r.stopped ? ` (stopped: ${r.stopped})` : ''}`);
  }
}
