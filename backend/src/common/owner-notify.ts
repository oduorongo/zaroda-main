import { DataSource } from 'typeorm';
import { escapeHtml } from './security';
import { enqueueEmails, processEmailQueue } from './email-queue';

// Emails the platform owner (OWNER_NOTIFY_EMAIL, comma-separated, or else every active
// super_admin) through the email queue, so it shares the daily cap. Never throws.
export async function notifyOwner(ds: DataSource, subject: string, fields: [string, string | null | undefined][], extraHtml = '') {
  try {
    const fromEnv = String(process.env.OWNER_NOTIFY_EMAIL || '').split(',').map(s => s.trim()).filter(Boolean);
    const to = fromEnv.length ? fromEnv : (await ds.query(
      `SELECT email FROM users WHERE role = 'super_admin' AND COALESCE(is_active, true) = true AND email IS NOT NULL`,
    ).catch(() => [])).map((r: any) => r.email);
    if (!to.length) return;
    // A timestamp keeps each notice unique, so the queue's duplicate guard never drops one.
    const stamp = new Date().toLocaleString('en-KE', { timeZone: 'Africa/Nairobi', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    const rows = fields.filter(([, v]) => v != null && String(v).trim() !== '')
      .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#666">${escapeHtml(k)}</td><td style="padding:4px 0"><b>${escapeHtml(String(v))}</b></td></tr>`).join('');
    const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1a1a1a">
      <p>${escapeHtml(subject)}</p><table>${rows}</table>${extraHtml}
      <p style="color:#888;font-size:12px">${escapeHtml(stamp)} (Nairobi time)</p></div>`;
    const text = `${subject}\n` + fields.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join('\n');
    await enqueueEmails(ds, null, to.map((email: string) => ({ email, subject: `${subject} · ${stamp}`, html, text })));
    processEmailQueue(ds).catch(() => null);
  } catch { /* a notification must never affect the action that triggered it */ }
}
